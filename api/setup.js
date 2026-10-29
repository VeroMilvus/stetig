// Einmal im Browser aufrufen: verbindet Telegram mit dieser App.
// https://DEINE-APP.vercel.app/api/setup?key=DEIN_INBOX_KEY
import { tg } from './_lib.js';

export default async function handler(req, res) {
  if (!process.env.INBOX_KEY || req.query.key !== process.env.INBOX_KEY) return res.status(401).send('falscher Schlüssel');
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(400).send('TELEGRAM_BOT_TOKEN fehlt in Vercel');

  const url = `https://${req.headers.host}/api/telegram`;
  const hook = await tg('setWebhook', {
    url,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
    allowed_updates: ['message'],
  });
  await tg('setMyCommands', {
    commands: [
      { command: 'hilfe', description: 'Zeigt, was du eintragen kannst' },
      { command: 'start', description: 'Zeigt deine Chat-ID' },
    ],
  });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(hook.ok ? `Fertig! Telegram schickt Nachrichten jetzt an ${url}` : `Fehler: ${hook.description}`);
}
