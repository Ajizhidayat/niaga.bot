require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

// 🔥 FUNGSI 1: Ambil Data dari Google Sheet (Membaca Saja)
async function getSpreadsheetData() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CONFIG),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A2:C' // ⚠️ PASTIKAN NAMA TAB DI GOOGLE SHEET ADALAH 'Sheet1'
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) return "Tidak ada data pengetahuan spesifik.";

    let faqContext = "Berikut adalah data pengetahuan toko kami:\n";
    rows.forEach(row => {
      if (row[1] && row[2]) {
        faqContext += `- Kategori ${row[0] || 'Umum'}: Jika ditanya "${row[1]}", jawabannya: "${row[2]}"\n`;
      }
    });

    return faqContext;
  } catch (err) {
    console.error("GDocs Read Error:", err.message);
    return "Data FAQ sedang tidak tersedia, jawablah sebisa mungkin dengan ramah.";
  }
}

// 🔥 WEBHOOK UTAMA (Penerima Pesan)
app.post('/wa-inbound', async (req, res) => {
  try {
    const data = req.body.data || req.body;
    
    // Validasi data masuk
    if (!data || !data.body || !data.from) return res.send("OK");

    const message = data.body;
    const from = data.from.replace('@c.us', '');

    console.log("Pesan Masuk:", message);

    // 1. Ambil data Sheet
    const sheetData = await getSpreadsheetData();

    // 2. Proses dengan AI (Gunakan model yang stabil)
    let aiReply = "";
    try {
      const completion = await openai.chat.completions.create({
        model: "google/gemini-2.0-flash-exp:free", // Model ini paling jarang Error 429
        messages: [
          { 
            role: "system", 
            content: `Kamu adalah CS AI yang ramah. Gunakan DATA PENGETAHUAN di bawah ini untuk menjawab user. Jika tidak ada di data, jawablah secara umum dan arahkan untuk hubungi admin di wa.me/6281284520257.
            
            DATA PENGETAHUAN:
            ${sheetData}` 
          },
          { role: "user", content: message }
        ],
        temperature: 0.5 
      });

      aiReply = completion.choices[0].message.content;
    } catch (err) {
      console.error("AI Error:", err.message);
      aiReply = "Maaf kak, layanan sedang sibuk. Bisa coba tanya lagi sebentar lagi? 🙏";
    }

    // 3. Kirim Balasan ke WhatsApp via UltraMsg
    await axios.post(
      `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE}/messages/chat`,
      {
        token: process.env.ULTRAMSG_TOKEN,
        to: from,
        body: aiReply
      }
    );

    console.log("Respon terkirim ke:", from);
    res.send("OK");

  } catch (err) {
    console.log("SERVER ERROR:", err.message);
    res.status(200).send("OK"); // Kirim OK agar Ultramsg tidak terus mencoba ulang
  }
});

// 🔥 Jalankan Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log("Server Jalan Normal di Port: " + PORT);
});