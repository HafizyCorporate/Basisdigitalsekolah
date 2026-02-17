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
const { processAI } = require('./ai'); // Pastikan ai.js sudah diperbaiki (lihat poin 2)
const { sendMail } = require('./email');

const app = express();

// --- PERBAIKAN PENTING: TRUST PROXY ---
app.set('trust proxy', 1); 

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // Meningkatkan kapasitas buffer untuk streaming video
});

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

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ==========================================
// 🎯 1. ROUTES (AUTH & TAMPILAN) - TETAP SAMA
// ==========================================
app.get('/', (req, res) => res.render('landing'));
app.get('/login', (req, res) => res.render('login', { msg: null }));
app.get('/register', (req, res) => res.render('register', { msg: null }));
app.get('/forget', (req, res) => res.render('forget', { msg: null, step: 1, email: null }));
app.get('/register-guru', (req, res) => res.render('register-guru', { msg: null }));
app.get('/login-siswa', (req, res) => res.render('login_siswa', { msg: null }));
app.get('/register-siswa', (req, res) => res.render('register_siswa', { msg: null }));
app.get('/forget-siswa', (req, res) => res.render('forget_siswa', { msg: null, step: 1, email: null }));
app.get('/verify', (req, res) => res.render('verify', { msg: null }));
app.get('/verify-guru', (req, res) => {
    const email = req.query.email || "";
    res.render('verify-guru', { msg: null, email: email });
});

