require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Pool } = require('pg');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const Brevo = require('@getbrevo/brevo');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- DATABASE CONNECTION (RAILWAY) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS global_instansi (
                id SERIAL PRIMARY KEY,
                nama_instansi TEXT NOT NULL,
                kode_instansi TEXT UNIQUE NOT NULL,
                admin_email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            );
        `);
        console.log("✅ Database Global Ready!");
    } catch (err) { console.error("❌ DB Error:", err.message); }
};
initDb();

// --- API CLIENTS (GEMINI & BREVO) ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// SETUP BREVO DENGAN EMAIL PAK HAJI
let defaultClient = Brevo.ApiClient.instance;
let apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const apiInstance = new Brevo.TransactionalEmailsApi();

const sendEmail = async (toEmail, subject, content) => {
    let sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = `<html><body style="font-family:sans-serif;">${content}</body></html>`;
    // PENGIRIM PAKAI EMAIL AZHARDAX94@GMAIL.COM
    sendSmtpEmail.sender = { "name": "Global School AI", "email": "azhardax94@gmail.com" };
    sendSmtpEmail.to = [{ "email": toEmail }];
    try { 
        await apiInstance.sendTransacEmail(sendSmtpEmail); 
        console.log("📧 Email Terkirim dari azhardax94@gmail.com");
    } catch (e) { console.error("❌ Email Error:", e); }
};

// --- ROUTES ---

app.get('/', (req, res) => res.render('login', { msg: null }));
app.get('/register', (req, res) => res.render('register', { msg: null }));
app.get('/forget', (req, res) => res.render('forget', { msg: null }));

app.post('/auth/register', async (req, res) => {
    const { nama, email, pass } = req.body;
    const kode = "SCH-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    try {
        const hashed = await bcrypt.hash(pass, 10);
        await pool.query('INSERT INTO global_instansi (nama_instansi, kode_instansi, admin_email, password) VALUES ($1,$2,$3,$4)', [nama, kode, email, hashed]);
        await pool.query(`CREATE SCHEMA IF NOT EXISTS "${kode}"`);
        await pool.query(`CREATE TABLE "${kode}".materi (id SERIAL PRIMARY KEY, judul TEXT, isi_html TEXT)`);
        
        await sendEmail(email, "Kode Instansi Anda - Global School", `<h2>Halo ${nama}!</h2><p>Selamat datang. Kode Instansi Anda adalah: <b>${kode}</b></p>`);
        res.render('login', { msg: `Registrasi Berhasil! Kode dikirim ke ${email}` });
    } catch (err) { res.status(500).send("Gagal Daftar: " + err.message); }
});

app.post('/auth/login', async (req, res) => {
    const { kode, email, pass } = req.body;
    try {
        const result = await pool.query('SELECT * FROM global_instansi WHERE kode_instansi = $1', [kode]);
        if (result.rows.length === 0) return res.render('login', { msg: "Kode Salah!" });
        const isMatch = await bcrypt.compare(pass, result.rows[0].password);
        if (!isMatch) return res.render('login', { msg: "Password Salah!" });
        res.render('dashboard', { instansi: result.rows[0].nama_instansi, kode: kode });
    } catch (err) { res.send(err.message); }
});

app.post('/auth/forget', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await pool.query('SELECT kode_instansi FROM global_instansi WHERE admin_email = $1', [email]);
        if (result.rows.length > 0) {
            await sendEmail(email, "Pemulihan Kode Instansi", `<p>Kode Instansi Anda adalah: <b>${result.rows[0].kode_instansi}</b></p>`);
            res.render('forget', { msg: "Kode telah dikirim ulang ke email." });
        } else { res.render('forget', { msg: "Email tidak ditemukan!" }); }
    } catch (err) { res.send(err.message); }
});

app.post('/api/generate', async (req, res) => {
    const { instruksi } = req.body;
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const result = await model.generateContent(`Buat materi SMK: ${instruksi}. Balas JSON: {"judul": "...", "html": "..."}`);
        const text = result.response.text().replace(/```json|```/g, "");
        res.json(JSON.parse(text));
    } catch (err) { res.status(500).json({ error: "AI Error" }); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Pak Haji Meluncur di Port ${PORT}`));
