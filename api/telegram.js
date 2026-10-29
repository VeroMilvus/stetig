// Empfängt Nachrichten von Telegram (Webhook) und legt sie in den Stetig-Eingang.
import { randomUUID } from 'node:crypto';
import { redis, tg, tgFileUrl, parse, confirmText, berlinDate, INBOX, AWAIT_SLEEP, HELP } from './_lib.js';

async function transcribe(fileId) {
  if (!process.env.GROQ_API_KEY) return null;
  const f = await tg('getFile', { file_id: fileId });
  const path = f.result?.file_path;
  if (!path) return null;
  const audio = await fetch(tgFileUrl(path));
  const buf = await audio.arrayBuffer();
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'audio/ogg' }), 'voice.ogg');
  fd.append('model', 'whisper-large-v3-turbo');
  fd.append('language', 'de');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: fd,
  });
  const j = await r.json();
  return j.text?.trim() || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Stetig-Bot läuft.');

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(401).end();

  const msg = req.body?.message;
  if (!msg) return res.status(200).end();
  const chatId = msg.chat.id;
  const say = (text) => tg('sendMessage', { chat_id: chatId, text });

  try {
    if (/^\/start/.test(msg.text || '')) {
      await say(`Hallo! Deine Chat-ID ist ${chatId}\n(Die trägst du in Vercel als ALLOWED_CHAT_ID ein.)\n\n${HELP}`);
      return res.status(200).end();
    }

    const allowed = process.env.ALLOWED_CHAT_ID;
    if (!allowed || String(chatId) !== String(allowed)) {
      await say('Dieser Bot ist privat. (Falls du das bist: ALLOWED_CHAT_ID in Vercel eintragen.)');
      return res.status(200).end();
    }

    let text = msg.text || msg.caption || '';
    let source = 'text';
    if (msg.voice || msg.audio) {
      source = 'voice';
      text = await transcribe((msg.voice || msg.audio).file_id);
      if (!text) {
        await say('Die Sprachnachricht konnte ich nicht umwandeln. Ist GROQ_API_KEY in Vercel eingetragen?');
        return res.status(200).end();
      }
    }
    if (!text) return res.status(200).end();

    if (/^\/(hilfe|help)/i.test(text)) {
      await say(HELP);
      return res.status(200).end();
    }

    let entry = parse(text);
    // Antwort auf die Morgenfrage: freier Text zählt als Schlaf-Eintrag
    const awaiting = await redis('GET', AWAIT_SLEEP);
    if (awaiting && entry.type === 'note') entry = { type: 'sleep', hours: null, note: text };
    if (entry.type === 'sleep') await redis('DEL', AWAIT_SLEEP);

    const item = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      date: berlinDate(new Date(msg.date * 1000)),
      source,
      text,
      ...entry,
    };
    await redis('RPUSH', INBOX, JSON.stringify(item));
    await say((source === 'voice' ? `„${text}"\n` : '') + confirmText(item));
  } catch (e) {
    await say('Da ist etwas schiefgelaufen: ' + e.message);
  }
  return res.status(200).end();
}
