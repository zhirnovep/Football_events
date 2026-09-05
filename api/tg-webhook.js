// Vercel serverless function.
// Called by a Supabase Database Webhook every time event_state changes.
// Edits (or creates + pins) one live status message in a Telegram group.

function buildText(data) {
  if (!data) {
    return '⚽ Сбор пока не создан.'
  }
  const going = Object.keys(data.going || {}).length
  const guests = (data.guests || []).length
  const notGoing = Object.keys(data.notGoing || {}).length
  const thinking = Object.keys(data.thinking || {}).length
  const total = going + guests
  const status = data.isOpen ? 'открыт 🟢' : 'закрыт 🔴'
  const when = [data.date, (data.startTime && data.endTime) ? `${data.startTime}–${data.endTime}` : null]
    .filter(Boolean).join(', ')
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })

  return [
    `⚽ ${data.location || ''}${when ? ` · ${when}` : ''}`.trim(),
    `Сбор ${status}`,
    '',
    `✅ Идут: ${total}${guests ? ` (в т.ч. ${guests} гостей)` : ''}`,
    `❌ Не идут: ${notGoing}`,
    `🤔 Думают: ${thinking}`,
    '',
    `Обновлено: ${time} МСК`
  ].join('\n')
}

async function getTelegramState() {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/telegram_state?id=eq.1&select=chat_id,message_id`
  const r = await fetch(url, {
    headers: {
      apikey: process.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
    }
  })
  const rows = await r.json()
  return rows[0]
}

async function saveTelegramState(chat_id, message_id) {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/telegram_state`
  await fetch(url, {
    method: 'POST',
    headers: {
      apikey: process.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ id: 1, chat_id, message_id })
  })
}

async function sendOrEdit(tgState, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (tgState.message_id) {
    const r = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: tgState.chat_id, message_id: tgState.message_id, text })
    })
    const j = await r.json()
    if (j.ok) return
    if (j.description && j.description.includes('not modified')) return
    // otherwise (message deleted, etc.) fall through and send a fresh one
  }

  const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: tgState.chat_id, text })
  })
  const sendJson = await sendRes.json()
  if (!sendJson.ok) return

  const newId = sendJson.result.message_id
  await saveTelegramState(tgState.chat_id, newId)
  await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: tgState.chat_id, message_id: newId, disable_notification: true })
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  const secret = req.headers['x-webhook-secret']
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized')
  }

  const payload = req.body
  if (!payload || payload.table !== 'event_state') {
    return res.status(200).send('ignored')
  }

  const data = payload.type === 'DELETE' ? null : payload.record?.data
  const text = buildText(data)

  const tgState = await getTelegramState()
  if (!tgState || !tgState.chat_id) return res.status(200).send('no chat configured yet')

  await sendOrEdit(tgState, text)
  res.status(200).send('ok')
}
