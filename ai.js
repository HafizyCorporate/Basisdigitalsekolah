// FILE: ai.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const processAI = async (instruksi) => {
  // Memastikan API KEY tersedia
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY tidak ditemukan!");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // UPDATE MODEL: Menggunakan Gemini 3.0 Flash
  // Model ini dioptimalkan untuk kecepatan tinggi dan instruksi kompleks
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.0-flash" 
  });
  
  const prompt = `Bertindaklah sebagai Guru SMK Internasional yang ahli. 
  TUGAS: Buatkan materi pelajaran lengkap tentang: "${instruksi}".
  
  INSTRUKSI KHUSUS:
  1. MATERI: Buat konten HTML yang sangat rapi (gunakan class Tailwind CSS) dengan heading, list, dan poin penting.
  2. PG: 5 Soal Pilihan Ganda berkualitas. Sertakan kunci jawaban (c).
  3. ESSAY: 3 Soal Essay analitis. Sertakan 'kriteria' penilaian berupa array kata kunci.

  WAJIB KEMBALIKAN HANYA DATA JSON DENGAN STRUKTUR BERIKUT:
  {
    "judul": "Judul Materi",
    "html": "Konten HTML Materi...",
    "soal": [
      {
        "q": "Pertanyaan PG...",
        "a": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
        "c": "Pilihan A" 
      }
    ],
    "essay": [
      {
        "q": "Pertanyaan Essay...",
        "kriteria": ["keyword1", "keyword2"]
      }
    ]
  }
  
  PENTING: Jangan berikan teks pembuka atau penutup. Kembalikan JSON murni agar sistem tidak error.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // ✨ PERBAIKAN: EKSTRAKSI JSON DENGAN REGEX SUPER KUAT
    // Regex ini mencari tanda kurung kurawal paling luar { ... }
    // Ini sangat berguna jika AI memberikan output di dalam blok markdown seperti ```json { ... } ```
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("Format data JSON tidak ditemukan dalam respon AI.");
    }
    
    const cleanJson = jsonMatch[0];
    const parsedData = JSON.parse(cleanJson);

    // Sinkronisasi Data: Memastikan properti dasar tidak kosong agar Frontend tidak macet
    return {
      judul: parsedData.judul || "Materi Tanpa Judul",
      html: parsedData.html || "<p>Gagal memuat konten materi.</p>",
      soal: Array.isArray(parsedData.soal) ? parsedData.soal : [],
      essay: Array.isArray(parsedData.essay) ? parsedData.essay : []
    };

  } catch (error) {
    console.error("❌ ERROR AI (Gemini 3.0 Flash):", error.message);
    
    return {
      judul: "Gagal Memuat Materi",
      html: `<div class='p-4 bg-orange-50 border-2 border-orange-200 text-orange-800 rounded-2xl'>
                <h3 class='font-bold'>AI Sedang Berpikir Keras...</h3>
                <p>Terjadi kendala teknis saat memproses "${instruksi}". Silakan coba sesaat lagi.</p>
             </div>`,
      soal: [],
      essay: []
    };
  }
};

module.exports = { processAI };
