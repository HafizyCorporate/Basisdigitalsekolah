// FILE: ai.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * 1. FUNGSI GENERATOR: Membuat Materi, 15 PG, 5 Essay, & 10 Quiz Cepat
 */
const processAI = async (instruksi) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY tidak ditemukan!");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-3.0-flash" });
  
  const prompt = `Bertindaklah sebagai Guru Ahli Internasional. 
  TUGAS: Buat materi lengkap dan paket evaluasi tentang: "${instruksi}".
  
  INSTRUKSI KHUSUS:
  1. MATERI: Buat konten HTML rapi (Tailwind CSS) dengan penjelasan mendalam.
  2. PG (15 SOAL): Pilihan ganda berkualitas tinggi dengan 4 opsi. Sertakan kunci jawaban (c).
  3. ESSAY (5 SOAL): Pertanyaan analisis mendalam. Sertakan 'kriteria' penilaian (array kata kunci).
  4. QUIZ (10 SOAL): Pertanyaan singkat/cepat (Flash Quiz) untuk menguji ingatan. Sertakan jawaban singkatnya.

  WAJIB KEMBALIKAN HANYA DATA JSON DENGAN STRUKTUR:
  {
    "judul": "Judul Materi",
    "html": "Konten HTML Materi...",
    "soal_pg": [
      { "q": "Pertanyaan...", "a": ["Opsi A", "Opsi B", "Opsi C", "Opsi D"], "c": "Opsi A" }
    ],
    "soal_essay": [
      { "q": "Pertanyaan Essay...", "kriteria": ["kata kunci 1", "kata kunci 2"] }
    ],
    "soal_quiz": [
      { "q": "Pertanyaan Singkat...", "jawaban_benar": "Jawaban" }
    ]
  }
  PENTING: Jangan berikan teks apapun selain JSON murni agar sistem tidak error.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) throw new Error("Format JSON tidak ditemukan.");
    return JSON.parse(jsonMatch[0]);

  } catch (error) {
    console.error("❌ ERROR GENERATOR:", error.message);
    return { 
        judul: "Gagal Memuat Materi", 
        html: "<p>Terjadi kesalahan saat AI merancang soal. Silakan coba instruksi yang lebih spesifik.</p>", 
        soal_pg: [], soal_essay: [], soal_quiz: [] 
    };
  }
};

/**
 * 2. FUNGSI PEMERIKSA: AI Menilai 15 PG, 5 Essay, & 10 Quiz secara otomatis
 */
const periksaUjian = async (soalAsli, jawabanMurid) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY tidak ditemukan!");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-3.0-flash" });

  const prompt = `Bertindaklah sebagai Guru Penilai (AI Evaluator).
  TUGAS: Periksa semua jawaban murid (15 PG, 5 Essay, 10 Quiz) berdasarkan referensi soal asli.

  DATA REFERENSI (SOAL & KUNCI):
  ${JSON.stringify(soalAsli)}

  DATA JAWABAN MURID:
  ${JSON.stringify(jawabanMurid)}

  INSTRUKSI PENILAIAN:
  1. Periksa PG (skor 1 per soal benar).
  2. Periksa Quiz Singkat (skor 1 per soal benar/mirip).
  3. Periksa Essay (berikan skor 0-20 per soal berdasarkan kriteria).
  4. Hitung Nilai Akhir dalam skala 0-100.
  5. Berikan feedback singkat untuk guru tentang kelemahan murid ini.

  KEMBALIKAN HANYA DATA JSON:
  {
    "skor_total": 85,
    "analisis": "PG: 14/15 benar. Quiz: 8/10 benar. Essay: Pemahaman konsep kuat tapi kurang di teknis.",
    "feedback_guru": "Murid siap lanjut ke materi berikutnya, hanya perlu penguatan di bagian essay nomor 3."
  }`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) throw new Error("AI gagal memproses nilai.");
    return JSON.parse(jsonMatch[0]);

  } catch (error) {
    console.error("❌ ERROR PEMERIKSA:", error.message);
    return { 
        skor_total: 0, 
        analisis: "Gagal diperiksa otomatis karena kendala teknis AI.", 
        feedback_guru: "Mohon bapak periksa secara manual di dashboard." 
    };
  }
};

module.exports = { processAI, periksaUjian };
