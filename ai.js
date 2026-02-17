// FILE: ai.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * 1. FUNGSI GENERATOR
 * AI membuat soal + KUNCI RAHASIA
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
  4. QUIZ (10 SOAL): Pertanyaan singkat/cepat (Flash Quiz). Sertakan jawaban singkatnya.

  WAJIB KEMBALIKAN HANYA DATA JSON DENGAN STRUKTUR:
  {
    "judul": "Judul Materi",
    "html": "Konten HTML Materi...",
    "soal_pg": [{ "q": "Pertanyaan...", "a": ["Opsi A", "Opsi B", "Opsi C", "Opsi D"], "c": "Opsi A" }],
    "soal_essay": [{ "q": "Pertanyaan Essay...", "kriteria": ["kata kunci 1"] }],
    "soal_quiz": [{ "q": "Pertanyaan Singkat...", "jawaban_benar": "Jawaban" }]
  }
  PENTING: Hanya JSON murni.`;

  try {
    const result = await model.generateContent(prompt);
    const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Format JSON tidak ditemukan.");
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("❌ ERROR GENERATOR:", error.message);
    return { judul: "Gagal Memuat", html: "<p>Gagal.</p>", soal_pg: [], soal_essay: [], soal_quiz: [] };
  }
};

/**
 * 2. FUNGSI PEMERIKSA (LOGIKA SENTRALISTIK)
 * Inilah yang akan dipanggil Server saat Murid menekan tombol 'Kirim'
 */
const periksaUjian = async (soalAsli, jawabanMurid) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY tidak ditemukan!");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-3.0-flash" });

  const prompt = `Bertindaklah sebagai Guru Penilai.
  TUGAS: Bandingkan Jawaban Murid dengan Kunci Jawaban Asli.

  DATA REFERENSI (KUNCI RAHASIA):
  ${JSON.stringify(soalAsli)}

  DATA JAWABAN MURID:
  ${JSON.stringify(jawabanMurid)}

  INSTRUKSI:
  1. Periksa 15 PG secara eksak sesuai kunci 'c'.
  2. Periksa 10 Quiz secara makna (toleransi typo).
  3. Periksa 5 Essay berdasarkan 'kriteria' kata kunci.
  4. Berikan total skor 0-100.

  KEMBALIKAN JSON:
  {
    "skor_total": 85,
    "analisis": "Tulis detail pencapaian murid di sini",
    "feedback_guru": "Saran untuk Bapak Guru"
  }`;

  try {
    const result = await model.generateContent(prompt);
    const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("❌ ERROR PEMERIKSA:", error.message);
    return { skor_total: 0, analisis: "Error", feedback_guru: "Periksa Manual" };
  }
};

module.exports = { processAI, periksaUjian };
