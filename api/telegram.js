// Empfängt Nachrichten von Telegram (Webhook) und legt sie in den Stetig-Eingang.
import { randomUUID } from 'node:crypto';
import { redis, getCfg, saveCfg, tg, tgFileUrl, parse, confirmText, berlinDate, INBOX, AWAIT_SLEEP, HELP } from './_lib.js';

async function transcribe(cfg, fileId) {
  if (!cfg.groqKey) return null;
  const f = await tg(cfg.botToken, 'getFile', { file_id: fileId });
  const path = f.result?.file_path;
  if (!path) return null;
  const audio = await fetch(tgFileUrl(cfg.botToken, path));
  const buf = await audio.arrayBuffer();
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'audio/ogg' }), 'voice.ogg');
  fd.append('model', 'whisper-large-v3-turbo');
  fd.append('language', 'de');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.groqKey}` },
    body: fd,
  });
  const j = await r.json();
  return j.text?.trim() || null;
}

function keysText(cfg, host) {
  return [
    'Dein App-Schlüssel (für Stetig → Einstellungen → Daten → Telegram-Schlüssel):',
    cfg.inboxKey,
    '',
    'Link für die Morgenfrage (bei cron-job.org, täglich 08:00, Europe/Berlin):',
    `https://${host}/api/morning?key=${cfg.cronKey}`,
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Stetig-Bot läuft.');

  const cfg = await getCfg();
  if (!cfg.botToken || req.headers['x-telegram-bot-api-secret-token'] !== cfg.webhookSecret) return res.status(401).end();

  const msg = req.body?.message;
  if (!msg) return res.status(200).end();
  const chatId = msg.chat.id;
  const say = (text) => tg(cfg.botToken, 'sendMessage', { chat_id: chatId, text });
  const host = req.headers.host;

  try {
    // Wer zuerst /start schreibt, wird Besitzer
    if (!cfg.ownerChatId && /^\/start/.test(msg.text || '')) {
      cfg.ownerChatId = chatId;
      await saveCfg(cfg);
      await say(`Hallo! Der Bot gehört jetzt dir. ✓\n\n${HELP}\n\n${keysText(cfg, host)}`);
      return res.status(200).end();
    }
    if (String(chatId) !== String(cfg.ownerChatId)) {
      await say('Dieser Bot ist privat.');
      return res.status(200).end();
    }

    let text = msg.text || msg.caption || '';
    if (/^\/start/.test(text) || /^\/(hilfe|help)/i.test(text)) { await say(HELP); return res.status(200).end(); }
    if (/^\/schl(ue|ü)ssel/i.test(text)) { await say(keysText(cfg, host)); return res.status(200).end(); }
    let m;
    if ((m = text.match(/^\/groq\s+(\S+)/i))) {
      cfg.groqKey = m[1];
      await saveCfg(cfg);
      await say('✓ Groq-Schlüssel gespeichert. Sprachnachrichten funktionieren jetzt.');
      return res.status(200).end();
    }

    let source = 'text';
    if (msg.voice || msg.audio) {
      source = 'voice';
      if (!cfg.groqKey) {
        await say('Für Sprachnachrichten brauche ich einen Groq-Schlüssel. Schick ihn so: /groq gsk_…');
        return res.status(200).end();
      }
      text = await transcribe(cfg, (msg.voice || msg.audio).file_id);
      if (!text) { await say('Die Sprachnachricht konnte ich nicht verstehen. Versuch es noch mal.'); return res.status(200).end(); }
    }
    if (!text) return res.status(200).end();

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
