// Family App – Cloudflare Worker (D1 + Workers AI + iCloud CalDAV + Web Push)
// Bindings: DB (D1), AI (Workers AI). Secret: SETUP_CODE (auch Schlüssel für den in der App hinterlegten iCloud-Zugang).
// Optional (alt): ICLOUD_USER, ICLOUD_PASS. Jede Familie läuft als eigene Kopie (eigener Worker + eigene D1).
// Cron: "*/5 * * * *" – Morgen-Mitteilung (Zeit je Nutzer), Erinnerungen vor Terminen, iCloud-Abgleich.

const APP_HTML = __APP_HTML__;
const SW_JS = __SW_JS__;
const ICON_180 = __ICON_180__;
const ICON_512 = __ICON_512__;
const SEED = __SEED__;

const AREAS = ['termine', 'aufgaben', 'einkauf', 'essen', 'themen', 'pinnwand'];
const KIND_AREA = { termin: 'termine', aufgabe: 'aufgaben', einkauf: 'einkauf', gedanke: 'themen', eingang: 'themen', nachricht: 'pinnwand' };
const COLL_AREA = { themen: 'themen', serien: 'aufgaben', essen: 'essen' };
const COLLS = ['eintraege', 'themen', 'serien', 'essen'];
const ROLES = ['admin', 'erwachsener', 'kind', 'gast', 'tablet'];
const LEVELS = ['off', 'mine', 'view', 'edit'];
const PRESETS = {
  admin: { termine: 'edit', aufgaben: 'edit', einkauf: 'edit', essen: 'edit', themen: 'edit', pinnwand: 'edit' },
  erwachsener: { termine: 'edit', aufgaben: 'edit', einkauf: 'edit', essen: 'edit', themen: 'edit', pinnwand: 'edit' },
  kind: { termine: 'mine', aufgaben: 'mine', einkauf: 'edit', essen: 'view', themen: 'off', pinnwand: 'edit' },
  gast: { termine: 'view', aufgaben: 'off', einkauf: 'off', essen: 'view', themen: 'off', pinnwand: 'view' },
  tablet: { termine: 'view', aufgaben: 'edit', einkauf: 'edit', essen: 'view', themen: 'off', pinnwand: 'edit' },
};
const COLORS = ['#2f6db0', '#c8613a', '#7d5ab8', '#1f8a80', '#b4457f', '#a07a12', '#55697d', '#8a5a3a'];
const AI_MODELS = [
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct-fast',
  '@cf/meta/llama-3.1-8b-instruct',
];
const PBKDF2_ITER = 20000;

const enc = new TextEncoder();
const b64u = (buf) => {
  const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const ub64u = (s) => {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const rid = (n = 24) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const nowIso = () => new Date().toISOString();
const json = (d, s = 200, h = {}) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });
const bad = (msg, s = 400) => json({ error: msg }, s);

function berlin(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(date)
      .map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, hh: p.hour === '24' ? '00' : p.hour, mm: p.minute };
}
const addDaysIso = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* ---------------- Datenbank ---------------- */
let ready = false;
async function init(env) {
  if (ready) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,areas TEXT NOT NULL,salt TEXT,hash TEXT,invite TEXT,active INTEGER NOT NULL DEFAULT 1,fails INTEGER NOT NULL DEFAULT 0,lock_until INTEGER NOT NULL DEFAULT 0,created TEXT)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS users_name ON users(name COLLATE NOCASE)`,
    `CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,created TEXT)`,
    `CREATE TABLE IF NOT EXISTS docs(coll TEXT NOT NULL,id TEXT NOT NULL,data TEXT,updated INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(coll,id))`,
    `CREATE INDEX IF NOT EXISTS docs_updated ON docs(updated)`,
    `CREATE TABLE IF NOT EXISTS push(endpoint TEXT PRIMARY KEY,user_id TEXT NOT NULL,created TEXT)`,
    `CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT)`,
    `CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,title TEXT,body TEXT,created INTEGER NOT NULL,seen INTEGER NOT NULL DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS notes_user ON notes(user_id,seen)`,
    `CREATE TABLE IF NOT EXISTS sent(k TEXT PRIMARY KEY,at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,created TEXT)`,
  ];
  await env.DB.batch(stmts.map((s) => env.DB.prepare(s)));
  for (const col of ['prefs TEXT', 'color TEXT', 'profil INTEGER NOT NULL DEFAULT 0']) {
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN ' + col).run(); } catch (e) { /* gibt es schon */ }
  }
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS backups(id INTEGER PRIMARY KEY AUTOINCREMENT,created INTEGER NOT NULL,data TEXT NOT NULL)').run();
  const { results: cu } = await env.DB.prepare('SELECT id,color FROM users ORDER BY created,rowid').all();
  const taken = new Set(cu.map((u) => u.color).filter(Boolean));
  for (const u of cu) {
    if (u.color) continue;
    const c = COLORS.find((x) => !taken.has(x)) || COLORS[taken.size % COLORS.length];
    taken.add(c);
    await env.DB.prepare('UPDATE users SET color=? WHERE id=?').bind(c, u.id).run();
  }
  ready = true;
}
async function getSetting(env, k) {
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k=?').bind(k).first();
  return r ? JSON.parse(r.v) : null;
}
async function setSetting(env, k, v) {
  await env.DB.prepare('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, JSON.stringify(v)).run();
}
let lastStamp = 0;
const stamp = () => {
  const t = Date.now();
  lastStamp = t > lastStamp ? t : lastStamp + 1;
  return lastStamp;
};
async function getDoc(env, coll, id) {
  const r = await env.DB.prepare('SELECT data,deleted FROM docs WHERE coll=? AND id=?').bind(coll, id).first();
  if (!r) return null;
  return { data: r.data ? JSON.parse(r.data) : null, deleted: !!r.deleted };
}
async function putDoc(env, coll, id, data) {
  await env.DB.prepare('INSERT INTO docs(coll,id,data,updated,deleted) VALUES(?,?,?,?,0) ON CONFLICT(coll,id) DO UPDATE SET data=excluded.data,updated=excluded.updated,deleted=0')
    .bind(coll, id, JSON.stringify(data), stamp())
    .run();
}
async function deleteDoc(env, coll, id) {
  await env.DB.prepare('UPDATE docs SET deleted=1,updated=? WHERE coll=? AND id=?').bind(stamp(), coll, id).run();
}
async function allDocs(env, coll) {
  const { results } = await env.DB.prepare('SELECT id,data FROM docs WHERE coll=? AND deleted=0').bind(coll).all();
  return results.map((r) => ({ id: r.id, data: JSON.parse(r.data) }));
}

/* ---------------- Nutzer & Rechte ---------------- */
const normRole = (r) => (r === 'mitglied' ? 'erwachsener' : r === 'lesen' ? 'gast' : ROLES.includes(r) ? r : 'erwachsener');
function normPerms(role, raw) {
  let p = raw;
  try { p = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { p = null; }
  if (Array.isArray(p)) { const o = {}; AREAS.forEach((a) => (o[a] = p.includes(a) ? (role === 'gast' ? 'view' : 'edit') : 'off')); p = o; }
  const base = PRESETS[role] || PRESETS.erwachsener;
  const o = {};
  AREAS.forEach((a) => (o[a] = role === 'admin' ? 'edit' : LEVELS.includes(p && p[a]) ? p[a] : base[a]));
  return o;
}
const PREF_DEF = { ruheVon: '22:00', ruheBis: '06:30', morgenWerktag: '06:30', morgenWochenende: '09:00' };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function normPrefs(raw) {
  let p = raw;
  try { p = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { p = null; }
  const o = { ...PREF_DEF };
  for (const k of Object.keys(PREF_DEF)) if (p && HHMM.test(String(p[k] || ''))) o[k] = p[k];
  return o;
}
const pub = (u) => { const role = normRole(u.role); return { id: u.id, name: u.name, role, perms: normPerms(role, u.areas), prefs: normPrefs(u.prefs), color: /^#[0-9a-f]{6}$/i.test(String(u.color || '')) ? u.color : '', profil: !!u.profil, active: !!u.active, invited: !u.profil && !!u.invite && !u.hash }; };
const inQuiet = (prefs, hhmm) => { const a = prefs.ruheVon, b = prefs.ruheBis; if (a === b) return false; return a < b ? hhmm >= a && hhmm < b : hhmm >= a || hhmm < b; };
const adult = (u) => u.role === 'admin' || u.role === 'erwachsener';
const lvl = (u, a) => (u.perms && u.perms[a]) || 'off';
const ownish = (u, d) => !!d && (d.by === u.id || d.fuer === u.id);
function canRead(u, coll, d) {
  if (!d) return false;
  const l = lvl(u, docArea(coll, d));
  if (l === 'off') return false;
  const s = d.sicht || 'familie';
  if (s === 'privat' && d.by && d.by !== u.id) return false;
  if (s === 'erwachsene' && !adult(u)) return false;
  if (l === 'mine' && coll !== 'essen') return ownish(u, d);
  return true;
}
function canWrite(u, coll, nd, od) {
  for (const d of [od, nd]) {
    if (!d) continue;
    const l = lvl(u, docArea(coll, d));
    if (l === 'edit') { if (!canRead(u, coll, d)) return false; continue; }
    if (l !== 'mine' || coll === 'essen') return false;
    if (!ownish(u, d)) return false;
    if ((d.sicht || 'familie') === 'erwachsene') return false;
  }
  if (od && nd && od.by !== u.id && lvl(u, docArea(coll, od)) === 'mine') {
    const keys = new Set([...Object.keys(od), ...Object.keys(nd)]);
    for (const k of keys) if (!['done', 'doneAt'].includes(k) && JSON.stringify(od[k]) !== JSON.stringify(nd[k])) return false;
  }
  return true;
}
const can = (u, area) => lvl(u, area) !== 'off';
const canCapture = (u) => AREAS.some((a) => ['edit', 'mine'].includes(lvl(u, a)));
const docArea = (coll, data) => (coll === 'eintraege' ? KIND_AREA[data && data.kind] || 'themen' : COLL_AREA[coll]);

async function pwHash(pw, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: ub64u(salt), iterations: PBKDF2_ITER }, k, 256);
  return b64u(bits);
}
const cookieOf = (req, name) => {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
};
const sessionCookie = (t, maxAge = 31536000) => `fa_s=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
async function newSession(env, userId) {
  const t = rid(32);
  await env.DB.prepare('INSERT INTO sessions(token,user_id,created) VALUES(?,?,?)').bind(await sha(t), userId, nowIso()).run();
  return t;
}
async function currentUser(req, env) {
  const t = cookieOf(req, 'fa_s');
  if (!t) return null;
  const r = await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND u.active=1').bind(await sha(t)).first();
  return r ? pub(r) : null;
}
const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 40);
const cleanPerms = (role, p) => normPerms(role, p && typeof p === 'object' && !Array.isArray(p) ? p : PRESETS[role]);

