// Gemeinsame Hilfsfunktionen für den Stetig-Telegram-Bot.
// Dateien mit "_" am Anfang werden von Vercel nicht als eigene Adresse veröffentlicht.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export const INBOX = 'stetig:inbox';
export const AWAIT_SLEEP = 'stetig:awaitSleep';

export async function redis(...cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('Upstash Redis ist nicht verbunden (KV_REST_API_URL fehlt).');
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

export async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export function tgFileUrl(path) {
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`;
}

// Datum in deutscher Zeit als YYYY-MM-DD
export function berlinDate(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
}

const NUM = '(\\d+(?:[.,]\\d+)?)';
const toNum = (s) => parseFloat(String(s).replace(',', '.'));

// Liest eine Nachricht aus und erkennt, was eingetragen werden soll.
// Alles, was nicht erkannt wird, wird eine Journal-Notiz.
export function parse(raw) {
  const text = String(raw || '').trim();
  const t = text.toLowerCase().replace(/^\//, '');
  let m;

  if ((m = t.match(new RegExp(`^(?:schlaf|geschlafen)\\s+${NUM}\\s*(?:h|std|stunden)?\\s*(.*)$`, 's')))) {
    return { type: 'sleep', hours: toNum(m[1]), note: text.slice(text.length - m[2].length).trim() || null };
  }
  if (t.includes('geschlaf') && (m = t.match(new RegExp(`${NUM}\\s*(?:h|std|stunden)\\b`)))) {
    return { type: 'sleep', hours: toNum(m[1]), note: text };
  }
  if ((m = t.match(new RegExp(`^(?:gewicht|waage)\\s+${NUM}`)))) {
    return { type: 'weight', kg: toNum(m[1]) };
  }
  if ((m = t.match(new RegExp(`^(?:stimmung|mood)\\s+${NUM}\\s*(.*)$`, 's')))) {
    return { type: 'mood', value: Math.max(1, Math.min(10, Math.round(toNum(m[1])))), note: m[2].trim() || null };
  }
  if ((m = t.match(/^schritte\s+([\d.]+)/))) {
    return { type: 'steps', steps: parseInt(m[1].replace(/\./g, ''), 10) };
  }
  if ((m = t.match(new RegExp(`^wasser\\s+${NUM}\\s*(ml|l)?`)))) {
    const v = toNum(m[1]);
    return { type: 'water', ml: m[2] === 'l' || v < 10 ? Math.round(v * 1000) : Math.round(v) };
  }
  if ((m = text.match(/^\/?(?:habit|erledigt|done)\s+(.+)$/i))) {
    return { type: 'habit', name: m[1].trim() };
  }
  if ((m = text.match(/^\/?(?:notiz|journal)\s+(.+)$/is))) {
    return { type: 'note', note: m[1].trim() };
  }
  return { type: 'note', note: text };
}

export function confirmText(e) {
  const de = (n) => String(n).replace('.', ',');
  switch (e.type) {
    case 'sleep': return e.hours ? `✓ Schlaf: ${de(e.hours)} h eingetragen.` : '✓ Schlaf-Notiz eingetragen.';
    case 'weight': return `✓ Gewicht: ${de(e.kg)} kg eingetragen.`;
    case 'mood': return `✓ Stimmung: ${e.value}/10 eingetragen.`;
    case 'steps': return `✓ Schritte: ${e.steps.toLocaleString('de-DE')} eingetragen.`;
    case 'water': return `✓ Wasser: ${e.ml} ml eingetragen.`;
    case 'habit': return `✓ Habit „${e.name}" abgehakt.`;
    default: return '✓ Als Journal-Notiz gespeichert.';
  }
}

export const HELP = [
  'So trägst du etwas in Stetig ein (Text oder Sprachnachricht):',
  '',
  'schlaf 7,5 gut geschlafen',
  'gewicht 82,4',
  'stimmung 7 entspannt',
  'schritte 9500',
  'wasser 500',
  'erledigt Lesen',
  '',
  'Alles andere landet als Notiz im Journal.',
  'Die Einträge erscheinen beim nächsten Öffnen der App.',
].join('\n');
