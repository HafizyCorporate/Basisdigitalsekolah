require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');

// --- SECURITY ADD-ON (IMPORT) ---
const helmet = require('helmet'); // Untuk header keamanan
const rateLimit = require('express-rate-limit'); // Untuk batasi spam request
// --------------------------------

// Import file yang dipisah (Gudang, Otak, Kurir)
const { pool, initDb } = require('./db');
const { processAI } = require('./ai');
const { sendMail } = require('./email');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- SECURITY ADD-ON (MIDDLEWARE) ---
// 1. HELMET: Melindungi header HTTP
// contentSecurityPolicy: false -> Agar Tailwind CDN di EJS tidak terblokir
app.use(helmet({
  contentSecurityPolicy: false, 
}));

// 2. RATE LIMIT: Batasi 100 request per 15 menit per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: "Terlalu banyak permintaan dari IP ini, coba lagi nanti."
});
app.use(limiter);
// ------------------------------------

// Setup Engine Tampilan
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Jalankan Auto-Setup Database pas server nyala
initDb();

// --- 1. ROUTES TAMPILAN (EJS) ---
app.get('/', (req, res) => res.render('login', { msg: null }));
app.get('/register', (req, res) => res.render('register', { msg: null }));
app.get('/forget', (req, res) => res.render('forget', { msg: null }));

// --- 2. LOGIKA DAFTAR (REGISTER) ---
app.post('/auth/register', async (req, res) => {
  const { nama, email, pass } = req.body;
  // Generate Kode Unik Sekolah
  const kode = "SCH-" + Math.random().toString(36).substring(2, 7).toUpperCase();
  
  try {
    const hashed = await bcrypt.hash(pass, 10);
    
    // Simpan ke Tabel Utama
    await pool.query(
      'INSERT INTO global_instansi (nama_instansi, kode_instansi, admin_email, password) VALUES ($1,$2,$3,$4)', 
      [nama, kode, email, hashed]
    );
    
    // Buat Kamar (Schema) Khusus Sekolah Ini agar data tidak campur
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${kode}"`);
    await pool.query(`CREATE TABLE "${kode}".materi (id SERIAL PRIMARY KEY, judul TEXT, konten JSONB)`);
    
    // PANGGIL BREVO: Kirim email selamat datang & Kode Instansi
    await sendMail(
      email, 
      "Selamat Datang di Global School AI!", 
      `<h1>Registrasi Berhasil!</h1><p>Nama Sekolah: <b>${nama}</b></p><p>Kode Instansi Anda: <b style="color:blue;">${kode}</b></p><p>Simpan kode ini untuk login admin.</p>`
    );
    
    res.render('login', { msg: `Sukses! Kode Instansi sudah dikirim ke email: ${email}` });
  } catch (err) { 
    res.status(500).send("Error Daftar: " + err.message); 
  }
});

// --- 3. LOGIKA MASUK (LOGIN) ---
app.post('/auth/login', async (req, res) => {
  const { kode, email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_instansi WHERE kode_instansi = $1', [kode]);
    
    if (result.rows.length === 0) return res.render('login', { msg: "Kode Instansi tidak ditemukan!" });
    
    const isMatch = await bcrypt.compare(pass, result.rows[0].password);
    if (!isMatch) return res.render('login', { msg: "Password salah, Pak Haji!" });
    
    // Lempar ke halaman Dashboard
    res.render('dashboard', { instansi: result.rows[0].nama_instansi, kode: kode });
  } catch (err) { res.send(err.message); }
});

// --- 4. LOGIKA LUPA KODE (FORGET) ---
app.post('/auth/forget', async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query('SELECT nama_instansi, kode_instansi FROM global_instansi WHERE admin_email = $1', [email]);
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      // PANGGIL BREVO: Kirim ulang kodenya
      await sendMail(
        email, 
        "Pemulihan Kode Instansi Bapak", 
        `<p>Halo Admin ${user.nama_instansi},</p><p>Kode Instansi Anda adalah: <b>${user.kode_instansi}</b></p>`
      );
      res.render('forget', { msg: "Berhasil! Cek inbox email Bapak." });
    } else {
      res.render('forget', { msg: "Maaf, email tersebut tidak terdaftar!" });
    }
  } catch (err) { res.status(500).send(err.message); }
});

// --- 5. API UNTUK AI (GEMINI) ---
app.post('/api/generate', async (req, res) => {
  try {
    // Panggil Otak AI di file ai.js
    const data = await processAI(req.body.instruksi);
    res.json(data);
  } catch (err) { 
    res.status(500).json({ error: "AI sedang sibuk, coba lagi nanti." }); 
  }
});

// --- RUN SERVER (PORT 8080) ---
// Pakai process.env.PORT agar Railway bisa atur otomatis, tapi default 8080
const PORT = process.env.PORT || 8080; 
server.listen(PORT, () => {
  console.log(`
  =========================================
  🚀 SERVER GLOBAL SCHOOL MELUNCUR!
  -----------------------------------------
  📍 Port     : ${PORT}
  📧 Sender   : azhardax94@gmail.com
  🧠 AI Brain : Gemini 2.5 Active
  =========================================
  `);
});
