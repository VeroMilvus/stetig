// Die App holt hier neue Einträge ab (GET) und bestätigt sie danach (DELETE).
import { redis, INBOX } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!process.env.INBOX_KEY || req.query.key !== process.env.INBOX_KEY) {
    return res.status(401).json({ error: 'falscher Schlüssel' });
  }

  try {
    if (req.method === 'GET') {
      const raw = (await redis('LRANGE', INBOX, 0, -1)) || [];
      return res.status(200).json({ items: raw.map((s) => JSON.parse(s)) });
    }
    if (req.method === 'DELETE') {
      // n = Anzahl der Einträge, die die App gespeichert hat (die ältesten zuerst)
      const n = Math.max(0, parseInt(req.query.n, 10) || 0);
      if (n > 0) await redis('LTRIM', INBOX, n, -1);
      return res.status(200).json({ removed: n });
    }
    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