/* ---------------- KI ---------------- */
function parseJsonLoose(x) {
  if (x && typeof x === 'object') return x;
  const s = String(x || '').replace(/```(?:json)?/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}
async function runAI(env, prompt) {
  if (!env.AI) return null;
  for (const m of AI_MODELS) {
    try {
      const r = await env.AI.run(m, { messages: [{ role: 'system', content: 'Du antwortest ausschließlich mit gültigem JSON, ohne Erklärungen.' }, { role: 'user', content: prompt }], max_tokens: 1500, temperature: 0.1 });
      const j = parseJsonLoose(r && (r.response !== undefined ? r.response : r));
      if (j) return j;
    } catch (e) { /* nächstes Modell */ }
  }
  return null;
}

/* ---------------- iCloud-Kalender (CalDAV) ---------------- */
const credCache = new WeakMap();
async function credKey(env) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(env.SETUP_CODE || 'family-app')), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('family-app-cal'), info: enc.encode('icloud') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function setCred(env, user, pass) {
  credCache.delete(env);
  if (!user || !pass) { await env.DB.prepare('DELETE FROM settings WHERE k=?').bind('calcred').run(); return; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await credKey(env), enc.encode(JSON.stringify({ user, pass })));
  await setSetting(env, 'calcred', { iv: b64u(iv), ct: b64u(ct), user });
}
async function getCred(env) {
  const c = credCache.get(env);
  if (c && Date.now() - c.at < 60000) return c.v;
  let v = null;
  const s = await getSetting(env, 'calcred');
  if (s && s.iv) {
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64u(s.iv) }, await credKey(env), ub64u(s.ct));
      const o = JSON.parse(new TextDecoder().decode(pt));
      if (o.user && o.pass) v = { user: o.user, pass: o.pass };
    } catch (e) { /* Schlüssel passt nicht mehr */ }
  }
  if (!v && env.ICLOUD_USER && env.ICLOUD_PASS) v = { user: env.ICLOUD_USER, pass: env.ICLOUD_PASS, fromEnv: true };
  credCache.set(env, { v, at: Date.now() });
  return v;
}
function basic(c) {
  const bytes = enc.encode(c.user + ':' + c.pass);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return 'Basic ' + btoa(s);
}
async function calStatus(env, err) {
  const st = (await getSetting(env, 'calstatus')) || { fails: 0 };
  const v = err ? { ok: false, err: String(err).slice(0, 200), fails: (st.fails || 0) + 1, at: Date.now() } : { ok: true, fails: 0, at: Date.now() };
  if (st.ok !== v.ok || st.fails !== v.fails || st.err !== v.err) await setSetting(env, 'calstatus', v);
}
async function dav(env, url, method, body, headers = {}) {
  const c = await getCred(env);
  if (!c) throw new Error('Der iCloud-Zugang fehlt. Ein Admin trägt ihn unter Einstellungen › iPhone-Kalender ein.');
  let u = url;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(u, { method, redirect: 'manual', headers: { authorization: basic(c), ...(body ? { 'content-type': 'application/xml; charset=utf-8' } : {}), ...headers }, body });
    const loc = r.headers.get('location');
    if ([301, 302, 303, 307, 308].includes(r.status) && loc) { u = new URL(loc, u).href; continue; }
    return { r, url: u, text: await r.text() };
  }
  throw new Error('Zu viele Weiterleitungen');
}
const xmlResponses = (x) => x.match(/<(?:[\w-]+:)?response[\s>][\s\S]*?<\/(?:[\w-]+:)?response>/g) || [];
const xmlHrefIn = (x, tag) => {
  const m = x.match(new RegExp('<(?:[\\w-]+:)?' + tag + '[^>]*>\\s*<(?:[\\w-]+:)?href[^>]*>([^<]+)<'));
  return m ? m[1].trim() : null;
};
const xmlUnesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
async function listCalendars(env) {
  const a = await dav(env, 'https://caldav.icloud.com/', 'PROPFIND', '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>', { depth: '0' });
  if (a.r.status === 401) throw new Error('iCloud lehnt die Anmeldung ab. Apple-ID und app-spezifisches Passwort prüfen.');
  const ph = xmlHrefIn(a.text, 'current-user-principal');
  if (!ph) throw new Error('iCloud-Konto nicht gefunden (' + a.r.status + ').');
  const principal = new URL(ph, a.url).href;
  const b = await dav(env, principal, 'PROPFIND', '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>', { depth: '0' });
  const hh = xmlHrefIn(b.text, 'calendar-home-set');
  if (!hh) throw new Error('Kalender-Verzeichnis nicht gefunden.');
  const home = new URL(hh, b.url).href;
  const c = await dav(env, home, 'PROPFIND', '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>', { depth: '1' });
  const out = [];
  for (const resp of xmlResponses(c.text)) {
    const href = (resp.match(/<(?:[\w-]+:)?href[^>]*>([^<]+)</) || [])[1];
    const rt = (resp.match(/<(?:[\w-]+:)?resourcetype[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?resourcetype>/) || [])[1] || '';
    if (!href || !/<(?:[\w-]+:)?calendar[\s/>]/.test(rt)) continue;
    const comps = (resp.match(/<(?:[\w-]+:)?supported-calendar-component-set[\s\S]*?<\/(?:[\w-]+:)?supported-calendar-component-set>/) || [])[0] || '';
    if (comps && !/VEVENT/.test(comps)) continue;
    const name = xmlUnesc((resp.match(/<(?:[\w-]+:)?displayname[^>]*>([^<]*)</) || [])[1] || 'Kalender');
    out.push({ url: new URL(href.trim(), c.url).href, name });
  }
  return out;
}
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const bytes = enc.encode(line);
  if (bytes.length <= 74) return line;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const l = enc.encode(ch).length;
    if (len + l > 73) { out.push(cur); cur = ' '; len = 1; }
    cur += ch; len += l;
  }
  out.push(cur);
  return out.join('\r\n');
}
const VTZ = ['BEGIN:VTIMEZONE', 'TZID:Europe/Berlin', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
const dt = (s) => s.replace(/[-:]/g, '').slice(0, 13) + '00';
function hourLater(s) {
  const d = new Date(s.slice(0, 16) + ':00Z');
  d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString().slice(0, 16);
}
function buildIcs(uid, e, byName) {
  const s = String(e.start || '');
  const allDay = e.ganztags || s.length <= 10;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family App//DE', 'CALSCALE:GREGORIAN'];
  if (!allDay) lines.push(...VTZ);
  lines.push('BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z');
  if (allDay) {
    const d = s.slice(0, 10);
    lines.push('DTSTART;VALUE=DATE:' + d.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDaysIso(d, 1).replace(/-/g, ''));
  } else {
    const en = e.ende && String(e.ende).length > 10 && String(e.ende) > s ? String(e.ende) : hourLater(s);
    lines.push('DTSTART;TZID=Europe/Berlin:' + dt(s), 'DTEND;TZID=Europe/Berlin:' + dt(en));
  }
  const freq = { woechentlich: 'FREQ=WEEKLY', zweiwoechentlich: 'FREQ=WEEKLY;INTERVAL=2', monatlich: 'FREQ=MONTHLY', jaehrlich: 'FREQ=YEARLY' }[e.wdh];
  if (freq) lines.push('RRULE:' + freq + (/^\d{4}-\d\d-\d\d$/.test(String(e.wdhBis || '')) ? ';UNTIL=' + String(e.wdhBis).replace(/-/g, '') + (allDay ? '' : 'T235959Z') : ''));
  if (freq) for (const x of (e.ausnahmen || []).filter(isDay).slice(0, 100)) lines.push(allDay ? 'EXDATE;VALUE=DATE:' + x.replace(/-/g, '') : 'EXDATE;TZID=Europe/Berlin:' + dt(x + s.slice(10)));
  lines.push('SUMMARY:' + icsEsc(e.titel || 'Termin'));
  const desc = [e.text && e.text !== e.titel ? e.text : '', byName ? 'Eingetragen von ' + byName + ' über die Family App' : 'Eingetragen über die Family App'].filter(Boolean).join('\n');
  lines.push('DESCRIPTION:' + icsEsc(desc));
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
const isDay = (x) => /^\d{4}-\d\d-\d\d$/.test(String(x || ''));
const WDH = ['woechentlich', 'zweiwoechentlich', 'monatlich', 'jaehrlich'];
function addMonthsIso(d, n) {
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
}
// Alle Termine eines Tages (Serientermine aufgelöst)
function onDay(e, day) {
  const s = String(e.start || ''), d0 = s.slice(0, 10);
  if (!d0 || day < d0) return null;
  const time = s.length > 10 ? s.slice(10) : '';
  if (!WDH.includes(e.wdh)) return d0 === day ? s : null;
  if (e.wdhBis && day > e.wdhBis) return null;
  if ((e.ausnahmen || []).includes(day)) return null;
  const diff = Math.round((Date.parse(day) - Date.parse(d0)) / 864e5);
  if (e.wdh === 'woechentlich' && diff % 7 === 0) return day + time;
  if (e.wdh === 'zweiwoechentlich' && diff % 14 === 0) return day + time;
  if (e.wdh === 'monatlich' || e.wdh === 'jaehrlich') {
    for (let i = 0, x = d0; x <= day && i < 1200; i++, x = addMonthsIso(d0, i * (e.wdh === 'monatlich' ? 1 : 12))) if (x === day) return day + time;
  }
  return null;
}
async function userName(env, id) {
  if (!id) return '';
  const r = await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(id).first();
  return r ? r.name : '';
}
async function calPut(env, id) {
  const cal = await getSetting(env, 'cal');
  if (!cal || !(await getCred(env))) return false;
  const d = await getDoc(env, 'eintraege', id);
  if (!d || d.deleted || !d.data || d.data.kind !== 'termin' || !/^\d{4}-\d\d-\d\d/.test(String(d.data.start || ''))) return false;
  if (d.data.vorschlag || d.data.sicht === 'privat') {
    if (d.data.calUrl) {
      await calDelete(env, d.data);
      const { kalender, calUid, calUrl, calSig, calErr, ...rest } = d.data;
      await putDoc(env, 'eintraege', id, rest);
    }
    return false;
  }
  const uid = d.data.calUid || id + '@family-app';
  const url = d.data.calUrl || cal.url.replace(/\/?$/, '/') + encodeURIComponent(id) + '.ics';
  const ics = buildIcs(uid, d.data, await userName(env, d.data.by));
  const res = await dav(env, url, 'PUT', ics, { 'content-type': 'text/calendar; charset=utf-8' });
  if (![200, 201, 204].includes(res.r.status)) throw new Error('Kalender: ' + res.r.status);
  const fresh = await getDoc(env, 'eintraege', id);
  if (fresh && !fresh.deleted && fresh.data) await putDoc(env, 'eintraege', id, { ...fresh.data, kalender: true, calUid: uid, calUrl: url, calSig: sigOf(fresh.data), calErr: '' });
  return true;
}
async function calDelete(env, data) {
  if (!data || !data.calUrl || !(await getCred(env))) return;
  try { await dav(env, data.calUrl, 'DELETE', null); } catch (e) { /* egal */ }
}
const sigOf = (d) => [d.titel, d.text, d.start, d.ende, d.ganztags, d.wdh || '', d.wdhBis || '', (d.ausnahmen || []).join(',')].join('|');
async function calMark(env, id, err) {
  const d = await getDoc(env, 'eintraege', id);
  if (d && !d.deleted && d.data) await putDoc(env, 'eintraege', id, { ...d.data, calErr: String(err).slice(0, 200) });
}
async function syncPending(env, limit = 10) {
  const cal = await getSetting(env, 'cal');
  if (!cal) return { synced: 0, failed: 0 };
  const yesterday = addDaysIso(berlin().date, -1);
  const docs = (await allDocs(env, 'eintraege')).filter((x) => x.data.kind === 'termin' && !x.data.vorschlag && x.data.sicht !== 'privat' && String(x.data.start || '').slice(0, 10) >= yesterday && (!x.data.kalender || x.data.calSig !== sigOf(x.data)));
  let synced = 0, failed = 0;
  let lastErr = '';
  for (const x of docs.slice(0, limit)) {
    try { if (await calPut(env, x.id)) synced++; } catch (e) { failed++; lastErr = e.message; await calMark(env, x.id, e.message); }
  }
  if (docs.length) await calStatus(env, failed && !synced ? lastErr : '');
  return { synced, failed, open: Math.max(0, docs.length - synced) };
}

const icsVal = (block, key) => {
  const m = block.match(new RegExp('^' + key + '(;[^:\\r\\n]*)?:(.*)$', 'm'));
  return m ? { params: m[1] || '', value: m[2].trim() } : null;
};
const icsUnesc = (s) => String(s || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
function icsTime(v) {
  if (!v) return null;
  const x = v.value;
  if (/VALUE=DATE/.test(v.params) || /^\d{8}$/.test(x)) return { day: x.slice(0, 4) + '-' + x.slice(4, 6) + '-' + x.slice(6, 8), allDay: true };
  const m = x.match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)/);
  if (!m) return null;
  if (x.endsWith('Z')) {
    const b = berlin(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])));
    return { local: b.date + 'T' + b.hh + ':' + b.mm, allDay: false };
  }
  return { local: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`, allDay: false };
}
function parseEvents(xml) {
  const out = [];
  const datas = xml.match(/<(?:[\w-]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?calendar-data>/g) || [];
  for (const d of datas) {
    const ics = xmlUnesc(d.replace(/^<[^>]+>|<\/[^>]+>$/g, '')).replace(/\r?\n[ \t]/g, '');
    for (const ev of ics.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []) {
      const uid = (icsVal(ev, 'UID') || {}).value || '';
      if (/@family-app$/.test(uid)) continue;
      const st = icsTime(icsVal(ev, 'DTSTART'));
      if (!st) continue;
      const en = icsTime(icsVal(ev, 'DTEND'));
      const rec = (icsVal(ev, 'RECURRENCE-ID') || {}).value || '';
      out.push({ id: 'ic-' + uid.replace(/[^\w-]/g, '').slice(0, 40) + (rec ? '-' + rec.replace(/\D/g, '').slice(0, 12) : ''), titel: icsUnesc((icsVal(ev, 'SUMMARY') || {}).value || 'Termin').slice(0, 120), start: st.allDay ? st.day : st.local, ende: en ? (en.allDay ? en.day : en.local) : '', ganztags: st.allDay, ort: icsUnesc((icsVal(ev, 'LOCATION') || {}).value || '').slice(0, 120) });
    }
  }
  const seen = new Set();
  return out.filter((e) => (seen.has(e.id + e.start) ? false : seen.add(e.id + e.start))).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 400);
}
async function refreshExternal(env) {
  const cal = await getSetting(env, 'cal');
  if (!cal || !(await getCred(env))) return null;
  const t0 = berlin().date;
  const from = addDaysIso(t0, -1).replace(/-/g, '') + 'T000000Z', to = addDaysIso(t0, 60).replace(/-/g, '') + 'T000000Z';
  const body = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data><c:expand start="${from}" end="${to}"/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${from}" end="${to}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  let res;
  try {
    res = await dav(env, cal.url, 'REPORT', body, { depth: '1' });
    if (res.r.status !== 207) throw new Error(res.r.status === 401 ? 'iCloud lehnt die Anmeldung ab. App-spezifisches Passwort prüfen.' : 'Kalender lesen: ' + res.r.status);
  } catch (e) { await calStatus(env, e.message); throw e; }
  await calStatus(env, '');
  const v = { at: Date.now(), events: parseEvents(res.text) };
  await setSetting(env, 'calext', v);
  return v;
}
async function externalEvents(env, force) {
  const c = await getSetting(env, 'calext');
  if (!force && c && Date.now() - c.at < 10 * 60000) return c;
  try { return (await refreshExternal(env)) || c; } catch (e) { return c ? { ...c, err: e.message } : { at: 0, events: [], err: e.message }; }
}
const seesExternal = (u) => ['view', 'edit'].includes(lvl(u, 'termine'));