// --- LOGIKA AUTH (GURU/SISWA) TETAP SESUAI KODINGAN ANDA ---
app.post('/auth/register', async (req, res) => {
  const { nama, email, pass } = req.body;
  const kode = "SCH-" + Math.random().toString(36).substring(2, 7).toUpperCase();
  const otp = generateOTP(); 
  try {
    const hashed = await bcrypt.hash(pass, 10);
    await pool.query('INSERT INTO global_instansi (nama_instansi, kode_instansi, admin_email, password, otp) VALUES ($1,$2,$3,$4,$5)', [nama, kode, email, hashed, otp]);
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${kode}"`);
    await pool.query(`CREATE TABLE IF NOT EXISTS "${kode}".materi (id SERIAL PRIMARY KEY, judul TEXT, konten JSONB)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS "${kode}".penilaian (id SERIAL PRIMARY KEY, nama TEXT, email TEXT, kelas TEXT, tipe TEXT, skor INT, jawaban_essay TEXT, feedback_ai TEXT, materi TEXT, waktu TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await sendMail(email, "Kode Verifikasi Pendaftaran Sekolah", `<h1>Verifikasi Akun</h1><p>KODE OTP ANDA: <b>${otp}</b></p><p>Kode Instansi: <b>${kode}</b></p>`);
    res.render('verify', { msg: `Pendaftaran Berhasil! Silakan masukkan OTP dari email: ${email}` });
  } catch (err) { res.status(500).send("Error Daftar: " + err.message); }
});

app.post('/auth/verify', async (req, res) => {
    const { kode, otp } = req.body;
    try {
      const result = await pool.query('SELECT * FROM global_instansi WHERE kode_instansi = $1 AND otp = $2', [kode, otp]);
      if (result.rows.length > 0) res.render('login', { msg: "Verifikasi Sukses! Silakan Login." });
      else res.render('verify', { msg: "Kode Instansi atau OTP Salah!" });
    } catch (err) { res.status(500).send("Error Verifikasi: " + err.message); }
});

app.post('/auth/login', async (req, res) => {
  const { kode, email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_instansi WHERE kode_instansi = $1', [kode]);
    if (result.rows.length === 0) return res.render('login', { msg: "Kode Instansi tidak ditemukan!" });
    const isMatch = await bcrypt.compare(pass, result.rows[0].password);
    if (!isMatch) return res.render('login', { msg: "Password salah!" });
    res.render('dashboard', { instansi: result.rows[0].nama_instansi, kode: kode, nama_guru: "Administrator" });
  } catch (err) { res.send(err.message); }
});

// --- API SISWA & UPDATE KELAS ---
app.post('/auth/login-siswa', async (req, res) => {
  const { email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_siswa WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.render('login_siswa', { msg: "Email tidak ditemukan!" });
    const isMatch = await bcrypt.compare(pass, result.rows[0].password);
    if (!isMatch) return res.render('login_siswa', { msg: "Password salah!" });
    res.render('dashboard-murid', { 
        nama_siswa: result.rows[0].nama_siswa, email_siswa: result.rows[0].email,
        kode_sekolah: result.rows[0].kode_sekolah, kelas_siswa: result.rows[0].kelas 
    });
  } catch (err) { res.send(err.message); }
});

app.post('/api/update-kelas-siswa', async (req, res) => {
    const { email, kelas } = req.body;
    try {
        await pool.query('UPDATE global_siswa SET kelas = $1 WHERE email = $2', [kelas, email]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 🤖 2. API AI (MENGGUNAKAN processAI DI ai.js)
// ==========================================
app.post('/api/generate', async (req, res) => {
  try {
    // Memanggil processAI yang sudah kita perbaiki skemanya
    const data = await processAI(req.body.instruksi);
    res.json(data);
  } catch (err) { 
    console.error("AI Error:", err.message);
    res.status(500).json({ error: "AI sedang sibuk atau limit tercapai." }); 
  }
});

app.get('/api/kelas/:kode', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM global_kelas WHERE kode_sekolah = $1', [req.params.kode]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 🚀 3. SOCKET.IO (REAL-TIME & VIDEO STREAM)
// ==========================================
let onlineUsers = {}; 

io.on('connection', (socket) => {
  console.log('User Terkoneksi:', socket.id);

  socket.on('join-room', (data) => {
    const roomID = typeof data === 'object' ? data.room : data;
    const userName = data.nama || null;
    const userRole = data.role || 'Umum';

    socket.join(roomID);
    socket.userName = userName;
    socket.userRoom = roomID;
    socket.userRole = userRole;

    if (userRole === 'Siswa' && userName) {
        if (!onlineUsers[roomID]) onlineUsers[roomID] = new Set();
        onlineUsers[roomID].add(userName);
        io.to(roomID).emit('update-absen', Array.from(onlineUsers[roomID]));
    }
  });

  // --- LOGIKA VIDEO STREAMING (BARU) ---
  socket.on('stream-frame', (data) => {
      // Guru mengirim frame gambar ke semua siswa di room yang sama
      socket.to(data.room).emit('update-frame', { image: data.image, room: data.room });
  });

  socket.on('change-view-mode', (data) => {
      // Mengubah tampilan murid (Kamera/Materi AI)
      socket.to(data.room).emit('change-view-mode', data);
  });

  socket.on('force-mute', (data) => {
      socket.to(data.room).emit('force-mute');
  });

  // --- LOGIKA CHAT & MATERI ---
  socket.on('chat-message', (data) => {
    io.to(data.room).emit('chat-message', data); 
  });

  socket.on('new-materi', (data) => {
    socket.to(data.room).emit('new-materi', data);
  });

  socket.on('start-quiz', (quizData) => {
    socket.to(quizData.room).emit('start-quiz', quizData);
  });

  socket.on('update-score-guru', async (data) => {
    try {
        const { name, score, feedback, kelas, materi_id } = data;
        const room = socket.userRoom;
        await pool.query(
            `INSERT INTO global_jawaban (nama_siswa, skor, umpan_balik_ai, nama_kelas, materi_id, created_at) 
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [name, score, feedback, kelas || 'Umum', materi_id || 0]
        );
        io.to(room).emit('score-updated-live', {
            nama_siswa: name, skor: score, umpan_balik: feedback,
            waktu: new Date().toLocaleTimeString('id-ID')
        });
    } catch (err) { console.error("❌ Gagal simpan skor:", err.message); }
  });

  socket.on('disconnect', () => {
    const room = socket.userRoom;
    const nama = socket.userName;
    if (socket.userRole === 'Siswa' && onlineUsers[room]) {
        onlineUsers[room].delete(nama);
        io.to(room).emit('update-absen', Array.from(onlineUsers[room]));
    }
  });
});

const PORT = process.env.PORT || 8080; 
server.listen(PORT, () => {
  console.log(`🚀 SERVER GLOBAL SCHOOL AKTIF PADA PORT: ${PORT}`);
});
