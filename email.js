// FILE: email.js
const Brevo = require('@getbrevo/brevo');

const sendMail = async (toEmail, subject, content) => {
  
  // ========================================================
  // 🛠️ LOGIKA DUMMY (PENDUKUNG SIMULASI)
  // Jika API Key tidak ada, sistem tidak akan crash/error.
  // ========================================================
  if (!process.env.BREVO_API_KEY || process.env.BREVO_API_KEY === 'dummy') {
    console.log("--------------------------------------------------");
    console.log("📩 [DUMMY MODE] SIMULASI EMAIL AKTIF");
    console.log(`KE      : ${toEmail}`);
    console.log(`SUBJEK  : ${subject}`);
    console.log(`ISI     : ${content.replace(/<[^>]*>?/gm, '').substring(0, 50)}...`);
    console.log("--------------------------------------------------");
    return true; // Berhenti di sini, jangan lanjut ke Brevo
  }

  // ========================================================
  // 🚀 KONEKSI ASLI (TIDAK DIUBAH)
  // ========================================================
  let defaultClient = Brevo.ApiClient.instance;
  let apiKey = defaultClient.authentications['api-key'];
  apiKey.apiKey = process.env.BREVO_API_KEY;

  const apiInstance = new Brevo.TransactionalEmailsApi();
  let sendSmtpEmail = new Brevo.SendSmtpEmail();

  sendSmtpEmail = {
    subject: subject,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <div style="background-color: #f4f4f4; padding: 15px; border-radius: 8px;">
          <h2 style="color: #2563eb;">Global School AI System</h2>
          ${content}
          <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #888;">Email ini dikirim otomatis oleh sistem.</p>
        </div>
      </div>
    `,
    sender: { name: "Admin Global School", email: "azhardax94@gmail.com" },
    to: [{ email: toEmail }]
  };

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`📧 SUKSES: Email terkirim ke ${toEmail} dari azhardax94@gmail.com`);
  } catch (err) {
    console.error("❌ GAGAL KIRIM EMAIL:", err);
  }
};

module.exports = { sendMail };
