// FILE: ai.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const processAI = async (instruksi) => {
  // Memastikan API KEY tersedia di environment
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY tidak ditemukan!");
  }

  // UPDATE MODEL: Langsung ke Gemini 3.0 Pro
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.0-pro",
    generationConfig: { responseMimeType: "application/json" } 
  });
  
  // LOGIKA: Prompt diperketat untuk Kunci Jawaban PG & Kriteria Essay
  const prompt = `Bertindaklah sebagai Guru SMK Internasional yang ahli. 
  Buatkan materi pelajaran tentang: "${instruksi}".
  
  TUGAS ANDA:
  1. MATERI: Buat konten HTML rapi (Tailwind CSS) dengan heading, list, dan poin penting.
  2. PG: 5 Soal Pilihan Ganda. Sertakan kunci jawaban (string yang sama dengan pilihan).
  3. ESSAY: 3 Soal Essay. Sertakan 'kriteria' berupa daftar kata kunci untuk penilaian otomatis.

  FORMAT JSON WAJIB:
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
        "kriteria": ["keyword1", "keyword2", "poin penting"]
      }
    ]
  }
  
  PENTING: Jangan berikan teks apapun selain JSON.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Ekstraksi JSON
    const startJson = text.indexOf('{');
    const endJson = text.lastIndexOf('}');
    
    if (startJson === -1 || endJson === -1) {
      throw new Error("Format JSON tidak ditemukan");
    }
    
    const cleanJson = text.substring(startJson, endJson + 1);
    const parsedData = JSON.parse(cleanJson);

    // Default value jika data tidak lengkap
    if (!parsedData.soal) parsedData.soal = [];
    if (!parsedData.essay) parsedData.essay = [];
    
    return parsedData;

  } catch (error) {
    console.error("❌ ERROR AI (Gemini 3.0):", error.message);
    
    return {
      judul: "Gagal Memuat Materi",
      html: "<p class='text-red-500'>Sistem AI sedang sibuk. Silakan coba lagi.</p>",
      soal: [],
      essay: []
    };
  }
};

module.exports = { processAI };