/* ---------------- Web Push ---------------- */
async function vapid(env) {
  let v = await getSetting(env, 'vapid');
  if (v) return v;
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  v = { jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)) };
  await setSetting(env, 'vapid', v);
  return v;
}
async function sendPush(env, endpoint) {
  const v = await vapid(env);
  const origin = (await getSetting(env, 'origin')) || 'https://example.com';
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: origin })));
  const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body)));
  const r = await fetch(endpoint, { method: 'POST', headers: { TTL: '43200', Urgency: 'high', Authorization: `vapid t=${head}.${body}.${sig}, k=${v.pub}`, 'Content-Length': '0' } });
  if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push WHERE endpoint=?').bind(endpoint).run();
  return r.status;
}
async function pushAll(env, userId) {
  const q = userId ? env.DB.prepare('SELECT endpoint FROM push WHERE user_id=?').bind(userId) : env.DB.prepare('SELECT p.endpoint FROM push p JOIN users u ON u.id=p.user_id WHERE u.active=1');
  const { results } = await q.all();
  const out = [];
  for (const r of results.slice(0, 40)) {
    try { out.push(await sendPush(env, r.endpoint)); } catch (e) { out.push('err'); }
  }
  return out;
}

async function activeUsers(env) {
  return (await env.DB.prepare('SELECT * FROM users WHERE active=1').all()).results.map(pub);
}
// urgent: klingelt auch während der Ruhezeit (Termine, Aufgaben mit Uhrzeit, Morgen-Mitteilung)
async function notify(env, users, title, body, urgent) {
  const hhmm = (() => { const b = berlin(); return b.hh + ':' + b.mm; })();
  const out = [];
  for (const u of users) {
    if (!urgent && inQuiet(u.prefs, hhmm)) continue;
    await env.DB.prepare('INSERT INTO notes(user_id,title,body,created) VALUES(?,?,?,?)').bind(u.id, String(title).slice(0, 80), String(body).slice(0, 400), Date.now()).run();
    out.push(...(await pushAll(env, u.id)));
  }
  return out;
}
async function once(env, k) {
  const r = await env.DB.prepare('SELECT k FROM sent WHERE k=?').bind(k).first();
  if (r) return false;
  await env.DB.prepare('INSERT INTO sent(k,at) VALUES(?,?)').bind(k, Date.now()).run();
  return true;
}
const minusMin = (local, n) => { const d = new Date(local.slice(0, 16) + ':00Z'); d.setUTCMinutes(d.getUTCMinutes() - n); return d.toISOString().slice(0, 16); };
const recipients = (users, d) => {
  const f = String(d.fuer || 'wir');
  return users.filter((u) => canRead(u, 'eintraege', d) && (f === 'wir' || f === u.id || d.by === u.id || (f.startsWith('partner-of:') && f !== 'partner-of:' + u.id)));
};
async function reminders(env, from, to) {
  const users = await activeUsers(env);
  const E = (await allDocs(env, 'eintraege')).map((x) => ({ id: x.id, ...x.data }));
  let n = 0;
  for (const e of E) {
    let at = null, title = '', body = '';
    if (e.kind === 'termin' && !e.vorschlag && String(e.start || '').length > 10 && e.erinnerung !== 'aus') {
      const lead = Number.isFinite(+e.erinnerung) && e.erinnerung !== '' && e.erinnerung !== undefined ? +e.erinnerung : 60;
      // Der Termin, dessen Erinnerung in dieses Fenster fällt (bei Serien: das passende Vorkommen)
      let occ = e.start;
      if (WDH.includes(e.wdh)) {
        occ = null;
        for (let k = 0; k <= Math.ceil(lead / 1440) + 1 && !occ; k++) {
          const day = addDaysIso(to.slice(0, 10), k), o = onDay(e, day);
          if (o) { const a = minusMin(o, lead); if (a > from && a <= to) occ = o; }
        }
        if (!occ) continue;
      }
      at = minusMin(occ, lead);
      title = 'Termin um ' + occ.slice(11, 16) + ' Uhr';
      body = e.titel + (lead >= 1440 ? ' (morgen)' : '');
    } else if (e.kind === 'aufgabe' && !e.done && e.faellig && HHMM.test(String(e.zeit || ''))) {
      at = e.faellig + 'T' + e.zeit;
      title = 'Aufgabe jetzt fällig';
      body = e.titel;
    }
    if (!at || !(at > from && at <= to)) continue;
    if (!(await once(env, 'r:' + e.id + ':' + at))) continue;
    await notify(env, recipients(users, e), title, body, true);
    n++;
  }
  return n;
}
async function morning(env, from, to) {
  const users = await activeUsers(env);
  let n = 0;
  for (const u of users) {
    for (const day of new Set([from.slice(0, 10), to.slice(0, 10)])) {
      const wd = new Date(day + 'T12:00:00Z').getUTCDay();
      const at = day + 'T' + (wd === 0 || wd === 6 ? u.prefs.morgenWochenende : u.prefs.morgenWerktag);
      if (!(at > from && at <= to)) continue;
      if (!(await once(env, 'm:' + u.id + ':' + day))) continue;
      await notify(env, [u], 'Guten Morgen, ' + u.name, await briefing(env, u), true);
      n++;
    }
  }
  return n;
}
async function onWrite(env, me, events) {
  const users = (await activeUsers(env)).filter((u) => u.id !== me.id);
  for (const ev of events) {
    const d = ev.data;
    if (ev.type === 'pin') await notify(env, users.filter((u) => canRead(u, 'eintraege', d)), 'Pinnwand · ' + me.name, d.text || d.titel, false);
    if (ev.type === 'vorschlag') await notify(env, users.filter((u) => adult(u) && lvl(u, 'termine') === 'edit'), 'Vorschlag von ' + me.name, d.titel + ' · ' + String(d.start || '').slice(0, 10).split('-').reverse().join('.'), false);
    if (ev.type === 'zuweisung') await notify(env, users.filter((u) => u.id === d.fuer && canRead(u, 'eintraege', d)), 'Neue Aufgabe von ' + me.name, d.titel, false);
  }
}

