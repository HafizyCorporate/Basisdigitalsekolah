const { GoogleGenerativeAI } = require("@google/generative-ai");

const processAI = async (instruksi) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  
  const prompt = `Bertindaklah sebagai Guru SMK Internasional. Buatkan materi lengkap tentang: ${instruksi}. 
  Balas HANYA dengan format JSON: 
  {
    "judul": "Judul Materi",
    "html": "Konten materi dalam format HTML (gunakan tailwind class untuk styling)",
    "soal": [{"q": "Pertanyaan", "a": ["Opsi A", "Opsi B", "Opsi C"], "c": "Jawaban Benar"}]
  }`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().replace(/```json|```/g, "");
  return JSON.parse(text);
};

module.exports = { processAI };
