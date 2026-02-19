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
    maxHttpBufferSize: 1e8,
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
// 🧠 MEMORY STORAGE
// ==========================================
let activeQuizzes = {}; 
let onlineUsers = {}; 

// ==========================================
// 🎯 ROUTES VIEW (HALAMAN)
// ==========================================

app.get('/', (req, res) => res.render('landing'));
app.get('/login', (req, res) => res.render('login', { msg: null }));
app.get('/login-siswa', (req, res) => res.render('login_siswa', { msg: null }));

app.get('/register', (req, res) => res.render('register', { msg: null }));
app.get('/register-guru', (req, res) => res.render('register-guru', { msg: null }));
app.get('/register-siswa', (req, res) => res.render('register_siswa', { msg: null }));
app.get('/verify-guru', (req, res) => res.render('verify-guru', { msg: null, email: req.query.email || "" }));

// [BARU] Route Halaman Lupa Password
app.get('/forget', (req, res) => res.render('forget', { msg: null, step: 1 }));
app.get('/forget-siswa', (req, res) => res.render('forget_siswa', { msg: null, step: 1 }));

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ==========================================
// 🔐 AUTHENTICATION ROUTES
// ==========================================

// 1. REGISTER INSTANSI (ADMIN SEKOLAH)
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${kode}".penilaian (
        id SERIAL PRIMARY KEY,
        nama TEXT,
        email TEXT,
        kelas TEXT,
        tipe TEXT,
        skor INT,
        jawaban_essay TEXT,
        feedback_ai TEXT,
        materi TEXT,
        waktu TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );
    
    await sendMail(email, "Kode Verifikasi", `OTP: ${otp}, Kode Sekolah: ${kode}`);
    
    // [UPDATE] Render ke verify.ejs (bukan verify-guru) untuk Admin
    res.render('verify', { msg: `Masukkan OTP yang dikirim ke: ${email}`, email });

  } catch (err) {
    console.error("Register Error:", err);
    if (err.code === '23505') {
        return res.render('register', { msg: "Email instansi sudah terdaftar." });
    }
    res.status(500).send("Error: " + err.message);
  }
});

// [BARU] VERIFIKASI OTP INSTANSI
app.post('/auth/verify', async (req, res) => {
    const { kode, otp } = req.body;
    try {
        const result = await pool.query('SELECT * FROM global_instansi WHERE kode_instansi = $1', [kode]);
        
        if (result.rows.length === 0) return res.render('verify', { msg: "Kode Sekolah Salah!" });
        if (result.rows[0].otp !== otp) return res.render('verify', { msg: "OTP Salah!" });

        // Hapus OTP setelah verified
        await pool.query('UPDATE global_instansi SET otp = null WHERE kode_instansi = $1', [kode]);

        res.render('login', { msg: "Verifikasi Berhasil! Silakan Login Guru." });
    } catch (err) {
        res.render('verify', { msg: "Terjadi kesalahan server." });
    }
});

// 2. REGISTER GURU
app.post('/auth/register-guru', async (req, res) => {
    const { nama, email, pass, kode_sekolah } = req.body;
    try {
        const hashed = await bcrypt.hash(pass, 10);
        await pool.query(
            'INSERT INTO global_guru (nama_guru, email, password, kode_sekolah) VALUES ($1,$2,$3,$4)',
            [nama, email, hashed, kode_sekolah]
        );
        res.render('login', { msg: "Pendaftaran Guru Berhasil! Silakan Login." });
    } catch {
        res.render('register-guru', { msg: "Email sudah terdaftar atau kode salah." });
    }
});

// 3. AKTIVASI GURU (Route yang sebelumnya hilang)
app.post('/auth/activate-guru', async (req, res) => {
    const { email, password, kode_sekolah, nama_guru } = req.body;
    try {
        const hashed = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO global_guru (nama_guru, email, password, kode_sekolah) VALUES ($1,$2,$3,$4)',
            [nama_guru, email, hashed, kode_sekolah]
        );
        res.redirect('/login?alert=sukses_aktivasi');
    } catch (err) {
        console.error("Error Aktivasi Guru:", err);
        res.render('register-guru', { msg: "Gagal Aktivasi: Email mungkin sudah terdaftar." });
    }
});

