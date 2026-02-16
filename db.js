const { Pool } = require('pg'); // C sudah diperbaiki jadi kecil

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optimasi: Gunakan SSL hanya jika tidak di localhost
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
});

const initDb = async () => {
  try {
    // Pastikan koneksi bisa tersambung
    const client = await pool.connect();
    console.log("🔌 Terhubung ke Database...");
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_instansi (
        id SERIAL PRIMARY KEY,
        nama_instansi TEXT NOT NULL,
        kode_instansi TEXT UNIQUE NOT NULL,
        admin_email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      );
    `);
    
    client.release(); // Lepas koneksi setelah selesai
    console.log("✅ Database Global Ready!");
  } catch (err) { 
    console.error("❌ DB Error Detail:", err.message); 
  }
};

module.exports = { pool, initDb };
