const Brevo = require('@getbrevo/brevo');

const sendMail = async (toEmail, subject, content) => {
  // Setup API
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
    // PENGIRIM: Email Pak Haji
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
