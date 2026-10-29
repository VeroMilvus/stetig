// Wird jeden Morgen von cron-job.org aufgerufen und stellt die Schlaf-Frage.
import { redis, getCfg, tg, AWAIT_SLEEP } from './_lib.js';

export default async function handler(req, res) {
  const cfg = await getCfg();
  if (!cfg.cronKey || req.query.key !== cfg.cronKey) return res.status(401).end();
  if (!cfg.ownerChatId) return res.status(400).send('Bot noch nicht mit /start übernommen');

  await tg(cfg.botToken, 'sendMessage', {
    chat_id: cfg.ownerChatId,
    text: 'Guten Morgen! Wie hast du geschlafen?\nAntworte einfach per Text oder Sprachnachricht, z. B. „7,5 Stunden, gut geschlafen".',
  });
  // 6 Stunden lang zählt die nächste freie Antwort als Schlaf-Eintrag
  await redis('SET', AWAIT_SLEEP, '1', 'EX', 21600);
  return res.status(200).send('gesendet');
}
