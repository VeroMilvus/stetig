// Einrichtung ohne Vercel-Einstellungen: Link im Browser öffnen, Bot-Token einfügen, fertig.
// https://stetig-sepia.vercel.app/api/setup
import { randomBytes } from 'node:crypto';
import { getCfg, saveCfg, tg } from './_lib.js';

const page = (body) => `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Stetig-Bot einrichten</title>
<style>body{margin:0;background:#ECEFE8;color:#2B332E;font:17px/1.5 ui-rounded,system-ui,-apple-system,sans-serif;padding:24px 16px}
main{max-width:460px;margin:0 auto;background:#FAFBF8;border-radius:24px;padding:24px;box-shadow:0 12px 30px -20px rgba(43,51,46,.35)}
h1{font-size:24px;margin:0 0 8px}p{margin:8px 0;color:#4a544d}label{display:block;font-weight:700;margin:18px 0 6px}
input{width:100%;box-sizing:border-box;padding:14px;border-radius:14px;border:1px solid #DDE3DA;background:#EEF1EB;font:inherit}
button{margin-top:20px;width:100%;padding:15px;border:0;border-radius:999px;background:#4F7360;color:#fff;font:800 17px system-ui,sans-serif}
small{color:#6F7A73}code{background:#EEF1EB;padding:2px 6px;border-radius:6px}
@media(prefers-color-scheme:dark){body{background:#151A17;color:#E4EAE2}main{background:#1E2521}p{color:#b8c2bb}input{background:#263029;border-color:#2F3A33;color:#E4EAE2}button{background:#9CC2A8;color:#10160F}code{background:#263029}}</style>
</head><body><main>${body}</main></body></html>`;

const send = (res, code, body) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(code).send(page(body));
};

export default async function handler(req, res) {
  let cfg;
  try { cfg = await getCfg(); } catch (e) { return send(res, 500, `<h1>Speicher fehlt</h1><p>${e.message}</p>`); }

  if (cfg.botToken) {
    return send(res, 200, `<h1>Schon eingerichtet ✓</h1><p>Öffne deinen Bot in Telegram${cfg.botName ? ` (<b>@${cfg.botName}</b>)` : ''} und schreib <code>/start</code>.</p>`);
  }

  if (req.method === 'POST') {
    const token = String(req.body?.token || '').trim();
    const groq = String(req.body?.groq || '').trim();
    const me = await tg(token, 'getMe', {});
    if (!me.ok) {
      return send(res, 400, `<h1>Token passt nicht</h1><p>Telegram kennt diesen Token nicht. Kopier ihn noch einmal komplett aus dem Chat mit BotFather.</p><p><a href="/api/setup">Zurück</a></p>`);
    }
    const next = {
      botToken: token,
      botName: me.result.username,
      webhookSecret: randomBytes(16).toString('hex'),
      inboxKey: randomBytes(16).toString('hex'),
      cronKey: randomBytes(16).toString('hex'),
      groqKey: groq || null,
      ownerChatId: null,
    };
    const hook = await tg(token, 'setWebhook', {
      url: `https://${req.headers.host}/api/telegram`,
      secret_token: next.webhookSecret,
      allowed_updates: ['message'],
    });
    if (!hook.ok) return send(res, 500, `<h1>Fehler</h1><p>${hook.description}</p>`);
    await tg(token, 'setMyCommands', {
      commands: [
        { command: 'hilfe', description: 'Zeigt, was du eintragen kannst' },
        { command: 'schluessel', description: 'App-Schlüssel und Link für die Morgenfrage' },
      ],
    });
    await saveCfg(next);
    return send(res, 200, `<h1>Fertig ✓</h1><p>Jetzt öffne <b>@${me.result.username}</b> in Telegram und schreib <code>/start</code>.</p><p>Wer zuerst <code>/start</code> schreibt, wird Besitzer – also mach das gleich.</p>`);
  }

  return send(res, 200, `<h1>Stetig-Bot einrichten</h1>
<p>Einmalig. Danach ist diese Seite gesperrt.</p>
<form method="post">
<label for="token">Bot-Token von BotFather</label>
<input id="token" name="token" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="123456789:ABC…">
<label for="groq">Groq-Schlüssel <small>(optional, für Sprachnachrichten)</small></label>
<input id="groq" name="groq" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="gsk_… (kann leer bleiben)">
<button type="submit">Einrichten</button>
</form>`);
}
