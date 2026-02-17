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
    maxHttpBufferSize: 1e8, // 100MB untuk stream video
    cors: { origin: "*" }
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 500, 
  message: "Terlalu banyak permintaan."
});
app.use(limiter);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

initDb();

// ==========================================
// 🧠 MEMORY STORAGE (STATE MANAGEMENT)
// ==========================================
let activeQuizzes = {}; 
let onlineUsers = {}; 

// ==========================================
// 🎯 1. ROUTES (AUTH & API)
// ==========================================
app.get('/', (req, res) => res.render('landing'));
app.get('/login', (req, res) => res.render('login', { msg: null }));
app.get('/login-siswa', (req, res) => res.render('login_siswa', { msg: null }));

// Auth Guru & Siswa (Logika Tetap Sama)
app.post('/auth/login-guru', async (req, res) => {
  const { email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_guru WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.render('login', { msg: "Akun tidak ditemukan!" });
    if (!(await bcrypt.compare(pass, result.rows[0].password))) return res.render('login', { msg: "Password salah!" });

    const infoSekolah = await pool.query('SELECT nama_instansi FROM global_instansi WHERE kode_instansi = $1', [result.rows[0].kode_sekolah]);
    res.render('dashboard', { 
        instansi: infoSekolah.rows[0]?.nama_instansi || "Global School", 
        kode: result.rows[0].kode_sekolah,
        nama_guru: result.rows[0].nama_guru 
    });
  } catch (err) { res.render('login', { msg: "Kesalahan sistem login." }); }
});

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

app.post('/api/generate', async (req, res) => {
  try {
    const data = await processAI(req.body.instruksi);
    res.json(data);
  } catch (err) { res.status(500).json({ error: "AI Sedang sibuk." }); }
});

// ==========================================
// 🚀 2. SOCKET.IO (MODERN COLLABORATION)
// ==========================================

io.on('connection', (socket) => {
  
  // Join Room & Absensi
  socket.on('join-room', (data) => {
    const roomID = typeof data === 'object' ? data.room : data;
    const userName = data.nama || 'Anonymous';
    const userRole = data.role || 'Siswa';

    socket.join(roomID);
    socket.userName = userName;
    socket.userRoom = roomID;
    socket.userRole = userRole;

    if (!onlineUsers[roomID]) onlineUsers[roomID] = [];
    
    // Hindari duplikasi nama dalam satu room
    if (!onlineUsers[roomID].find(u => u.name === userName)) {
        onlineUsers[roomID].push({ name: userName, role: userRole });
    }
    
    io.to(roomID).emit('update-attendance', onlineUsers[roomID]);
    
    // Beritahu guru ada user baru untuk grid monitoring
    if (userRole === 'Siswa') {
        socket.to(roomID).emit('join-live', { name: userName });
    }
  });

  // Video Streaming (Guru -> Siswa & Monitoring Siswa -> Guru)
  socket.on('update-frame', (data) => {
      // Broadcast frame ke semua orang di room tersebut
      socket.to(data.room).emit('receive-frame', { 
          image: data.image, 
          name: socket.userName 
      });
  });

  // Chatting Dua Arah (Guru <-> Murid)
  socket.on('chat-message', (data) => {
    // Memastikan pengirim disertakan dalam data agar UI bisa membedakan Chat In/Out
    io.to(data.room).emit('chat-message', {
        user: data.user,
        msg: data.msg,
        role: data.role
    }); 
  });

  // LOGIKA KUIS AMAN (MASTER KEY PROTECTION)
  socket.on('start-quiz', (payload) => {
    const { room, fullData } = payload;
    
    // 1. Simpan Master Soal (Lengkap dengan Kunci) di Server
    activeQuizzes[room] = fullData; 

    // 2. Buat Salinan Bersih (Sensor Kunci Jawaban)
    const cleanData = JSON.parse(JSON.stringify(fullData));
    
    if(cleanData.soal_pg) cleanData.soal_pg.forEach(s => delete s.c);
    if(cleanData.soal_quiz) cleanData.soal_quiz.forEach(s => delete s.jawaban_benar);
    if(cleanData.soal_essay) cleanData.soal_essay.forEach(s => delete s.kriteria);
    
    // 3. Kirim soal "Aman" ke semua murid
    socket.to(room).emit('start-quiz', cleanData);
    console.log(`[SECURE QUIZ] Started in ${room}. Answers stored in memory.`);
  });

  // PENILAIAN AI SENTRALISTIK
  socket.on('submit-jawaban-siswa', async (data) => {
    try {
        const { name, email, kelas, room, jawabanMurid, materi_judul } = data;
        
        // 1. Ambil Kunci Jawaban dari Memory Server (Bukan dari Client Siswa)
        const soalAsli = activeQuizzes[room];
        if (!soalAsli) return console.error("❌ Quiz key missing in server memory!");

        // 2. Proses Penilaian AI
        const hasilAI = await periksaUjian(soalAsli, jawabanMurid);
        const kodeSekolah = room.includes('-') ? room.split('-')[0] : room;

        // 3. Simpan ke Database (Schema Sekolah & Global)
        await pool.query(
            `INSERT INTO "${kodeSekolah}".penilaian (nama, email, kelas, tipe, skor, feedback_ai, materi, jawaban_essay) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [name, email, kelas, 'Kuis AI', hasilAI.skor_total, hasilAI.analisis, materi_judul, JSON.stringify(jawabanMurid.essay)]
        );

        await pool.query(
            `INSERT INTO global_jawaban (nama_siswa, skor, umpan_balik_ai, nama_kelas) 
             VALUES ($1, $2, $3, $4)`,
            [name, hasilAI.skor_total, hasilAI.analisis, kelas]
        );

        // 4. Update Dashboard Guru Secara Live
        io.to(room).emit('score-updated-live', {
            nama_siswa: name,
            skor: hasilAI.skor_total,
            umpan_balik: hasilAI.analisis,
            feedback_guru: hasilAI.feedback_guru,
            waktu: new Date().toLocaleTimeString()
        });

        // 5. Beri Notifikasi Skor ke Murid
        socket.emit('personal-score', {
            skor: hasilAI.skor_total,
            umpan_balik: hasilAI.analisis
        });

    } catch (err) { console.error("Evaluation Error:", err.message); }
  });

  // Handle Disconnect & Pembersihan List Online
  socket.on('disconnect', () => {
    const room = socket.userRoom;
    const name = socket.userName;
    if (onlineUsers[room]) {
        onlineUsers[room] = onlineUsers[room].filter(u => u.name !== name);
        io.to(room).emit('update-attendance', onlineUsers[room]);
    }
  });
});

const PORT = process.env.PORT || 8080; 
server.listen(PORT, () => {
  console.log(`🚀 SERVER ZOOM-STYLE READY ON PORT ${PORT}`);
});