/* ---------------- Tages-Briefing ---------------- */
const mineFor = (x, uid) => {
  const f = String(x.fuer || 'wir');
  return f === 'wir' || f === uid || (f.startsWith('partner-of:') && f !== 'partner-of:' + uid);
};
async function briefing(env, u) {
  const t0 = berlin().date;
  const E = (await allDocs(env, 'eintraege')).map((x) => x.data).filter((d) => canRead(u, 'eintraege', d) && !d.vorschlag);
  const lines = [];
  if (can(u, 'termine')) {
    let ter = E.filter((e) => e.kind === 'termin' && onDay(e, t0)).map((e) => ({ ...e, start: onDay(e, t0) }));
    if (seesExternal(u)) { const c = await getSetting(env, 'calext'); if (c) ter = ter.concat(c.events.filter((x) => x.start.slice(0, 10) === t0)); }
    ter.sort((a, b) => String(a.start).localeCompare(String(b.start)));
    if (ter.length) lines.push('Termine: ' + ter.map((e) => (String(e.start).length > 10 ? String(e.start).slice(11, 16) + ' ' : '') + e.titel).join(', '));
  }
  if (can(u, 'pinnwand')) {
    const m = E.filter((e) => e.kind === 'nachricht' && !e.done && !(e.readBy || []).includes(u.id));
    if (m.length) lines.push('Pinnwand: ' + m.slice(0, 2).map((e) => e.text || e.titel).join(' / ') + (m.length > 2 ? ' …' : ''));
  }
  if (can(u, 'aufgaben')) {
    const open = E.filter((e) => e.kind === 'aufgabe' && !e.done && mineFor(e, u.id));
    const due = open.filter((e) => e.faellig && e.faellig <= t0);
    if (due.length) lines.push('Fällig: ' + due.slice(0, 3).map((e) => e.titel).join(', ') + (open.length > due.length ? ` (+${open.length - due.length} offen)` : ''));
    else if (open.length) lines.push(open.length === 1 ? '1 offene Aufgabe' : open.length + ' offene Aufgaben');
    const S = (await allDocs(env, 'serien')).map((x) => x.data).filter((s) => canRead(u, 'serien', s) && s.next && addDaysIso(s.next, -(Number(s.vorlauf) || 0)) <= t0);
    if (S.length) lines.push('Steht an: ' + S.slice(0, 3).map((s) => s.titel).join(', '));
  }
  if (can(u, 'themen')) {
    const T = (await allDocs(env, 'themen')).map((x) => x.data).filter((t) => canRead(u, 'themen', t) && t.name && t.name !== 'Eingang' && !t.done && t.due && t.due <= t0);
    if (T.length) lines.push('Wiedervorlage: ' + T.slice(0, 3).map((t) => t.name).join(', '));
  }
  const extra = [];
  if (can(u, 'essen')) {
    const f = (await getDoc(env, 'essen', 'd-' + t0));
    if (f && !f.deleted && f.data && f.data.gericht) extra.push('Essen: ' + f.data.gericht);
  }
  if (can(u, 'einkauf')) {
    const n = E.filter((e) => e.kind === 'einkauf' && !e.done).length;
    if (n) extra.push(n + ' Dinge auf der Einkaufsliste');
  }
  if (extra.length) lines.push(extra.join(' · '));
  return lines.length ? lines.join('\n') : 'Heute steht nichts Besonderes an.';
}

async function applyOps(env, ctx, me, ops) {
  const calTouch = new Set(), calGone = [], events = [];
  for (const o of ops) {
    if (!COLLS.includes(o.coll) || !/^[\w-]{1,80}$/.test(String(o.id || ''))) return { error: 'Ungültiger Eintrag.' };
    const cur = await getDoc(env, o.coll, o.id);
    const old = cur && !cur.deleted ? cur.data : null;
    if (old && !canWrite(me, o.coll, null, old)) return { error: 'Dafür fehlt dir die Berechtigung.', status: 403 };
    if (o.op === 'delete') {
      if (old && old.by !== me.id && lvl(me, docArea(o.coll, old)) === 'mine') return { error: 'Dafür fehlt dir die Berechtigung.', status: 403 };
      if (!old) continue;
      await deleteDoc(env, o.coll, o.id);
      if (o.coll === 'eintraege' && old.kind === 'termin') calGone.push(old);
      continue;
    }
    if (!o.data || typeof o.data !== 'object' || JSON.stringify(o.data).length > 20000) return { error: 'Ungültige Daten.' };
    let data;
    if (o.op === 'set') data = { ...o.data };
    else if (o.op === 'update') { if (!old) return { error: 'Eintrag existiert nicht.', status: 404 }; data = { ...old, ...o.data }; }
    else return { error: 'Unbekannte Aktion.' };
    for (const k of ['kalender', 'calUid', 'calUrl', 'calSig', 'calErr']) { if (old && k in old) data[k] = old[k]; else if (!old) delete data[k]; }
    if (!old) data.by = me.id;
    else data.by = old.by || data.by;
    if (!['familie', 'erwachsene', 'privat'].includes(data.sicht || 'familie')) data.sicht = 'familie';
    if (o.coll === 'eintraege' && data.kind === 'termin' && !adult(me) && (!old || old.vorschlag || old.kind !== 'termin')) data.vorschlag = true;
    if (!canWrite(me, o.coll, data, old)) return { error: 'Dafür fehlt dir die Berechtigung.', status: 403 };
    await putDoc(env, o.coll, o.id, data);
    if (o.coll === 'eintraege') {
      if (data.kind === 'nachricht' && !old) events.push({ type: 'pin', data });
      if (data.kind === 'termin' && data.vorschlag && (!old || !old.vorschlag)) events.push({ type: 'vorschlag', data });
      if (data.kind === 'aufgabe' && !data.done && data.fuer && data.fuer !== 'wir' && data.fuer !== me.id && (!old || old.fuer !== data.fuer)) events.push({ type: 'zuweisung', data });
    }
    if (o.coll === 'eintraege' && (data.kind === 'termin' || (old && old.kind === 'termin'))) {
      if (data.kind === 'termin') calTouch.add(o.id); else if (old) calGone.push(old);
    }
  }
  if (events.length) ctx.waitUntil(onWrite(env, me, events).catch(() => {}));
  if (calTouch.size || calGone.length) {
    ctx.waitUntil((async () => {
      for (const g of calGone) await calDelete(env, g);
      for (const id of calTouch) { try { await calPut(env, id); } catch (e) { await calMark(env, id, e.message); } }
    })());
  }
return { ok: true };
}


