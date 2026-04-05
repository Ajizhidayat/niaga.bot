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

// 🔥 FUNGSI 1: Ambil Data dari Google Sheet (Membaca)
async function getSpreadsheetData() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CONFIG),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'sheet1!A2:C'
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) return "Tidak ada data FAQ.";

    let faqContext = "Berikut adalah data pengetahuan toko kami:\n";
    rows.forEach(row => {
      if (row[1] && row[2]) {
        faqContext += `- Kategori ${row[0] || 'Umum'}: Jika ditanya "${row[1]}", jawabannya: "${row[2]}"\n`;
      }
    });

    return faqContext;
  } catch (err) {
    console.error("GDocs Read Error:", err.message);
    return "Data FAQ tidak tersedia.";
  }
}

// 🔥 FUNGSI 2: Catat Pertanyaan Baru (Menulis)
async function logUnansweredQuestion(category, question) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CONFIG),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'sheet1!A2:C', 
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[category, question, "BELUM ADA JAWABAN (Tolong Isi)"]]
      }
    });
    console.log("Pertanyaan baru otomatis dicatat ke Sheets!");
  } catch (err) {
    console.error("GDocs Write Error:", err.message);
  }
}

// 🔥 WEBHOOK UTAMA
app.post('/wa-inbound', async (req, res) => {
  try {
    const data = req.body.data || req.body;
    const message = data.body;
    const from = data.from.replace('@c.us', '');

    console.log("Pesan Masuk:", message);

    // 1. Ambil data Sheet
    const sheetData = await getSpreadsheetData();
    // DEBUG: Cek di console log, apakah sheetData ada isinya?
    console.log("ISI DATA SHEET:", sheetData);

    if (!sheetData || sheetData.includes("tidak tersedia")) {
      console.log("WARNING: Data Sheet Kosong!");
    }

    let aiReply = "";

    // 2. Proses dengan AI
    try {
      const completion = await openai.chat.completions.create({
        model: "qwen/qwen3.6-plus:free", // Gunakan model yang stabil
        messages: [
          { 
            role: "system", 
            content: `Kamu adalah CS AI yang sangat membantu. Kamu diberikan DATA PENGETAHUAN di bawah ini untuk menjawab user.
            
            DATA PENGETAHUAN:
            ${sheetData}

            TUGAS:
            - Cari jawaban yang PALING RELEVAN dari data di atas.
            - Jika pertanyaan user ada kemiripan makna dengan data, berikan jawabannya.
            - HANYA jika benar-benar tidak ada di data, jawab: [TIDAK_ADA]` 
          },
          { role: "user", content: message }
        ],
        temperature: 0.3 // Supaya AI lebih fokus pada data
      });

      aiReply = completion.choices[0].message.content;

      // 3. Logika jika data tidak ada
      if (aiReply.includes("[TIDAK_ADA]")) {
        await logUnansweredQuestion("Auto-Log", message);
        aiReply = "Maaf, pertanyaan itu belum ada di database kami. Sudah kami catat untuk dijawab admin ya! Hubungi admin: wa.me/6281284520257";
      }

    } catch (err) {
      console.log("AI Error:", err.message);
      aiReply = "Aduh, otak AI-nya lagi loading. Coba tanya lagi ya!";
    }

    // 4. Kirim Balasan ke WhatsApp
    await axios.post(
      `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE}/messages/chat`,
      {
        token: process.env.ULTRAMSG_TOKEN,
        to: from,
        body: aiReply
      }
    );

    res.send("OK");
  } catch (err) {
    console.log("SERVER ERROR:", err.message);
    res.status(500).send("ERROR");
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log("Server jalan di port: " + PORT);
});