// 4. REGISTER SISWA
app.post('/auth/register-siswa', async (req, res) => {
    const { nama, email, pass, kode_sekolah, kelas } = req.body;
    try {
        const hashed = await bcrypt.hash(pass, 10);
        await pool.query(
            'INSERT INTO global_siswa (nama_siswa, email, password, kode_sekolah, kelas) VALUES ($1,$2,$3,$4,$5)',
            [nama, email, hashed, kode_sekolah, kelas]
        );
        res.render('login_siswa', { msg: "Pendaftaran Siswa Berhasil! Silakan Login." });
    } catch {
        res.render('register_siswa', { msg: "Gagal mendaftar siswa. Email mungkin sudah ada." });
    }
});

// 5. LOGIN GURU
app.post('/auth/login-guru', async (req, res) => {
  const { email, pass } = req.body;

  try {
    const result = await pool.query('SELECT * FROM global_guru WHERE email = $1', [email]);
    if (!result.rows.length) return res.render('login', { msg: "Akun tidak ditemukan!" });
    if (!(await bcrypt.compare(pass, result.rows[0].password)))
        return res.render('login', { msg: "Password salah!" });

    const infoSekolah = await pool.query(
        'SELECT nama_instansi FROM global_instansi WHERE kode_instansi = $1',
        [result.rows[0].kode_sekolah]
    );

    res.render('dashboard', { 
        instansi: infoSekolah.rows[0]?.nama_instansi || "Global School",
        kode: result.rows[0].kode_sekolah,
        nama_guru: result.rows[0].nama_guru 
    });

  } catch {
    res.render('login', { msg: "Kesalahan sistem login." });
  }
});

// 6. LOGIN SISWA
app.post('/auth/login-siswa', async (req, res) => {
    const { email, pass } = req.body;
    try {
      const result = await pool.query('SELECT * FROM global_siswa WHERE email = $1', [email]);
      if (!result.rows.length) return res.render('login_siswa', { msg: "Email tidak ditemukan!" });
      if (!(await bcrypt.compare(pass, result.rows[0].password)))
          return res.render('login_siswa', { msg: "Password salah!" });

      res.render('dashboard-murid', { 
          nama_siswa: result.rows[0].nama_siswa,
          email_siswa: result.rows[0].email,
          kode_sekolah: result.rows[0].kode_sekolah,
          kelas_siswa: result.rows[0].kelas 
      });

    } catch (err) {
      res.send(err.message);
    }
});

// [BARU] 7. FORGOT PASSWORD (GURU)
app.post('/auth/forget', async (req, res) => {
    const { email } = req.body;
    // Di sini Anda bisa tambahkan logika kirim email OTP asli
    // Untuk sekarang simulasi sukses agar tidak error
    res.render('forget', { msg: "OTP telah dikirim ke email Anda (Simulasi)", step: 2, email: email });
});

app.post('/auth/reset-password', async (req, res) => {
    const { email, otp, newPass } = req.body;
    // Logika validasi OTP disini
    try {
        const hashed = await bcrypt.hash(newPass, 10);
        await pool.query('UPDATE global_guru SET password = $1 WHERE email = $2', [hashed, email]);
        res.render('login', { msg: "Password berhasil diubah! Silakan login." });
    } catch (e) {
        res.render('forget', { msg: "Gagal reset password.", step: 2, email });
    }
});

// [BARU] 8. FORGOT PASSWORD (SISWA)
app.post('/auth/forget-siswa', async (req, res) => {
    const { email } = req.body;
    res.render('forget_siswa', { msg: "OTP dikirim (Simulasi)", step: 2, email: email });
});