/* ---------------- Erfassen (Text oder Sprache -> Einträge) ---------------- */
const WDN = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const isD = (x) => /^\d{4}-\d\d-\d\d$/.test(String(x || ''));
const isT = (x) => HHMM.test(String(x || ''));
const slugify = (x) => 't-' + String(x).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const relDe = (d, today) => (d === today ? 'heute' : d === addDaysIso(today, 1) ? 'morgen' : d.split('-').reverse().slice(0, 2).join('.') + '.');
function capturePrompt(me, users, themes, text) {
  const b = berlin();
  const wd = WDN[new Date(b.date + 'T12:00:00Z').getUTCDay()];
  return `Du sortierst Einträge einer Familie in einer gemeinsamen App. Heute ist ${wd}, ${b.date}, ${b.hh}:${b.mm} Uhr.
Familienmitglieder: ${users.map((u) => u.name).join(', ')}.
Eingabe von ${me.name}: """${text}"""

Bestehende Themen (Namen exakt übernehmen, wenn eines passt):
${themes.length ? themes.map((n) => '- ' + n).join('\n') : '(noch keine)'}

Zerlege die Eingabe in einzelne Einträge. art ist eines von:
- "termin": fester Zeitpunkt mit Datum (Arzt, Treffen, Feier).
- "aufgabe": etwas Konkretes, das jemand erledigen muss (TÜV machen, Rechnung zahlen, Handwerker anrufen).
- "gedanke": Idee oder Überlegung ohne konkreten Auftrag (Urlaubsidee, Garten umgestalten, Geschenkidee).
- "einkauf": etwas kaufen oder besorgen, je Artikel ein Eintrag.
- "serie": etwas Wiederkehrendes (jeden Dienstag 17:30 Training, jeden Dienstag Restmüll, Geburtstag am 3. Februar).
- "essen": Gericht für einen bestimmten Tag (Freitag gibt es Lasagne).
- "nachricht": kurze Info an die anderen, die sie lesen sollen (Paket liegt beim Nachbarn, bin heute später zu Hause).

Felder je Eintrag (nicht passende leer lassen):
- titel: kurz, höchstens 6 Wörter, auf Deutsch. Bei einkauf nur der Artikel ohne Menge.
- text: der Inhalt als ein klarer Satz.
- menge: nur bei einkauf, wenn eine Menge genannt ist (2 Liter, 500 g).
- zustaendig: bei aufgabe, termin und serie. Für wen es ist: der Vorname eines Familienmitglieds, "ich" für ${me.name} oder "wir". Ohne Hinweis "wir".
- faellig: bei aufgabe ein Datum YYYY-MM-DD, wenn eines genannt ist, sonst leer.
- zeit: bei aufgabe und serie eine Uhrzeit HH:MM, wenn genannt, sonst leer.
- thema: nur bei gedanke. Oberthema mit 1 bis 3 Wörtern. Passt ein bestehendes Thema, nimm genau dessen Namen. Sonst ein neues, allgemeines Thema wie "Garten", "Urlaub 2027", "Auto" oder "Geschenke".
- wiedervorlage: nur bei gedanke, YYYY-MM-DD. Standard in 7 Tagen. Anlass mit Datum: 14 Tage davor. Nur Monat oder Jahreszeit: der 1. Tag davon (Frühjahr 1. März, Sommer 1. Juni, Herbst 1. September, Winter 1. Dezember). Nie in der Vergangenheit.
- start: nur bei termin, YYYY-MM-DDTHH:MM, ohne Uhrzeit nur YYYY-MM-DD.
- ende: nur bei termin mit Uhrzeit, YYYY-MM-DDTHH:MM. Ohne Angabe start plus 1 Stunde.
- ganztags: true, wenn bei termin keine Uhrzeit genannt ist, sonst false.
- rhythmus: nur bei serie: "woechentlich", "zweiwoechentlich", "monatlich" oder "jaehrlich".
- naechstes: nur bei serie, das nächste Datum ab heute, YYYY-MM-DD.
- serienart: nur bei serie: "geburtstag", "muell", "frist", "termin" (Training, Kurs, Treffen mit fester Uhrzeit) oder "sonstiges".
- person: nur bei geburtstag, der Name der Person.
- datum: nur bei essen, YYYY-MM-DD.
- gericht: nur bei essen.
Ein Termin ohne Datum wird eine aufgabe mit dem titel "Termin vereinbaren: ...".

Antworte nur mit JSON in dieser Form:
{"eintraege":[{"art":"","titel":"","text":"","menge":"","zustaendig":"","faellig":"","zeit":"","thema":"","wiedervorlage":"","start":"","ende":"","ganztags":false,"rhythmus":"","naechstes":"","serienart":"","person":"","datum":"","gericht":""}]}`;
}
async function capture(env, ctx, me, text) {
  const users = (await activeUsers(env));
  const T = (await allDocs(env, 'themen')).filter((x) => canRead(me, 'themen', x.data) && x.data.name && x.data.name !== 'Eingang');
  const E = (await allDocs(env, 'eintraege')).filter((x) => canRead(me, 'eintraege', x.data));
  const r = await runAI(env, capturePrompt(me, users, T.map((x) => x.data.name), text));
  let items = r && Array.isArray(r.eintraege) && r.eintraege.length ? r.eintraege : null;
  const fallback = !items;
  if (fallback) { const parts = text.split(/\n|;|,|\.\s+/).map((x) => x.trim().replace(/\.$/, '')).filter(Boolean); items = (parts.length ? parts : [text]).map((x) => ({ art: 'eingang', titel: x.slice(0, 120), text: x })); }
  const today = berlin().date, at = new Date().toISOString();
  const fuerOf = (z) => {
    const x = String(z || '').trim().toLowerCase();
    if (!x || x === 'wir' || x === 'alle') return 'wir';
    if (x === 'ich') return me.id;
    const u = users.find((v) => v.name.toLowerCase() === x || v.name.toLowerCase().split(' ')[0] === x);
    if (u) return u.id;
    const others = users.filter((v) => v.id !== me.id && !v.profil);
    return x === 'du' && others.length === 1 ? others[0].id : 'wir';
  };
  const label = (id) => (id === 'wir' ? '' : id === me.id ? '' : ' für ' + ((users.find((u) => u.id === id) || {}).name || ''));
  const ok = (k) => ['edit', 'mine'].includes(lvl(me, KIND_AREA[k] || (k === 'serie' ? 'aufgaben' : k === 'essen' ? 'essen' : 'themen')));
  const lines = [], undo = [], skipped = [], ops = [], ask = [];
  const add = (coll, id, data) => { ops.push({ op: 'set', coll, id, data }); undo.push([coll, id]); };
  let nIn = 0;
  for (const it of items) {
    let art = ['termin', 'einkauf', 'gedanke', 'aufgabe', 'serie', 'essen', 'nachricht', 'eingang'].includes(it.art) ? it.art : 'gedanke';
    if (art === 'termin' && !/^\d{4}-\d\d-\d\d/.test(String(it.start || ''))) art = 'aufgabe';
    if (!ok(art)) { if (ok('eingang') && art !== 'eingang') art = 'eingang'; else { skipped.push(String(it.titel || text)); continue; } }
    const id = 'e-' + rid(8).toLowerCase().replace(/[^a-z0-9]/g, 'x');
    const base = { kind: art, titel: String(it.titel || '').slice(0, 120) || text.slice(0, 60), text: String(it.text || text).slice(0, 1000), at, raw: text.slice(0, 1000) };
    if (art === 'eingang') { add('eintraege', id, base); nIn++; continue; }
    base.sicht = art === 'gedanke' && adult(me) ? 'erwachsene' : 'familie';
    if (art === 'termin') {
      const st = String(it.start);
      Object.assign(base, { start: st.slice(0, 16), ende: String(it.ende || '').slice(0, 16), ganztags: !!it.ganztags || st.length <= 10, fuer: fuerOf(it.zustaendig) });
      if (!adult(me)) base.vorschlag = true;
      add('eintraege', id, base);
      lines.push({ text: (base.vorschlag ? 'Vorschlag: ' : 'Termin: ') + base.titel + ', ' + relDe(st.slice(0, 10), today) + (base.ganztags ? '' : ' ' + st.slice(11, 16)), open: 'e:' + id });
      continue;
    }
    if (art === 'serie') {
      const rh = WDH.includes(it.rhythmus) ? it.rhythmus : 'jaehrlich';
      let nx = isD(it.naechstes) ? it.naechstes : today;
      for (let i = 0; nx < today && i < 600; i++) nx = rh === 'woechentlich' ? addDaysIso(nx, 7) : rh === 'zweiwoechentlich' ? addDaysIso(nx, 14) : addMonthsIso(nx, rh === 'monatlich' ? 1 : 12);
      const sa = ['geburtstag', 'muell', 'frist', 'termin', 'sonstiges'].includes(it.serienart) ? it.serienart : 'sonstiges';
      const asTermin = (sa === 'termin' || (isT(it.zeit) && sa !== 'muell')) && ok('termin');
      if (asTermin) {
        const d = { kind: 'termin', titel: base.titel, text: base.text, at, raw: base.raw, sicht: 'familie', start: nx + (isT(it.zeit) ? 'T' + it.zeit : ''), ganztags: !isT(it.zeit), wdh: rh, fuer: fuerOf(it.zustaendig) };
        if (!adult(me)) d.vorschlag = true;
        add('eintraege', id, d);
        lines.push({ text: 'Serientermin: ' + d.titel + ', ' + ({ woechentlich: 'jede Woche', zweiwoechentlich: 'alle 2 Wochen', monatlich: 'jeden Monat', jaehrlich: 'jedes Jahr' }[rh]) + (isT(it.zeit) ? ' ' + it.zeit : ''), open: 'e:' + id });
        ask.push({ coll: 'eintraege', id, is: 'termin' });
      } else {
        const sd = { titel: base.titel, text: base.text, rhythmus: rh === 'zweiwoechentlich' ? 'woechentlich' : rh, next: nx, art: sa === 'termin' ? 'sonstiges' : sa, person: String(it.person || '').slice(0, 60), vorlauf: sa === 'geburtstag' ? 14 : sa === 'muell' ? 1 : sa === 'frist' ? 14 : 0, fuer: fuerOf(it.zustaendig), at, zeit: isT(it.zeit) ? it.zeit : '' };
        add('serien', id, sd);
        lines.push({ text: 'Wiederkehrende Aufgabe: ' + sd.titel + ', ' + ({ woechentlich: 'jede Woche', monatlich: 'jeden Monat', jaehrlich: 'jedes Jahr' }[sd.rhythmus]), open: 's:' + id });
        if (ok('termin') && sa !== 'geburtstag') ask.push({ coll: 'serien', id, is: 'aufgabe' });
      }
      continue;
    }
    if (art === 'essen') {
      const d = isD(it.datum) ? it.datum : today, g = String(it.gericht || base.titel).slice(0, 120), fid = 'd-' + d;
      const ex = await getDoc(env, 'essen', fid);
      if (ex && !ex.deleted) ops.push({ op: 'update', coll: 'essen', id: fid, data: { gericht: g } }); else add('essen', fid, { datum: d, gericht: g });
      lines.push({ text: 'Essen ' + relDe(d, today) + ': ' + g });
      continue;
    }
    if (art === 'nachricht') { Object.assign(base, { done: false, readBy: [me.id] }); add('eintraege', id, base); lines.push({ text: 'Pinnwand: ' + base.text, open: 'e:' + id }); continue; }
    if (art === 'aufgabe') {
      Object.assign(base, { fuer: fuerOf(it.zustaendig), faellig: isD(it.faellig) ? it.faellig : '', zeit: isD(it.faellig) && isT(it.zeit) ? it.zeit : '', done: false });
      add('eintraege', id, base);
      lines.push({ text: 'Aufgabe' + label(base.fuer) + ': ' + base.titel + (base.faellig ? ', ' + relDe(base.faellig, today) : ''), open: 'e:' + id });
      continue;
    }
    if (art === 'einkauf') {
      const ex = E.find((x) => x.data.kind === 'einkauf' && !x.data.done && String(x.data.titel).toLowerCase() === base.titel.toLowerCase());
      if (ex) { lines.push({ text: 'Steht schon auf der Liste: ' + ex.data.titel }); continue; }
      Object.assign(base, { done: false, menge: String(it.menge || '').slice(0, 40) });
      add('eintraege', id, base);
      lines.push({ text: 'Einkauf: ' + base.titel + (base.menge ? ' (' + base.menge + ')' : ''), open: 'e:' + id });
      continue;
    }
    // Idee
    let name = String(it.thema || 'Allgemein').trim().slice(0, 60) || 'Allgemein';
    const ex = T.find((x) => x.data.name.toLowerCase() === name.toLowerCase());
    if (ex) name = ex.data.name;
    let wv = isD(it.wiedervorlage) ? it.wiedervorlage : addDaysIso(today, 7);
    if (wv < today) wv = today;
    Object.assign(base, { kind: 'gedanke', thema: name });
    add('eintraege', id, base);
    if (ex) {
      const nd = ex.data.done ? wv : ex.data.due && ex.data.due < wv ? ex.data.due : wv;
      if (ex.data.done || nd !== ex.data.due) ops.push({ op: 'update', coll: 'themen', id: ex.id, data: { done: false, due: nd } });
      lines.push({ text: 'Idee zu „' + name + '“', open: 't:' + ex.id });
    } else {
      const tid = slugify(name) || 't-' + rid(6);
      if (!T.find((x) => x.id === tid)) { add('themen', tid, { name, due: wv, done: false, at, sicht: base.sicht }); T.push({ id: tid, data: { name } }); }
      lines.push({ text: 'Neue Idee „' + name + '“, meldet sich am ' + wv.split('-').reverse().join('.'), open: 't:' + tid });
    }
  }
  if (nIn) lines.push({ text: (fallback ? 'Nicht automatisch sortiert: ' : '') + nIn + (nIn === 1 ? ' Notiz liegt' : ' Notizen liegen') + ' im Eingang unter „Ideen“.' });
  if (skipped.length) lines.push({ text: 'Nicht gespeichert, dafür fehlt dir die Berechtigung: ' + skipped.join(', ') });
  const res = ops.length ? await applyOps(env, ctx, me, ops) : { ok: true };
  if (res.error) return { lines: [{ text: 'Nicht gespeichert: ' + res.error }], undo: [], ask: [] };
  return { lines, undo, ask };
}

