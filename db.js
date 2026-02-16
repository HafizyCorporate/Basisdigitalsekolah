// FILE: db.js
require('dotenv').config(); // Pastikan variabel environment terbaca
const { Pool } = require('pg');

// 1. Cek Apakah DATABASE_URL Ada (Penting untuk Railway/Deployment)
if (!process.env.DATABASE_URL) {
  console.error("❌ ERROR FATAL: Variabel DATABASE_URL tidak ditemukan di .env atau Railway Variables!");
}

// 2. Konfigurasi Pool dengan Logika SSL (Localhost vs Railway)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false // Jika localhost, matikan SSL
    : { rejectUnauthorized: false } // Jika Railway/Cloud, nyalakan SSL (Allow Self-Signed)
});

// 3. Fungsi Init Database
const initDb = async () => {
  try {
    const client = await pool.connect();
    console.log("🔌 Sedang mencoba menghubungkan kabel ke database...");
    
    // A. Tabel untuk Guru/Instansi
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_instansi (
        id SERIAL PRIMARY KEY,
        nama_instansi TEXT NOT NULL,
        kode_instansi TEXT UNIQUE NOT NULL,
        admin_email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // B. Tabel untuk Siswa (BARU)
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_siswa (
        id SERIAL PRIMARY KEY,
        nama_siswa TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    client.release();
    console.log("✅ Database Global (Instansi & Siswa) Ready!");
  } catch (err) { 
    console.error("❌ DB Error Lengkap:");
    console.error("- Pesan:", err.message);
    console.error("- Kode Error:", err.code);
  }
};

module.exports = { pool, initDb };