app.post('/auth/reset-password-siswa', async (req, res) => {
    const { email, newPass } = req.body;
    try {
        const hashed = await bcrypt.hash(newPass, 10);
        await pool.query('UPDATE global_siswa SET password = $1 WHERE email = $2', [hashed, email]);
        res.render('login_siswa', { msg: "Password berhasil diubah!" });
    } catch (e) {
        res.render('forget_siswa', { msg: "Gagal reset password.", step: 2, email });
    }
});


// ==========================================
// 📡 API ROUTES (DATA & AI)
// ==========================================

// API AI
app.post('/api/generate', async (req, res) => {
  try {
    const data = await processAI(req.body.instruksi);
    res.json(data);
  } catch {
    res.status(500).json({ error: "AI Sedang sibuk." });
  }
});

// API GAMBAR (Pollinations AI + Filter Pemotong Teks)
app.get('/api/gambar', async (req, res) => {
    let prompt = req.query.prompt || "Education";

    try {
        // TRIK CERDAS: Ambil kalimat pertama saja sebelum tanda koma.
        // Contoh: "GERMAN V2 ROCKET, BRITISH RADAR..." -> hanya diambil "GERMAN V2 ROCKET"
        // Ini bikin AI nggak pusing dan URL nggak kepanjangan!
        let cleanPrompt = prompt.split(',')[0].trim(); 
        
        // Gabungkan dengan gaya gambar yang realistis/edukatif
        let query = encodeURIComponent(cleanPrompt + ", high quality, historical educational illustration");

        // Tembak ke Pollinations (AI yang langsung menggambar sesuai request)
        const imageUrl = `https://image.pollinations.ai/prompt/${query}?width=800&height=400&nologo=true`;

        // Lempar gambarnya langsung ke layar presentasi
        res.redirect(imageUrl);

    } catch (error) {
        console.error("Gagal load gambar:", error.message);
        // Kalau server ngadat, kembali ke kotak elegan (bukan pohon lagi hehe)
        res.redirect(`https://placehold.co/800x400/1e293b/ffffff?text=Visual+Materi`);
    }
});

// UPDATE KELAS SISWA
app.post('/api/update-kelas-siswa', async (req, res) => {
    const { email, kelas } = req.body;
    try {
        await pool.query('UPDATE global_siswa SET kelas = $1 WHERE email = $2', [kelas, email]);
        res.json({ status: 'ok', message: 'Kelas berhasil diperbarui' });
    } catch {
        res.status(500).json({ error: "Gagal update kelas." });
    }
});

// TAMBAH KELAS (DARI GURU)
app.post('/api/tambah-kelas', async (req, res) => {
    const { kode_sekolah, nama_kelas } = req.body;
    try {
        // Cek duplikat
        const cek = await pool.query(
            'SELECT * FROM global_kelas WHERE kode_sekolah = $1 AND nama_kelas = $2', 
            [kode_sekolah, nama_kelas]
        );
        
        if (cek.rows.length === 0) {
            await pool.query(
                'INSERT INTO global_kelas (kode_sekolah, nama_kelas) VALUES ($1, $2)', 
                [kode_sekolah, nama_kelas]
            );
        }
        res.json({ status: 'ok', message: 'Kelas berhasil disimpan.' });
    } catch (err) {
        console.error("Error Tambah Kelas:", err);
        res.status(500).json({ error: "Gagal membuat kelas." });
    }
});

// GET DAFTAR KELAS
app.get('/api/kelas/:kode_sekolah', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT nama_kelas FROM global_kelas WHERE kode_sekolah = $1 ORDER BY nama_kelas ASC', 
            [req.params.kode_sekolah]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Gagal mengambil data kelas." });
    }
});


// ==========================================
// 🚀 SOCKET.IO (FIXED STRUCTURE)
// ==========================================

