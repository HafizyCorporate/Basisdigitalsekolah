// FILE: ai.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- KONFIGURASI MODEL & FALLBACK ---
// Prioritas: Gemini 3 Flash -> Fallback: Gemini 2.5 Flash
const PRIMARY_MODEL = "gemini-3-flash";
const FALLBACK_MODEL = "gemini-2.5-flash"; 

/**
 * Helper: Mencoba generate dengan model utama, lalu pindah ke cadangan jika gagal
 */
async function generateWithFallback(genAI, prompt) {
  try {
    // 1. Coba Model Utama
    const model = genAI.getGenerativeModel({ 
      model: PRIMARY_MODEL,
      generationConfig: { responseMimeType: "application/json" }
    });
    
    console.log(`🤖 AI memproses dengan: ${PRIMARY_MODEL}...`);
    return await model.generateContent(prompt);

  } catch (error) {
    // 2. Jika Gagal, Switch ke Model Cadangan
    console.warn(`⚠️ ${PRIMARY_MODEL} gagal (${error.message}). Mengalihkan ke ${FALLBACK_MODEL}...`);
    
    const fallbackModel = genAI.getGenerativeModel({ 
      model: FALLBACK_MODEL,
      generationConfig: { responseMimeType: "application/json" }
    });

    return await fallbackModel.generateContent(prompt);
  }
}

/**
 * 1. FUNGSI GENERATOR
 * AI membuat soal + KUNCI RAHASIA + MATERI BERBASIS SLIDE
 */
const processAI = async (instruksi) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY tidak ditemukan!");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // --- UPDATE PROMPT: MEMINTA STRUKTUR SLIDES & VISUAL ---
  const prompt = `Bertindaklah sebagai Guru Ahli Internasional (Profesor Nano Banana). 
  TUGAS: Buat materi lengkap dan paket evaluasi tentang: "${instruksi}".
  
  INSTRUKSI KHUSUS:
  1. MATERI (SLIDES): Pecah materi menjadi 5-7 SLIDE (Halaman). Gunakan bahasa HTML rapi (Tailwind CSS) di dalam konten.
  2. VISUAL: Berikan 'keyword_gambar' (bahasa inggris) yang relevan untuk setiap slide.
  3. PG (15 SOAL): Pilihan ganda berkualitas tinggi dengan 4 opsi. Sertakan kunci jawaban (c).
  4. ESSAY (5 SOAL): Pertanyaan analisis mendalam. Sertakan 'kriteria' penilaian.
  5. QUIZ (10 SOAL): Pertanyaan singkat/cepat (Flash Quiz). Sertakan jawaban singkatnya.

  WAJIB KEMBALIKAN HANYA DATA JSON DENGAN STRUKTUR:
  {
    "judul_besar": "Judul Utama Materi",
    "slides": [
      {
        "halaman": 1,
        "judul_slide": "Judul Sub-Bab",
        "konten_html": "<p>Penjelasan materi disini...</p>",
        "keyword_gambar": "deskripsi visual singkat dalam bahasa inggris"
      }
    ],
    "soal_pg": [{ "q": "Pertanyaan...", "a": ["Opsi A", "Opsi B", "Opsi C", "Opsi D"], "c": "Opsi A" }],
    "soal_essay": [{ "q": "Pertanyaan Essay...", "kriteria": ["kata kunci 1"] }],
    "soal_quiz": [{ "q": "Pertanyaan Singkat...", "jawaban_benar": "Jawaban" }]
  }
  PENTING: Hanya JSON murni, jangan ada teks penjelasan lain.`;

  try {
    // UPDATE: Menggunakan fungsi fallback, bukan inisialisasi model langsung
    const result = await generateWithFallback(genAI, prompt);
    const text = result.response.text();
    
    try {
        return JSON.parse(text);
    } catch(e) {
        // Fallback jika ada teks di luar JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Format JSON tidak ditemukan.");
        return JSON.parse(jsonMatch[0]);
    }

  } catch (error) {
    console.error("❌ ERROR GENERATOR:", error.message);
    return { 
        judul_besar: "Gagal Memuat", 
        slides: [], // Return array kosong agar frontend tau
        html: `<p class="text-red-500 font-bold">Gagal menyusun materi: ${error.message}</p>`, 
        soal_pg: [], soal_essay: [], soal_quiz: [] 
    };
  }
};

/**
 * 2. FUNGSI PEMERIKSA (LOGIKA SENTRALISTIK)
 * Tidak ada perubahan logika di sini selain implementasi fallback.
 */
const periksaUjian = async (soalAsli, jawabanMurid) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY tidak ditemukan!");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const prompt = `Bertindaklah sebagai Guru Penilai.
  TUGAS: Bandingkan Jawaban Murid dengan Kunci Jawaban Asli.

  DATA REFERENSI (KUNCI JAWABAN ASLI):
  ${JSON.stringify(soalAsli)}

  DATA JAWABAN MURID:
  ${JSON.stringify(jawabanMurid)}

  INSTRUKSI:
  1. Periksa 15 PG secara eksak sesuai kunci 'c'.
  2. Periksa 10 Quiz secara makna (toleransi typo).
  3. Periksa 5 Essay berdasarkan 'kriteria' kata kunci.
  4. Berikan total skor 0-100.

  KEMBALIKAN JSON DENGAN STRUKTUR:
  {
    "skor_total": 85,
    "analisis": "Tulis detail pencapaian murid di sini",
    "feedback_guru": "Saran untuk Bapak Guru"
  }
  PENTING: Hanya JSON murni.`;

  try {
    // UPDATE: Menggunakan fungsi fallback
    const result = await generateWithFallback(genAI, prompt);
    const text = result.response.text();
    
    try {
        return JSON.parse(text);
    } catch(e) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Format JSON penilaian tidak ditemukan.");
        return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("❌ ERROR PEMERIKSA:", error.message);
    return { skor_total: 0, analisis: "Gagal memproses penilaian secara otomatis.", feedback_guru: "Periksa Manual karena kendala teknis AI." };
  }
};

module.exports = { processAI, periksaUjian };
