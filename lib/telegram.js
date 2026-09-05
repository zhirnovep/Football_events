// Shared helpers for the Telegram "live message" feature.
// Kept outside /api so Vercel doesn't treat this file as its own route.

export function buildText(data) {
  const siteUrl = process.env.SITE_URL || ''

  if (!data) {
    return ['⚽ Сбор пока не создан.', siteUrl ? `\n👉 Сайт: ${siteUrl}` : ''].join('')
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
    siteUrl ? `👉 Голосовать: ${siteUrl}` : null,
    `Обновлено: ${time} МСК`
  ].filter(line => line !== null).join('\n')
}

export async function getTelegramState() {
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

export async function saveTelegramState(chat_id, message_id) {
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

export async function sendOrEdit(tgState, text) {
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