io.on("connection", (socket) => {

  socket.on("join-room", ({ roomID, userName, role }) => {
    socket.join(roomID);
    socket.userName = userName;
    socket.role = role;
    socket.roomID = roomID;
    socket.to(roomID).emit("user-joined", { name: userName, role });
  });

  // --- WEBRTC SIGNALING ---

  socket.on("teacher-ready", (data) => {
    socket.to(data.room).emit("teacher-ready", { teacherId: socket.id });
  });

  socket.on("student-signal", (data) => {
    io.to(data.targetId).emit("student-signal", {
      signal: data.signal,
      senderId: socket.id
    });
  });

  socket.on("teacher-signal", (data) => {
    io.to(data.targetId).emit("teacher-signal", {
      signal: data.signal,
      senderId: socket.id
    });
  });

  // --- STREAM & CHAT ---

  socket.on("stream-frame", (data) => {
    socket.to(data.room).emit("stream-frame", {
      image: data.image,
      name: socket.userName,
      role: socket.role
    });
  });

  socket.on("chat-message", (data) => {
    io.to(data.room).emit("chat-message", {
      user: data.user,
      msg: data.msg,
      role: data.role,
      isPinned: data.isPinned || false
    });
  });

  socket.on("new-materi", (data) => {
    socket.to(data.room).emit("new-materi", data);
  });

  socket.on("change-view-mode", (data) => {
    socket.to(data.room).emit("change-view-mode", data);
  });

  socket.on("mute-all", (data) => {
    socket.to(data.room).emit("mute-all");
  });

  // QUIZ START
  socket.on('start-quiz', (payload) => {
    const { room } = payload;
    activeQuizzes[room] = payload;

    const cleanData = JSON.parse(JSON.stringify(payload));
    if(cleanData.soal_pg) cleanData.soal_pg.forEach(s => delete s.c);
    if(cleanData.soal_quiz) cleanData.soal_quiz.forEach(s => delete s.jawaban_benar);
    if(cleanData.soal_essay) cleanData.soal_essay.forEach(s => delete s.kriteria);

    socket.to(room).emit('start-quiz', cleanData);
  });

  // SUBMIT JAWABAN
  socket.on('submit-jawaban-siswa', async (data) => {
    try {
        const { name, email, kelas, room, jawabanMurid } = data;
        const dataSoal = activeQuizzes[room];
        if (!dataSoal) return;

        const hasilAI = await periksaUjian(dataSoal, jawabanMurid);
        const kodeSekolah = room.includes('-') ? room.split('-')[0] : room;

        await pool.query(
            `INSERT INTO "${kodeSekolah}".penilaian
             (nama,email,kelas,tipe,skor,feedback_ai,materi,jawaban_essay)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [name,email,kelas,dataSoal.type,hasilAI.skor_total,hasilAI.analisis,
             dataSoal.materi_judul || "Kuis Live",
             JSON.stringify(jawabanMurid.essay)]
        );

        await pool.query(
            `INSERT INTO global_jawaban (nama_siswa,skor,umpan_balik_ai,nama_kelas)
             VALUES ($1,$2,$3,$4)`,
            [name,hasilAI.skor_total,hasilAI.analisis,kelas]
        );

        // Kirim update skor ke semua di room (scoreboard)
        io.to(room).emit('score-updated-live', {
            nama_siswa: name,
            skor: hasilAI.skor_total,
            umpan_balik: hasilAI.analisis,
            feedback_guru: hasilAI.feedback_guru,
            waktu: new Date().toLocaleTimeString()
        });

    } catch (err) {
        console.error("Evaluation Error:", err.message);
    }
  });

  // SINKRONISASI SLIDE
  socket.on('change-slide', (data) => {
      socket.to(data.room).emit('change-slide', data);
  });

  socket.on('disconnect', () => {
    const room = socket.roomID;
    const name = socket.userName;

    if (onlineUsers[room]) {
        onlineUsers[room] = onlineUsers[room].filter(u => u.name !== name);
        io.to(room).emit('update-attendance', onlineUsers[room]);
    }

    if (room) {
        socket.to(room).emit("user-left", { name });
    }
  });

});

const PORT = process.env.PORT || 8080; 
server.listen(PORT, () => {
  console.log(`🚀 SERVER ZOOM-STYLE READY ON PORT ${PORT}`);
});
