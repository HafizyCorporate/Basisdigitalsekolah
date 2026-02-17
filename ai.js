// FILE: ai.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const processAI = async (instruksi) => {
  // Memastikan API KEY tersedia di environment
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY tidak ditemukan!");
  }

  // Konfigurasi Model ke Gemini 2.5 Pro (Tetap dipertahankan sesuai permintaan)
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
  
  // LOGIKA BARU: Memperkuat Prompt untuk Kuis & Materi Profesional
  const prompt = `Bertindaklah sebagai Guru SMK Internasional yang ahli dan komunikatif. 
  Buatkan materi pelajaran yang mendalam, menarik, dan edukatif tentang: ${instruksi}. 
  
  KETEENTUAN OUTPUT:
  1. HTML: Gunakan class Tailwind CSS. Buat konten yang rapi dengan heading, list, dan penekanan teks (bold/italic).
  2. SOAL: Buatkan minimal 5 soal pilihan ganda yang menantang berdasarkan materi tersebut.
  3. FORMAT: Balas HANYA dengan format JSON murni. Jangan ada penjelasan di luar JSON.

  STRUKTUR JSON:
  {
    "judul": "Judul Materi yang Menarik",
    "html": "Konten materi format HTML (gunakan tailwind)",
    "soal": [
      {
        "q": "Pertanyaan soal nomor 1?",
        "a": ["Jawaban A", "Jawaban B", "Jawaban C", "Jawaban D"],
        "c": "Jawaban A" 
      },
      ...dan seterusnya sampai minimal 5 soal
    ]
  }
  
  PENTING: Nilai 'c' (kunci jawaban) harus sama persis dengan salah satu teks yang ada di dalam array 'a'.`;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text();
    
    // Ektraksi JSON murni dari respon AI (mengantisipasi teks tambahan/markdown ```json)
    const startJson = text.indexOf('{');
    const endJson = text.lastIndexOf('}');
    
    if (startJson === -1 || endJson === -1) {
      throw new Error("Format JSON tidak valid");
    }
    
    const cleanJson = text.substring(startJson, endJson + 1);
    const parsedData = JSON.parse(cleanJson);

    // Validasi sederhana agar dashboard guru/murid tidak error jika AI gagal membuat soal
    if (!parsedData.soal) parsedData.soal = [];
    
    return parsedData;

  } catch (error) {
    console.error("❌ ERROR AI (Gemini 2.5):", error.message);
    // Kembalikan objek default agar aplikasi tetap berjalan (Fallback UI)
    return {
      judul: "Gagal Memuat Materi",
      html: "<p class='text-red-500 font-bold'>Maaf Guru, Sistem AI sedang sibuk atau mencapai limit. Silakan coba beberapa saat lagi.</p>",
      soal: []
    };
  }
};

module.exports = { processAI };
