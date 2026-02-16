const { Pool } = require('pg');

// Deteksi apakah DATABASE_URL ada atau tidak
if (!process.env.DATABASE_URL) {
  console.error("❌ ERROR FATAL: Variabel DATABASE_URL tidak ditemukan di .env atau Railway Variables!");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Baris ini krusial untuk Railway (SSL On) tapi Off untuk Localhost
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
});

const initDb = async () => {
  try {
    // Kita tes koneksi manual di sini
    const client = await pool.connect();
    console.log("🔌 Sedang mencoba menghubungkan kabel ke database...");
    
    // Tabel untuk Guru/Instansi
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_instansi (
        id SERIAL PRIMARY KEY,
        nama_instansi TEXT NOT NULL,
        kode_instansi TEXT UNIQUE NOT NULL,
        admin_email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      );
    `);

    // TABEL BARU: Untuk Data Siswa
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_siswa (
        id SERIAL PRIMARY KEY,
        nama_siswa TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      );
    `);
    
    client.release();
    console.log("✅ Database Global (Instansi & Siswa) Ready!");
  } catch (err) { 
    // Tampilkan seluruh objek error agar kita tahu penyebab pastinya
    console.error("❌ DB Error Lengkap:");
    console.error("- Pesan:", err.message);
    console.error("- Kode Error:", err.code);
    console.error("- Detail Tambahan:", err.detail || "Tidak ada detail tambahan.");
  }
};

module.exports = { pool, initDb };
