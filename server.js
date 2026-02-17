require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 

// Import module eksternal
const { pool, initDb } = require('./db');
const { processAI, periksaUjian } = require('./ai'); 
const { sendMail } = require('./email');

const app = express();
app.set('trust proxy', 1); 

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8, // Kapasitas 100MB untuk stream video lebih lancar
    cors: { origin: "*" }
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
// Rate limiter dilonggarkan untuk operasional sekolah
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 500, 
  message: "Terlalu banyak permintaan, coba lagi nanti."
});
app.use(limiter);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

initDb();

// ==========================================
// 🧠 MEMORY STORAGE (JANTUNG PERBAIKAN)
// ==========================================
let activeQuizzes = {}; // Menyimpan Kunci Jawaban Asli di Server
let onlineUsers = {}; 

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ==========================================
// 🎯 1. ROUTES (AUTH & API)
// ==========================================
app.get('/', (req, res) => res.render('landing'));
app.get('/login', (req, res) => res.render('login', { msg: null }));
app.get('/register', (req, res) => res.render('register', { msg: null }));
app.get('/login-siswa', (req, res) => res.render('login_siswa', { msg: null }));
app.get('/register-siswa', (req, res) => res.render('register_siswa', { msg: null }));
app.get('/verify-guru', (req, res) => res.render('verify-guru', { msg: null, email: req.query.email || "" }));

// AUTH GURU
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
    await pool.query(`CREATE TABLE IF NOT EXISTS "${kode}".penilaian (id SERIAL PRIMARY KEY, nama TEXT, email TEXT, kelas TEXT, tipe TEXT, skor INT, jawaban_essay TEXT, feedback_ai TEXT, materi TEXT, waktu TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    
    await sendMail(email, "Kode Verifikasi", `OTP: ${otp}, Kode Sekolah: ${kode}`);
    res.render('verify', { msg: `Masukkan OTP untuk: ${email}` });
  } catch (err) { res.status(500).send("Error: " + err.message); }
});

app.post('/auth/login-guru', async (req, res) => {
  const { email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_guru WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.render('login', { msg: "Akun Guru tidak ditemukan!" });
    if (!(await bcrypt.compare(pass, result.rows[0].password))) return res.render('login', { msg: "Password salah!" });

    const infoSekolah = await pool.query('SELECT nama_instansi FROM global_instansi WHERE kode_instansi = $1', [result.rows[0].kode_sekolah]);
    res.render('dashboard', { 
        instansi: infoSekolah.rows[0]?.nama_instansi || "Global School", 
        kode: result.rows[0].kode_sekolah,
        nama_guru: result.rows[0].nama_guru 
    });
  } catch (err) { res.render('login', { msg: "Kesalahan sistem login." }); }
});

// AUTH SISWA
app.post('/auth/login-siswa', async (req, res) => {
  const { email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_siswa WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.render('login_siswa', { msg: "Email tidak ditemukan!" });
    if (!(await bcrypt.compare(pass, result.rows[0].password))) return res.render('login_siswa', { msg: "Password salah!" });
    
    res.render('dashboard-murid', { 
        nama_siswa: result.rows[0].nama_siswa, 
        email_siswa: result.rows[0].email,
        kode_sekolah: result.rows[0].kode_sekolah,
        kelas_siswa: result.rows[0].kelas 
    });
  } catch (err) { res.send(err.message); }
});

// API GENERATE AI
app.post('/api/generate', async (req, res) => {
  try {
    const data = await processAI(req.body.instruksi);
    res.json(data);
  } catch (err) { res.status(500).json({ error: "AI Sibuk." }); }
});

// ==========================================
// 🚀 2. SOCKET.IO (JANTUNG SINKRONISASI)
// ==========================================

io.on('connection', (socket) => {
  
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

  socket.on('stream-frame', (data) => {
      socket.to(data.room).emit('receive-frame', { 
          image: data.image, 
          room: data.room,
          name: socket.userName 
      });
  });

  socket.on('chat-message', (data) => {
    io.to(data.room).emit('chat-message', data); 
  });

  // --- LOGIKA KUIS AMAN (SERVER-SIDE PROTECTION) ---
  socket.on('start-quiz', (quizData) => {
    // 1. Simpan Master Soal (Lengkap dengan Kunci) di Memori Server
    activeQuizzes[quizData.room] = quizData; 

    // 2. Buat Duplikat "Aman" untuk dikirim ke Siswa (Hapus Kunci Jawaban)
    const soalAman = JSON.parse(JSON.stringify(quizData));
    if(soalAman.soal_pg) soalAman.soal_pg.forEach(s => delete s.c);
    if(soalAman.soal_quiz) soalAman.soal_quiz.forEach(s => delete s.jawaban_benar);
    if(soalAman.soal_essay) soalAman.soal_essay.forEach(s => delete s.kriteria);
    
    // 3. Kirim soal yang sudah disensor ke semua murid di room
    socket.to(quizData.room).emit('start-quiz', soalAman);
    console.log(`[QUIZ] Dimulai di room ${quizData.room}. Kunci disimpan di Server.`);
  });

  // --- LOGIKA PENILAIAN SENTRALISTIK (THE HEART) ---
  socket.on('submit-jawaban-siswa', async (data) => {
    try {
        const { name, email, kelas, room, jawabanMurid, materi_judul } = data;
        
        // 1. Ambil Kunci Jawaban dari Server Memori
        const soalAsli = activeQuizzes[room];

        if (!soalAsli) {
            console.error("❌ Data kuis tidak ditemukan di server!");
            return;
        }

        // 2. AI Memeriksa Jawaban dengan membandingkan Jawaban Murid vs Kunci Asli
        const hasilAI = await periksaUjian(soalAsli, jawabanMurid);

        const kodeSekolah = room.includes('-') ? room.split('-').slice(0, 2).join('-') : room;

        // 3. Simpan ke Database Sekolah (Schema Sekolah)
        await pool.query(
            `INSERT INTO "${kodeSekolah}".penilaian (nama, email, kelas, tipe, skor, feedback_ai, materi, jawaban_essay) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [name, email || '', kelas, 'Kuis AI', hasilAI.skor_total, hasilAI.analisis, materi_judul, JSON.stringify(jawabanMurid.essay)]
        );

        // 4. Simpan ke Database Global (Untuk Scoreboard Umum)
        await pool.query(
            `INSERT INTO global_jawaban (nama_siswa, skor, umpan_balik_ai, nama_kelas, created_at) 
             VALUES ($1, $2, $3, $4, NOW())`,
            [name, hasilAI.skor_total, hasilAI.analisis, kelas]
        );

        // 5. Update Live Dashboard Guru
        io.to(room).emit('score-updated-live', {
            nama_siswa: name,
            skor: hasilAI.skor_total,
            umpan_balik: hasilAI.analisis,
            feedback_guru: hasilAI.feedback_guru,
            waktu: new Date().toLocaleTimeString(),
            status: "Selesai AI"
        });

        // 6. Kirim Skor Langsung ke Murid yang bersangkutan
        io.to(room).emit('personal-score', {
            target: name,
            skor: hasilAI.skor_total,
            umpan_balik: hasilAI.analisis
        });

    } catch (err) { console.error("Submit Error:", err.message); }
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
  console.log(`🚀 SERVER SYNCED & READY ON PORT ${PORT}`);
});
