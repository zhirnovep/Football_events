// Visit this URL once in a browser, after you know your group's chat_id, to
// send the first live message, pin it, and remember its id for future edits:
//
//   https://<your-site>.vercel.app/api/tg-init?chat_id=-100XXXXXXXXXX&secret=<WEBHOOK_SECRET>

import { buildText, saveTelegramState } from '../lib/telegram.js'

export default async function handler(req, res) {
  const { chat_id, secret } = req.query

  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized')
  }
  if (!chat_id) return res.status(400).send('chat_id required')

  const token = process.env.TELEGRAM_BOT_TOKEN
  const text = buildText(null)

  const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text })
  })
  const sendJson = await sendRes.json()
  if (!sendJson.ok) return res.status(500).json(sendJson)

  const messageId = sendJson.result.message_id
  await saveTelegramState(String(chat_id), messageId)

  const pinRes = await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, message_id: messageId, disable_notification: true })
  })
  const pinJson = await pinRes.json()

  res.status(200).send(
    `Готово. Сообщение отправлено (message_id=${messageId}). ` +
    (pinJson.ok ? 'Закреплено.' : `Закрепить не удалось: ${pinJson.description || 'неизвестная ошибка'} — дайте боту права администратора с разрешением "закреплять сообщения".`)
  )
}
