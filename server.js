require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');

// --- SECURITY ADD-ON (IMPORT) ---
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 

// Import file yang dipisah (Gudang, Otak, Kurir)
const { pool, initDb } = require('./db');
const { processAI } = require('./ai');
const { sendMail } = require('./email');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- SECURITY ADD-ON (MIDDLEWARE) ---
app.use(helmet({
  contentSecurityPolicy: false, 
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: "Terlalu banyak permintaan dari IP ini, coba lagi nanti."
});
app.use(limiter);

// Setup Engine Tampilan
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Jalankan Auto-Setup Database pas server nyala
initDb();

// --- FUNGSI HELPER: GENERATE OTP 6 DIGIT ---
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ==========================================
// 🎯 1. ROUTES TAMPILAN (EJS) - SERAGAM & RESPONSIVE
// ==========================================

app.get('/', (req, res) => res.render('landing'));

// RUTE GURU / INSTANSI
app.get('/login', (req, res) => res.render('login', { msg: null }));
app.get('/register', (req, res) => res.render('register', { msg: null }));
app.get('/forget', (req, res) => res.render('forget', { msg: null }));

// FIX RUTE: REGISTER GURU
app.get('/register-guru', (req, res) => res.render('register-guru', { msg: null }));

// RUTE SISWA
app.get('/login-siswa', (req, res) => res.render('login_siswa', { msg: null }));
app.get('/register-siswa', (req, res) => res.render('register_siswa', { msg: null }));
app.get('/forget-siswa', (req, res) => res.render('forget_siswa', { msg: null }));

// ==========================================
// 👨‍🏫 2. LOGIKA GURU / INSTANSI / ADMIN
// ==========================================

app.post('/auth/register', async (req, res) => {
  const { nama, email, pass } = req.body;
  const kode = "SCH-" + Math.random().toString(36).substring(2, 7).toUpperCase();
  const otp = generateOTP(); 
  try {
    const hashed = await bcrypt.hash(pass, 10);
    await pool.query(
      'INSERT INTO global_instansi (nama_instansi, kode_instansi, admin_email, password, otp) VALUES ($1,$2,$3,$4,$5)', 
      [nama, kode, email, hashed, otp]
    );
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${kode}"`);
    await pool.query(`CREATE TABLE IF NOT EXISTS "${kode}".materi (id SERIAL PRIMARY KEY, judul TEXT, konten JSONB)`);
    
    await sendMail(
      email, 
      "Kode Verifikasi Pendaftaran Sekolah", 
      `<h1>Verifikasi Akun</h1><p>Terima kasih telah mendaftar.</p><p>KODE OTP ANDA: <b style="font-size:24px; color:blue;">${otp}</b></p><p>Kode Instansi: <b>${kode}</b></p>`
    );
    res.render('login', { msg: `Sukses! Cek OTP & Kode Instansi di email: ${email}` });
  } catch (err) { res.status(500).send("Error Daftar: " + err.message); }
});

app.post('/auth/register-guru', async (req, res) => {
  const { nama, email, pass, kode_sekolah } = req.body;
  const otp = generateOTP();
  try {
    const hashed = await bcrypt.hash(pass, 10);
    const checkSekolah = await pool.query('SELECT * FROM global_instansi WHERE kode_instansi = $1', [kode_sekolah]);
    if(checkSekolah.rows.length === 0) return res.render('register-guru', { msg: "Kode Sekolah Tidak Valid!" });

    await pool.query(
      'INSERT INTO global_guru (nama_guru, email, password, kode_sekolah, otp) VALUES ($1,$2,$3,$4,$5)',
      [nama, email, hashed, kode_sekolah, otp]
    );
    await sendMail(email, "OTP Guru", `<p>Kode OTP Guru Anda: <b>${otp}</b></p>`);
    res.render('login', { msg: "Pendaftaran Guru Berhasil! Cek OTP di email." });
  } catch (err) { res.render('register-guru', { msg: "Email sudah terdaftar!" }); }
});

// LOGIN ADMIN/INSTANSI (MENGGUNAKAN KODE)
app.post('/auth/login', async (req, res) => {
  const { kode, email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_instansi WHERE kode_instansi = $1', [kode]);
    if (result.rows.length === 0) return res.render('login', { msg: "Kode Instansi tidak ditemukan!" });
    const isMatch = await bcrypt.compare(pass, result.rows[0].password);
    if (!isMatch) return res.render('login', { msg: "Password salah!" });
    res.render('dashboard', { instansi: result.rows[0].nama_instansi, kode: kode });
  } catch (err) { res.send(err.message); }
});

// --- PERBAIKAN: LOGIN KHUSUS GURU (HANYA EMAIL & PASS) ---
app.post('/auth/login-guru', async (req, res) => {
  const { email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_guru WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.render('login', { msg: "Akun Guru tidak ditemukan!" });
    
    const isMatch = await bcrypt.compare(pass, result.rows[0].password);
    if (!isMatch) return res.render('login', { msg: "Password Guru salah!" });

    const infoSekolah = await pool.query('SELECT nama_instansi FROM global_instansi WHERE kode_instansi = $1', [result.rows[0].kode_sekolah]);
    const namaSekolah = infoSekolah.rows.length > 0 ? infoSekolah.rows[0].nama_instansi : "Global School";

    res.render('dashboard', { instansi: namaSekolah, kode: result.rows[0].kode_sekolah });
  } catch (err) { res.render('login', { msg: "Terjadi kesalahan sistem login guru." }); }
});

app.post('/auth/forget', async (req, res) => {
  const { email } = req.body;
  const otp = generateOTP();
  try {
    const result = await pool.query('UPDATE global_instansi SET otp = $1 WHERE admin_email = $2 RETURNING nama_instansi', [otp, email]);
    if (result.rows.length > 0) {
      await sendMail(email, "Reset Akses Admin", `<p>Kode OTP Pemulihan: <b>${otp}</b></p>`);
      res.render('forget', { msg: "OTP Pemulihan sudah dikirim ke email bapak." });
    } else { res.render('forget', { msg: "Email tidak ditemukan!" }); }
  } catch (err) { res.status(500).send(err.message); }
});

// ==========================================
// 🎓 3. LOGIKA SISWA (TERKONEKSI BREVO & OTP)
// ==========================================

app.post('/auth/register-siswa', async (req, res) => {
  const { nama, email, pass, kode_sekolah } = req.body;
  const otp = generateOTP();
  try {
    const hashed = await bcrypt.hash(pass, 10);
    await pool.query(
      'INSERT INTO global_siswa (nama_siswa, email, password, kode_sekolah, otp) VALUES ($1,$2,$3,$4,$5)', 
      [nama, email, hashed, kode_sekolah, otp]
    );
    await sendMail(email, "Verifikasi Siswa", `<h1>Halo ${nama}!</h1><p>KODE OTP ANDA: <b>${otp}</b></p>`);
    res.render('login_siswa', { msg: "Daftar Berhasil! Cek OTP di email untuk masuk." });
  } catch (err) { res.render('register_siswa', { msg: "Email sudah digunakan!" }); }
});

app.post('/auth/login-siswa', async (req, res) => {
  const { email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_siswa WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.render('login_siswa', { msg: "Email tidak ditemukan!" });
    const isMatch = await bcrypt.compare(pass, result.rows[0].password);
    if (!isMatch) return res.render('login_siswa', { msg: "Password salah!" });
    res.send(`<h1 style="text-align:center; color:green; margin-top:50px;">Selamat Belajar, ${result.rows[0].nama_siswa}!</h1>`);
  } catch (err) { res.send(err.message); }
});

app.post('/auth/forget-siswa', async (req, res) => {
  const { email } = req.body;
  const otp = generateOTP();
  try {
    const result = await pool.query('UPDATE global_siswa SET otp = $1 WHERE email = $2 RETURNING nama_siswa', [otp, email]);
    if (result.rows.length > 0) {
      await sendMail(email, "OTP Reset Password Siswa", `<p>Halo, Kode OTP Reset Anda: <b>${otp}</b></p>`);
      res.render('forget_siswa', { msg: "Kode OTP sudah dikirim ke email kamu." });
    } else { res.render('forget_siswa', { msg: "Email siswa tidak ditemukan!" }); }
  } catch (err) { res.status(500).send(err.message); }
});

// ==========================================
// 🤖 4. API UNTUK AI & SERVER RUN
// ==========================================

app.post('/api/generate', async (req, res) => {
  try {
    const data = await processAI(req.body.instruksi);
    res.json(data);
  } catch (err) { res.status(500).json({ error: "AI sedang sibuk." }); }
});

const PORT = process.env.PORT || 8080; 
server.listen(PORT, () => {
  console.log(`
  =========================================
  🚀 SERVER GLOBAL SCHOOL AKTIF (GEMINI 2.5)
  -----------------------------------------
  📍 Port     : ${PORT}
  📧 Email    : Brevo Connected (OTP Ready)
  📦 DB       : PostgreSQL Connected
  =========================================
  `);
});