/* ---------------- Routen ---------------- */
async function handleApi(req, env, ctx, url) {
  const p = url.pathname;
  const body = req.method === 'POST' || req.method === 'PUT' ? await req.json().catch(() => ({})) : {};
  const userCount = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;

  // --- ohne Anmeldung ---
  if (p === '/api/setup' && req.method === 'POST') {
    if ((await userCount()) > 0) return bad('Die App ist schon eingerichtet.', 403);
    if (!env.SETUP_CODE || body.code !== env.SETUP_CODE) return bad('Einrichtungs-Code stimmt nicht.', 403);
    const name = cleanName(body.name);
    if (!name || String(body.password || '').length < 8) return bad('Name und ein Passwort mit mindestens 8 Zeichen angeben.');
    const id = 'u_' + rid(9), salt = rid(16);
    await env.DB.prepare('INSERT INTO users(id,name,role,areas,salt,hash,active,created,color) VALUES(?,?,?,?,?,?,1,?,?)').bind(id, name, 'admin', JSON.stringify(PRESETS.admin), salt, await pwHash(body.password, salt), nowIso(), COLORS[0]).run();
    for (const d of SEED.docs || []) {
      const data = { ...d.data };
      for (const k of Object.keys(data)) if (data[k] === SEED.owner) data[k] = id;
      await putDoc(env, d.coll, d.id, data);
    }
    await setSetting(env, 'origin', url.origin);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(await newSession(env, id)) });
  }
  if (p === '/api/login' && req.method === 'POST') {
    const u = await env.DB.prepare('SELECT * FROM users WHERE name=? COLLATE NOCASE').bind(cleanName(body.name)).first();
    const fail = () => bad('Name oder Passwort stimmt nicht.', 401);
    if (!u || !u.active || !u.hash) return fail();
    if (u.lock_until > Date.now()) return bad('Zu viele Versuche. Bitte in 15 Minuten noch einmal.', 429);
    const ok = (await pwHash(String(body.password || ''), u.salt)) === u.hash;
    if (!ok) {
      const fails = u.fails + 1;
      await env.DB.prepare('UPDATE users SET fails=?,lock_until=? WHERE id=?').bind(fails >= 8 ? 0 : fails, fails >= 8 ? Date.now() + 15 * 60000 : 0, u.id).run();
      return fail();
    }
    await env.DB.prepare('UPDATE users SET fails=0,lock_until=0 WHERE id=?').bind(u.id).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(await newSession(env, u.id)) });
  }
  if (p === '/api/invite' && req.method === 'GET') {
    const u = await env.DB.prepare('SELECT name FROM users WHERE invite=? AND active=1').bind(await sha(url.searchParams.get('t') || '-')).first();
    return u ? json({ name: u.name }) : bad('Dieser Einladungslink ist nicht mehr gültig.', 404);
  }
  if (p === '/api/invite' && req.method === 'POST') {
    const u = await env.DB.prepare('SELECT * FROM users WHERE invite=? AND active=1').bind(await sha(String(body.t || '-'))).first();
    if (!u) return bad('Dieser Einladungslink ist nicht mehr gültig.', 404);
    if (String(body.password || '').length < 8) return bad('Das Passwort braucht mindestens 8 Zeichen.');
    const salt = rid(16);
    await env.DB.prepare('UPDATE users SET salt=?,hash=?,invite=NULL,fails=0,lock_until=0 WHERE id=?').bind(salt, await pwHash(body.password, salt), u.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run();
    return json({ ok: true, name: u.name }, 200, { 'set-cookie': sessionCookie(await newSession(env, u.id)) });
  }

  // --- angemeldet ---
  const me = await currentUser(req, env);
  if (!me) return json({ error: 'Bitte anmelden.', setup: (await userCount()) === 0 }, 401);
  const users = (await env.DB.prepare('SELECT * FROM users ORDER BY created').all()).results.map(pub);

  if (p === '/api/me') {
    const cal = await getSetting(env, 'cal');
    const warn = [];
    if (me.role === 'admin') {
      const st = await getSetting(env, 'calstatus');
      if (cal && st && !st.ok && st.fails >= 3) warn.push('iPhone-Kalender: Abgleich klappt seit ' + st.fails + ' Versuchen nicht (' + st.err + ').');
      if (cal && !(await getCred(env))) warn.push('iPhone-Kalender: Der iCloud-Zugang fehlt.');
    }
    const fam = (await getSetting(env, 'family')) || {};
    return json({ user: me, users: users.filter((u) => u.active).map((u, i) => ({ id: u.id, name: u.name, role: u.role, profil: u.profil, color: u.color || COLORS[i % COLORS.length] })), calendar: cal ? cal.name : null, ai: !!env.AI, family: fam.name || '', warnings: warn });
  }
  if (p === '/api/prefs' && req.method === 'POST') {
    if (/^#[0-9a-f]{6}$/i.test(String(body.color || ''))) await env.DB.prepare('UPDATE users SET color=? WHERE id=?').bind(body.color, me.id).run();
    const np = { ...me.prefs };
    for (const k of Object.keys(PREF_DEF)) if (HHMM.test(String(body[k] || ''))) np[k] = body[k];
    await env.DB.prepare('UPDATE users SET prefs=? WHERE id=?').bind(JSON.stringify(np), me.id).run();
    return json({ ok: true, prefs: np });
  }
  if (p === '/api/calendar/events') {
    if (!seesExternal(me)) return json({ events: [] });
    const c = await externalEvents(env, url.searchParams.get('force') === '1');
    return json({ events: c ? c.events : [], at: c ? c.at : 0, err: c && c.err ? c.err : '' });
  }
  if (p === '/api/notify') {
    await env.DB.prepare('UPDATE notes SET seen=1 WHERE user_id=? AND seen=0 AND created<=?').bind(me.id, Date.now() - 30 * 60000).run();
    const n = await env.DB.prepare('SELECT * FROM notes WHERE user_id=? AND seen=0 ORDER BY id LIMIT 1').bind(me.id).first();
    if (n) { await env.DB.prepare('UPDATE notes SET seen=1 WHERE id=?').bind(n.id).run(); return json({ title: n.title, body: n.body, tag: 'n' + n.id }); }
    return json({ title: 'Family App', body: await briefing(env, me), tag: 'family-daily' });
  }
  if (p === '/api/logout' && req.method === 'POST') {
    const t = cookieOf(req, 'fa_s');
    if (t) await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(await sha(t)).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('x', 0) });
  }
  if (p === '/api/password' && req.method === 'POST') {
    const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(me.id).first();
    if ((await pwHash(String(body.old || ''), u.salt)) !== u.hash) return bad('Das bisherige Passwort stimmt nicht.', 403);
    if (String(body.password || '').length < 8) return bad('Das neue Passwort braucht mindestens 8 Zeichen.');
    const salt = rid(16);
    await env.DB.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').bind(salt, await pwHash(body.password, salt), me.id).run();
    return json({ ok: true });
  }
  if (p === '/api/data') {
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    const { results } = await env.DB.prepare('SELECT coll,id,data,updated,deleted FROM docs WHERE updated>? ORDER BY updated LIMIT 2000').bind(since ? since - 3000 : 0).all();
    const docs = [];
    let max = since;
    for (const r of results) {
      max = Math.max(max, r.updated);
      const data = r.data ? JSON.parse(r.data) : null;
      if (!canRead(me, r.coll, data)) { if (since) docs.push({ coll: r.coll, id: r.id, deleted: 1 }); continue; }
      if (r.deleted) { if (since) docs.push({ coll: r.coll, id: r.id, deleted: 1 }); continue; }
      docs.push({ coll: r.coll, id: r.id, data, u: r.updated });
    }
    return json({ now: max, docs });
  }
  if (p === '/api/write' && req.method === 'POST') {
    const r = await applyOps(env, ctx, me, Array.isArray(body.ops) ? body.ops.slice(0, 50) : []);
    return r.error ? bad(r.error, r.status || 400) : json({ ok: true });
  }
  if (p === '/api/capture' && req.method === 'POST') {
    if (!canCapture(me)) return bad('Dafür fehlt dir die Berechtigung.', 403);
    const text = String(body.text || '').trim().slice(0, 2000);
    if (!text) return bad('Bitte etwas eingeben.');
    return json(await capture(env, ctx, me, text));
  }
  if (p === '/api/token' && req.method === 'POST') {
    const t = rid(24);
    await env.DB.prepare('DELETE FROM tokens WHERE user_id=?').bind(me.id).run();
    await env.DB.prepare('INSERT INTO tokens(hash,user_id,created) VALUES(?,?,?)').bind(await sha(t), me.id, nowIso()).run();
    return json({ link: url.origin + '/q/' + t });
  }
  if (p === '/api/token' && req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM tokens WHERE user_id=?').bind(me.id).run();
    return json({ ok: true });
  }
  if (p === '/api/token') {
    const r = await env.DB.prepare('SELECT created FROM tokens WHERE user_id=?').bind(me.id).first();
    return json({ exists: !!r, created: r ? r.created : '' });
  }
  if (p === '/api/ai' && req.method === 'POST') {
    if (!canCapture(me)) return bad('Dafür fehlt dir die Berechtigung.', 403);
    const prompt = String(body.prompt || '').slice(0, 14000);
    if (!prompt) return bad('Leere Anfrage.');
    return json({ json: await runAI(env, prompt) });
  }
  if (p === '/api/push/key') return json({ key: (await vapid(env)).pub });
  if (p === '/api/push/subscribe' && req.method === 'POST') {
    const ep = String(body.endpoint || '');
    if (!/^https:\/\//.test(ep)) return bad('Ungültiges Abo.');
    await env.DB.prepare('INSERT INTO push(endpoint,user_id,created) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id').bind(ep, me.id, nowIso()).run();
    if (!(await getSetting(env, 'origin'))) await setSetting(env, 'origin', url.origin);
    return json({ ok: true });
  }
  if (p === '/api/push/test' && req.method === 'POST') return json({ results: await notify(env, [me], 'Test · Family App', await briefing(env, me), true) });
  if (p === '/api/briefing') return json({ title: 'Family App', body: await briefing(env, me) });

  // --- nur Admin ---
  if (!p.startsWith('/api/admin/')) return bad('Nicht gefunden.', 404);
  if (me.role !== 'admin') return bad('Nur für Admins.', 403);
  if (p === '/api/admin/users' && req.method === 'GET') return json({ users });
  if (p === '/api/admin/users' && req.method === 'POST') {
    const name = cleanName(body.name);
    if (!name) return bad('Bitte einen Namen angeben.');
    if (users.some((u) => u.name.toLowerCase() === name.toLowerCase())) return bad('Diesen Namen gibt es schon.');
    const role = ROLES.includes(body.role) ? body.role : 'erwachsener';
    const id = 'u_' + rid(9), t = rid(24);
    const profil = !!body.profil && role !== 'admin';
    const used = new Set(users.map((u) => u.color));
    const color = /^#[0-9a-f]{6}$/i.test(String(body.color || '')) ? body.color : COLORS.find((c) => !used.has(c)) || COLORS[users.length % COLORS.length];
    await env.DB.prepare('INSERT INTO users(id,name,role,areas,invite,active,created,color,profil) VALUES(?,?,?,?,?,1,?,?,?)').bind(id, name, role, JSON.stringify(cleanPerms(role, body.perms)), profil ? null : await sha(t), nowIso(), color, profil ? 1 : 0).run();
    return json({ ok: true, id, link: profil ? '' : url.origin + '/?einladung=' + t });
  }
  const um = p.match(/^\/api\/admin\/users\/(u_[\w-]+)(\/invite)?$/);
  if (um) {
    const target = users.find((u) => u.id === um[1]);
    if (!target) return bad('Nutzer nicht gefunden.', 404);
    const admins = users.filter((u) => u.role === 'admin' && u.active);
    if (um[2] && req.method === 'POST') {
      const t = rid(24);
      await env.DB.prepare('UPDATE users SET invite=?,hash=NULL,salt=NULL,profil=0 WHERE id=?').bind(await sha(t), target.id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id).run();
      return json({ ok: true, link: url.origin + '/?einladung=' + t });
    }
    if (req.method === 'POST') {
      const role = ROLES.includes(body.role) ? body.role : target.role;
      const active = body.active === undefined ? target.active : !!body.active;
      if (target.role === 'admin' && (role !== 'admin' || !active) && admins.length <= 1) return bad('Mindestens ein Admin muss bleiben.');
      await env.DB.prepare('UPDATE users SET role=?,areas=?,active=? WHERE id=?').bind(role, JSON.stringify(cleanPerms(role, body.perms || (role === target.role ? target.perms : null))), active ? 1 : 0, target.id).run();
      if (/^#[0-9a-f]{6}$/i.test(String(body.color || ''))) await env.DB.prepare('UPDATE users SET color=? WHERE id=?').bind(body.color, target.id).run();
      if (typeof body.name === 'string' && cleanName(body.name)) await env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(cleanName(body.name), target.id).run();
      if (!active) await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id).run();
      return json({ ok: true });
    }
    if (req.method === 'DELETE') {
      if (target.id === me.id) return bad('Du kannst dich nicht selbst löschen.');
      await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id), env.DB.prepare('DELETE FROM push WHERE user_id=?').bind(target.id), env.DB.prepare('DELETE FROM users WHERE id=?').bind(target.id)]);
      return json({ ok: true });
    }
  }
  if (p === '/api/admin/calendars') {
    try { return json({ calendars: await listCalendars(env), current: await getSetting(env, 'cal') }); } catch (e) { return bad(e.message, 502); }
  }
  if (p === '/api/admin/calendar' && req.method === 'POST') {
    if (!body.url) { await env.DB.prepare('DELETE FROM settings WHERE k=?').bind('cal').run(); return json({ ok: true }); }
    if (!/^https:\/\/[\w.-]+\.icloud\.com(:443)?\//.test(String(body.url))) return bad('Ungültiger Kalender.');
    await setSetting(env, 'cal', { url: String(body.url), name: cleanName(body.name) || 'Kalender' });
    await env.DB.prepare('DELETE FROM settings WHERE k=?').bind('calext').run();
    ctx.waitUntil(syncPending(env));
    return json({ ok: true });
  }
  if (p === '/api/admin/calcred') {
    if (req.method === 'POST') {
      const user = String(body.user || '').trim().slice(0, 200), pass = String(body.pass || '').replace(/\s+/g, '').slice(0, 100);
      if (body.clear) { await setCred(env, '', ''); return json({ ok: true }); }
      if (!/^[^@\s]+@[^@\s]+$/.test(user) || pass.length < 8) return bad('Bitte Apple-ID (E-Mail) und das app-spezifische Passwort eingeben.');
      const prev = await getSetting(env, 'calcred');
      await setCred(env, user, pass);
      try { await listCalendars(env); } catch (e) {
        if (prev) await setSetting(env, 'calcred', prev); else await setCred(env, '', '');
        credCache.delete(env);
        return bad(e.message, 502);
      }
      await calStatus(env, '');
      return json({ ok: true });
    }
    const c = await getCred(env);
    return json({ configured: !!c, user: c ? c.user.replace(/^(.{2}).*(@.*)$/, '$1…$2') : '', fromEnv: !!(c && c.fromEnv) });
  }
  if (p === '/api/admin/family' && req.method === 'POST') {
    await setSetting(env, 'family', { name: cleanName(body.name) });
    return json({ ok: true });
  }
  if (p === '/api/admin/export') {
    return new Response(JSON.stringify(await exportAll(env), null, 1), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="family-app-sicherung-' + berlin().date + '.json"', 'cache-control': 'no-store' } });
  }
  if (p === '/api/admin/backups') {
    const { results } = await env.DB.prepare('SELECT id,created,length(data) AS size FROM backups ORDER BY id DESC').all();
    return json({ backups: results });
  }
  if (p === '/api/admin/restore' && req.method === 'POST') {
    let data = body.data;
    if (body.backup) { const r = await env.DB.prepare('SELECT data FROM backups WHERE id=?').bind(Number(body.backup)).first(); data = r ? JSON.parse(r.data) : null; }
    if (!data || data.app !== 'family-app' || !Array.isArray(data.docs)) return bad('Das ist keine gültige Sicherung.');
    await env.DB.prepare('INSERT INTO backups(created,data) VALUES(?,?)').bind(Date.now(), JSON.stringify(await exportAll(env))).run();
    const now = stamp();
    await env.DB.prepare('UPDATE docs SET deleted=1,updated=? WHERE deleted=0').bind(now).run();
    const ops = data.docs.filter((d) => COLLS.includes(d.coll) && d.id && d.data).map((d) => env.DB.prepare('INSERT INTO docs(coll,id,data,updated,deleted) VALUES(?,?,?,?,0) ON CONFLICT(coll,id) DO UPDATE SET data=excluded.data,updated=excluded.updated,deleted=0').bind(d.coll, String(d.id), JSON.stringify(d.data), stamp()));
    for (let i = 0; i < ops.length; i += 50) await env.DB.batch(ops.slice(i, i + 50));
    return json({ ok: true, restored: ops.length });
  }
  if (p === '/api/admin/calsync' && req.method === 'POST') {
    try { const r = await syncPending(env); const c = await refreshExternal(env); return json({ ...r, external: c ? c.events.length : 0 }); } catch (e) { return bad(e.message, 502); }
  }
  return bad('Nicht gefunden.', 404);
}

async function exportAll(env) {
  const { results } = await env.DB.prepare('SELECT coll,id,data FROM docs WHERE deleted=0').all();
  const us = (await env.DB.prepare('SELECT id,name,role,color,profil FROM users').all()).results;
  const fam = await getSetting(env, 'family');
  return { app: 'family-app', version: 1, created: new Date().toISOString(), family: fam ? fam.name : '', users: us, docs: results.map((r) => ({ coll: r.coll, id: r.id, data: JSON.parse(r.data) })) };
}
async function housekeeping(env) {
  const now = Date.now(), day = 86400000;
  // erledigte Aufgaben nach 60 Tagen, gelöschte Einträge nach 30 Tagen endgültig entfernen
  const E = await allDocs(env, 'eintraege');
  const old = E.filter((x) => (x.data.kind === 'aufgabe' && x.data.done && Date.parse(x.data.doneAt || 0) < now - 60 * day) || (x.data.kind === 'termin' && String(x.data.start || '9') < addDaysIso(berlin().date, -180)));
  // Einkauf: gekaufte Artikel als "Zuletzt gekauft" behalten (je Titel der neueste, höchstens 80)
  const bought = E.filter((x) => x.data.kind === 'einkauf' && x.data.done).sort((a, b) => String(b.data.doneAt || b.data.at || '').localeCompare(String(a.data.doneAt || a.data.at || '')));
  const seen = new Set(); let keep = 0;
  for (const x of bought) { const k = String(x.data.titel || '').toLowerCase(); if (seen.has(k) || keep >= 80) old.push(x); else { seen.add(k); keep++; } }
  for (const x of old) await deleteDoc(env, 'eintraege', x.id);
  await env.DB.prepare('DELETE FROM docs WHERE deleted=1 AND updated<?').bind(now - 30 * day).run();
  return old.length;
}
async function weeklyBackup(env) {
  await env.DB.prepare('INSERT INTO backups(created,data) VALUES(?,?)').bind(Date.now(), JSON.stringify(await exportAll(env))).run();
  await env.DB.prepare('DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT 6)').run();
}

async function tick(env, ms) {
  const b = berlin(new Date(ms));
  const to = b.date + 'T' + b.hh + ':' + b.mm;
  const prev = await getSetting(env, 'tick');
  const loc = (t) => { const x = berlin(new Date(t)); return x.date + 'T' + x.hh + ':' + x.mm; };
  if (prev && prev >= to) return { skipped: true };
  const floor = loc(ms - 30 * 60000);
  const from = prev && prev >= floor ? prev : loc(ms - 5 * 60000);
  await setSetting(env, 'tick', to);
  const out = { from, to, morning: 0, reminders: 0 };
  try { out.morning = await morning(env, from, to); } catch (e) { out.err = e.message; }
  try { out.reminders = await reminders(env, from, to); } catch (e) { out.err = e.message; }
  if (Number(b.mm) % 15 < 5) {
    try { await syncPending(env); } catch (e) { /* später erneut */ }
    try { await refreshExternal(env); } catch (e) { /* später erneut */ }
    await env.DB.prepare('DELETE FROM sent WHERE at<?').bind(Date.now() - 40 * 86400000).run();
    await env.DB.prepare('DELETE FROM notes WHERE created<?').bind(Date.now() - 3 * 86400000).run();
  }
  if (b.hh === '03' && Number(b.mm) < 5) {
    try { out.archived = await housekeeping(env); } catch (e) { out.err = e.message; }
    if (b.weekday === 'Sun') { try { await weeklyBackup(env); } catch (e) { out.err = e.message; } }
  }
  return out;
}
export const _test = { tick, parseEvents, inQuiet, normPrefs, housekeeping, weeklyBackup, getCred, onDay, buildIcs };

async function quick(req, env, ctx, url) {
  const txt = (m, st = 200) => new Response(m, { status: st, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  const key = url.pathname.slice(3);
  if (!/^[\w-]{20,64}$/.test(key)) return txt('Der Link ist ungültig.', 404);
  const t = await env.DB.prepare('SELECT user_id FROM tokens WHERE hash=?').bind(await sha(key)).first();
  const u = t && (await env.DB.prepare('SELECT * FROM users WHERE id=? AND active=1').bind(t.user_id).first());
  if (!u) return txt('Der Link ist nicht mehr gültig. Hol dir in der Family App einen neuen.', 403);
  const me = pub(u);
  if (req.method === 'GET') return txt('Family App: Hallo ' + me.name + ', dein Link funktioniert.');
  if (req.method !== 'POST') return txt('Nur POST.', 405);
  const ct = req.headers.get('content-type') || '';
  let text = '';
  if (ct.includes('json')) { const b = await req.json().catch(() => ({})); text = b.text || b.Text || b.diktat || ''; } else text = await req.text();
  text = String(text || '').trim().slice(0, 2000);
  if (!text) return txt('Ich habe nichts verstanden. Bitte noch einmal.');
  if (!canCapture(me)) return txt('Dafür fehlt dir die Berechtigung.', 403);
  const r = await capture(env, ctx, me, text);
  return txt(r.lines.map((l) => l.text).join('\n') || 'Gemerkt.');
}

const MANIFEST = JSON.stringify({
  name: 'Family App', short_name: 'Family', start_url: '/', scope: '/', display: 'standalone', background_color: '#eef3f8', theme_color: '#2f5d84', lang: 'de',
  icons: [{ src: '/icon-180.png', sizes: '180x180', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
});
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY' };
const png = (b64) => new Response(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) {
        await init(env);
        if (req.method !== 'GET' && req.headers.get('origin') && req.headers.get('origin') !== url.origin) return bad('Ungültige Herkunft.', 403);
        return await handleApi(req, env, ctx, url);
      }
      if (url.pathname.startsWith('/q/')) { await init(env); return await quick(req, env, ctx, url); }
      if (url.pathname === '/sw.js') return new Response(SW_JS, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' } });
      if (url.pathname === '/manifest.webmanifest') return new Response(MANIFEST, { headers: { 'content-type': 'application/manifest+json' } });
      if (url.pathname === '/icon-180.png' || url.pathname === '/apple-touch-icon.png') return png(ICON_180);
      if (url.pathname === '/icon-512.png') return png(ICON_512);
      if (url.pathname === '/' || url.pathname === '/index.html') return new Response(APP_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', ...SEC } });
      return new Response('Nicht gefunden', { status: 404 });
    } catch (e) {
      return bad('Serverfehler: ' + (e && e.message ? e.message : e), 500);
    }
  },
  async scheduled(event, env, ctx) {
    await init(env);
    ctx.waitUntil(tick(env, event.scheduledTime || Date.now()));
  },
};
