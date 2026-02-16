// FILE: email.js
const Brevo = require('@getbrevo/brevo');

const sendMail = async (toEmail, subject, content) => {
  
  // ========================================================
  // 🛠️ LOGIKA DUMMY (TETAP DIPERTAHANKAN)
  // ========================================================
  if (!process.env.BREVO_API_KEY || process.env.BREVO_API_KEY === 'dummy') {
    console.log("--------------------------------------------------");
    console.log("📩 [DUMMY MODE] SIMULASI EMAIL AKTIF");
    console.log(`KE      : ${toEmail}`);
    console.log(`SUBJEK  : ${subject}`);
    console.log(`ISI     : ${content.replace(/<[^>]*>?/gm, '').substring(0, 50)}...`);
    console.log("--------------------------------------------------");
    return true; 
  }

  // ========================================================
  // 🚀 PERBAIKAN KONEKSI (Agar tidak error 'instance' undefined)
  // ========================================================
  try {
    // Inisialisasi API Instance yang benar untuk @getbrevo/brevo
    const apiInstance = new Brevo.TransactionalEmailsApi();

    // Cara set API Key yang benar di versi terbaru
    apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

    let sendSmtpEmail = new Brevo.SendSmtpEmail();

    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <div style="background-color: #f4f4f4; padding: 15px; border-radius: 8px;">
          <h2 style="color: #2563eb;">Global School AI System</h2>
          ${content}
          <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #888;">Email ini dikirim otomatis oleh sistem.</p>
        </div>
      </div>
    `;
    // Sender tetap menggunakan email kamu
    sendSmtpEmail.sender = { name: "Admin Global School", email: "azhardax94@gmail.com" };
    sendSmtpEmail.to = [{ email: toEmail }];

    // Proses Kirim
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`📧 SUKSES: Email terkirim ke ${toEmail}`);
    return true;

  } catch (err) {
    // Menampilkan error lebih detail di log Railway agar mudah dilacak
    console.error("❌ GAGAL KIRIM EMAIL:", err.response ? err.response.body : err);
    return false;
  }
};

module.exports = { sendMail };
