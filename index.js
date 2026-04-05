require('dotenv').config();

console.log("ENV:", process.env.OPENROUTER_API_KEY);

const express = require('express')
const axios = require('axios')
const { google } = require('googleapis')
const OpenAI = require('openai')

const app = express()
app.use(express.json())

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
})

console.log("API KEY:", process.env.OPENROUTER_API_KEY);

// 🔥 ambil isi Google Sheet
async function getSpreadsheetData() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CONFIG),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    })

    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'FAQ BOT!A2:C'
    })

    const rows = res.data.values;
    if (!rows || rows.length === 0) return "Tidak ada data FAQ.";

    let faqContext = "Berikut adalah data pengetahuan toko kami:\n";

    let text = "";
    rows.forEach(row => {
      // row[0] = Kategori, row[1] = Keyword/Tanya, row[2] = Jawaban
      if (row[1] && row[2]) {
        faqContext += `- Kategori ${row[0] || 'Umum'}: Jika ditanya tentang "${row[1]}", jawabannya adalah: "${row[2]}"\n`;
      }
    });

  return faqContext;
  } catch (err) {
    console.error("Sheets error:", err.message);
    return "Data FAQ saat ini tidak tersedia.";
  }
}

// 🔥 webhook dari UltraMsg
app.post('/wa-inbound', async (req, res) => {
  try {
    const data = req.body.data || req.body
    const message = data.body
    const from = data.from.replace('@c.us', '')

    console.log("Pesan:", message);
    console.log("Kirim ke:", from);

    const sheetData = await getSpreadsheetData();
    const reply = findAnswer(message, sheetData);

    if(!reply)

    try {
      const ai = await openai.chat.completions.create({
        model: "qwen/qwen3.6-plus:free", // ✅ FIX MODEL
        messages: [
          { role: "system", content: `Kamu adalah CS AI yang cerdas dan ramah.
            Tugasmu menjawab pertanyaan pelanggan berdasarkan DATA FAQ di bawah ini.
      
      ATURAN:
      1. Jika pertanyaan pelanggan mirip dengan 'Keyword' di data, berikan 'Jawaban' yang sesuai.
      2. Gunakan gaya bahasa yang santai dan solutif.
      3. Jika pertanyaan tidak ada di data, arahkan pelanggan untuk menghubungi admin di https://wa.me/6281284520257.
      
      DATA FAQ:
      ${sheetData}` },
          { role: "user", content: message }
        ]
      });

      reply = ai.choices[0].message.content // ✅ FIX SCOPE
    } catch (err) {
      console.log("AI Error:", err.message);
      reply="maff bot lagi error, coba beberapa saat lagi yaa 🥰"
    }

    const send = await axios.post(
      `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE}/messages/chat`,
      {
        token: process.env.ULTRAMSG_TOKEN,
        to: from,
        body: reply
      }
    )

    console.log("ULTRAMSG RESPONSE:", send.data);gi

    res.send("OK")
  } catch (err) {
    console.log("SERVER ERROR", err.message)
    res.send("ERROR")
  }
})

const PORT= process.env.PORT || 8080
app.listen(PORT,'0.0.0.0', () => {
  console.log("Server jalan di http://localhost:" + PORT)
})

