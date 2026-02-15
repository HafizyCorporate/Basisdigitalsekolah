require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { pool, initDb } = require('./db');
const { processAI } = require('./ai');
const { sendMail } = require('./email');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

initDb();

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
    await pool.query(`CREATE TABLE "${kode}".materi (id SERIAL PRIMARY KEY, judul TEXT, konten JSONB)`);
    
    await sendMail(email, "Kode Instansi Global School", `<h1>Halo Admin!</h1><p>Sekolah <b>${nama}</b> berhasil didaftarkan. Kode Instansi Anda: <b>${kode}</b></p>`);
    res.render('login', { msg: `Daftar Berhasil! Cek email ${email}` });
  } catch (err) { res.status(500).send(err.message); }
});

app.post('/auth/login', async (req, res) => {
  const { kode, email, pass } = req.body;
  try {
    const result = await pool.query('SELECT * FROM global_instansi WHERE kode_instansi = $1', [kode]);
    if (result.rows.length === 0) return res.render('login', { msg: "Kode Instansi Salah!" });
    const isMatch = await bcrypt.compare(pass, result.rows[0].password);
    if (!isMatch) return res.render('login', { msg: "Password Salah!" });
    res.render('dashboard', { instansi: result.rows[0].nama_instansi, kode: kode });
  } catch (err) { res.send(err.message); }
});

app.post('/api/generate', async (req, res) => {
  try {
    const data = await processAI(req.body.instruksi);
    res.json(data);
  } catch (err) { res.status(500).json({ error: "Gagal memproses AI" }); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
