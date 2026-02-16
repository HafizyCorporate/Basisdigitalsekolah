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

// ==========================================
// 🎯 1. ROUTES TAMPILAN (EJS)
// ==========================================

// HALAMAN UTAMA (Landing Page dengan Animasi)
app.get('/', (req, res) => res.render('landing'));

// RUTE GURU / INSTANSI (Original)
app.get('/login-guru', (req, res) => res.render('login', { msg: null }));
app.get('/register', (req, res) => res.render('register', { msg: null }));
app.get('/forget', (req, res) => res.render('forget', { msg: null }));

// RUTE SISWA (Baru)
app.get('/login-siswa', (req, res) => res.render('login_siswa', { msg: null }));
app.get('/register-siswa', (req, res) => res.render('register_siswa', { msg: null }));
app.get('/forget-siswa', (req, res) => res.render('forget_siswa', { msg: null }));


// ==========================================
// 👨‍🏫 2. LOGIKA GURU / INSTANSI (Original)
// ==========================================

app.post('/auth/register', async (req, res) => {
  const { nama, email, pass } = req.body;
  const kode = "SCH-" + Math.random().toString(36).substring(2, 7).toUpperCase();
  try {
    const hashed = await bcrypt.hash(pass, 10);
    await pool.query(
      'INSERT INTO global_instansi (nama_instansi, kode_instansi, admin_email, password) VALUES ($1,$2,$3,$4)', 
      [nama, kode, email, hashed]
    );
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${kode}"`);
    await pool.query(`CREATE TABLE "${kode}".materi (id SERIAL PRIMARY KEY, judul TEXT, konten JSONB)`);
    
    await sendMail(
      email, 
      "Selamat Datang di Global School AI!", 
      `<h1>Registrasi Berhasil!</h1><p>Nama Sekolah: <b>${nama}</b></p><p>Kode Instansi Anda: <b style="color:blue;">${kode}</b></p><p>Simpan kode ini untuk login admin.</p>`
    );
    res.render('login', { msg: `Sukses! Kode Instansi sudah dikirim ke email: ${email}` });
  } catch (err) { res.status(500).send("Error Daftar: " + err.message); }
});

app.post('/auth/login', async (req, res) => {
  const { kode, email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_instansi WHERE kode_instansi = $1', [kode]);
    if (result.rows.length === 0) return res.render('login', { msg: "Kode Instansi tidak ditemukan!" });
    const isMatch = await bcrypt.compare(pass, result.rows[0].password);
    if (!isMatch) return res.render('login', { msg: "Password salah, Pak Haji!" });
    res.render('dashboard', { instansi: result.rows[0].nama_instansi, kode: kode });
  } catch (err) { res.send(err.message); }
});

app.post('/auth/forget', async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query('SELECT nama_instansi, kode_instansi FROM global_instansi WHERE admin_email = $1', [email]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      await sendMail(
        email, 
        "Pemulihan Kode Instansi Bapak", 
        `<p>Halo Admin ${user.nama_instansi},</p><p>Kode Instansi Anda adalah: <b>${user.kode_instansi}</b></p>`
      );
      res.render('forget', { msg: "Berhasil! Cek inbox email Bapak." });
    } else { res.render('forget', { msg: "Maaf, email tersebut tidak terdaftar!" }); }
  } catch (err) { res.status(500).send(err.message); }
});


// ==========================================
// 🎓 3. LOGIKA SISWA (BARU - TERKONEKSI BREVO)
// ==========================================

app.post('/auth/register-siswa', async (req, res) => {
  const { nama, email, pass } = req.body;
  try {
    const hashed = await bcrypt.hash(pass, 10);
    await pool.query(
      'INSERT INTO global_siswa (nama_siswa, email, password) VALUES ($1,$2,$3)', 
      [nama, email, hashed]
    );

    // Kirim email selamat datang ke Siswa via Brevo
    await sendMail(
      email, 
      "Selamat Datang Siswa Baru!", 
      `<h1>Halo ${nama}!</h1><p>Akun siswa Anda di Global School AI telah aktif.</p><p>Silakan gunakan email ini untuk masuk ke ruang belajar.</p>`
    );
    
    res.render('login_siswa', { msg: "Pendaftaran Berhasil! Silakan Login." });
  } catch (err) { res.status(500).send("Error Daftar Siswa: " + err.message); }
});

app.post('/auth/login-siswa', async (req, res) => {
  const { email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_siswa WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.render('login_siswa', { msg: "Email tidak ditemukan!" });
    
    const isMatch = await bcrypt.compare(pass, result.rows[0].password);
    if (!isMatch) return res.render('login_siswa', { msg: "Password salah!" });
    
    // Sementara arahkan ke pesan sukses (Nanti bisa bapak buatkan dashboard_siswa.ejs)
    res.send(`<h1 style="text-align:center; color:green; margin-top:50px;">Selamat Belajar, ${result.rows[0].nama_siswa}!</h1>`);
  } catch (err) { res.send(err.message); }
});

app.post('/auth/forget-siswa', async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query('SELECT nama_siswa FROM global_siswa WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      await sendMail(
        email, 
        "Pemulihan Akun Siswa", 
        `<p>Halo ${result.rows[0].nama_siswa},</p><p>Permintaan reset akun kami terima. Jika Anda lupa password, silakan hubungi Admin Sekolah Bapak.</p>`
      );
      res.render('forget_siswa', { msg: "Instruksi sudah dikirim ke email siswa." });
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
  🚀 SERVER GLOBAL SCHOOL MELUNCUR!
  -----------------------------------------
  📍 Port     : ${PORT}
  📧 Sender   : azhardax94@gmail.com
  🧠 AI Brain : Gemini Active (Guru & Siswa)
  =========================================
  `);
});
