require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Pool } = require('pg');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());

// KONEKSI DB
const pool = new Pool({
  user: 'postgres', host: 'localhost', database: 'global_school', password: 'admin', port: 5432
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ROUTES VIEWS
app.get('/', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));
app.get('/forget', (req, res) => res.render('forget'));
app.get('/dashboard', (req, res) => res.render('dashboard')); // Nanti dicek role-nya

// LOGIKA PRODUKSI MEDIA AI (GEMINI 2.5)
app.post('/generate-ai', async (req, res) => {
    const { instruksi, kode_instansi } = req.body;
    try {
        // Pindah Schema DB Instansi
        await pool.query(`SET search_path TO "${kode_instansi}"`);
        
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const prompt = `Instruksi Guru: ${instruksi}. Buatkan materi rapi format HTML, soal JSON, dan skenario video.`;
        
        const result = await model.generateContent(prompt);
        res.json({ success: true, data: result.response.text() });
    } catch (err) { res.json({ success: false, msg: err.message }); }
});

// SOCKET LIVE INTERACTION
io.on('connection', (socket) => {
    socket.on('join-room', (kode) => socket.join(kode));
    socket.on('send-live-media', (data) => {
        io.to(data.kode_instansi).emit('receive-media', data);
    });
});

server.listen(3000, () => console.log('Gaskeun Pak Haji di Port 3000!'));
