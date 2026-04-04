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

// 🔥 ambil isi Google Docs
async function getGoogleDoc() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/documents.readonly']
    })

    const docs = google.docs({ version: 'v1', auth })
    const res = await docs.documents.get({
      documentId: process.env.GOOGLE_DOC_ID
    })

    const content = res.data.body.content
      .map(item => item.paragraph?.elements?.map(e => e.textRun?.content).join(''))
      .join('')

    return content || "Tidak ada data"
  } catch (err) {
    console.log("GDocs error:", err.message)
    return ""
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

    const knowledge = await getGoogleDoc()

    let reply = "Maaf, bot lagi error 🙏";

    try {
      const ai = await openai.chat.completions.create({
        model: "qwen/qwen3.6-plus:free", // ✅ FIX MODEL
        messages: [
          { role: "system", content: `Kamu adalah CS UMKM. ${knowledge}` },
          { role: "user", content: message }
        ]
      });

      reply = ai.choices[0].message.content // ✅ FIX SCOPE
    } catch (err) {
      console.log("AI Error:", err.message);
    }

    const send = await axios.post(
      `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE}/messages/chat`,
      {
        token: process.env.ULTRAMSG_TOKEN,
        to: from,
        body: reply
      }
    )

    console.log("ULTRAMSG RESPONSE:", send.data);

    res.send("OK")
  } catch (err) {
    console.log("SERVER ERROR", err.message)
    res.send("ERROR")
  }
})

app.listen(process.env.PORT, () => {
  console.log("Server jalan di http://localhost:" + process.env.PORT)
})

// 🔥 test AI
// async function testAI() {
//   try {
//     const res = await openai.chat.completions.create({
//       model: "qwen/qwen3.6-plus:free",
//       messages: [
//         { role: "user", content: "halo" }
//       ]
//     });

//     console.log("AI RESPONSE:", res.choices[0].message.content);

//   } catch (err) {
//     console.log("AI ERROR:", err.message);
//   }
// }

// testAI();