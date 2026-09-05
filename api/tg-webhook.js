// Vercel serverless function.
// Called by a Supabase Database Webhook every time event_state changes.
// Edits (or creates + pins) one live status message in a Telegram group.

import { buildText, getTelegramState, sendOrEdit } from '../lib/telegram.js'

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
