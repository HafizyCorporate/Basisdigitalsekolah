// FILE: db.js
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error("❌ ERROR FATAL: Variabel DATABASE_URL tidak ditemukan!");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
});

const initDb = async () => {
  try {
    const client = await pool.connect();
    console.log("🔌 Sedang mensinkronkan tabel ke database...");
    
    // 1. Tabel untuk Admin Instansi / Sekolah (KODINGAN ASLI)
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_instansi (
        id SERIAL PRIMARY KEY,
        nama_instansi TEXT NOT NULL,
        kode_instansi TEXT UNIQUE NOT NULL,
        admin_email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        otp TEXT, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Tabel untuk Guru (KODINGAN ASLI)
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_guru (
        id SERIAL PRIMARY KEY,
        nama_guru TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        kode_sekolah TEXT NOT NULL,
        otp TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Tabel untuk Siswa (KODINGAN ASLI)
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_siswa (
        id SERIAL PRIMARY KEY,
        nama_siswa TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        kode_sekolah TEXT,
        otp TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ============================================================
    // 🚀 SINKRONISASI FITUR: CHAT, MATERI AI, & KUIS LIVE
    // ============================================================

    // 4. Tabel untuk Chat Real-time (Tersimpan Permanen)
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_chat (
        id SERIAL PRIMARY KEY,
        kode_sekolah TEXT NOT NULL,
        pengirim_nama TEXT NOT NULL,
        role TEXT NOT NULL, -- 'guru' atau 'siswa'
        pesan TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Tabel untuk Media Pembelajaran / Materi AI (Dibuat Guru)
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_materi (
        id SERIAL PRIMARY KEY,
        kode_sekolah TEXT NOT NULL,
        guru_id INTEGER, -- Bisa null jika dibuat admin instansi
        judul TEXT NOT NULL,
        konten_html TEXT NOT NULL,
        soal_json JSONB, -- Menyimpan array kuis dari AI
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. Tabel untuk Jawaban & Nilai Siswa (Hasil Kuis)
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_jawaban (
        id SERIAL PRIMARY KEY,
        materi_id INTEGER,
        siswa_id INTEGER,
        nama_siswa TEXT NOT NULL,
        jawaban_user JSONB, -- Pilihan jawaban siswa per soal
        skor INTEGER DEFAULT 0, -- Nilai angka (0-100)
        status_selesai BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Tabel untuk Manajemen Kelas (BARU)
    // Menyimpan daftar kelas yang dibuat oleh guru (Contoh: 1.1, 7-A, dsb)
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_kelas (
        id SERIAL PRIMARY KEY,
        kode_sekolah TEXT NOT NULL,
        nama_kelas TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // ============================================================
    // 🛠️ MAINTENANCE & AUTO-PATCH COLUMNS (KODINGAN ASLI TETAP ADA)
    // ============================================================
    
    // Pastikan kolom-kolom penting tersedia tanpa error jika sudah ada
    await client.query(`ALTER TABLE global_instansi ADD COLUMN IF NOT EXISTS otp TEXT;`);
    await client.query(`ALTER TABLE global_siswa ADD COLUMN IF NOT EXISTS otp TEXT;`);
    await client.query(`ALTER TABLE global_siswa ADD COLUMN IF NOT EXISTS kode_sekolah TEXT;`);
    
    // Patch Baru: Menambahkan kolom kelas pada tabel siswa agar pilihan kelas tersimpan permanen
    await client.query(`ALTER TABLE global_siswa ADD COLUMN IF NOT EXISTS kelas TEXT;`);
    
    // Tambahan Sinkronisasi: Pastikan tabel materi punya kolom soal_json untuk AI Gemini
    await client.query(`ALTER TABLE global_materi ADD COLUMN IF NOT EXISTS soal_json JSONB;`);
    
    // Tambahan Sinkronisasi: Kolom skor di jawaban murid dipastikan berupa INTEGER untuk kalkulasi
    await client.query(`ALTER TABLE global_jawaban ALTER COLUMN skor TYPE INTEGER USING skor::integer;`);

    client.release();
    console.log("✅ Database Sinkron: Login, Chat, Kamera, Kuis AI, & Manajemen Kelas Siap!");
  } catch (err) { 
    console.error("❌ DB Error:", err.message);
  }
};

module.exports = { pool, initDb };
