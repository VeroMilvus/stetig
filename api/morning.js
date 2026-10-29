// Wird jeden Morgen von cron-job.org aufgerufen und stellt die Schlaf-Frage.
import { redis, tg, AWAIT_SLEEP } from './_lib.js';

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.query.key !== process.env.CRON_SECRET) return res.status(401).end();
  const chatId = process.env.ALLOWED_CHAT_ID;
  if (!chatId) return res.status(400).send('ALLOWED_CHAT_ID fehlt');

  await tg('sendMessage', {
    chat_id: chatId,
    text: 'Guten Morgen! Wie hast du geschlafen?\nAntworte einfach per Text oder Sprachnachricht, z. B. „7,5 Stunden, gut geschlafen".',
  });
  // 6 Stunden lang zählt die nächste freie Antwort als Schlaf-Eintrag
  await redis('SET', AWAIT_SLEEP, '1', 'EX', 21600);
  return res.status(200).send('gesendet');
}
