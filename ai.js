// FILE: ai.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const processAI = async (instruksi) => {
  // Memastikan API KEY tersedia di environment
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY tidak ditemukan!");
  }

  // Konfigurasi Model ke Gemini 2.5 Pro
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
  
  const prompt = `Bertindaklah sebagai Guru SMK Internasional yang ahli. 
  Buatkan materi lengkap tentang: ${instruksi}. 
  
  Balas HANYA dengan format JSON murni: 
  {
    "judul": "Judul Materi",
    "html": "Konten materi format HTML (gunakan tailwind class untuk styling profesional)",
    "soal": [{"q": "Pertanyaan", "a": ["Opsi A", "Opsi B", "Opsi C"], "c": "Jawaban Benar"}]
  }`;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text();
    
    // Ektraksi JSON murni dari respon AI (mengantisipasi teks tambahan)
    const startJson = text.indexOf('{');
    const endJson = text.lastIndexOf('}');
    
    if (startJson === -1 || endJson === -1) {
      throw new Error("Format JSON tidak valid");
    }
    
    const cleanJson = text.substring(startJson, endJson + 1);
    return JSON.parse(cleanJson);

  } catch (error) {
    console.error("❌ ERROR AI (Gemini 2.5):", error.message);
    // Kembalikan objek default agar aplikasi tetap berjalan
    return {
      judul: "Gagal Memuat Materi",
      html: "<p class='text-red-500'>Sistem AI sedang melakukan update. Coba lagi nanti.</p>",
      soal: []
    };
  }
};

module.exports = { processAI };
