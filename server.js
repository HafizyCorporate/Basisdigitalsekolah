const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Pool } = require('pg');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// 1. KONEKSI POSTGRESQL
const pool = new Pool({
  user: 'postgres', host: 'localhost', database: 'global_school',
  password: 'admin', port: 5432
});

// 2. KONEKSI GEMINI 2.5
const genAI = new GoogleGenerativeAI("YOUR_GEMINI_API_KEY");

// 3. LOGIKA MULTI-TENANT & GENERATE AI (Poin 8, 9, 13)
app.post('/api/generate-materi', async (req, res) => {
    const { instruksi, kode_instansi } = req.body;
    
    try {
        // Set Schema berdasarkan Kode Instansi (Poin 2)
        await pool.query(`SET search_path TO "${kode_instansi}"`);

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // Gunakan versi pro terbaru
        const prompt = `Buatkan materi lengkap tentang ${instruksi}. 
        Output harus JSON: { "materi": "text html", "soal": [{"q":"", "a":[""], "c":""}], "video_script": "" }`;

        const result = await model.generateContent(prompt);
        const data = JSON.parse(result.response.text());

        res.json({ success: true, data, warning: "Peringatan: AI tidak 100% benar. Pak Haji cek dulu!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. LIVE INTERACTION (Poin 14)
io.on('connection', (socket) => {
    socket.on('join-instansi', (kode) => socket.join(kode));
    socket.on('kirim-soal-live', (payload) => {
        io.to(payload.kode_instansi).emit('terima-soal', payload.soal);
    });
});

server.listen(5000, () => console.log('Backend Sekolah Digital Gaskeun!'));
