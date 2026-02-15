require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Pool } = require('pg');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 1. SETUP DATABASE ---
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'global_school', // Pastikan database 'global_school' sudah dibuat di PgAdmin
  password: process.env.DB_PASSWORD || 'admin',
  port: 5432,
});

// Fungsi Auto-Setup (Dimasukkan ke Server.js)
const initDb = async () => {
    try {
        // Buat tabel utama jika belum ada
        await pool.query(`
            CREATE TABLE IF NOT EXISTS global_instansi (
                id SERIAL PRIMARY KEY,
                nama_instansi TEXT NOT NULL,
                kode_instansi TEXT UNIQUE NOT NULL,
                admin_email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Database Global Ready, Pak Haji!");
    } catch (err) {
        console.error("❌ Waduh, Gagal Setup DB:", err.message);
    }
};
initDb();

// --- 2. SETUP GEMINI 2.5 ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- 3. ROUTES VIEWS ---
app.get('/', (req, res) => res.render('login', { msg: null }));
app.get('/register', (req, res) => res.render('register'));
app.get('/forget', (req, res) => res.render('forget', { info: null }));

// --- 4. AUTH LOGIC ---
// Register Instansi (Otomatis bikin Schema/Kamar Baru)
app.post('/auth/register', async (req, res) => {
    const { nama_instansi, email, password } = req.body;
    const kode = "SCH-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    const hashed = await bcrypt.hash(password, 10);

    try {
        // Simpan Data Global
        await pool.query(
            'INSERT INTO global_instansi (nama_instansi, kode_instansi, admin_email, password) VALUES ($1,$2,$3,$4)', 
            [nama_instansi, kode, email, hashed]
        );

        // OTOMATIS BIKIN SCHEMA KHUSUS SEKOLAH (Poin 4 & 5)
        await pool.query(`CREATE SCHEMA IF NOT EXISTS "${kode}"`);
        await pool.query(`
            CREATE TABLE "${kode}".materi (
                id SERIAL PRIMARY KEY, 
                judul TEXT, 
                isi_html TEXT, 
                soal_json JSONB,
                video_script TEXT
            )
        `);

        res.render('login', { msg: `SUKSES! Kode Instansi Anda: ${kode} (Simpan Baik-baik!)` });
    } catch (err) {
        res.status(500).send("Gagal Daftar: " + err.message);
    }
});

// Login Logic
app.post('/auth/login', async (req, res) => {
    const { kode_instansi, email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM global_instansi WHERE kode_instansi = $1', [kode_instansi]);
        if (result.rows.length === 0) return res.render('login', { msg: "Kode Instansi Salah!" });

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.render('login', { msg: "Password Salah!" });

        res.render('dashboard', { instansi: user.nama_instansi, kode: kode_instansi });
    } catch (err) { res.send(err.message); }
});

// Lupa Password Logic
app.post('/auth/forget', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await pool.query('SELECT kode_instansi FROM global_instansi WHERE admin_email = $1', [email]);
        const info = result.rows.length > 0 ? `KODE ANDA: ${result.rows[0].kode_instansi}` : "Email tidak terdaftar!";
        res.render('forget', { info });
    } catch (err) { res.send(err.message); }
});

// --- 5. AI ENGINE (GEMINI 2.5) ---
app.post('/api/generate', async (req, res) => {
    const { instruksi } = req.body;
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const prompt = `Buatkan materi SMK Internasional tentang: ${instruksi}. 
        Output harus JSON murni: {"judul": "...", "html": "...", "soal": [], "video": "..."}`;
        
        const result = await model.generateContent(prompt);
        const data = JSON.parse(result.response.text().replace(/```json|```/g, ""));
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 6. SOCKET.IO (LIVE INTERACTION) ---
io.on('connection', (socket) => {
    socket.on('join-instansi', (kode) => socket.join(kode));
    socket.on('guru-push', (payload) => {
        io.to(payload.kode).emit('murid-receive', payload);
    });
});

server.listen(3000, () => console.log('🚀 Pak Haji, Server & DB Auto-Setup Ready di Port 3000!'));
