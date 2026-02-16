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
    
    // 1. Tabel untuk Admin Instansi / Sekolah (Ditambah kolom OTP)
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

    // 2. Tabel untuk Guru (BARU - Untuk memperbaiki error register guru)
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

    // 3. Tabel untuk Siswa (Ditambah kolom OTP dan Kode Sekolah)
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
    
    // LOGIKA TAMBAHAN: Memastikan kolom OTP ada jika tabel sudah terlanjur dibuat sebelumnya
    await client.query(`ALTER TABLE global_instansi ADD COLUMN IF NOT EXISTS otp TEXT;`);
    await client.query(`ALTER TABLE global_siswa ADD COLUMN IF NOT EXISTS otp TEXT;`);
    await client.query(`ALTER TABLE global_siswa ADD COLUMN IF NOT EXISTS kode_sekolah TEXT;`);

    client.release();
    console.log("✅ Database Global (Instansi, Guru, & Siswa) Siap Digunakan!");
  } catch (err) { 
    console.error("❌ DB Error:", err.message);
  }
};

module.exports = { pool, initDb };
