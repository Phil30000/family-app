// Family App – Cloudflare Worker (D1 + Workers AI + iCloud CalDAV + Web Push)
// Bindings: DB (D1), AI (Workers AI). Secret: SETUP_CODE (auch Schlüssel für den in der App hinterlegten iCloud-Zugang).
// Optional (alt): ICLOUD_USER, ICLOUD_PASS. Jede Familie läuft als eigene Kopie (eigener Worker + eigene D1).
// Cron: "*/5 * * * *" – Morgen-Mitteilung (Zeit je Nutzer), Erinnerungen vor Terminen, iCloud-Abgleich.

const APP_HTML = "<!DOCTYPE html>\n<html lang=\"de\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#2f5d84\">\n<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n<meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\">\n<meta name=\"apple-mobile-web-app-title\" content=\"Family App\">\n<link rel=\"manifest\" href=\"/manifest.webmanifest\">\n<link rel=\"apple-touch-icon\" href=\"/icon-180.png\">\n<link rel=\"icon\" href=\"/icon-180.png\">\n<title>Family App</title>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link href=\"https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;700;800&display=swap\" rel=\"stylesheet\">\n<style>\n/* VOICE everyday, calm and quick\n   IDEA the family's day on one screen: what's pinned, what's on, what's due\n   COLOUR steel blue #2f5d84 band, ink #142636, white cards, coral #e4572e for what is due\n   TYPE Figtree 800 display + Figtree text\n   LAYOUT compact blue band with three counters, one column of cards, four tabs at the bottom, a round mic button */\n:root{color-scheme:light dark;--bg:light-dark(#eef3f8,#0e1620);--ink:light-dark(#142636,#e8eff6);--soft:light-dark(#5b6d7e,#9fb2c4);--card:light-dark(#ffffff,#172331);--line:light-dark(#dfe7ef,#2a3a4c);--blue:light-dark(#2f5d84,#8db8dc);--tint:light-dark(#e8f0f7,#1d2c3d);--pin:light-dark(#fff4dc,#3a2f17);--pinInk:light-dark(#6b4a08,#f3d79a);--due:#e4572e;--ok:#2f8f5b;--bar:calc(62px + env(safe-area-inset-bottom,0px))}\n*{box-sizing:border-box;min-width:0;-webkit-tap-highlight-color:transparent}\n[hidden]{display:none!important}\nhtml,body{margin:0}\nbody{background:var(--bg);color:var(--ink);font:16px/1.45 Figtree,system-ui,-apple-system,sans-serif;overflow-x:clip}\nbutton{font:inherit;color:inherit}\n.top{background:#2f5d84;color:#fff;padding:calc(12px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) 14px max(16px,env(safe-area-inset-left,0px))}\n.wrap{max-width:640px;margin:0 auto}\n.hrow{display:flex;align-items:center;gap:10px}\n.hrow h1{flex:1;margin:0;font-size:22px;line-height:1.15;font-weight:800;letter-spacing:-.01em}\n.hdate{font-size:13px;opacity:.85}\n.gear{width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:20px;cursor:pointer;display:grid;place-items:center}\n.counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}\n.count{background:rgba(255,255,255,.14);border:0;border-radius:12px;padding:8px 10px;text-align:left;color:#fff;cursor:pointer}\n.count b{display:block;font-size:22px;line-height:1.1;font-weight:800}\n.count span{font-size:12px;opacity:.9}\n.count.hot b{color:#ffd2c4}\nmain{max-width:640px;margin:0 auto;padding:12px 14px calc(var(--bar) + 88px)}\n.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px 14px;margin:0 0 12px}\n.card>h2{display:flex;align-items:center;gap:8px;margin:10px 0 2px;font-size:14px;font-weight:700;color:var(--soft);text-transform:none}\n.card>h2 .more{margin-left:auto}\n.pin{background:var(--pin);color:var(--pinInk);border-radius:14px;padding:10px 12px 10px 14px;margin:0 0 10px;display:flex;gap:10px;align-items:flex-start}\n.pin p{margin:0;flex:1;font-size:16px}\n.pin small{display:block;font-size:12px;font-weight:700;opacity:.8;margin-bottom:2px}\n.x{border:0;background:transparent;font-size:20px;line-height:1;padding:4px 6px;cursor:pointer;color:inherit;opacity:.7}\n.ev{display:grid;grid-template-columns:3.4em minmax(0,1fr);gap:10px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer;background:none;border-left:0;border-right:0;border-top:0;width:100%;text-align:left}\n.ev:last-child{border-bottom:0}\n.ev .tm{font-weight:700;color:var(--blue);font-size:15px}\n.ev .tt{font-size:16px}\n.ev .sm{display:block;font-size:13.5px;color:var(--soft)}\n.ev.ext .tm{color:var(--soft)}\n.ev.prop .tt{font-style:italic}\n.task{display:flex;gap:12px;align-items:center;min-height:54px;border-bottom:1px solid var(--line)}\n.task:last-child{border-bottom:0}\n.task input{width:24px;height:24px;accent-color:var(--ok);flex:none;margin:0}\n.task .tb{flex:1;border:0;background:none;text-align:left;padding:8px 0;cursor:pointer}\n.task .tt{display:block;font-size:16px}\n.task .sm{display:block;font-size:13.5px;color:var(--soft)}\n.task.done .tt{text-decoration:line-through;color:var(--soft)}\n.late{color:var(--due)!important;font-weight:700}\n.empty{padding:8px 0 10px;margin:0;color:var(--soft);font-size:15px}\n.link{background:none;border:0;padding:10px 0;min-height:44px;color:var(--blue);font-weight:700;font-size:14px;cursor:pointer}\n.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}\n.btn{min-height:44px;padding:0 16px;border-radius:999px;border:1.5px solid currentColor;background:transparent;font-weight:700;font-size:15px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}\n.btn{color:inherit}a.btn{color:var(--ink)}\n.btn.main{background:#2f5d84;color:#fff;border-color:#2f5d84}\n.btn.sm{min-height:40px;padding:0 14px;font-size:14.5px;border-width:1px}\n.btn.warn{color:var(--due)}\n.btn[aria-pressed=true]{background:var(--blue);border-color:var(--blue);color:var(--card)}\n.btn[disabled]{opacity:.5}\n.btn:focus-visible,.tab:focus-visible,textarea:focus-visible,input:focus-visible,select:focus-visible,.fab:focus-visible{outline:3px solid var(--due);outline-offset:2px}\n.day{margin:14px 0 4px;font-size:13px;font-weight:700;color:var(--soft)}\n.day.today{color:var(--blue)}\ndetails>summary{list-style:none;cursor:pointer;color:var(--soft);font-size:14px;font-weight:700;padding:10px 0}\ndetails>summary::-webkit-details-marker{display:none}\ndetails>summary:before{content:'\u203a';display:inline-block;margin-right:6px;transition:transform .15s}\ndetails[open]>summary:before{transform:rotate(90deg)}\n.bar{position:fixed;left:0;right:0;bottom:0;height:var(--bar);padding-bottom:env(safe-area-inset-bottom,0px);background:var(--card);border-top:1px solid var(--line);display:flex;z-index:4}\n.tab{flex:1;border:0;background:none;color:var(--soft);font-size:12px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}\n.tab svg{width:24px;height:24px}\n.tab[aria-selected=true]{color:var(--blue)}\n.tab i{font-style:normal;position:relative}\n.tab i b{position:absolute;top:-4px;right:-12px;min-width:18px;padding:0 5px;border-radius:9px;background:var(--due);color:#fff;font-size:11px;line-height:18px}\n.fab{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;position:fixed;right:max(18px,calc(50% - 302px));bottom:calc(var(--bar) + 16px);width:62px;height:62px;border-radius:50%;border:0;background:#2f5d84;color:#fff;box-shadow:0 10px 24px -8px rgba(10,35,60,.6);cursor:pointer;display:grid;place-items:center;z-index:4}\n.fab svg{width:28px;height:28px}\n.shade{position:fixed;inset:0;background:rgba(8,20,32,.45);z-index:6;display:flex;align-items:flex-end;justify-content:center}\n.sheet{background:var(--card);width:100%;max-width:640px;border-radius:18px 18px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom,0px));max-height:88vh;overflow:auto}\n.sheet h2{margin:0 0 10px;font-size:18px;display:flex;align-items:center}\n.sheet h2 .x{margin-left:auto}\n.sheet textarea{width:100%;min-height:84px;border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--bg);color:var(--ink);font:500 18px/1.4 Figtree,system-ui,sans-serif;resize:none;outline:none}\n.f{display:grid;gap:4px;margin:0 0 10px;font-size:13px;font-weight:700;color:var(--soft)}\n.f input,.f select,.field{min-height:44px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--ink);font:16px Figtree,system-ui,sans-serif;padding:0 12px;width:100%}\n.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}\n.mic{width:44px;height:44px;border-radius:50%;border:1.5px solid #2f5d84;background:transparent;color:#2f5d84;display:grid;place-items:center;cursor:pointer}\n.mic.on{background:var(--due);border-color:var(--due);color:#fff}\n.mic svg{width:22px;height:22px}\n.hint{font-size:13px;color:var(--soft);flex:1 1 140px}\n.add{display:flex;gap:8px;margin:4px 0 6px}\n.add input{flex:1}\n.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin:6px 0 10px}\n.tile{border:0;border-radius:12px;background:#2f5d84;color:#fff;min-height:72px;padding:8px;font-weight:700;font-size:14px;line-height:1.2;cursor:pointer;overflow-wrap:anywhere;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}\n.tile small{display:block;font-weight:400;font-size:11px;opacity:.85;margin-top:3px}\n.tile.gone{opacity:.2;transform:scale(.92);transition:all .25s}\n.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}\n.chip{border:1px solid var(--line);background:var(--tint);border-radius:999px;padding:6px 12px;font-size:14px;cursor:pointer}\n.topic{border-bottom:1px solid var(--line);padding:4px 0}\n.topic:last-child{border-bottom:0}\n.topic>summary{color:var(--ink);font-size:16px;font-weight:700;display:flex;gap:6px;align-items:baseline}\n.topic>summary:before{color:var(--soft)}\n.topic>summary span{margin-left:auto;font-size:12px;font-weight:400;color:var(--soft);white-space:nowrap}\n.lines{margin:0 0 8px;padding:0 0 0 16px;font-size:15px}\n.lines{list-style:none;padding-left:0}\n.lines li{padding:4px 0;display:flex;gap:8px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line,rgba(0,0,0,.06))}\n.lines li:last-child{border-bottom:0}\n.lines .ltxt{flex:1;color:inherit;font-size:15px}\n.lines .ltxt span{color:var(--soft);font-size:12px}\n.lines .ldel{flex:0 0 auto;min-height:36px;padding:0 12px;color:#b3261e}\n.lines span{color:var(--soft);font-size:12px}\n.search{width:100%;min-height:44px;margin:4px 0 8px;padding:0 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font:16px Figtree,system-ui,sans-serif}\n.meta{font-size:13.5px;color:var(--soft)}\n.toast{position:fixed;left:50%;bottom:calc(var(--bar) + 12px);transform:translateX(-50%);width:min(560px,calc(100% - 28px));background:#16324a;color:#eef5fb;border-radius:14px;padding:10px 12px 10px 14px;box-shadow:0 12px 30px -12px rgba(0,0,0,.5);z-index:7;display:flex;gap:8px;align-items:center}\n.toast ul{margin:0;padding:0;list-style:none;flex:1;font-size:14.5px}\n.toast li{padding:2px 0}\n.tl{background:none;border:0;color:#fff;font:inherit;text-align:left;padding:4px 0;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(255,255,255,.4)}\n.toast .btn{color:#bcd8f0;min-height:34px}\n.banner{background:var(--due);color:#fff;padding:8px 16px;font-size:14px;text-align:center}\n.inbox{padding:10px 0;border-bottom:1px solid var(--line)}\n.inbox:last-child{border-bottom:0}\n.inbox p{margin:0 0 6px}\n.auth{max-width:420px;margin:0 auto;padding:24px 16px 60px}\n.auth form{display:grid;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}\n.auth label{display:grid;gap:4px;font-size:14px;font-weight:600}\n.err{color:var(--due);font-size:14px;margin:0;min-height:1em}\n.user{padding:10px 0;border-bottom:1px solid var(--line)}\n.user:last-child{border-bottom:0}\n.areas{display:grid;grid-template-columns:repeat(auto-fit,minmax(9em,1fr));gap:8px 10px;margin:8px 0}\n.areas label{display:grid;gap:2px;font-size:12px;color:var(--soft)}\n.areas select,.user select{min-height:38px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink);font:15px Figtree,system-ui,sans-serif;padding:0 8px}\n.back{display:inline-flex;gap:4px;align-items:center;margin:0 0 8px}\ni.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:1px;font-style:normal}\n.new{position:relative}\n.new:after{content:'neu';position:absolute;right:0;top:8px;background:var(--due);color:#fff;font-size:11px;font-weight:800;border-radius:999px;padding:1px 7px}\n.ev.new:after{top:10px}\n.warn-card{background:#fde8e1;color:#7a2a12;border-radius:14px;padding:10px 14px;margin:0 0 10px;font-size:15px}\n@media(prefers-color-scheme:dark){.warn-card{background:#3a1d14;color:#ffd2c4}}\n.swatches{display:flex;gap:10px;flex-wrap:wrap;margin:4px 0 10px}\n.sw{width:36px;height:36px;border-radius:50%;border:3px solid transparent;cursor:pointer}\n.sw[aria-pressed=true]{border-color:var(--ink)}\n\n.seg{display:flex;gap:4px;background:var(--tint);border-radius:999px;padding:4px;margin:0 0 10px}\n.seg button{flex:1;border:0;background:none;border-radius:999px;min-height:38px;font-weight:700;font-size:14.5px;color:var(--soft);cursor:pointer}\n.seg button[aria-pressed=true]{background:var(--card);color:var(--blue);box-shadow:0 1px 3px rgba(0,0,0,.12)}\n.calnav{display:flex;align-items:center;gap:6px;margin:0 0 8px}\n.calnav b{flex:1;text-align:center;font-size:15px}\n.calnav .btn{min-width:44px;padding:0 10px}\n.week{display:grid;gap:10px}\n.wday{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:6px 12px}\n.wday.today{border-color:var(--blue);border-width:2px}\n.wday h3{margin:4px 0;font-size:14px;color:var(--soft);display:flex;justify-content:space-between}\n.wday .ev{padding:6px 0}\n.wday .mini{font-size:13.5px;color:var(--soft);padding:2px 0 6px}\n.wall{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}\n.pcol{background:var(--card);border:1px solid var(--line);border-top:6px solid var(--c,#2f5d84);border-radius:14px;padding:6px 14px 10px}\n.pcol h2{margin:6px 0 2px;font-size:20px;font-weight:800}\n.pcol .prog{font-size:13.5px;color:var(--soft);margin:0 0 6px}\n.bar2{height:8px;background:var(--tint);border-radius:4px;overflow:hidden;margin:4px 0 8px}\n.bar2 i{display:block;height:100%;background:var(--c,#2f5d84)}\n.steps{list-style:none;padding:0;margin:0}\n.steps li{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}\n.steps li:last-child{border-bottom:0}\n.steps .n{flex:none;width:30px;height:30px;border-radius:50%;background:var(--tint);color:var(--blue);font-weight:800;display:grid;place-items:center}\n.steps .ok .n{background:var(--ok);color:#fff}\n.info{padding:8px 0;border-bottom:1px solid var(--line)}\n.info:last-child{border-bottom:0}\n.info p{margin:2px 0 0;white-space:pre-wrap}\n.cmt{font-size:14.5px;padding:6px 0;border-bottom:1px solid var(--line)}\n.cmt small{display:block;color:var(--soft);font-size:12.5px}\ntextarea.field{min-height:96px;padding:10px 12px;resize:vertical}\n\n.recipe{display:flex;gap:10px;align-items:center;background:var(--tint);border-radius:12px;padding:10px 12px;margin:8px 0 2px;color:var(--ink);text-decoration:none}\n.recipe svg{flex:none;color:var(--blue)}\n.recipe b{display:block;font-size:15px;line-height:1.25}\n.recipe small{display:block;color:var(--soft);font-size:13px}\n.recipe .go{margin-left:auto;color:var(--blue);font-weight:700;font-size:14px;white-space:nowrap}\n.meal{padding:10px 0;border-bottom:1px solid var(--line)}\n.meal:last-child{border-bottom:0}\n@media(min-width:900px){main,.wrap{max-width:1120px}.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}.week.wide{grid-template-columns:repeat(7,minmax(0,1fr))}.week.wide .ev{display:block}.week.wide .ev .tm{display:block}}\n@media(prefers-reduced-motion:reduce){*{transition:none!important}}\n.fab.rec{background:#c0392b;transform:scale(1.12);box-shadow:0 0 0 10px rgba(192,57,43,.18),0 10px 24px -8px rgba(10,35,60,.6);transition:transform .15s}\n.holdbub{position:fixed;right:max(18px,calc(50% - 302px));bottom:calc(var(--bar) + 92px);max-width:min(78vw,420px);background:#fff;color:#1d2b38;border-radius:16px;padding:12px 14px;box-shadow:0 12px 30px -10px rgba(10,35,60,.45);font-size:15px;line-height:1.35;z-index:6;pointer-events:none}\n</style>\n</head>\n<body>\n<div id=\"banner\" class=\"banner\" hidden></div>\n<header class=\"top\" id=\"top\" hidden><div class=\"wrap\">\n<div class=\"hrow\"><div style=\"flex:1\"><div class=\"hdate\" id=\"hdate\"></div><h1 id=\"hello\">Family App</h1></div><button class=\"gear\" id=\"find\" aria-label=\"Suchen\" style=\"margin-right:6px\"><svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" aria-hidden=\"true\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M20 20l-3.5-3.5\"/></svg></button><button class=\"gear\" id=\"gear\" aria-label=\"Einstellungen\"><svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\"/></svg></button></div>\n<div class=\"counts\" id=\"counts\"></div>\n</div></header>\n<section class=\"auth\" id=\"auth\" hidden></section>\n<main id=\"p\" hidden></main>\n<button class=\"fab\" id=\"fab\" aria-label=\"Neuer Eintrag: sprechen oder schreiben\" hidden><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" aria-hidden=\"true\"><rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v3\"/></svg></button>\n<nav class=\"bar\" id=\"bar\" role=\"tablist\" hidden></nav>\n<div id=\"sheetRoot\"></div>\n<div id=\"toastRoot\" role=\"status\" aria-live=\"polite\"></div>\n<script>\n{\nconst $=s=>document.querySelector(s);\nconst esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nconst pad=n=>String(n).padStart(2,'0');\nconst iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());\nconst today=()=>iso(new Date());\nconst isDate=s=>/^\\d{4}-\\d\\d-\\d\\d$/.test(String(s||''));\nconst isTime=s=>/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(s||''));\nconst addDays=(s,n)=>{const d=new Date((s||today())+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)};\nconst addMonths=(s,n)=>{const d=new Date((s||today())+'T12:00:00');const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return iso(d)};\nconst fmtDay=s=>{if(!s)return'';const d=new Date(s.slice(0,10)+'T12:00:00');return isNaN(d)?s:d.toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'short'})};\nconst fmtLong=s=>new Date(s+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});\nconst relDay=s=>{const d=String(s||'').slice(0,10),t=today();return d===t?'Heute':d===addDays(t,1)?'Morgen':d===addDays(t,-1)?'Gestern':fmtDay(d)};\nconst hm=s=>s&&s.length>10?s.slice(11,16):'';\nconst slug=s=>'t-'+String(s).toLowerCase().replace(/\u00e4/g,'ae').replace(/\u00f6/g,'oe').replace(/\u00fc/g,'ue').replace(/\u00df/g,'ss').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);\nconst uid=()=>'e-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);\nconst WD=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];\nconst RH={woechentlich:'jede Woche',monatlich:'jeden Monat',jaehrlich:'jedes Jahr'};\nconst AREAS=[['termine','Termine'],['aufgaben','Aufgaben'],['einkauf','Einkauf'],['essen','Essen'],['themen','Ideen'],['pinnwand','Pinnwand']];\nconst ROLES=[['admin','Admin'],['erwachsener','Erwachsener'],['kind','Kind'],['gast','Gast'],['tablet','Familien-Tablet']];\nconst COLORS=['#2f6db0','#c8613a','#7d5ab8','#1f8a80','#b4457f','#a07a12','#55697d','#8a5a3a'];\nconst LEVELS=[['off','Aus'],['mine','Nur meins'],['view','Alles sehen'],['edit','Alles bearbeiten']];\nconst PRESETS={admin:{termine:'edit',aufgaben:'edit',einkauf:'edit',essen:'edit',themen:'edit',pinnwand:'edit'},erwachsener:{termine:'edit',aufgaben:'edit',einkauf:'edit',essen:'edit',themen:'edit',pinnwand:'edit'},kind:{termine:'mine',aufgaben:'mine',einkauf:'edit',essen:'view',themen:'off',pinnwand:'edit'},gast:{termine:'view',aufgaben:'off',einkauf:'off',essen:'view',themen:'off',pinnwand:'view'},tablet:{termine:'view',aufgaben:'edit',einkauf:'edit',essen:'view',themen:'off',pinnwand:'edit'}};\nconst SICHT=[['familie','Familie'],['erwachsene','Nur Erwachsene'],['privat','Nur ich']];\nconst KIND_AREA={termin:'termine',aufgabe:'aufgaben',einkauf:'einkauf',gedanke:'themen',eingang:'themen',nachricht:'pinnwand',serie:'aufgaben',essen:'essen'};\nconst wide=()=>window.matchMedia('(min-width:900px)').matches;\nconst REMIND=[['aus','Keine Erinnerung'],['15','15 Minuten vorher'],['30','30 Minuten vorher'],['60','1 Stunde vorher'],['120','2 Stunden vorher'],['1440','1 Tag vorher']];\nconst KATS=[\n ['Drogerie',['shampoo','duschgel','zahnpasta','zahnb\u00fcrste','zahnbuerste','deo','seife','creme','windel','toilettenpapier','klopapier','taschent\u00fc','tampon','binden','rasier','sp\u00fclung','pflaster']],\n ['Haushalt',['sp\u00fclmittel','spuelmittel','waschmittel','m\u00fcllbeutel','muellbeutel','schwamm','putz','reiniger','alufolie','frischhalte','backpapier','batterie','gl\u00fchbirne','k\u00fcchenrolle','kuechenrolle','sp\u00fcltabs','spueltabs','kerzen','servietten']],\n ['Getr\u00e4nke',['wasser','saft','cola','bier','wein','sprudel','limo','schorle','sekt','kakao']],\n ['Tiefk\u00fchl',['tk ','tk-','tiefk\u00fchl','tiefkuehl','pizza','eis','pommes','fischst\u00e4bchen']],\n ['Vorrat',['nudeln','spaghetti','pasta','reis','mehl','zucker','\u00f6l','oel','essig','salz','pfeffer','gew\u00fcrz','dose','passiert','tomatenmark','m\u00fcsli','muesli','haferflocken','honig','marmelade','nutella','kaffee','tee','lasagne','br\u00fche','bruehe','linsen','bohnen','mais','senf','ketchup','mayo','backpulver','hefe']],\n ['S\u00fc\u00dfes & Snacks',['schoko','chips','kekse','gummib\u00e4r','gummibaer','s\u00fc\u00df','n\u00fcsse','nuesse','popcorn','riegel','bonbon']],\n ['Fleisch & Fisch',['fleisch','hack','h\u00e4hnchen','haehnchen','huhn','h\u00fchnchen','rind','schwein','lachs','fisch','steak','w\u00fcrstchen','wuerstchen','garnelen','schnitzel','bratwurst','speck']],\n ['K\u00fchlregal',['milch','joghurt','jogurt','k\u00e4se','kaese','butter','sahne','quark','eier','ei ','wurst','schinken','aufschnitt','frischk\u00e4se','schmand','mozzarella','feta','creme fraiche','margarine','tofu']],\n ['Brot & Backwaren',['brot','br\u00f6tchen','broetchen','toast','croissant','brezel','kuchen','baguette','wraps']],\n ['Obst & Gem\u00fcse',['apfel','\u00e4pfel','aepfel','banane','tomate','gurke','salat','kartoffel','zwiebel','knoblauch','paprika','m\u00f6hre','moehre','karotte','zitrone','limette','beeren','obst','gem\u00fcse','gemuese','avocado','pilz','champignon','zucchini','brokkoli','birne','traube','orange','mandarine','kr\u00e4uter','kraeuter','petersilie','basilikum','lauch','spinat','ingwer','kiwi','mango','melone']]\n];\nconst KAT_ORDER=['Obst & Gem\u00fcse','Brot & Backwaren','K\u00fchlregal','Fleisch & Fisch','Tiefk\u00fchl','Vorrat','Getr\u00e4nke','S\u00fc\u00dfes & Snacks','Drogerie','Haushalt','Sonstiges'];\nconst QU={g:['g',1],gr:['g',1],gramm:['g',1],kg:['g',1000],kilo:['g',1000],ml:['ml',1],l:['ml',1000],liter:['ml',1000],stk:['Stk',1],'st\u00fcck':['Stk',1],st:['Stk',1],x:['Stk',1],el:['EL',1],tl:['TL',1],pck:['Pck',1],packung:['Pck',1],packungen:['Pck',1],dose:['Dose',1],dosen:['Dose',1],bund:['Bund',1],becher:['Becher',1],flasche:['Flasche',1],flaschen:['Flasche',1],glas:['Glas',1],'gl\u00e4ser':['Glas',1],zehe:['Zehe',1],zehen:['Zehe',1],scheibe:['Scheibe',1],scheiben:['Scheibe',1]};\nconst qNum=x=>x==='\u00bd'?0.5:x==='\u00bc'?0.25:parseFloat(String(x).replace(',','.'));\nfunction qtyOf(s){const m=String(s||'').trim().match(/^(\\d+(?:[.,]\\d+)?|\u00bd|\u00bc)\\s*([A-Za-z\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df]+)?\\.?$/);if(!m)return null;const n=qNum(m[1]);if(!(n>0))return null;if(!m[2])return{n,u:'Stk'};const u=QU[m[2].toLowerCase()];return u?{n:n*u[1],u:u[0]}:null}\nfunction splitItem(t){\n  t=String(t||'').trim().replace(/\\s+/g,' ');\n  const unit=w=>w?QU[w.replace(/\\.$/,'').toLowerCase()]:null;\n  let m=t.match(/^(\\d+(?:[.,]\\d+)?|\u00bd|\u00bc)\\s*(.+)$/);\n  if(m){const n=qNum(m[1]);const w=m[2].match(/^([A-Za-z\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df]+\\.?)\\s+(.+)$/);const u=w&&unit(w[1]);if(u)return{name:w[2],qty:{n:n*u[1],u:u[0]}};const u2=unit(m[2].split(' ')[0]);if(u2&&!w)return{name:m[2],qty:null};return{name:m[2],qty:{n,u:'Stk'}}}\n  m=t.match(/^(.+?)\\s+(\\d+(?:[.,]\\d+)?|\u00bd|\u00bc)\\s*([A-Za-z\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df]+\\.?)?$/);\n  if(m){const u=unit(m[3]);if(!m[3]||u)return{name:m[1],qty:{n:qNum(m[2])*(u?u[1]:1),u:u?u[0]:'Stk'}}}\n  return{name:t,qty:null};\n}\nfunction addQty(a,b){if(!a)return b;if(!b)return a;return a.u===b.u?{n:a.n+b.n,u:a.u}:null}\nfunction fmtQty(q){if(!q)return'';let n=q.n,u=q.u;if(u==='g'&&n>=1000){n/=1000;u='kg'}if(u==='ml'&&n>=1000){n/=1000;u='l'}return(Math.round(n*100)/100).toLocaleString('de-DE')+' '+u}\n\nfunction katOf(t){const s=' '+String(t||'').toLowerCase().replace(/^\\d+\\s*(g|kg|ml|l|x|stk\\.?|st\u00fcck|pck\\.?|packung(en)?|dose(n)?|flasche(n)?)?\\s*/,'')+' ';for(const[k,ws]of KATS)for(const w of ws){const i=s.indexOf(w);if(i>=0&&/[\\s(\\-]/.test(s[i-1]||' '))return k}return'Sonstiges'}\nconst ICON={\n wand:'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"7\" height=\"16\" rx=\"2\"/><rect x=\"14\" y=\"4\" width=\"7\" height=\"10\" rx=\"2\"/><path d=\"M14 18h7\"/></svg>',\n heute:'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z\"/></svg>',\n kalender:'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 10h18M8 3v4M16 3v4\"/></svg>',\n einkauf:'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L21 8H6.2\"/><circle cx=\"9\" cy=\"20\" r=\"1.4\"/><circle cx=\"18\" cy=\"20\" r=\"1.4\"/></svg>',\n ideen:'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z\"/></svg>'\n};\nlet fidCount=0,ME=null,USERS=[],CAL=null,meId=null,meName='',FAMILY='',credInfo=null,backups=null,pushChecked=false,quickLink='',quickExists=false;\nconst openD=new Set();const dk=k=>` data-keep=\"${k}\"${openD.has(k)?' open':''}`;\nlet I=[],Ls=[],curList='',calMode='liste',calAnchor='',sq='',E=[],T=[],S=[],F=[],X=[],XERR='',view='heute',sub='',q='',mineOnly=true,adminUsers=null,calList=null,pushOn=false,openTopics=new Set();\n\n/* ---------- Server, Zwischenspeicher, Offline-Warteschlange ---------- */\nasync function api(path,body,method){\n  const r=await fetch(path,{method:method||(body?'POST':'GET'),headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store'});\n  let d=null;try{d=await r.json()}catch(e){}\n  if(!r.ok){const err=new Error(d&&d.error||('Fehler '+r.status));err.status=r.status;err.data=d;throw err}\n  return d;\n}\nconst LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};\nconst store={eintraege:new Map(),themen:new Map(),serien:new Map(),essen:new Map(),infos:new Map(),listen:new Map()};const META=new Map();let newSince=0;\nconst subs={};let since=0,pulling=false,queue=LS.get('fa-q',[]);\nconst snap=c=>[...store[c].entries()].map(([id,data])=>({id,data}));\nfunction emit(c){(subs[c]||[]).forEach(f=>f(snap(c)))}\nfunction saveCache(){LS.set('fa-cache',{since,meta:[...META.entries()],docs:Object.fromEntries(Object.entries(store).map(([c,m])=>[c,[...m.entries()]]))})}\nfunction loadCache(){const c=LS.get('fa-cache',null);if(!c)return false;for(const[k,arr]of Object.entries(c.docs||{}))if(store[k])arr.forEach(([id,d])=>store[k].set(id,d));(c.meta||[]).forEach(([k,v])=>META.set(k,v));since=c.since||0;return true}\nasync function flushQueue(){\n  while(queue.length){const op=queue[0];\n    try{await api('/api/write',{ops:[op]})}catch(e){if(!e.status)return false;/* vom Server abgelehnt: verwerfen */}\n    queue.shift();LS.set('fa-q',queue)}\n  return true;\n}\nasync function pull(full){\n  if(pulling)return;pulling=true;\n  try{\n    if(!(await flushQueue())){banner('Offline. \u00c4nderungen werden nachgeholt, sobald wieder Netz da ist.');return}\n    const d=await api('/api/data?since='+(full?0:since));\n    if(full)Object.values(store).forEach(m=>m.clear());\n    const touched=new Set(full?Object.keys(store):[]);\n    for(const x of d.docs){if(!store[x.coll])continue;if(x.deleted)store[x.coll].delete(x.id);else{store[x.coll].set(x.id,x.data);if(x.u)META.set(x.coll+':'+x.id,x.u)}touched.add(x.coll)}\n    if(d.now)since=d.now;touched.forEach(emit);banner('');saveCache();\n  }catch(e){if(e.status===401)location.reload();else banner('Offline. \u00c4nderungen werden nachgeholt, sobald wieder Netz da ist.')}\n  finally{pulling=false}\n}\nasync function write(op){\n  if(queue.length){queue.push(op);LS.set('fa-q',queue);saveCache();return}\n  try{await api('/api/write',{ops:[op]});saveCache()}\n  catch(e){if(!e.status){queue.push(op);LS.set('fa-q',queue);saveCache();banner('Offline. \u00c4nderungen werden nachgeholt, sobald wieder Netz da ist.');return}await pull(true);throw e}\n}\nconst db={collection:c=>({\n  onSnapshot(cb){(subs[c]=subs[c]||[]).push(cb);cb(snap(c))},\n  doc:id=>({\n    set:async data=>{store[c].set(id,data);emit(c);await write({op:'set',coll:c,id,data})},\n    update:async data=>{store[c].set(id,Object.assign({},store[c].get(id)||{},data));emit(c);await write({op:'update',coll:c,id,data})},\n    delete:async()=>{store[c].delete(id);emit(c);await write({op:'delete',coll:c,id})}\n  })\n})};\nconst col=n=>db.collection(n);\nconst put=(c,id,data)=>col(c).doc(id).set(data);\nconst upd=(c,id,data)=>col(c).doc(id).update(data);\nconst del=(c,id)=>col(c).doc(id).delete();\nconst rows=l=>l.map(d=>Object.assign({},d.data,{id:d.id}));\nasync function askJson(p,ok){try{const d=await api('/api/ai',{prompt:p});return d&&d.json&&(!ok||ok(d.json))?d.json:null}catch(e){return null}}\nasync function loadExternal(force){\n  if(!ME||!['view','edit'].includes(lvl('termine')))return;\n  try{const d=await api('/api/calendar/events'+(force?'?force=1':''));X=d.events||[];XERR=d.err||'';LS.set('fa-ext',X);render()}catch(e){}\n}\n\n/* ---------- Rechte & Hilfen ---------- */\nconst isAdmin=()=>ME&&ME.role==='admin';\nconst lvl=a=>(ME&&ME.perms&&ME.perms[a])||'off';\nconst isAdult=()=>ME&&(ME.role==='admin'||ME.role==='erwachsener');\nconst canSee=a=>lvl(a)!=='off';\nconst canWrite=a=>['edit','mine'].includes(lvl(a));\nconst fullEdit=(d,a)=>lvl(a)==='edit'||(lvl(a)==='mine'&&d.by===meId);\nconst banner=t=>{const b=$('#banner');b.textContent=t||'';b.hidden=!t};\nconst nameOf=id=>{const u=USERS.find(x=>x.id===id);return u?u.name:''};\nconst colorOf=id=>{const i=USERS.findIndex(x=>x.id===id);return i<0?'':(USERS[i].color||COLORS[i%COLORS.length])};\nconst dot=id=>{const c=colorOf(id);return c?`<i class=\"dot\" style=\"background:${c}\" title=\"${esc(nameOf(id))}\"></i>`:''};\nconst isNew=(coll,d)=>!!newSince&&d&&d.by&&d.by!==meId&&(META.get(coll+':'+d.id)||0)>newSince;\nconst who=id=>id&&id===meId?'Ich':nameOf(id);\nconst others=()=>USERS.filter(u=>u.id!==meId);\nconst isMine=x=>{const f=String(x.fuer||'wir');return f==='wir'||f===meId||(f.startsWith('partner-of:')&&f!=='partner-of:'+meId)};\nfunction fuerKey(x){const f=String(x.fuer||'wir');if(f==='wir')return'wir';if(f===meId||(f.startsWith('partner-of:')&&f!=='partner-of:'+meId))return meId;if(f.startsWith('partner-of:'))return others().length===1?others()[0].id:'wir';return f}\nconst fuerLabel=x=>{const k=fuerKey(x);return k==='wir'?'Alle':k===meId?'Ich':(nameOf(k)||'Jemand')};\nfunction fuerFromAi(z){const s=String(z||'').trim().toLowerCase();if(!s||s==='wir'||s==='alle')return'wir';if(s==='ich')return meId;const u=USERS.find(x=>x.name.toLowerCase()===s||x.name.toLowerCase().split(' ')[0]===s);if(u)return u.id;if(s==='du'&&others().length===1)return others()[0].id;return'wir'}\nconst opts=(list,cur)=>list.map(([v,l])=>`<option value=\"${esc(v)}\"${String(cur)===String(v)?' selected':''}>${esc(l)}</option>`).join('');\nconst fuerOpts=cur=>opts([['wir','Alle']].concat(USERS.map(u=>[u.id,u.id===meId?u.name+' (ich)':u.name])),cur);\nconst sichtOpts=cur=>opts(SICHT.filter(([k])=>k!=='erwachsene'||isAdult()),cur||'familie');\n\n/* ---------- Daten-Auswahl ---------- */\nconst t0=()=>today();\nconst activePins=()=>canSee('pinnwand')?E.filter(e=>e.kind==='nachricht'&&!e.done).sort((a,b)=>String(b.at).localeCompare(String(a.at))):[];\nconst unreadPins=()=>canSee('pinnwand')?E.filter(e=>e.kind==='nachricht'&&!e.done&&!(e.readBy||[]).includes(meId)).sort((a,b)=>String(b.at).localeCompare(String(a.at))):[];\nconst proposals=()=>isAdult()&&lvl('termine')==='edit'?E.filter(e=>e.kind==='termin'&&e.vorschlag).sort((a,b)=>String(a.start).localeCompare(String(b.start))):[];\nconst WDH=[['','Nicht wiederholen'],['woechentlich','Jede Woche'],['zweiwoechentlich','Alle 2 Wochen'],['monatlich','Jeden Monat'],['jaehrlich','Jedes Jahr']];\nconst WDHL={woechentlich:'jede Woche',zweiwoechentlich:'alle 2 Wochen',monatlich:'jeden Monat',jaehrlich:'jedes Jahr'};\nfunction onDay(e,day){\n  const s=String(e.start||''),d0=s.slice(0,10);if(!d0||day<d0)return null;const time=s.length>10?s.slice(10):'';\n  if(!WDHL[e.wdh])return d0===day?s:null;\n  if(e.wdhBis&&day>e.wdhBis)return null;if((e.ausnahmen||[]).includes(day))return null;\n  const diff=Math.round((Date.parse(day)-Date.parse(d0))/864e5);\n  if(e.wdh==='woechentlich')return diff%7===0?day+time:null;\n  if(e.wdh==='zweiwoechentlich')return diff%14===0?day+time:null;\n  if(d0.slice(8)!==day.slice(8)&&!(Number(d0.slice(8))>28))return null;\n  for(let i=0,x=d0;x<=day&&i<1200;i++,x=addMonths(d0,i*(e.wdh==='monatlich'?1:12)))if(x===day)return day+time;\n  return null;\n}\nfunction eventsOn(d){\n  if(!canSee('termine'))return[];\n  const a=E.filter(e=>e.kind==='termin'&&(!e.vorschlag||e.by===meId||isAdult())).map(e=>{const o=onDay(e,d);return o?(o===e.start?e:Object.assign({},e,{start:o,occ:d,ende:''})):null}).filter(Boolean);\n  const b=X.filter(x=>x.start.slice(0,10)===d||(d===t0()&&x.start.slice(0,10)<d&&String(x.ende||'').slice(0,10)>d)).map(x=>Object.assign({ext:true},x));\n  return a.concat(b).sort((x,y)=>((x.ganztags?0:1)-(y.ganztags?0:1))||String(x.start).localeCompare(String(y.start)));\n}\nconst serieDue=s=>s.next&&addDays(s.next,-(Number(s.vorlauf)||0))<=t0();\nconst openTasks=()=>E.filter(e=>e.kind==='aufgabe'&&!e.done);\nconst dueTasks=()=>openTasks().filter(e=>isMine(e)&&(!e.faellig||e.faellig<=t0())).sort((a,b)=>String(a.faellig||'9').localeCompare(String(b.faellig||'9')));\nconst doneToday=()=>E.filter(e=>e.kind==='aufgabe'&&e.done&&String(e.doneAt||'').slice(0,10)===t0()&&isMine(e));\nconst dueTopics=()=>canSee('themen')?T.filter(t=>!t.done&&t.due&&t.due<=t0()):[];\nconst inbox=()=>canSee('themen')?E.filter(e=>e.kind==='eingang'||(e.kind==='gedanke'&&e.thema==='Eingang')).sort((a,b)=>String(a.at||'').localeCompare(String(b.at||''))):[];\nconst listOf=id=>Ls.find(l=>l.id===id);\nconst isCheck=e=>{const l=listOf(e.liste||'');return !!l&&l.typ==='liste'};\nconst buyList=()=>E.filter(e=>e.kind==='einkauf'&&!e.done&&!isCheck(e));\nconst inList=e=>(listOf(e.liste||'')?e.liste:'')===curList;\nfunction themeEntries(name){const n=String(name).toLowerCase();return E.filter(e=>e.kind==='gedanke'&&String(e.thema||'').toLowerCase()===n).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')))}\n\n/* ---------- Bausteine ---------- */\nfunction evRow(e){\n  const t=e.ganztags||String(e.start||'').length<=10?'ganztags':hm(e.start);\n  const last=e.ganztags&&e.ende?addDays(e.ende.slice(0,10),-1):String(e.ende||'').slice(0,10);\n  const span=last&&last>String(e.start).slice(0,10)?'bis '+fmtDay(last):'';\n  const sm=[span,WDHL[e.wdh]?'\u21bb '+WDHL[e.wdh]:'',e.ext?'iPhone-Kalender':'',e.vorschlag?'Vorschlag von '+(who(e.by)||'?'):'',!e.ext&&e.fuer&&e.fuer!=='wir'?'f\u00fcr '+fuerLabel(e):'',e.ort||''].filter(Boolean).join(' \u00b7 ');\n  const who1=!e.ext&&(fuerKey(e)!=='wir'?fuerKey(e):'');\n  return `<button class=\"ev${e.ext?' ext':''}${e.vorschlag?' prop':''}${!e.ext&&isNew('eintraege',e)?' new':''}\" data-open=\"${e.ext?'x:':'e:'}${esc(e.id)}${e.occ?'@'+e.occ:''}\"><span class=\"tm\">${t==='ganztags'?'<small>ganzt.</small>':esc(t)}</span><span><span class=\"tt\">${who1?dot(who1):''}${esc(e.titel)}</span>${sm?`<span class=\"sm\">${esc(sm)}</span>`:''}</span></button>`;\n}\nfunction taskRow(e){\n  const late=!e.done&&e.faellig&&e.faellig<t0();const w=canWrite('aufgaben');\n  const sm=[fuerKey(e)!=='wir'?fuerLabel(e):'',e.faellig?(late?'seit '+relDay(e.faellig):relDay(e.faellig))+(e.zeit?' '+e.zeit:''):''].filter(Boolean).join(' \u00b7 ');\n  const fk=fuerKey(e);\n  return `<div class=\"task${e.done?' done':''}${isNew('eintraege',e)?' new':''}\" data-e=\"${esc(e.id)}\"><input type=\"checkbox\" data-a=\"tick\" aria-label=\"${esc(e.titel)} erledigt\"${e.done?' checked':''}${w?'':' disabled'}><button class=\"tb\" data-open=\"e:${esc(e.id)}\"><span class=\"tt\">${fk!=='wir'?dot(fk):''}${esc(e.titel)}</span>${sm?`<span class=\"sm${late?' late':''}\">${esc(sm)}</span>`:''}</button>${e.done&&fullEdit(e,'aufgaben')?`<button class=\"x\" data-a=\"del\" aria-label=\"${esc(e.titel)} l\u00f6schen\" title=\"L\u00f6schen\">\u00d7</button>`:''}</div>`;\n}\nfunction serieRow(s){\n  const late=s.next&&s.next<t0();\n  return `<div class=\"task\" data-s=\"${esc(s.id)}\"><input type=\"checkbox\" data-a=\"stick\" aria-label=\"${esc(s.titel)} erledigt\"${canWrite('aufgaben')?'':' disabled'}><button class=\"tb\" data-open=\"s:${esc(s.id)}\"><span class=\"tt\">${esc(s.titel)}</span><span class=\"sm${late?' late':''}\">${esc(RH[s.rhythmus]||'')} \u00b7 ${esc(relDay(s.next))}</span></button></div>`;\n}\nconst card=(title,body,more)=>`<section class=\"card\"><h2>${title}${more||''}</h2>${body}</section>`;\n\n/* ---------- Ansichten ---------- */\nfunction newItems(){\n  if(!newSince)return[];\n  const out=[];\n  for(const e of E){if(!isNew('eintraege',e))continue;if(e.kind==='nachricht'||e.kind==='eingang')continue;out.push(e)}\n  for(const t of T){const m=META.get('themen:'+t.id)||0;if(m>newSince&&t.by&&t.by!==meId)out.push(Object.assign({kind:'thema',titel:t.name},t))}\n  return out.sort((a,b)=>(META.get('eintraege:'+b.id)||0)-(META.get('eintraege:'+a.id)||0));\n}\nconst KL={termin:'Termin',aufgabe:'Aufgabe',einkauf:'Einkauf',gedanke:'Idee',thema:'Idee'};\nfunction pinCard(e,all){\n  const mine=e.by===meId,read=(e.readBy||[]).includes(meId);\n  return `<div class=\"pin\" data-e=\"${esc(e.id)}\" style=\"margin:6px 0\"><p><small>${esc(who(e.by)||'')} \u00b7 ${esc(relDay(String(e.at||'').slice(0,10)))}</small>${esc(e.text||e.titel)}</p>${mine||isAdult()?`<button class=\"x\" data-a=\"pinoff\" aria-label=\"Abnehmen (f\u00fcr alle)\" title=\"Abnehmen\">\u2713</button>`:''}${!all&&!read?`<button class=\"x\" data-a=\"pinread\" aria-label=\"Gelesen, f\u00fcr mich ausblenden\">\u00d7</button>`:''}</div>`;\n}\nfunction vPinnwand(){\n  const all=activePins();\n  let h=`<button class=\"link back\" data-go=\"heute\">\u2039 Heute</button>`;\n  h+=card('Pinnwand',(all.map(e=>pinCard(e,true)).join('')||'<p class=\"empty\">Gerade h\u00e4ngt nichts.</p>')+(canWrite('pinnwand')?'<button class=\"link\" data-a=\"pinnew\">+ Etwas anpinnen</button>':''));\n  h+=`<p class=\"meta\" style=\"padding:0 4px\">\u00d7 blendet einen Hinweis nur f\u00fcr dich aus. \u2713 nimmt ihn f\u00fcr alle ab (wer ihn angepinnt hat oder Erwachsene).</p>`;\n  return h;\n}\nfunction openNew(kind,o){\n  o=o||{};const d=isDate(o.d)?o.d:'';\n  const fuer=`<label class=\"f\">F\u00fcr<select name=\"fuer\">${fuerOpts('wir')}</select></label>`;\n  let f='',title={termin:'Neuer Termin',aufgabe:'Neue Aufgabe',gedanke:'Neue Idee'}[kind];\n  if(kind==='termin')f=`<label class=\"f\">Was<input name=\"titel\" required placeholder=\"z. B. Zahnarzt Max\"></label><div class=\"two\"><label class=\"f\">Datum<input type=\"date\" name=\"d\" value=\"${esc(d||t0())}\" required></label><label class=\"f\">Uhrzeit (leer = ganztags)<input type=\"time\" name=\"z\"></label></div><div class=\"two\"><label class=\"f\">Wiederholen<select name=\"wdh\">${opts(WDH,'')}</select></label><label class=\"f\">Erinnerung<select name=\"erinnerung\">${opts(REMIND,'60')}</select></label></div><div class=\"two\">${fuer}<label class=\"f\">Sichtbar<select name=\"sicht\">${sichtOpts('familie')}</select></label></div>`;\n  if(kind==='aufgabe')f=`<label class=\"f\">Was<input name=\"titel\" required placeholder=\"z. B. T\u00dcV-Termin machen\"></label><div class=\"two\"><label class=\"f\">F\u00e4llig am (optional)<input type=\"date\" name=\"faellig\" value=\"${esc(d)}\"></label><label class=\"f\">Uhrzeit (dann klingelt es)<input type=\"time\" name=\"zeit\"></label></div><div class=\"two\">${fuer}<label class=\"f\">Sichtbar<select name=\"sicht\">${sichtOpts('familie')}</select></label></div>`;\n  if(kind==='gedanke'){const names=T.map(t=>t.name);f=`<label class=\"f\">Thema<input name=\"thema\" list=\"themes2\" value=\"${esc(o.thema||'')}\" placeholder=\"z. B. Garten, Urlaub 2027\" required><datalist id=\"themes2\">${names.map(n=>`<option value=\"${esc(n)}\">`).join('')}</datalist></label><label class=\"f\">Gedanke<textarea class=\"field\" name=\"text\" required placeholder=\"z. B. Hecke im Fr\u00fchjahr schneiden lassen\"></textarea></label><label class=\"f\">Wieder zeigen am<input type=\"date\" name=\"due\" value=\"${esc(addDays(t0(),7))}\" min=\"${t0()}\"></label>`}\n  if(!f)return;\n  sheet(`<h2>${title}<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2><form id=\"newf\" data-k=\"${kind}\">${f}<div class=\"row\"><button class=\"btn main\" type=\"submit\">Speichern</button></div></form>`);\n  setTimeout(()=>{const i=document.querySelector('#newf [name=titel],#newf [name=thema]');if(i&&!i.value)i.focus();else{const t=document.querySelector('#newf textarea');if(t)t.focus()}},60);\n}\nasync function saveNew(fm){\n  const k=fm.dataset.k,fd=Object.fromEntries(new FormData(fm)),at=new Date().toISOString(),id=uid();\n  const titel=String(fd.titel||'').trim().slice(0,120);\n  try{\n    if(k==='termin'){if(!titel||!isDate(fd.d))return;const d={kind:'termin',titel,text:titel,by:meId,at,start:isTime(fd.z)?fd.d+'T'+fd.z:fd.d,ganztags:!isTime(fd.z),fuer:fd.fuer||'wir',sicht:fd.sicht||'familie',erinnerung:fd.erinnerung==='aus'?'aus':Number(fd.erinnerung)};if(WDHL[fd.wdh])d.wdh=fd.wdh;if(!isAdult())d.vorschlag=true;closeSheet();await put('eintraege',id,d);toast({text:(d.vorschlag?'Vorschlag: ':'Termin: ')+titel+', '+relDay(fd.d)+(isTime(fd.z)?' '+fd.z:''),open:'e:'+id});return}\n    if(k==='aufgabe'){if(!titel)return;const d={kind:'aufgabe',titel,text:titel,by:meId,at,done:false,fuer:fd.fuer||'wir',sicht:fd.sicht||'familie',faellig:isDate(fd.faellig)?fd.faellig:'',zeit:isDate(fd.faellig)&&isTime(fd.zeit)?fd.zeit:''};closeSheet();await put('eintraege',id,d);toast({text:'Aufgabe: '+titel+(d.faellig?', '+relDay(d.faellig):''),open:'e:'+id});return}\n    if(k==='gedanke'){const text=String(fd.text||'').trim().slice(0,1000);const name0=String(fd.thema||'').trim().slice(0,60);if(!text||!name0)return;closeSheet();\n      const sicht=isAdult()?'erwachsene':'familie';const name=await ensureTheme(name0,sicht);const t=T.find(x=>x.name===name);\n      if(isDate(fd.due)&&t&&(!t.due||fd.due<t.due||t.done))await upd('themen',t.id,{due:fd.due,done:false});\n      await put('eintraege',id,{kind:'gedanke',titel:text.slice(0,60),text,thema:name,by:meId,at,sicht});\n      openTopics.add(t?t.id:slug(name));toast('Idee zu \u201e'+name+'\u201c gespeichert.');return}\n  }catch(e){toast(e.message||'Speichern hat nicht geklappt.')}\n}\nfunction openPin(){\n  sheet(`<h2>An die Pinnwand<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2><form id=\"pinf\"><textarea class=\"field\" name=\"t\" placeholder=\"z. B. Paket liegt beim Nachbarn. Oder: Bin heute erst um 19 Uhr zu Hause.\" aria-label=\"Hinweis\" style=\"width:100%\" required></textarea><p class=\"meta\">Alle anderen bekommen eine Mitteilung (au\u00dfer in ihrer Ruhezeit).</p><div class=\"row\"><button class=\"btn main\" type=\"submit\">Anpinnen</button></div></form>`);\n  setTimeout(()=>{const t=document.querySelector('#pinf textarea');if(t)t.focus()},60);\n}\nfunction vHeute(){\n  let h='';\n  for(const w of (ME.warnings||[]))h+=`<div class=\"warn-card\" role=\"alert\">${esc(w)} <button class=\"link\" data-go=\"mehr\" style=\"color:inherit;text-decoration:underline;min-height:0;padding:0\">Zu den Einstellungen</button></div>`;\n  const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;\n  if(standalone&&!pushOn&&pushChecked&&'PushManager'in window&&ME.role!=='tablet')h+=`<div class=\"warn-card\">Mitteilungen sind auf diesem iPhone aus. Ohne sie verpasst du Erinnerungen. <button class=\"link\" data-a=\"pushon\" style=\"color:inherit;text-decoration:underline;min-height:0;padding:0\">Einschalten</button></div>`;\n  const nw=newItems();\n  if(nw.length){const buy=nw.filter(e=>e.kind==='einkauf');const rest=nw.filter(e=>e.kind!=='einkauf');\n    h+=card(`Neu seit deinem letzten Besuch (${nw.length})`,rest.slice(0,6).map(e=>`<button class=\"ev\" data-open=\"${e.kind==='thema'?'t:':'e:'}${esc(e.id)}\"><span class=\"tm\"><small>${esc(KL[e.kind]||'')}</small></span><span><span class=\"tt\">${esc(e.titel)}</span><span class=\"sm\">von ${esc(who(e.by)||'?')}</span></span></button>`).join('')+(buy.length?`<button class=\"link\" data-go=\"einkauf\">${buy.length} neu auf der Einkaufsliste: ${esc(buy.slice(0,4).map(e=>e.titel).join(', '))}${buy.length>4?' \u2026':''}</button>`:'')+`<div class=\"row\" style=\"padding-bottom:8px\"><button class=\"btn sm\" data-a=\"seen\">Alles gesehen</button></div>`)}\n  if(canSee('pinnwand')){const up=unreadPins(),all=activePins();\n    let pb=up.map(pinCard).join('');\n    if(!up.length)pb+=`<p class=\"empty\" style=\"margin:0\">${all.length?'Alles gelesen.':'Hier h\u00e4ngen Hinweise f\u00fcr alle, z. B. \u201ePaket liegt beim Nachbarn\u201c.'}</p>`;\n    h+=`<section class=\"card\" style=\"padding-bottom:6px\"><h2>Pinnwand${all.length?`<button class=\"link more\" data-go=\"pinnwand\">Alle (${all.length})</button>`:''}</h2>${pb}${canWrite('pinnwand')?'<button class=\"link\" data-a=\"pinnew\">+ Etwas anpinnen</button>':''}</section>`}\n  const ps=proposals();\n  if(ps.length)h+=card('Vorschl\u00e4ge zum Best\u00e4tigen',ps.map(evRow).join(''));\n  if(canSee('termine')){const a=eventsOn(t0()),b=eventsOn(addDays(t0(),1));\n    h+=card('Heute',a.length?a.map(evRow).join(''):'<p class=\"empty\">Heute keine Termine.</p>',`<button class=\"link more\" data-go=\"kalender\">Kalender</button>`);\n    if(b.length)h+=card('Morgen',b.slice(0,4).map(evRow).join('')+(b.length>4?`<button class=\"link\" data-go=\"kalender\">und ${b.length-4} weitere</button>`:''));}\n  if(canSee('aufgaben')){const ts=dueTasks(),ss=S.filter(serieDue).sort((a,b)=>String(a.next).localeCompare(String(b.next))),dn=doneToday();const all=openTasks().filter(isMine).length;\n    let b=ss.map(serieRow).join('')+ts.slice(0,7).map(taskRow).join('');\n    if(!b)b='<p class=\"empty\">Nichts f\u00e4llig.</p>';\n    if(canWrite('aufgaben'))b+='<button class=\"link\" data-a=\"new\" data-k=\"aufgabe\">+ Aufgabe</button>';\n    if(ts.length>7)b+=`<button class=\"link\" data-go=\"aufgaben\">und ${ts.length-7} weitere</button>`;\n    if(dn.length)b+=`<details${dk('dn')}><summary>${dn.length} heute erledigt</summary>${dn.map(taskRow).join('')}</details>`;\n    if(ME.role==='kind'){const wk=weekStats(meId);if(wk.total)b+=`<p class=\"meta\">Diese Woche: ${wk.done} von ${wk.total} erledigt</p><div class=\"bar2\" style=\"--c:${colorOf(meId)}\"><i style=\"width:${Math.round(100*wk.done/wk.total)}%\"></i></div>`}\n    h+=card('Zu erledigen',b,`<button class=\"link more\" data-go=\"aufgaben\">Alle (${all})</button>`);}\n  const extra=[];\n  const ib=inbox().length,dt=dueTopics().length;\n  if(ib)extra.push(`<button class=\"link\" data-go=\"ideen\">${ib} ${ib===1?'Notiz':'Notizen'} im Eingang zuordnen</button>`);\n  if(dt)extra.push(`<button class=\"link\" data-go=\"ideen\">${dt} ${dt===1?'Idee':'Ideen'} zur Wiedervorlage</button>`);\n  if(canSee('essen')){const m=F.find(f=>f.datum===t0());extra.push(`<button class=\"link\" data-go=\"essen\">Essen heute: ${esc(m&&m.gericht||'noch offen')}</button>`)}\n  if(extra.length)h+=card('Au\u00dferdem','<div style=\"display:grid;justify-items:start;padding-bottom:4px\">'+extra.join('')+'</div>');\n  if(wide()){const r=weekCard()+(isAdult()?`<p class=\"meta\" style=\"padding:0 4px\"><button class=\"link\" data-go=\"wand\">Family Wall \u00f6ffnen</button> \u00b7 \u00dcbersicht f\u00fcr alle, ohne Erwachsenen-Themen</p>`:'');return `<div class=\"cols\"><div>${h}</div><div>${r}</div></div>`}\n  return h;\n}\nfunction vWand(){\n  const fam=x=>ME.role==='tablet'||(x.sicht||'familie')==='familie';\n  const t=t0();let h='';\n  const pins=E.filter(e=>e.kind==='nachricht'&&!e.done&&fam(e)&&String(e.at||'')>=addDays(t,-7)).sort((a,b)=>String(b.at).localeCompare(String(a.at)));\n  for(const e of pins.slice(0,3))h+=`<div class=\"pin\"><p><small>Pinnwand \u00b7 ${esc(who(e.by)||'')}</small>${esc(e.text||e.titel)}</p></div>`;\n  const people=USERS.filter(u=>!['tablet','gast'].includes(u.role));\n  const cols=people.map(u=>({id:u.id,name:u.name,c:colorOf(u.id)})).concat([{id:'wir',name:'Alle',c:'#55697d'}]);\n  h+='<div class=\"wall\">';\n  for(const p of cols){\n    const mineT=x=>p.id==='wir'?fuerKey(x)==='wir':String(x.fuer||'wir')===p.id;\n    const open=E.filter(e=>e.kind==='aufgabe'&&!e.done&&fam(e)&&mineT(e)&&(!e.faellig||e.faellig<=t)).sort((a,b)=>String(a.faellig||'9').localeCompare(String(b.faellig||'9')));\n    const done=E.filter(e=>e.kind==='aufgabe'&&e.done&&fam(e)&&mineT(e)&&String(e.doneAt||'').slice(0,10)===t);\n    const ser=S.filter(x=>serieDue(x)&&mineT(x));\n    const ev=eventsOn(t).filter(e=>!e.vorschlag&&(e.ext?p.id==='wir':fam(e)&&mineT(e)));\n    const wk=weekStats(p.id);\n    const all=open.length+done.length+ser.length;\n    h+=`<section class=\"pcol\" style=\"--c:${p.c}\" data-person=\"${esc(p.id)}\"><h2>${esc(p.name)}</h2>${all?`<p class=\"prog\">Heute ${done.length} von ${all} erledigt</p><div class=\"bar2\"><i style=\"width:${Math.round(100*done.length/all)}%\"></i></div>`:''}${ev.map(evRow).join('')}${ser.map(serieRow).join('')}${open.map(taskRow).join('')}${!ev.length&&!all?'<p class=\"empty\">Heute nichts.</p>':''}${p.id!=='wir'&&wk.total?`<p class=\"meta\">Diese Woche: ${wk.done} von ${wk.total} erledigt</p>`:''}</section>`;\n  }\n  h+='</div>';\n  const f=canSee('essen')?F.find(x=>x.datum===t):null;const nb=buyList().length;\n  h+=`<p class=\"meta\" style=\"padding:8px 4px\">${f&&f.gericht?'Essen heute: '+esc(f.gericht)+' \u00b7 ':''}${canSee('einkauf')?`<button class=\"link\" data-go=\"einkauf\" style=\"min-height:0;padding:0\">${nb} Dinge auf der Einkaufsliste</button>`:''}</p>`;\n  return h;\n}\n// Wochenstand je Person (Montag bis heute)\nfunction weekStats(pid){\n  const m=monday(t0());const mine=x=>String(x.fuer||'wir')===pid;\n  const tasks=E.filter(e=>e.kind==='aufgabe'&&mine(e)&&((e.faellig&&e.faellig>=m&&e.faellig<=addDays(m,6))||(e.done&&String(e.doneAt||'').slice(0,10)>=m)));\n  return {total:tasks.length,done:tasks.filter(e=>e.done).length};\n}\nfunction vAufgaben(){\n  const open=openTasks().filter(e=>!mineOnly||isMine(e)).sort((a,b)=>String(a.faellig||'9').localeCompare(String(b.faellig||'9')));\n  const g={late:[],now:[],soon:[],none:[]};\n  for(const e of open)(!e.faellig?g.none:e.faellig<t0()?g.late:e.faellig===t0()?g.now:g.soon).push(e);\n  const done=E.filter(e=>e.kind==='aufgabe'&&e.done).sort((a,b)=>String(b.doneAt||'').localeCompare(String(a.doneAt||''))).slice(0,30);\n  let h=`<button class=\"link back\" data-go=\"heute\">\u2039 Heute</button><div class=\"row\" style=\"margin:0 0 10px\"><button class=\"btn sm\" data-a=\"mine\" aria-pressed=\"${mineOnly}\">Meine</button><button class=\"btn sm\" data-a=\"all\" aria-pressed=\"${!mineOnly}\">Alle</button>${canWrite('aufgaben')?'<button class=\"btn sm main\" data-a=\"new\" data-k=\"aufgabe\" style=\"margin-left:auto\">+ Aufgabe</button>':''}</div>`;\n  const sec=(t,l)=>l.length?card(t,l.map(taskRow).join('')):'';\n  h+=sec('\u00dcberf\u00e4llig',g.late)+sec('Heute',g.now)+sec('Demn\u00e4chst',g.soon)+sec('Ohne Datum',g.none);\n  if(!open.length)h+=card('Aufgaben','<p class=\"empty\">Keine offenen Aufgaben.</p>');\n  const ss=S.slice().sort((a,b)=>String(a.next).localeCompare(String(b.next)));\n  h+=card('Wiederkehrend',ss.length?ss.map(serieRow).join(''):'<p class=\"empty\">Sag zum Beispiel \u201eJeden Dienstag Restm\u00fcll\u201c oder \u201eMamas Geburtstag ist am 3. Februar\u201c.</p>');\n  if(done.length)h+=`<section class=\"card\"><details${dk('ad')}><summary>Zuletzt erledigt (${done.length})</summary>${done.map(taskRow).join('')}${done.some(e=>fullEdit(e,'aufgaben'))?'<div class=\"row\" style=\"padding:8px 0\"><button class=\"btn sm warn\" data-a=\"deldone\">Alle erledigten l\u00f6schen</button></div>':''}</details></section>`;\n  return h;\n}\nconst monday=d=>{const x=new Date(d+'T12:00:00');const wd=(x.getDay()+6)%7;return addDays(d,-wd)};\nconst tasksOn=d=>canSee('aufgaben')?openTasks().filter(e=>e.faellig===d&&isMine(e)):[];\nfunction vKalender(){\n  let h='';const ps=proposals();\n  if(ps.length)h+=card('Vorschl\u00e4ge zum Best\u00e4tigen',ps.map(evRow).join(''));\n  const anchor=calAnchor||t0();\n  if(canWrite('termine'))h+=`<div class=\"row\" style=\"margin:0 0 10px\"><button class=\"btn sm main\" data-a=\"new\" data-k=\"termin\" data-d=\"${esc(calMode==='liste'?'':anchor)}\">+ Termin</button></div>`;\n  h+=`<div class=\"seg\" role=\"group\" aria-label=\"Ansicht\">${[['liste','Liste'],['woche','Woche'],['tag','Tag']].map(([k,l])=>`<button data-a=\"calmode\" data-m=\"${k}\" aria-pressed=\"${calMode===k}\">${l}</button>`).join('')}</div>`;\n  if(calMode==='liste'){\n    let body='';\n    for(let i=0;i<45;i++){const d=addDays(t0(),i);const l=eventsOn(d).filter(e=>!e.vorschlag||!isAdult());\n      if(l.length)body+=`<p class=\"day${i===0?' today':''}\">${esc(i<2?relDay(d)+', '+fmtDay(d):fmtLong(d))}</p>`+l.map(evRow).join('')}\n    h+=card('Die n\u00e4chsten Wochen',body||'<p class=\"empty\">Keine Termine.</p>');\n    const past=E.filter(e=>e.kind==='termin'&&!e.wdh&&String(e.start||'').slice(0,10)<t0()).sort((a,b)=>String(b.start).localeCompare(String(a.start))).slice(0,15);\n    if(past.length)h+=`<section class=\"card\"><details${dk('past')}><summary>Vergangene Termine aus der App</summary>${past.map(evRow).join('')}</details></section>`;\n  }\n  if(calMode==='woche'){\n    const m=monday(anchor),end=addDays(m,6);\n    h+=`<div class=\"calnav\"><button class=\"btn sm\" data-a=\"calprev\" aria-label=\"Vorige Woche\">\u2039</button><b>${esc(fmtDay(m))} \u2013 ${esc(fmtDay(end))}</b><button class=\"btn sm\" data-a=\"calnext\" aria-label=\"N\u00e4chste Woche\">\u203a</button>${m!==monday(t0())?'<button class=\"btn sm\" data-a=\"caltoday\">Heute</button>':''}</div>`;\n    h+=`<div class=\"week${wide()?' wide':''}\">`;\n    for(let i=0;i<7;i++){const d=addDays(m,i);const l=eventsOn(d).filter(e=>!e.vorschlag||!isAdult());const ts=tasksOn(d);const f=canSee('essen')?F.find(x=>x.datum===d):null;\n      h+=`<div class=\"wday${d===t0()?' today':''}\" data-d=\"${d}\"><h3><span>${esc(WD[new Date(d+'T12:00:00').getDay()].slice(0,2))}, ${esc(Number(d.slice(8)))}.${esc(Number(d.slice(5,7)))}.</span>${canWrite('termine')?`<button class=\"link\" data-a=\"caladd\" data-d=\"${d}\" aria-label=\"Termin an diesem Tag\" style=\"min-height:0;padding:0 4px\">+</button>`:''}</h3>${l.map(evRow).join('')||'<div class=\"mini\">\u2013</div>'}${ts.length?`<div class=\"mini\">Aufgaben: ${esc(ts.map(e=>e.titel).join(', '))}</div>`:''}${f&&f.gericht?`<div class=\"mini\">Essen: ${esc(f.gericht)}</div>`:''}</div>`}\n    h+='</div>';\n  }\n  if(calMode==='tag'){\n    const d=anchor;const l=eventsOn(d).filter(e=>!e.vorschlag||!isAdult());const ts=tasksOn(d);\n    h+=`<div class=\"calnav\"><button class=\"btn sm\" data-a=\"calprev\" aria-label=\"Voriger Tag\">\u2039</button><b>${esc(relDay(d)===fmtDay(d)?fmtLong(d):relDay(d)+', '+fmtLong(d))}</b><button class=\"btn sm\" data-a=\"calnext\" aria-label=\"N\u00e4chster Tag\">\u203a</button>${d!==t0()?'<button class=\"btn sm\" data-a=\"caltoday\">Heute</button>':''}</div>`;\n    h+=card('Termine',(l.map(evRow).join('')||'<p class=\"empty\">Keine Termine.</p>')+(canWrite('termine')?`<button class=\"link\" data-a=\"caladd\" data-d=\"${d}\">+ Termin an diesem Tag</button>`:''));\n    if(ts.length)h+=card('F\u00e4llig an diesem Tag',ts.map(taskRow).join(''));\n  }\n  const note=CAL?`Neue Termine aus der App landen automatisch im Kalender \u201e${esc(CAL)}\u201c. Termine aus diesem Kalender erscheinen hier mit.`:(isAdmin()?'Noch kein iPhone-Kalender verbunden. Das geht unter Einstellungen.':'');\n  if(note)h+=`<p class=\"meta\" style=\"padding:0 4px\">${note}${XERR?' Lesen gerade nicht m\u00f6glich.':''}</p>`;\n  return h;\n}\nfunction weekCard(){\n  const m=t0();let b='';\n  for(let i=0;i<7;i++){const d=addDays(m,i);const l=eventsOn(d).filter(e=>!e.vorschlag||!isAdult());\n    b+=`<p class=\"day${i===0?' today':''}\">${esc(i<2?relDay(d)+', '+fmtDay(d):fmtLong(d))}</p>`+(l.map(evRow).join('')||'<p class=\"empty\" style=\"padding:2px 0 6px\">\u2013</p>')}\n  return card('Die n\u00e4chsten 7 Tage',b,`<button class=\"link more\" data-a=\"towoche\">Woche</button>`);\n}\nfunction vEinkauf(){\n  let h='';\n  if(canSee('einkauf')){\n    if(curList&&!listOf(curList))curList='';\n    const cur=listOf(curList);const check=cur&&cur.typ==='liste';const w=canWrite('einkauf');\n    const cnt=id=>E.filter(e=>e.kind==='einkauf'&&!e.done&&(listOf(e.liste||'')?e.liste:'')===id).length;\n    h+=`<div class=\"chips\" style=\"margin:0 0 10px\">${[{id:'',name:'Einkauf'}].concat(Ls.slice().sort((a,b)=>a.name.localeCompare(b.name,'de'))).map(l=>`<button class=\"chip\" data-a=\"list\" data-l=\"${esc(l.id)}\" aria-pressed=\"${l.id===curList}\" style=\"${l.id===curList?'background:#2f5d84;color:#fff;border-color:#2f5d84':''}\">${esc(l.name)}${l.tag!==undefined&&l.tag!==''?' ('+esc(TAGE.find(t=>t[0]===String(l.tag))[1].slice(0,2))+')':''}${cnt(l.id)?' \u00b7 '+cnt(l.id):''}</button>`).join('')}${w?'<button class=\"chip\" data-a=\"listadd\">+ Liste</button>':''}</div>`;\n    const xs=E.filter(e=>e.kind==='einkauf'&&inList(e)&&(check||!e.done));\n    let b=w?`<form class=\"add\" id=\"addBuy\"><input class=\"field\" id=\"buyIn\" placeholder=\"${check?'Was geh\u00f6rt dazu?':'Was fehlt? z. B. Milch, Brot'}\" aria-label=\"Artikel hinzuf\u00fcgen\" autocomplete=\"off\" enterkeyhint=\"done\"><button class=\"btn main\" type=\"submit\" aria-label=\"Hinzuf\u00fcgen\">+</button></form>`:'';\n    if(!xs.length)b+=`<p class=\"empty\">${check?'Noch leer.':'Alles da. Die Liste ist leer.'}</p>`;\n    if(check){\n      b+=xs.sort((a,c)=>(a.done?1:0)-(c.done?1:0)||a.titel.localeCompare(c.titel,'de')).map(e=>`<div class=\"task${e.done?' done':''}\" data-e=\"${esc(e.id)}\"><input type=\"checkbox\" data-a=\"tick\" aria-label=\"${esc(e.titel)}\"${e.done?' checked':''}${w?'':' disabled'}><button class=\"tb\" data-open=\"e:${esc(e.id)}\"><span class=\"tt\">${esc(e.titel)}</span>${e.menge?`<span class=\"sm\">${esc(e.menge)}</span>`:''}</button></div>`).join('');\n      const d=xs.filter(e=>e.done).length;\n      if(w&&xs.length)b+=`<div class=\"row\" style=\"padding:8px 0\"><span class=\"meta\" style=\"flex:1\">${d} von ${xs.length} abgehakt</span>${d?'<button class=\"btn sm\" data-a=\"listreset\">Alle Haken entfernen</button>':''}</div>`;\n    }else{\n      const by={};for(const e of xs){const k=e.kat||katOf(e.titel);(by[k]=by[k]||[]).push(e)}\n      for(const k of KAT_ORDER)if(by[k])b+=`<p class=\"day\">${esc(k)}</p><div class=\"tiles\">${by[k].sort((a,c)=>a.titel.localeCompare(c.titel,'de')).map(e=>`<button class=\"tile\" data-buy=\"${esc(e.id)}\">${esc(e.titel)}${e.menge?`<small>${esc(e.menge)}</small>`:''}${e.quellen&&e.quellen.length?`<small>${esc([...new Set(e.quellen.map(q=>q.replace(/ \\(.*\\)$/,'')))].join(', '))}</small>`:''}</button>`).join('')}</div>`;\n      if(xs.length&&w)b+='<p class=\"meta\">Antippen = gekauft. Lange dr\u00fccken = bearbeiten.</p>';\n      if(xs.length&&w&&USERS.filter(u=>u.id!==meId&&!u.profil).length)b+=`<div class=\"row\" style=\"padding:4px 0 8px\"><button class=\"btn sm\" data-a=\"shopgo\">Ich gehe jetzt einkaufen</button><span class=\"meta\">Die anderen bekommen einen Hinweis und k\u00f6nnen noch etwas erg\u00e4nzen.</span></div>`;\n      const seen=new Set(xs.map(e=>e.titel.toLowerCase()));const recent=[];\n      for(const e of E.filter(e=>e.kind==='einkauf'&&e.done&&inList(e)).sort((a,c)=>String(c.doneAt||c.at||'').localeCompare(String(a.doneAt||a.at||'')))){const k=e.titel.toLowerCase();if(seen.has(k))continue;seen.add(k);recent.push(e);if(recent.length>=24)break}\n      if(recent.length&&w)b+=`<details${dk('recent')}><summary>Zuletzt gekauft</summary><div class=\"chips\">${recent.map(e=>`<button class=\"chip\" data-again=\"${esc(e.id)}\">+ ${esc(e.titel)}</button>`).join('')}</div></details>`;\n    }\n    if(cur&&w)b+=`<div class=\"row\" style=\"padding-bottom:8px\"><button class=\"link\" data-a=\"listedit\">Liste umbenennen oder l\u00f6schen</button></div>`;\n    h+=card(cur?cur.name:'Einkaufsliste',b);\n  }\n  if(canSee('essen')&&!curList)h+=vEssenCard();\n  return h;\n}\nfunction openList(l){\n  l=l||{};sheet(`<h2>${l.id?'Liste bearbeiten':'Neue Liste'}<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2><form id=\"listf\" data-l=\"${esc(l.id||'')}\"><label class=\"f\">Name<input name=\"name\" value=\"${esc(l.name||'')}\" placeholder=\"z. B. Drogerie, Baumarkt, Packliste Urlaub\" required></label><label class=\"f\">Art<select name=\"typ\">${opts([['einkauf','Einkaufsliste: Gekauftes verschwindet'],['liste','Checkliste: Haken bleiben (Packliste, Geschenkideen)']],l.typ||'einkauf')}</select></label><label class=\"f\">Einkaufstag (f\u00fcr Einkaufslisten)<select name=\"tag\">${opts(TAGE,l.tag===undefined?'':String(l.tag))}</select></label><p class=\"meta\" style=\"margin-top:-4px\">Mit Einkaufstag schl\u00e4gt die App beim Essensplan die passende Liste vor: Zutaten f\u00fcrs Essen am Donnerstag landen auf der Mittwochs-Liste, wenn es eine gibt.</p><div class=\"row\"><button class=\"btn main\" type=\"submit\">Speichern</button>${l.id?'<button class=\"btn warn\" type=\"button\" data-a=\"listdel\">Liste l\u00f6schen</button>':''}</div></form>`);\n}\nconst BOOK='<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z\"/><path d=\"M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5\"/></svg>';\nconst recipeLink=r=>r&&r.url?`<a class=\"recipe\" href=\"${esc(r.url)}\" target=\"_blank\" rel=\"noopener noreferrer\">${BOOK}<span><b>${esc(r.titel||'Rezept')}</b><small>${esc(r.quelle||'')}${r.portionen?' \u00b7 f\u00fcr '+r.portionen+' Personen':''}</small></span><span class=\"go\">\u00d6ffnen \u2197</span></a>`:'';\nfunction vEssenCard(){\n  const w=canWrite('essen');let b='';\n  for(let i=0;i<7;i++){const d=addDays(t0(),i);const f=F.find(x=>x.datum===d);const r=f&&f.rezept;\n    const acts=w&&f&&f.gericht?`<div class=\"row\" style=\"gap:4px 14px\">${canWrite('einkauf')?'<button class=\"link\" data-a=\"zutaten\">Zutaten auf die Liste</button>':''}<button class=\"link\" data-a=\"rezept\">${r?'Rezept \u00e4ndern':'+ Rezept-Link'}</button></div>`:'';\n    b+=`<div class=\"meal\" data-d=\"${d}\"><div class=\"meta\" style=\"font-weight:700\">${esc(i<2?relDay(d):fmtDay(d))}</div>${w?`<input class=\"field\" data-a=\"meal\" placeholder=\"Was gibt es?\" value=\"${esc(f&&f.gericht||'')}\" aria-label=\"Essen ${esc(relDay(d))}\" enterkeyhint=\"done\">`:`<div>${esc(f&&f.gericht||'\u2013')}</div>`}${recipeLink(r)}${acts}</div>`}\n  return `<section class=\"card\" id=\"essen\"><details${dk('essen')}><summary>Essensplan der Woche</summary>${b}</details></section>`;\n}\nfunction vIdeen(){\n  let h=canWrite('themen')?`<div class=\"row\" style=\"margin:0 0 10px\"><button class=\"btn sm main\" data-a=\"new\" data-k=\"gedanke\">+ Idee</button></div>`:'';const ib=inbox();\n  if(ib.length)h+=card('Eingang: einzeln zuordnen',ib.map(e=>`<div class=\"inbox\" data-e=\"${esc(e.id)}\"><p>${esc(e.text||e.titel)}</p><div class=\"row\">${[['termin','Termin'],['aufgabe','Aufgabe'],['einkauf','Einkauf'],['gedanke','Idee']].filter(([k])=>canWrite(KIND_AREA[k])).map(([k,l])=>`<button class=\"btn sm\" data-a=\"to-${k}\">${l}</button>`).join('')}<button class=\"btn sm\" data-a=\"x-ai\">Automatisch</button><button class=\"x\" data-a=\"del\" aria-label=\"L\u00f6schen\">\u00d7</button></div></div>`).join(''));\n  const open=T.filter(t=>!t.done).sort((a,b)=>String(a.due||'9').localeCompare(String(b.due||'9'))),done=T.filter(t=>t.done);\n  const now=open.filter(t=>t.due&&t.due<=t0()),later=open.filter(t=>!(t.due&&t.due<=t0()));\n  if(now.length)h+=card('Jetzt dran',now.map(topicRow).join(''));\n  h+=card(now.length?'Sp\u00e4ter':'Ideen und Themen',later.length?later.map(topicRow).join(''):(now.length?'<p class=\"empty\">Nichts weiter geplant.</p>':'<p class=\"empty\">Noch keine Ideen. Einfach sprechen: \u201eIm Fr\u00fchjahr die Hecke schneiden lassen.\u201c Die Idee meldet sich dann im M\u00e4rz.</p>'));\n  if(done.length)h+=`<section class=\"card\"><details${dk('tdone')}><summary>Erledigt (${done.length})</summary>${done.map(topicRow).join('')}${done.some(t=>fullEdit(t,'themen'))?'<div class=\"row\" style=\"padding:8px 0\"><button class=\"btn sm warn\" data-a=\"tdelall\">Alle erledigten Ideen l\u00f6schen</button></div>':''}</details></section>`;\n  return h;\n}\nfunction topicRow(t){\n  const es=themeEntries(t.name);const late=!t.done&&t.due&&t.due<=t0();const w=fullEdit(t,'themen');\n  const acts=!w?'':t.done?`<button class=\"btn sm\" data-a=\"reopen\">Wieder \u00f6ffnen</button><button class=\"btn sm warn\" data-a=\"tdel\">L\u00f6schen</button>`:`<button class=\"btn sm\" data-a=\"new\" data-k=\"gedanke\" data-t=\"${esc(t.name)}\">+ Gedanke</button><button class=\"btn sm\" data-a=\"later\">Sp\u00e4ter</button><button class=\"btn sm\" data-a=\"tdone\">Erledigt</button><button class=\"btn sm\" data-a=\"tedit\">Bearbeiten</button>`;\n  const when=t.done?'erledigt':late?'jetzt dran':'meldet sich '+(relDay(t.due)==='Morgen'?'morgen':'am '+fmtDay(t.due));\n  return `<details class=\"topic\" data-t=\"${esc(t.id)}\"${openTopics.has(t.id)?' open':''}><summary>${esc(t.name)}<span class=\"${late?'late':''}\">${esc(when)} \u00b7 ${es.length}</span></summary><ul class=\"lines\">${es.map(e=>`<li><span class=\"ltxt\">${esc(e.text||e.titel)} <span>\u00b7 ${esc(who(e.by)||'')}, ${esc(fmtDay(String(e.at||'').slice(0,10)))}</span></span>${fullEdit(e,'themen')?`<button class=\"btn sm ldel\" data-a=\"edel\" data-e=\"${esc(e.id)}\" aria-label=\"Gedanken l\u00f6schen\">L\u00f6schen</button>`:''}</li>`).join('')}</ul><div class=\"row\" style=\"margin-bottom:8px\">${acts}</div></details>`;\n}\nfunction openTopic(t,mode){\n  if(mode==='later')return sheet(`<h2>\u201e${esc(t.name)}\u201c sp\u00e4ter wieder zeigen<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2><div class=\"row\" data-t=\"${esc(t.id)}\" style=\"margin-bottom:10px\"><button class=\"btn sm\" data-a=\"tl\" data-n=\"7\">In 1 Woche</button><button class=\"btn sm\" data-a=\"tl\" data-n=\"m1\">In 1 Monat</button><button class=\"btn sm\" data-a=\"tl\" data-n=\"m3\">In 3 Monaten</button></div><form id=\"tdue\" data-t=\"${esc(t.id)}\"><label class=\"f\">Oder an einem Tag<input type=\"date\" name=\"due\" value=\"${esc(t.due||'')}\" min=\"${t0()}\"></label><button class=\"btn main\" type=\"submit\">Speichern</button></form>`);\n  sheet(`<h2>Thema bearbeiten<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2><form id=\"tedit\" data-t=\"${esc(t.id)}\"><label class=\"f\">Name<input name=\"name\" value=\"${esc(t.name)}\"></label><label class=\"f\">Meldet sich am<input type=\"date\" name=\"due\" value=\"${esc(t.due||'')}\"></label><label class=\"f\">Sichtbar f\u00fcr<select name=\"sicht\">${sichtOpts(t.sicht)}</select></label><div class=\"row\"><button class=\"btn main\" type=\"submit\">Speichern</button><button class=\"btn warn\" type=\"button\" data-a=\"tdelsheet\">Thema l\u00f6schen</button></div></form>`);\n}\nconst INFO_KAT=['Notfall','\u00c4rzte','Schule und Kita','Gr\u00f6\u00dfen','Kontakte','Sonstiges'];\nfunction linkify(t){return esc(t).replace(/(\\+?\\d[\\d \\/-]{6,}\\d)/g,m=>`<a href=\"tel:${m.replace(/[^\\d+]/g,'')}\">${m}</a>`)}\nfunction vInfos(){\n  let h=`<button class=\"link back\" data-go=\"mehr\">\u2039 Einstellungen</button>`;\n  const by={};for(const x of I){(by[x.kat||'Sonstiges']=by[x.kat||'Sonstiges']||[]).push(x)}\n  const w=isAdult()&&canWrite('pinnwand');\n  if(w)h+=`<div class=\"row\" style=\"margin:0 0 10px\"><button class=\"btn sm main\" data-a=\"infoadd\">+ Info hinzuf\u00fcgen</button></div>`;\n  let any=false;\n  for(const k of INFO_KAT)if(by[k]){any=true;h+=card(k,by[k].sort((a,b)=>a.titel.localeCompare(b.titel,'de')).map(x=>`<div class=\"info\"><b>${esc(x.titel)}</b>${w?` <button class=\"link\" data-a=\"infoedit\" data-i=\"${esc(x.id)}\" style=\"min-height:0;padding:0 6px\">\u00c4ndern</button>`:''}<p>${linkify(x.text||'')}</p></div>`).join(''))}\n  if(!any)h+=card('Familien-Infos','<p class=\"empty\">Hier steht, was man selten braucht, aber dann schnell: Notfallnummern, Kinderarzt, Schule, Schuhgr\u00f6\u00dfen.</p>');\n  h+=`<p class=\"meta\" style=\"padding:0 4px\">Bitte keine Passw\u00f6rter, PINs, Konto- oder Ausweisnummern speichern.</p>`;\n  return h;\n}\nfunction openInfo(x){\n  x=x||{};sheet(`<h2>${x.id?'Info \u00e4ndern':'Neue Info'}<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2><form id=\"infof\" data-i=\"${esc(x.id||'')}\"><label class=\"f\">Titel<input name=\"titel\" value=\"${esc(x.titel||'')}\" placeholder=\"z. B. Kinderarzt Dr. Meier\" required></label><label class=\"f\">Bereich<select name=\"kat\">${opts(INFO_KAT.map(k=>[k,k]),x.kat||'Sonstiges')}</select></label><label class=\"f\">Inhalt<textarea class=\"field\" name=\"text\" placeholder=\"Telefon, Adresse, Sprechzeiten \u2026\">${esc(x.text||'')}</textarea></label><label class=\"f\">Sichtbar<select name=\"sicht\">${opts([['familie','Familie'],['erwachsene','Nur Erwachsene']],x.sicht||'familie')}</select></label><p class=\"meta\">Keine Passw\u00f6rter, PINs, Konto- oder Ausweisnummern.</p><div class=\"row\"><button class=\"btn main\" type=\"submit\">Speichern</button>${x.id?'<button class=\"btn warn\" type=\"button\" data-a=\"infodel\">L\u00f6schen</button>':''}</div></form>`);\n}\nasync function saveInfo(fm){\n  const fd=Object.fromEntries(new FormData(fm));const text=String(fd.text||'').slice(0,3000);\n  if(/\\b[A-Z]{2}\\d{2}(?:\\s?[A-Z0-9]{4}){3,}/i.test(text)||/(passwort|kennwort|\\bpin\\b|tan\\b)/i.test(text+' '+fd.titel)){toast('Das sieht nach Bankdaten oder einem Passwort aus. Solche Daten geh\u00f6ren nicht in die App.');return}\n  const id=fm.dataset.i||uid();const d={titel:String(fd.titel||'').trim().slice(0,120),kat:INFO_KAT.includes(fd.kat)?fd.kat:'Sonstiges',text,sicht:fd.sicht==='erwachsene'?'erwachsene':'familie'};\n  if(!d.titel)return;closeSheet();try{if(fm.dataset.i)await upd('infos',id,d);else await put('infos',id,Object.assign(d,{at:new Date().toISOString()}))}catch(e){toast(e.message)}\n}\nfunction vSuche(){\n  let h=`<input class=\"search\" id=\"sq\" type=\"search\" placeholder=\"Alles durchsuchen: Termine, Aufgaben, Ideen, Infos \u2026\" value=\"${esc(sq)}\" autocomplete=\"off\">`;\n  const qq=sq.toLowerCase();if(qq.length<2)return h+'<p class=\"meta\" style=\"padding:0 4px\">Mindestens 2 Buchstaben.</p>';\n  const hit=x=>[x.titel,x.text,x.thema,x.name,x.gericht,...(x.notizen||[]).map(n=>n.text)].some(v=>String(v||'').toLowerCase().includes(qq));\n  const groups=[['Termine',E.filter(e=>e.kind==='termin'&&hit(e)).map(e=>evRow(e))],['Aufgaben',E.filter(e=>e.kind==='aufgabe'&&hit(e)).map(taskRow)],['Wiederkehrend',S.filter(hit).map(serieRow)],\n    ['Ideen',T.filter(hit).map(t=>`<button class=\"ev\" data-open=\"t:${esc(t.id)}\"><span class=\"tm\"><small>Thema</small></span><span class=\"tt\">${esc(t.name)}</span></button>`).concat(E.filter(e=>e.kind==='gedanke'&&hit(e)).map(e=>`<button class=\"ev\" data-open=\"e:${esc(e.id)}\"><span class=\"tm\"><small>Idee</small></span><span><span class=\"tt\">${esc(e.text||e.titel)}</span><span class=\"sm\">${esc(e.thema||'')}</span></span></button>`))],\n    ['Einkauf',E.filter(e=>e.kind==='einkauf'&&hit(e)).map(e=>`<button class=\"ev\" data-open=\"e:${esc(e.id)}\"><span class=\"tm\"><small>${e.done?'gekauft':'offen'}</small></span><span class=\"tt\">${esc(e.titel)}</span></button>`)],\n    ['Pinnwand',E.filter(e=>e.kind==='nachricht'&&hit(e)).map(e=>`<button class=\"ev\" data-open=\"e:${esc(e.id)}\"><span class=\"tm\"><small>${esc(fmtDay(String(e.at||'').slice(0,10)))}</small></span><span class=\"tt\">${esc(e.text||e.titel)}</span></button>`)],\n    ['Familien-Infos',I.filter(hit).map(x=>`<div class=\"info\"><b>${esc(x.titel)}</b><p>${linkify(x.text||'')}</p></div>`)],\n    ['Essen',F.filter(hit).map(f=>`<div class=\"info\">${esc(fmtDay(f.datum))}: ${esc(f.gericht)}</div>`)]];\n  let n=0;for(const [t,l] of groups)if(l.length){n+=l.length;h+=card(t+' ('+l.length+')',l.slice(0,20).join(''))}\n  if(!n)h+='<p class=\"empty\" style=\"padding:0 4px\">Nichts gefunden.</p>';\n  return h;\n}\nfunction pushBox(){\n  const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;\n  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!standalone)return '<p class=\"empty\">Mitteilungen gehen nur, wenn die App \u00fcber Teilen \u203a \u201eZum Home-Bildschirm\u201c hinzugef\u00fcgt und von dort ge\u00f6ffnet wird.</p>';\n  return pushOn?'<p class=\"empty\">Mitteilungen sind an.</p><div class=\"row\" style=\"margin-bottom:10px\"><button class=\"btn sm\" data-a=\"pushtest\">Test senden</button></div>':'<div class=\"row\" style=\"margin:4px 0 10px\"><button class=\"btn sm main\" data-a=\"pushon\">Mitteilungen einschalten</button></div>';\n}\nfunction vMehr(){\n  const p=ME.prefs||{};\n  let h=`<button class=\"link back\" data-go=\"heute\">\u2039 Heute</button>`;\n  h+=card('Mitteilungen',pushBox()+`<form id=\"prefs\"><div class=\"two\"><label class=\"f\">Morgen-\u00dcbersicht Mo\u2013Fr<input type=\"time\" name=\"morgenWerktag\" value=\"${esc(p.morgenWerktag||'06:30')}\"></label><label class=\"f\">Sa und So<input type=\"time\" name=\"morgenWochenende\" value=\"${esc(p.morgenWochenende||'09:00')}\"></label></div><div class=\"two\"><label class=\"f\">Ruhezeit ab<input type=\"time\" name=\"ruheVon\" value=\"${esc(p.ruheVon||'22:00')}\"></label><label class=\"f\">bis<input type=\"time\" name=\"ruheBis\" value=\"${esc(p.ruheBis||'06:30')}\"></label></div><p class=\"meta\" style=\"margin:0 0 10px\">In der Ruhezeit schweigen Pinnwand, Vorschl\u00e4ge und neue Aufgaben. Termine und Aufgaben mit Uhrzeit melden sich trotzdem.</p><div class=\"two\"><label class=\"f\">Wochenvorschau sonntags<input type=\"time\" name=\"woche\" value=\"${esc(p.woche&&p.woche!=='aus'?p.woche:'18:00')}\"${p.woche==='aus'?' disabled':''}></label><label class=\"f\" style=\"align-self:end;display:flex;gap:8px;align-items:center;min-height:44px\"><input type=\"checkbox\" style=\"width:22px;height:22px;flex:0 0 auto;margin:0\" name=\"wocheAus\"${p.woche==='aus'?' checked':''} data-a=\"wocheaus\">keine Wochenvorschau</label></div><button class=\"btn sm main\" type=\"submit\">Zeiten speichern</button></form><div style=\"height:10px\"></div>`);\n  if(canSee('pinnwand'))h+=card('Familien-Infos',`<p class=\"meta\" style=\"margin-top:6px\">Notfallnummern, \u00c4rzte, Schule, Gr\u00f6\u00dfen: alles, was man selten, aber dann schnell braucht.</p><div class=\"row\" style=\"margin-bottom:10px\"><button class=\"btn sm\" data-go=\"infos\">\u00d6ffnen (${I.length})</button></div>`);\n  if(ME.role!=='tablet'&&AREAS.some(([k])=>canWrite(k)))h+=card('Kurzbefehl: Aktionstaste und Siri',`<p class=\"meta\" style=\"margin-top:6px\">Damit sprichst du einen Satz ein, ohne die App zu \u00f6ffnen: Aktionstaste dr\u00fccken oder \u201eHey Siri, merk dir\u201c sagen.</p>${quickLink?`<input class=\"field\" readonly value=\"${esc(quickLink)}\" aria-label=\"Dein pers\u00f6nlicher Link\" style=\"font-size:13px;margin:6px 0\"><div class=\"row\" style=\"margin-bottom:8px\"><button class=\"btn sm\" data-a=\"qcopy\">Link kopieren</button><button class=\"btn sm warn\" data-a=\"qoff\">Link ung\u00fcltig machen</button></div><p class=\"meta\">Den Link nur in deinen eigenen Kurzbefehl einf\u00fcgen, nicht weitergeben. Wer ihn hat, kann in deinem Namen Eintr\u00e4ge anlegen, aber nichts lesen.</p>`:`<div class=\"row\" style=\"margin:6px 0 8px\"><button class=\"btn sm main\" data-a=\"qnew\">${quickExists?'Neuen Link erzeugen':'Pers\u00f6nlichen Link erzeugen'}</button></div>${quickExists?'<p class=\"meta\">Du hast schon einen Link. Ein neuer macht den alten ung\u00fcltig.</p>':''}`}<details${dk('qhelp')}><summary>So richtest du den Kurzbefehl ein</summary><ol class=\"meta\" style=\"padding-left:20px;margin:0 0 10px\"><li>Hast du von einem Familienmitglied einen Kurzbefehl-Link bekommen: \u00f6ffnen, \u201eKurzbefehl hinzuf\u00fcgen\u201c, deinen Link von oben einf\u00fcgen. Fertig.</li><li>Sonst selbst bauen: App \u201eKurzbefehle\u201c \u203a \u201e+\u201c \u203a Name \u201eMerk dir\u201c.</li><li>Aktion \u201eText diktieren\u201c (Sprache Deutsch).</li><li>Aktion \u201eInhalte von URL abrufen\u201c: als URL deinen Link einf\u00fcgen, Methode \u201ePOST\u201c, Anforderungstext \u201eDatei\u201c, als Datei \u201eDiktierter Text\u201c.</li><li>Aktion \u201eErgebnis anzeigen\u201c mit \u201eInhalte von URL\u201c.</li><li>Aktionstaste: iPhone-Einstellungen \u203a Aktionstaste \u203a Kurzbefehl \u203a \u201eMerk dir\u201c.</li><li>Zum Teilen mit der Familie: im Kurzbefehl auf Teilen \u203a \u201eiCloud-Link kopieren\u201c und vorher bei \u201eEinrichtung\u201c die URL als Importfrage markieren.</li></ol></details>`);\n  const myc=colorOf(meId);\n  h+=card('Meine Farbe',`<div class=\"swatches\">${COLORS.map(c=>`<button class=\"sw\" data-a=\"mycolor\" data-c=\"${c}\" style=\"background:${c}\" aria-label=\"Farbe w\u00e4hlen\" aria-pressed=\"${c===myc}\"></button>`).join('')}</div>`);\n  if(isAdmin())h+=vFamilie();\n  const fid=window.PublicKeyCredential?(fidCount?`<p class=\"meta\">Face ID ist eingerichtet. Beim n\u00e4chsten Anmelden einfach \u201eMit Face ID anmelden\u201c tippen.</p><div class=\"row\" style=\"margin-bottom:10px\"><button class=\"btn sm\" data-a=\"fidadd\">F\u00fcr dieses Ger\u00e4t hinzuf\u00fcgen</button><button class=\"btn sm warn\" data-a=\"fiddel\">Face ID entfernen</button></div>`:`<p class=\"meta\">Mit Face ID meldest du dich ohne Passwort an. Es wird kein Gesichtsbild \u00fcbertragen, nur ein Schl\u00fcssel, der auf deinem Ger\u00e4t bleibt.</p><div class=\"row\" style=\"margin-bottom:10px\"><button class=\"btn sm main\" data-a=\"fidadd\">Face ID einrichten</button></div>`):'';\n  h+=card('Konto',`<p class=\"empty\">Angemeldet als ${esc(meName)}</p>${fid}<div class=\"row\" style=\"margin-bottom:12px\"><button class=\"btn sm\" data-a=\"pw\">Passwort \u00e4ndern</button><button class=\"btn sm\" data-a=\"logout\">Abmelden</button></div>`);\n  return h;\n}\nfunction vFamilie(){\n  if(!adminUsers){loadAdmin();return card('Familie','<p class=\"empty\">L\u00e4dt \u2026</p>')}\n  const areaBoxes=(u,role)=>{const pr=u?u.perms:PRESETS[role||'erwachsener'];const r=u?u.role:role;return `<details style=\"margin:4px 0\"${r==='admin'?' hidden':''} data-k=\"permwrap\"${dk('perm'+(u?u.id:'new'))}><summary>Rechte im Detail</summary><div class=\"areas\" data-k=\"perms\">${AREAS.map(([k,l])=>`<label>${l}<select data-area=\"${k}\">${opts(LEVELS,pr[k])}</select></label>`).join('')}</div></details>`};\n  const swatch=(cur)=>`<div class=\"swatches\">${COLORS.map(c=>`<button type=\"button\" class=\"sw\" data-a=\"ucolor\" data-c=\"${c}\" style=\"background:${c}\" aria-label=\"Farbe\" aria-pressed=\"${c===cur}\"></button>`).join('')}</div>`;\n  const roleSel=u=>`<select data-k=\"role\" aria-label=\"Rolle\">${opts(ROLES,u?u.role:'kind')}</select>`;\n  const RL=Object.fromEntries(ROLES);\n  let b=adminUsers.map(u=>`<details class=\"user topic\" data-u=\"${esc(u.id)}\"${dk('u'+u.id)}><summary>${dot(u.id)}${esc(u.name)}${u.id===meId?' (du)':''}<span>${esc(RL[u.role]||'')} \u00b7 ${u.profil?'Profil ohne Anmeldung':u.active?(u.invited?'Einladung offen':'aktiv'):'gesperrt'}</span></summary>${swatch(u.color)}<div class=\"row\" style=\"margin-top:6px\">${roleSel(u)}<label class=\"meta\" style=\"display:flex;gap:6px;align-items:center\"><input type=\"checkbox\" data-k=\"active\"${u.active?' checked':''}>Zugang aktiv</label></div>${areaBoxes(u)}<div class=\"row\"><button class=\"btn sm\" data-a=\"usave\">Speichern</button><button class=\"btn sm\" data-a=\"uinvite\">${u.profil?'Doch mit Anmeldung':u.invited?'Link neu':'Passwort zur\u00fccksetzen'}</button>${u.id===meId?'':'<button class=\"btn sm warn\" data-a=\"udel\">L\u00f6schen</button>'}</div><div data-k=\"link\" style=\"margin-bottom:8px\"></div></details>`).join('');\n  b+=`<details style=\"padding-bottom:6px\"${dk('newu')}><summary>Neues Mitglied einladen</summary><div class=\"user\" id=\"newu\" style=\"border:0\"><div class=\"row\"><input class=\"field\" data-k=\"name\" placeholder=\"Name\" aria-label=\"Name\" style=\"flex:1 1 10em\">${roleSel(null)}</div><label class=\"meta\" style=\"display:flex;gap:8px;align-items:center;margin:8px 0\"><input type=\"checkbox\" data-k=\"profil\">Ohne eigenes Ger\u00e4t (Profil, z. B. f\u00fcr j\u00fcngere Kinder): bekommt Aufgaben, sieht sie auf dem Familien-Tablet</label>${areaBoxes(null,'kind')}<p class=\"meta\">Kinder sehen nur, was ihnen zugewiesen ist oder was sie selbst angelegt haben. Ihre Termine sind Vorschl\u00e4ge, bis ein Erwachsener best\u00e4tigt. \u201eFamilien-Tablet\u201c ist ein gemeinsames Ger\u00e4t in der K\u00fcche: zeigt alle Familienaufgaben, aber keine Erwachsenen-Themen.</p><div class=\"row\"><button class=\"btn sm main\" data-a=\"uadd\">Hinzuf\u00fcgen</button></div><div data-k=\"link\"></div></div></details>`;\n  const fam=`<form id=\"famname\" class=\"row\" style=\"margin:6px 0 10px\"><input class=\"field\" name=\"name\" placeholder=\"z. B. Familie Hitzbleck\" value=\"${esc(FAMILY)}\" aria-label=\"Name der Familie\" style=\"flex:1 1 12em\"><button class=\"btn sm\" type=\"submit\">Speichern</button></form>`;\n  const cr=credInfo?(credInfo.configured?`<p class=\"meta\">iCloud-Zugang: ${esc(credInfo.user)}${credInfo.fromEnv?' (aus Cloudflare)':' (verschl\u00fcsselt gespeichert)'}</p>`:'<p class=\"meta\">Noch kein iCloud-Zugang hinterlegt.</p>'):'';\n  const credForm=`<details${dk('cred')}><summary>${credInfo&&credInfo.configured?'iCloud-Zugang \u00e4ndern':'iCloud-Zugang eintragen'}</summary><form id=\"credf\"><p class=\"meta\">Apple verlangt f\u00fcr fremde Apps ein eigenes Passwort. So geht's: <a href=\"https://account.apple.com\" target=\"_blank\" rel=\"noopener\">account.apple.com</a> \u203a Anmelden und Sicherheit \u203a App-spezifische Passw\u00f6rter \u203a \u201e+\u201c, Name \u201eFamily App\u201c. Das Passwort wird verschl\u00fcsselt gespeichert und nie wieder angezeigt.</p><label class=\"f\">Apple-ID (E-Mail)<input name=\"user\" type=\"email\" autocomplete=\"off\" required></label><label class=\"f\">App-spezifisches Passwort<input name=\"pass\" type=\"password\" autocomplete=\"off\" placeholder=\"xxxx-xxxx-xxxx-xxxx\" required></label><button class=\"btn sm main\" type=\"submit\">Pr\u00fcfen und speichern</button></form></details>`;\n  let c=cr+credForm+(CAL?`<p class=\"empty\">Verbunden mit \u201e${esc(CAL)}\u201c.${XERR?' Lesen gerade nicht m\u00f6glich: '+esc(XERR):''}</p>`:'<p class=\"empty\">Noch kein Kalender verbunden.</p>');\n  if(calList)c+=calList.length?'<div class=\"row\">'+calList.map((x,i)=>`<button class=\"btn sm\" data-a=\"calpick\" data-i=\"${i}\">${esc(x.name)}</button>`).join('')+'</div>':'<p class=\"empty\">Keine Kalender gefunden.</p>';\n  c+=`<div class=\"row\" style=\"margin:8px 0 12px\"><button class=\"btn sm\" data-a=\"calfind\">${CAL?'Anderen w\u00e4hlen':'Kalender suchen'}</button>${CAL?'<button class=\"btn sm\" data-a=\"calsync\">Jetzt abgleichen</button><button class=\"btn sm warn\" data-a=\"caloff\">Trennen</button>':''}</div>`;\n  const bk=`<p class=\"meta\">Jeden Sonntag wird automatisch eine Sicherung angelegt (die letzten 6 bleiben). Zus\u00e4tzlich kannst du eine Datei auf dein Ger\u00e4t laden.</p><div class=\"row\" style=\"margin-bottom:8px\"><a class=\"btn sm\" href=\"/api/admin/export\" download>Sicherung herunterladen</a><label class=\"btn sm\" style=\"cursor:pointer\">Aus Datei wiederherstellen<input type=\"file\" accept=\"application/json,.json\" data-a=\"restorefile\" hidden></label></div>${backups&&backups.length?`<details${dk('bk')}><summary>Automatische Sicherungen (${backups.length})</summary>${backups.map(x=>`<div class=\"row\" style=\"padding:4px 0\"><span style=\"flex:1\">${esc(new Date(x.created).toLocaleString('de-DE',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</span><button class=\"btn sm\" data-a=\"restorebk\" data-id=\"${x.id}\">Wiederherstellen</button></div>`).join('')}</details>`:''}`;\n  return card('Familie',fam+b)+card('iPhone-Kalender',c)+card('Datensicherung',bk);\n}\nconst VIEWS={pinnwand:['Pinnwand',vPinnwand,'pinnwand'],wand:['Wand',vWand,null],infos:['Familien-Infos',vInfos,'pinnwand'],suche:['Suche',vSuche,null],heute:['Heute',vHeute,null],kalender:['Kalender',vKalender,'termine'],einkauf:['Einkauf',vEinkauf,'einkauf|essen'],ideen:['Ideen',vIdeen,'themen'],aufgaben:['Aufgaben',vAufgaben,'aufgaben'],mehr:['Einstellungen',vMehr,null]};\nlet TABS=['heute','kalender','einkauf','ideen'];\nconst allowedView=v=>{const a=VIEWS[v]&&VIEWS[v][2];return !!VIEWS[v]&&(!a||a.split('|').some(canSee))};\nfunction renderBar(){\n  $('#bar').innerHTML=TABS.filter(allowedView).map(v=>`<button class=\"tab\" role=\"tab\" data-v=\"${v}\" aria-selected=\"${v===view}\"><i>${ICON[v]}<b data-badge=\"${v}\" hidden></b></i>${VIEWS[v][0]}</button>`).join('');\n}\nfunction renderHead(){\n  const t=t0();$('#hdate').textContent=fmtLong(t);\n  const h=new Date().getHours();$('#hello').textContent=ME.role==='tablet'?(FAMILY||'Unsere Familie'):(h<11?'Guten Morgen':h<18?'Hallo':'Guten Abend')+', '+meName;$('#hdate').textContent=fmtLong(t)+(FAMILY&&ME.role!=='tablet'?' \u00b7 '+FAMILY:'');\n  const c=[];\n  if(canSee('termine'))c.push(['kalender',eventsOn(t).length,'Termine heute',false]);\n  if(canSee('aufgaben')){const n=dueTasks().length+S.filter(serieDue).length;c.push(['aufgaben',n,'zu erledigen',dueTasks().some(e=>e.faellig&&e.faellig<t)])}\n  if(canSee('einkauf'))c.push(['einkauf',buyList().length,'Einkauf',false]);\n  $('#counts').innerHTML=c.map(([v,n,l,hot])=>`<button class=\"count${hot?' hot':''}\" data-go=\"${v}\"><b>${n}</b><span>${l}</span></button>`).join('');\n  $('#counts').hidden=!c.length;\n  const bd={heute:unreadPins().length+proposals().length,ideen:inbox().length+dueTopics().length};\n  document.querySelectorAll('[data-badge]').forEach(b=>{const n=bd[b.dataset.badge]||0;b.textContent=n;b.hidden=!n});\n}\nlet renderTO=null,booting=false;\n// Ungespeicherte Eingaben in der Mitgliederverwaltung \u00fcberstehen das automatische Neuzeichnen\nfunction snapForms(){const m=[];document.querySelectorAll('#p [data-u],#p #newu').forEach(box=>{const id=box.dataset.u||'newu';\n  box.querySelectorAll('select,input').forEach(el=>{const k=el.dataset.area?'a:'+el.dataset.area:el.dataset.k?'k:'+el.dataset.k:null;if(!k||el.type==='file')return;m.push([id,k,el.type==='checkbox'?el.checked:el.value])});\n  const sw=box.querySelector('.sw[aria-pressed=true]');if(sw)m.push([id,'sw',sw.dataset.c])});return m}\nfunction restoreForms(m){for(const [id,k,v] of m){const box=id==='newu'?document.getElementById('newu'):document.querySelector('#p [data-u=\"'+CSS.escape(id)+'\"]');if(!box)continue;\n  if(k==='sw'){box.querySelectorAll('.sw').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.c===v)));continue}\n  const el=box.querySelector(k.startsWith('a:')?'[data-area=\"'+k.slice(2)+'\"]':'[data-k=\"'+k.slice(2)+'\"]');if(!el)continue;\n  if(el.type==='checkbox')el.checked=v;else el.value=v;if(k==='k:role'){const pa=box.querySelector('[data-k=permwrap]');if(pa)pa.hidden=v==='admin'}}}\nfunction render(){\n  if(!ME||booting)return;\n  if(!allowedView(view))view=TABS[0];\n  renderHead();\n  $('#fab').hidden=view==='mehr'||!AREAS.some(([k])=>canWrite(k));\n  document.querySelectorAll('.tab').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.v===view||(view==='aufgaben'&&x.dataset.v===TABS[0]))));\n  const a=document.activeElement;\n  const keep=a&&['q','buyIn','sq'].includes(a.id)?a.id:null;\n  if(!keep&&a&&a.closest&&a.closest('#p')&&a.matches('input,select,textarea')&&a.type!=='checkbox')return;\n  const val=keep?a.value:'';\n  const forms=view==='mehr'?snapForms():null;\n  $('#p').innerHTML=VIEWS[view][1]();\n  if(forms)restoreForms(forms);\n  if(keep){const i=document.getElementById(keep);if(i){i.value=val;i.focus();try{i.setSelectionRange(val.length,val.length)}catch(e){}}}\n}\nfunction go(v,s){view=v;sub=s||'';if(sub==='essen')openD.add('essen');try{localStorage.setItem('fa-view',TABS.includes(v)?v:'heute')}catch(e){}render();window.scrollTo(0,0);if(s==='essen')setTimeout(()=>{const x=$('#essen');if(x)x.scrollIntoView({behavior:'smooth'})},50)}\n\n/* ---------- Toast mit R\u00fcckg\u00e4ngig ---------- */\nlet tt=null,undoFn=null;\nfunction toast(lines,undo,ms){\n  undoFn=undo||null;\n  const li=l=>typeof l==='string'?'<li>'+esc(l)+'</li>':`<li>${l.open?`<button class=\"tl\" data-x=\"open\" data-open=\"${esc(l.open)}\">${esc(l.text)} \u203a</button>`:esc(l.text)}${l.ask?`<br><button class=\"btn sm\" data-x=\"ask\" data-ask=\"${esc(JSON.stringify(l.ask))}\" style=\"margin-top:4px\">${l.ask.is==='termin'?'Doch als Aufgabe':'Doch als Termin im Kalender'}</button>`:''}</li>`;\n  $('#toastRoot').innerHTML=`<div class=\"toast\"><ul>${(Array.isArray(lines)?lines:[lines]).map(li).join('')}</ul>${undo?'<button class=\"btn sm\" data-x=\"undo\">R\u00fcckg\u00e4ngig</button>':''}<button class=\"x\" data-x=\"close\" aria-label=\"Schlie\u00dfen\" style=\"color:#bcd8f0\">\u00d7</button></div>`;\n  clearTimeout(tt);tt=setTimeout(()=>{$('#toastRoot').innerHTML='';undoFn=null},ms||(undo?6000:5000));\n}\n$('#toastRoot').addEventListener('click',async ev=>{const b=ev.target.closest('[data-x]');if(!b)return;\n  if(b.dataset.x==='open'){openItem(b.dataset.open);return}\n  if(b.dataset.x==='ask'){const a=JSON.parse(b.dataset.ask);$('#toastRoot').innerHTML='';undoFn=null;try{await switchSeries(a)}catch(e){toast(e.message)}return}\n  const f=undoFn;undoFn=null;$('#toastRoot').innerHTML='';if(b.dataset.x==='undo'&&f){try{await f()}catch(e){}}});\nasync function switchSeries(a){\n  if(a.is==='termin'){const e=E.find(x=>x.id===a.id);if(!e)return;const id=uid();\n    await put('serien',id,{titel:e.titel,text:e.text,rhythmus:e.wdh==='zweiwoechentlich'?'woechentlich':(e.wdh||'woechentlich'),next:String(e.start).slice(0,10),art:'sonstiges',vorlauf:0,fuer:e.fuer||'wir',zeit:hm(e.start),at:new Date().toISOString()});\n    await del('eintraege',e.id);toast({text:'Jetzt eine wiederkehrende Aufgabe: '+e.titel,open:'s:'+id});return}\n  const s=S.find(x=>x.id===a.id);if(!s)return;const id=uid();\n  await put('eintraege',id,{kind:'termin',titel:s.titel,text:s.text||s.titel,start:s.next+(isTime(s.zeit)?'T'+s.zeit:''),ganztags:!isTime(s.zeit),wdh:s.rhythmus,fuer:s.fuer||'wir',sicht:'familie',vorschlag:!isAdult()||undefined,at:new Date().toISOString()});\n  await del('serien',s.id);toast({text:'Jetzt ein Serientermin im Kalender: '+s.titel,open:'e:'+id});\n}\n\n/* ---------- Fenster (Erfassen, Bearbeiten) ---------- */\nfunction sheet(html){$('#sheetRoot').innerHTML=`<div class=\"shade\" id=\"shade\"><div class=\"sheet\" role=\"dialog\" aria-modal=\"true\">${html}</div></div>`;document.body.style.overflow='hidden'}\nfunction closeSheet(){if(rec){try{rec.stop()}catch(e){}rec=null}$('#sheetRoot').innerHTML='';document.body.style.overflow=''}\n$('#sheetRoot').addEventListener('click',ev=>{if(ev.target.id==='shade'||ev.target.closest('[data-close]'))closeSheet()});\ndocument.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&$('#shade'))closeSheet()});\nconst SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null;\n// Aufnahme: Mikrofon wird einmal freigegeben und bleibt (stummgeschaltet) bis zum Schlie\u00dfen der App offen,\n// damit iOS nicht bei jedem Sprechen neu fragt. Text kommt vom Server (Whisper).\nconst CAN_REC=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder);\nconst MIC=CAN_REC||!!SR;\nconst Voice={stream:null,mr:null,chunks:[],\n  async start(){let fresh=false;\n    if(!(this.stream&&this.stream.getAudioTracks().some(t=>t.readyState==='live'))){this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});fresh=true}\n    this.stream.getAudioTracks().forEach(t=>t.enabled=true);\n    const mt=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(m=>MediaRecorder.isTypeSupported(m));\n    this.chunks=[];const mr=this.mr=new MediaRecorder(this.stream,mt?{mimeType:mt}:{});\n    mr.ondataavailable=e=>{if(e.data&&e.data.size)this.chunks.push(e.data)};mr.start();return {fresh}},\n  mute(){if(this.stream)this.stream.getAudioTracks().forEach(t=>t.enabled=false)},\n  cancel(){const mr=this.mr;this.mr=null;this.mute();if(mr&&mr.state!=='inactive'){mr.onstop=null;try{mr.stop()}catch(e){}}},\n  stop(){return new Promise((res,rej)=>{const mr=this.mr;if(!mr||mr.state==='inactive'){res('');return}\n    mr.onstop=async()=>{this.mute();this.mr=null;const blob=new Blob(this.chunks,{type:mr.mimeType||'audio/mp4'});this.chunks=[];if(blob.size<1500){res('');return}\n      try{const buf=new Uint8Array(await blob.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));\n        const r=await api('/api/transcribe',{audio:btoa(bin),mime:blob.type});res(String(r&&r.text||'').trim())}catch(e){rej(e)}};\n    try{mr.stop()}catch(e){rej(e)}})}};\nwindow.addEventListener('pagehide',()=>{try{Voice.cancel();if(Voice.stream)Voice.stream.getTracks().forEach(t=>t.stop())}catch(e){}});\nfunction openCapture(pre){\n  let draft=typeof pre==='string'?pre:LS.get('fa-draft','');if(typeof draft!=='string'||/^\\[object /.test(draft)){draft='';LS.set('fa-draft','')}\n  sheet(`<h2>Was gibt es?<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2><form id=\"cap\"><textarea id=\"t\" placeholder=\"Zahnarzt Dienstag 15 Uhr. Milch und Brot. Conny muss den T\u00dcV machen.\" aria-label=\"Neuer Eintrag\" enterkeyhint=\"send\">${esc(draft)}</textarea><div class=\"row\" style=\"margin-top:10px\">${MIC?`<button class=\"mic\" type=\"button\" id=\"mic\" aria-label=\"Sprechen\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" aria-hidden=\"true\"><rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v3\"/></svg></button>`:''}<span class=\"hint\" id=\"st\">${MIC?'Tipp: Den runden Mikrofon-Knopf gedr\u00fcckt halten startet die Aufnahme sofort.':'Tipp: Mikrofon der Tastatur antippen und sprechen.'}</span><button class=\"btn main\" id=\"go\" type=\"submit\">Merken</button></div></form>`);\n  const t=$('#t');setTimeout(()=>{t.focus();t.setSelectionRange(t.value.length,t.value.length)},60);\n  t.addEventListener('input',()=>LS.set('fa-draft',t.value));\n  t.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();$('#cap').requestSubmit()}});\n  if(CAN_REC)$('#mic').addEventListener('click',async()=>{\n    const m=$('#mic'),st=$('#st');\n    if(Voice.mr){m.classList.remove('on');st.textContent='Wird umgesetzt \u2026';try{const x=await Voice.stop();const tt=$('#t');if(!tt)return;if(x){tt.value=(tt.value?tt.value.replace(/\\s*$/,' '):'')+x;LS.set('fa-draft',tt.value);$('#st').textContent='Fertig? Dann \u201eMerken\u201c.'}else $('#st').textContent='Nichts verstanden \u2013 nochmal versuchen.'}catch(e){const s2=$('#st');if(s2)s2.textContent='Das Umwandeln hat nicht geklappt. Tippe oder nutze das Mikrofon der Tastatur.'}return}\n    try{const r=await Voice.start();m.classList.add('on');st.textContent=r.fresh?'Ich h\u00f6re zu \u2026 tippe nochmal zum Beenden':'Ich h\u00f6re zu \u2026 tippe nochmal zum Beenden'}catch(e){st.textContent='Mikrofon nicht erlaubt. Nutze das Mikrofon der Tastatur.'}\n  });\n  else if(SR)$('#mic').addEventListener('click',()=>{\n    if(rec){rec.stop();return}\n    rec=new SR();rec.lang='de-DE';rec.interimResults=true;rec.continuous=false;const base=t.value?t.value.replace(/\\s*$/,' '):'';\n    rec.onresult=e=>{let s='';for(const r of e.results)s+=r[0].transcript;t.value=base+s;LS.set('fa-draft',t.value)};\n    rec.onend=()=>{rec=null;const m=$('#mic');if(m)m.classList.remove('on');const st=$('#st');if(st)st.textContent='Fertig? Dann \u201eMerken\u201c.'};\n    rec.onerror=()=>{const st=$('#st');if(st)st.textContent='Sprechen geht hier nicht. Nutze das Mikrofon der Tastatur.'};\n    $('#mic').classList.add('on');$('#st').textContent='Ich h\u00f6re zu \u2026';try{rec.start()}catch(e){rec=null}\n  });\n  $('#cap').addEventListener('submit',async ev=>{\n    ev.preventDefault();if(rec){try{rec.stop()}catch(e){}}if(Voice.mr)Voice.cancel();const text=t.value.trim();if(!text)return;\n    const g=$('#go');g.disabled=true;$('#st').textContent='Sortiere \u2026';\n    try{await capture(text);LS.set('fa-draft','');closeSheet()}\n    catch(err){$('#st').textContent='Nicht gespeichert: '+(err&&err.message||'Fehler');g.disabled=false}\n  });\n}\nfunction openItem(key){\n  const k=key.slice(0,1);let id=key.slice(2),occ='';if(id.includes('@')){occ=id.split('@')[1];id=id.split('@')[0]}\n  if(k==='x'){const x=X.find(y=>y.id===id);if(!x)return;\n    sheet(`<h2>${esc(x.titel)}<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2><p>${esc(relDay(x.start))}, ${esc(fmtLong(x.start.slice(0,10)))}${x.ganztags?' \u00b7 ganzt\u00e4gig':' \u00b7 '+esc(hm(x.start))+(hm(x.ende)?'\u2013'+esc(hm(x.ende)):'')+' Uhr'}</p>${x.ort?`<p class=\"meta\">${esc(x.ort)}</p>`:''}<p class=\"meta\">Aus dem iPhone-Kalender \u201e${esc(CAL||'')}\u201c. \u00c4ndern bitte direkt im Kalender.</p>`);return}\n  if(k==='t'){closeSheet();openTopics.add(id);go('ideen');return}\n  if(k==='s'){const s=S.find(y=>y.id===id);if(!s)return;const w=canWrite('aufgaben');\n    sheet(`<h2>${esc(s.titel)}<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2><form id=\"ed\" data-s=\"${esc(s.id)}\"><label class=\"f\">Titel<input name=\"titel\" value=\"${esc(s.titel)}\"${w?'':' disabled'}></label><div class=\"two\"><label class=\"f\">Wie oft<select name=\"rhythmus\"${w?'':' disabled'}>${opts([['woechentlich','Jede Woche'],['monatlich','Jeden Monat'],['jaehrlich','Jedes Jahr']],s.rhythmus)}</select></label><label class=\"f\">N\u00e4chstes Mal<input type=\"date\" name=\"next\" value=\"${esc(s.next||'')}\"${w?'':' disabled'}></label></div>${w?'<div class=\"row\"><button class=\"btn main\" type=\"submit\">Speichern</button><button class=\"btn warn\" type=\"button\" data-a=\"sdel\">L\u00f6schen</button></div>':''}</form>`);return}\n  const e=E.find(y=>y.id===id);if(!e)return;\n  const area=KIND_AREA[e.kind]||'themen';const w=fullEdit(e,area);const dis=w?'':' disabled';\n  const KINDS=[['termin','Termin'],['aufgabe','Aufgabe'],['einkauf','Einkauf'],['gedanke','Idee'],['nachricht','Pinnwand']].filter(([k])=>k===e.kind||canWrite(KIND_AREA[k]));\n  let f=w&&!e.vorschlag&&e.kind!=='eingang'?`<label class=\"f\">Art<select name=\"kind\" data-a=\"convert\">${opts(KINDS,e.kind)}</select></label>`:'';\n  f+=`<label class=\"f\">Titel<input name=\"titel\" value=\"${esc(e.titel||'')}\"${dis}></label>`;\n  if(e.kind==='termin'){const d=String(e.start||'').slice(0,10),z=hm(e.start);\n    f+=`<div class=\"two\"><label class=\"f\">Datum<input type=\"date\" name=\"d\" value=\"${esc(d)}\"${dis}></label><label class=\"f\">Uhrzeit (leer = ganztags)<input type=\"time\" name=\"z\" value=\"${esc(z)}\"${dis}></label></div><div class=\"two\"><label class=\"f\">Wiederholen<select name=\"wdh\"${dis}>${opts(WDH,e.wdh||'')}</select></label><label class=\"f\">bis (optional)<input type=\"date\" name=\"wdhBis\" value=\"${esc(e.wdhBis||'')}\"${dis}></label></div>${occ&&w&&e.wdh?`<p class=\"meta\" style=\"margin:0 0 10px\">Ge\u00f6ffnet am ${esc(fmtLong(occ))}. <button class=\"link\" type=\"button\" data-a=\"skip\" data-occ=\"${esc(occ)}\" style=\"min-height:0;padding:0\">Nur diesen Termin absagen</button></p>`:''}<label class=\"f\">Erinnerung<select name=\"erinnerung\"${dis}>${opts(REMIND,e.erinnerung===undefined||e.erinnerung===''?'60':e.erinnerung)}</select></label><div class=\"two\"><label class=\"f\">F\u00fcr<select name=\"fuer\"${dis}>${fuerOpts(fuerKey(e))}</select></label><label class=\"f\">Sichtbar<select name=\"sicht\"${dis}>${sichtOpts(e.sicht)}</select></label></div>`}\n  if(e.kind==='aufgabe')f+=`<div class=\"two\"><label class=\"f\">F\u00e4llig am<input type=\"date\" name=\"faellig\" value=\"${esc(e.faellig||'')}\"${dis}></label><label class=\"f\">Uhrzeit (dann klingelt es)<input type=\"time\" name=\"zeit\" value=\"${esc(e.zeit||'')}\"${dis}></label></div><div class=\"two\"><label class=\"f\">F\u00fcr<select name=\"fuer\"${dis}>${fuerOpts(fuerKey(e))}</select></label><label class=\"f\">Sichtbar<select name=\"sicht\"${dis}>${sichtOpts(e.sicht)}</select></label></div>`;\n  if(e.kind==='gedanke'){const names=[...new Set(T.map(t=>t.name).concat(e.thema?[e.thema]:[]))];f+=`<label class=\"f\">Thema<input name=\"thema\" list=\"themes\" value=\"${esc(e.thema||'')}\"${dis}><datalist id=\"themes\">${names.map(n=>`<option value=\"${esc(n)}\">`).join('')}</datalist></label>`}\n  if(e.kind==='einkauf'&&((e.quellen&&e.quellen.length)||(e.rezepte&&e.rezepte.length)))f+=`<div class=\"f\">Gebraucht f\u00fcr<div style=\"font-weight:400;color:var(--ink)\">${esc((e.quellen||[]).join(', '))}</div>${(e.rezepte||[]).map(r=>recipeLink({url:r.url,titel:r.name,quelle:(()=>{try{return new URL(r.url).hostname.replace(/^www\\./,'')}catch(x){return''}})()})).join('')}</div>`;\n  if(e.kind==='einkauf'&&Ls.length)f+=`<label class=\"f\">Liste<select name=\"liste\"${dis}>${opts([['','Einkauf']].concat(Ls.map(l=>[l.id,l.name])),listOf(e.liste||'')?e.liste:'')}</select></label>`;\n  if(e.kind==='einkauf')f+=`<div class=\"two\"><label class=\"f\">Menge<input name=\"menge\" value=\"${esc(e.menge||'')}\" placeholder=\"z. B. 2 Liter\"${dis}></label><label class=\"f\">Abteilung<select name=\"kat\"${dis}>${opts(KAT_ORDER.map(x=>[x,x]),e.kat||katOf(e.titel))}</select></label></div>`;\n  f+=`<label class=\"f\">Notiz<input name=\"text\" value=\"${esc(e.text&&e.text!==e.titel?e.text:'')}\"${dis}></label>`;\n  const meta=[e.by?'Notiert von '+who(e.by):'',e.kind==='termin'&&!e.vorschlag&&CAL&&e.sicht!=='privat'?(e.kalender&&!e.calErr?'steht im iPhone-Kalender':e.calErr?'Kalender-Fehler, wird erneut versucht':'wird in den Kalender eingetragen'):''].filter(Boolean).join(' \u00b7 ');\n  let acts='';\n  if(e.vorschlag&&isAdult()&&lvl('termine')==='edit')acts=`<button class=\"btn main\" type=\"button\" data-a=\"approve\">Best\u00e4tigen</button><button class=\"btn warn\" type=\"button\" data-a=\"del\">Ablehnen</button>`;\n  else if(w)acts=`<button class=\"btn main\" type=\"submit\">Speichern</button><button class=\"btn warn\" type=\"button\" data-a=\"del\">L\u00f6schen</button>`;\n  const notes=e.notizen||[];const canC=w||String(e.fuer||'')===meId||e.by===meId;\n  const cm=['termin','aufgabe','einkauf','gedanke','nachricht'].includes(e.kind)?`<div style=\"margin-top:14px\"><p class=\"day\">Kommentare${notes.length?' ('+notes.length+')':''}</p>${notes.map(n=>`<div class=\"cmt\">${esc(n.text)}<small>${esc(who(n.by)||'')} \u00b7 ${esc(new Date(n.at).toLocaleString('de-DE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</small></div>`).join('')}${canC?`<form id=\"cmtf\" data-e=\"${esc(e.id)}\" class=\"add\" style=\"margin-top:8px\"><input class=\"field\" name=\"c\" placeholder=\"z. B. Hab angerufen, R\u00fcckruf Montag\" aria-label=\"Kommentar\" autocomplete=\"off\"><button class=\"btn sm main\" type=\"submit\">Senden</button></form>`:''}</div>`:'';\n  sheet(`<h2>${esc({termin:e.vorschlag?'Termin-Vorschlag':'Termin',aufgabe:'Aufgabe',einkauf:'Einkauf',nachricht:'Pinnwand',gedanke:'Idee',eingang:'Notiz'}[e.kind]||'Eintrag')}<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2><form id=\"ed\" data-e=\"${esc(e.id)}\">${f}${meta?`<p class=\"meta\" style=\"margin:0 0 10px\">${esc(meta)}</p>`:''}<div class=\"row\">${acts}</div></form>${cm}`);\n}\n$('#sheetRoot').addEventListener('submit',async ev=>{\n  const fm0=ev.target;\n  if(fm0.id==='tdue'){ev.preventDefault();const d=new FormData(fm0).get('due');if(isDate(d)){closeSheet();await upd('themen',fm0.dataset.t,{due:d,done:false});toast('Meldet sich am '+fmtDay(d)+'.')}return}\n  if(fm0.id==='tedit'){ev.preventDefault();const fd=Object.fromEntries(new FormData(fm0));const t=T.find(x=>x.id===fm0.dataset.t);if(!t)return;const name=String(fd.name||'').trim().slice(0,60)||t.name;closeSheet();\n    await upd('themen',t.id,{name,due:isDate(fd.due)?fd.due:t.due,sicht:fd.sicht});\n    for(const e of themeEntries(t.name))if(e.by===meId||isAdult())await upd('eintraege',e.id,{thema:name,sicht:fd.sicht});\n    toast('Gespeichert.');return}\n  if(fm0.id==='rezf'){ev.preventDefault();return saveRecipe(fm0)}\n  if(fm0.id==='zutf'){ev.preventDefault();return saveZutaten(fm0)}\n  if(fm0.id==='newf'){ev.preventDefault();return saveNew(fm0)}\n  if(fm0.id==='pinf'){ev.preventDefault();const t=String(new FormData(fm0).get('t')||'').trim().slice(0,500);if(!t)return;closeSheet();\n    await put('eintraege',uid(),{kind:'nachricht',titel:t.slice(0,60),text:t,by:meId,at:new Date().toISOString(),done:false,readBy:[meId],sicht:'familie'});toast('Angepinnt. Die anderen bekommen eine Mitteilung.');return}\n  if(fm0.id==='listf'){ev.preventDefault();const fd=Object.fromEntries(new FormData(fm0));const name=String(fd.name||'').trim().slice(0,40);if(!name)return;const id=fm0.dataset.l||('l-'+uid().slice(2));closeSheet();\n    const tag=fd.typ!=='liste'&&/^[0-6]$/.test(fd.tag||'')?Number(fd.tag):'';\n    if(fm0.dataset.l)await upd('listen',id,{name,typ:fd.typ==='liste'?'liste':'einkauf',tag});else{await put('listen',id,{name,typ:fd.typ==='liste'?'liste':'einkauf',tag,at:new Date().toISOString()});curList=id;LS.set('fa-list',id)}render();return}\n  if(fm0.id==='infof'){ev.preventDefault();return saveInfo(fm0)}\n  if(fm0.id==='cmtf'){ev.preventDefault();return addComment(fm0)}\n  if(ev.target.id!=='ed')return;ev.preventDefault();const fm=ev.target;const fd=Object.fromEntries(new FormData(fm));\n  try{\n    if(fm.dataset.s){const ch={titel:String(fd.titel||'').trim().slice(0,120),rhythmus:fd.rhythmus,next:isDate(fd.next)?fd.next:undefined};Object.keys(ch).forEach(k=>ch[k]===undefined&&delete ch[k]);closeSheet();await upd('serien',fm.dataset.s,ch);return}\n    const e=E.find(y=>y.id===fm.dataset.e);if(!e)return;\n    const ch={titel:String(fd.titel||e.titel).trim().slice(0,120)||e.titel,text:String(fd.text||'').trim().slice(0,1000)||String(fd.titel||e.titel)};\n    if(e.kind==='termin'){if(!isDate(fd.d)){toast('Bitte ein Datum w\u00e4hlen.');return}Object.assign(ch,{start:isTime(fd.z)?fd.d+'T'+fd.z:fd.d,ganztags:!isTime(fd.z),erinnerung:fd.erinnerung==='aus'?'aus':Number(fd.erinnerung),fuer:fd.fuer,sicht:fd.sicht,wdh:WDHL[fd.wdh]?fd.wdh:'',wdhBis:WDHL[fd.wdh]&&isDate(fd.wdhBis)?fd.wdhBis:''});if(ch.start!==e.start)ch.ende=''}\n    if(e.kind==='aufgabe')Object.assign(ch,{faellig:isDate(fd.faellig)?fd.faellig:'',zeit:isDate(fd.faellig)&&isTime(fd.zeit)?fd.zeit:'',fuer:fd.fuer,sicht:fd.sicht});\n    if(e.kind==='einkauf')Object.assign(ch,{menge:String(fd.menge||'').trim().slice(0,40),kat:KAT_ORDER.includes(fd.kat)?fd.kat:''},'liste'in fd?{liste:listOf(fd.liste)?fd.liste:''}:{});\n    if(e.kind==='gedanke'){const name=String(fd.thema||'').trim().slice(0,60)||'Allgemein';ch.thema=await ensureTheme(name,e.sicht)}\n    closeSheet();await upd('eintraege',e.id,ch);toast('Gespeichert.');\n  }catch(err){toast(err.message||'Speichern hat nicht geklappt.')}\n});\nasync function addComment(fm){\n  const e=E.find(y=>y.id===fm.dataset.e);const text=String(new FormData(fm).get('c')||'').trim().slice(0,500);if(!e||!text)return;\n  try{await upd('eintraege',e.id,{notizen:(e.notizen||[]).concat({by:meId,at:new Date().toISOString(),text})});openItem('e:'+e.id)}catch(err){toast(err.message)}\n}\nlet sureKey='',sureAt=0;\nfunction sure(btn,key,label){if(sureKey===key&&Date.now()-sureAt<8000){sureKey='';return true}sureKey=key;sureAt=Date.now();btn.textContent=label;return false}\nasync function deleteTheme(t){\n  for(const e of themeEntries(t.name))if(fullEdit(e,'themen'))await del('eintraege',e.id);\n  await del('themen',t.id);\n}\nasync function ensureTheme(name,sicht){\n  const ex=T.find(t=>t.name.toLowerCase()===name.toLowerCase());\n  if(ex){if(ex.done)await upd('themen',ex.id,{done:false,due:addDays(today(),7)});return ex.name}\n  await put('themen',slug(name)||uid(),{name,due:addDays(today(),7),done:false,at:new Date().toISOString(),by:meId,sicht:sicht||(isAdult()?'erwachsene':'familie')});return name;\n}\nasync function convert(e,k){\n  if(e.kind===k)return;\n  const d=String(e.start||'').slice(0,10)||e.faellig||'';\n  const ch={kind:k};\n  if(k==='termin')Object.assign(ch,{start:d||addDays(today(),1),ganztags:true,done:false,vorschlag:!isAdult()||undefined,fuer:e.fuer||'wir'});\n  if(k==='aufgabe')Object.assign(ch,{faellig:d,zeit:hm(e.start)||'',done:false,fuer:e.fuer||'wir'});\n  if(k==='einkauf')Object.assign(ch,{done:false,kat:katOf(e.titel)});\n  if(k==='gedanke')Object.assign(ch,{thema:await ensureTheme(T[0]?T[0].name:'Allgemein'),sicht:isAdult()?'erwachsene':'familie'});\n  if(k==='nachricht')Object.assign(ch,{done:false,readBy:[meId],text:e.text||e.titel});\n  await upd('eintraege',e.id,ch);\n}\n$('#sheetRoot').addEventListener('input',ev=>{if(ev.target.dataset.a==='persons')scaleZutaten()});\n$('#sheetRoot').addEventListener('change',async ev=>{\n  const el=ev.target;if(el.dataset.a!=='convert')return;\n  const e=E.find(y=>y.id===el.closest('form').dataset.e);if(!e)return;\n  try{await convert(e,el.value);toast('Umgewandelt in: '+el.options[el.selectedIndex].text+'. Bitte pr\u00fcfen.');openItem('e:'+e.id)}catch(err){toast(err.message)}\n});\n$('#sheetRoot').addEventListener('click',async ev=>{\n  const b=ev.target.closest('button[data-a]');if(!b)return;const fm=b.closest('form');\n  if(b.dataset.a==='rezept2'){const d=$('#zutf').dataset.d;openRecipe(d);return}\n  if(b.dataset.a==='rezdel'){const d=fm.dataset.d;closeSheet();await upd('essen','d-'+d,{rezept:null});return}\n  if(b.dataset.a==='tl'){const id=b.closest('[data-t]').dataset.t;const n=b.dataset.n;const d=n==='m1'?addMonths(today(),1):n==='m3'?addMonths(today(),3):addDays(today(),7);closeSheet();await upd('themen',id,{due:d,done:false});toast('Meldet sich am '+fmtDay(d)+'.');return}\n  if(b.dataset.a==='tdelsheet'){const t=T.find(x=>x.id===fm.dataset.t);if(!t)return;if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent='Mit allen Gedanken l\u00f6schen?';return}closeSheet();await deleteTheme(t);toast('Gel\u00f6scht: '+t.name);return}\n  if(b.dataset.a==='listdel'){const id=fm.dataset.l;if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent='Wirklich? Alle Eintr\u00e4ge darin auch';return}closeSheet();for(const e of E.filter(e=>e.kind==='einkauf'&&e.liste===id))await del('eintraege',e.id);await del('listen',id);curList='';LS.set('fa-list','');render();return}\n  if(b.dataset.a==='infodel'){const id=fm.dataset.i;if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent='Wirklich l\u00f6schen?';return}closeSheet();await del('infos',id);return}\n  if(b.dataset.a==='startcap'){closeSheet();LS.set('fa-intro-'+meId,1);openCapture();return}\n  if(b.dataset.a==='introdone'){closeSheet();LS.set('fa-intro-'+meId,1);return}\n  if(b.dataset.a==='intropush'){await enablePush();showIntro();return}\n  if(!fm)return;\n  try{\n    if(b.dataset.a==='sdel'){if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent='Wirklich l\u00f6schen?';return}closeSheet();await del('serien',fm.dataset.s);return}\n    const e=E.find(y=>y.id===fm.dataset.e);if(!e)return;\n    if(b.dataset.a==='skip'){closeSheet();const ax=Array.from(new Set((e.ausnahmen||[]).concat(b.dataset.occ)));await upd('eintraege',e.id,{ausnahmen:ax});toast('Abgesagt am '+fmtDay(b.dataset.occ)+'.',()=>upd('eintraege',e.id,{ausnahmen:e.ausnahmen||[]}));return}\n    if(b.dataset.a==='approve'){closeSheet();await upd('eintraege',e.id,{vorschlag:false});toast('Best\u00e4tigt. Der Termin geht jetzt in den Kalender.');return}\n    if(b.dataset.a==='del'){closeSheet();const copy=Object.assign({},e);delete copy.id;await del('eintraege',e.id);toast((e.vorschlag?'Abgelehnt: ':'Gel\u00f6scht: ')+e.titel,async()=>{const {kalender,calUid,calUrl,calSig,calErr,...rest}=copy;await put('eintraege',e.id,rest)})}\n  }catch(err){toast(err.message||'Das hat nicht geklappt.')}\n});\n\n/* ---------- Erfassen (sortiert auf dem Server) ---------- */\nasync function capture(text){\n  let r;\n  try{r=await api('/api/capture',{text})}\n  catch(e){\n    if(e.status)throw e;\n    const id=uid();await put('eintraege',id,{kind:'eingang',titel:text.slice(0,120),text,by:meId,at:new Date().toISOString()});\n    toast('Offline gespeichert. Die Notiz liegt im Eingang unter \u201eIdeen\u201c und wird sortiert, sobald wieder Netz da ist.');return;\n  }\n  await pull();\n  const lines=r.lines.map(l=>{const a=(r.ask||[]).find(x=>l.open&&l.open.slice(2)===x.id);return a?Object.assign({},l,{ask:a}):l});\n  toast(lines,r.undo&&r.undo.length?async()=>{for(const x of r.undo){try{await del(x[0],x[1])}catch(e){}}}:null,r.ask&&r.ask.length?14000:9000);\n}\nconst PANTRY=/^(salz|pfeffer|\u00f6l|oliven\u00f6l|raps\u00f6l|mehl|zucker|wasser|gew\u00fcrz|paprikapulver|muskat|oregano|basilikum, getrocknet|br\u00fche, instant)/i;\nasync function addZutaten(d){\n  const f=F.find(x=>x.datum===d);if(!f||!f.gericht)return;\n  const r=f.rezept;let zs=[],fromRecipe=false;\n  if(r&&r.zutaten&&r.zutaten.length){fromRecipe=true;zs=r.zutaten.map(z=>{const sp=splitItem(z);return{name:sp.name.split(/,|\\(/)[0].trim(),qty:sp.qty,raw:z}}).filter(z=>z.name)}\n  else{\n    toast('Suche Zutaten f\u00fcr '+f.gericht+' \u2026');\n    const a=await askJson(`Nenne die Zutaten, die man f\u00fcr \"${f.gericht}\" f\u00fcr eine Familie mit 4 Personen einkaufen muss. Lass Grundvorr\u00e4te weg (Salz, Pfeffer, \u00d6l, Mehl, Zucker, Gew\u00fcrze). Kurze deutsche Namen ohne Menge im Namen, z. B. \"H\u00e4hnchenbrust\". Einheit nur g, ml oder Stk. Antworte nur mit JSON: {\"zutaten\":[{\"name\":\"\",\"menge\":0,\"einheit\":\"g\"}]}`,x=>Array.isArray(x.zutaten));\n    zs=a?a.zutaten.map(z=>typeof z==='string'?splitItem(z):{name:String(z.name||'').trim(),qty:z.menge>0?(qtyOf(z.menge+' '+(z.einheit||''))||qtyOf(String(z.menge))):null}).filter(z=>z.name).slice(0,25):[];\n    $('#toastRoot').innerHTML='';\n  }\n  if(!zs.length){toast('Keine Zutaten gefunden. Bitte von Hand eintragen.');return}\n  const base=fromRecipe&&r.portionen?r.portionen:4;const people=Math.max(1,USERS.filter(u=>!['tablet','gast'].includes(u.role)).length)||4;\n  const lists=[['','Einkauf']].concat(Ls.filter(l=>l.typ!=='liste').map(l=>[l.id,l.name+(l.tag!==undefined&&l.tag!==''?' ('+TAGE.find(t=>t[0]===String(l.tag))[1]+')':'')]));\n  const sug=suggestList(d);\n  const head=fromRecipe?`<p class=\"meta\" style=\"margin:0 0 4px\">Aus dem Rezept:</p>${recipeLink(r)}`:`<p class=\"meta\" style=\"margin-top:0\">Kein Rezept hinterlegt. Die Zutaten hat die KI f\u00fcr 4 Personen gesch\u00e4tzt. <button class=\"link\" type=\"button\" data-a=\"rezept2\" style=\"min-height:0;padding:0\">Rezept-Link hinzuf\u00fcgen</button></p>`;\n  sheet(`<h2>Zutaten f\u00fcr ${esc(f.gericht)}<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2>${head}<form id=\"zutf\" data-d=\"${d}\" data-base=\"${base}\"><div class=\"row\" style=\"margin:10px 0 4px\"><label class=\"meta\" style=\"display:flex;gap:8px;align-items:center\">F\u00fcr<input class=\"field\" type=\"number\" name=\"personen\" min=\"1\" max=\"20\" value=\"${fromRecipe?people:4}\" style=\"width:72px\" data-a=\"persons\">Personen</label>${fromRecipe&&r.portionen?`<span class=\"meta\">(Rezept: ${r.portionen})</span>`:''}</div><p class=\"meta\" style=\"margin:0\">Was du zu Hause hast, abw\u00e4hlen. Mengen kannst du \u00e4ndern.</p>${zs.map((z,i)=>`<div class=\"task\" style=\"min-height:48px\"><input type=\"checkbox\" name=\"z${i}\"${PANTRY.test(z.name)?'':' checked'} aria-label=\"${esc(z.name)}\"><input class=\"field\" name=\"n${i}\" value=\"${esc(z.name)}\" style=\"flex:2\" aria-label=\"Zutat\"><input class=\"field\" name=\"m${i}\" data-q=\"${z.qty?esc(JSON.stringify(z.qty)):''}\" value=\"\" placeholder=\"Menge\" style=\"flex:1;min-width:84px\" aria-label=\"Menge\"></div>`).join('')}<label class=\"f\" style=\"margin-top:10px\">Auf welche Liste?<select name=\"liste\">${opts(lists,sug)}</select></label>${Ls.some(l=>l.tag!==undefined&&l.tag!=='')?'':'<p class=\"meta\">Tipp: Lege Listen wie \u201eSamstag\u201c und \u201eMittwoch\u201c mit Einkaufstag an. Dann schl\u00e4gt die App die passende Liste vor.</p>'}<div class=\"row\"><button class=\"btn main\" type=\"submit\">Auf die Liste</button></div></form>`);\n  scaleZutaten();\n}\nfunction scaleZutaten(){\n  const fm=$('#zutf');if(!fm)return;const base=Number(fm.dataset.base)||4;const p=Math.max(1,Number(fm.querySelector('[name=personen]').value)||base);\n  fm.querySelectorAll('[data-q]').forEach(i=>{if(!i.dataset.q)return;const q=JSON.parse(i.dataset.q);const n=q.n*p/base;i.value=fmtQty({n:q.u==='Stk'||q.u==='Dose'||q.u==='Pck'||q.u==='Bund'?Math.ceil(n*2)/2:n,u:q.u})});\n}\nfunction openRecipe(d){\n  const f=F.find(x=>x.datum===d)||{};const r=f.rezept;const q=encodeURIComponent(f.gericht||'');\n  sheet(`<h2>Rezept f\u00fcr ${esc(f.gericht||fmtLong(d))}<button class=\"x\" data-close aria-label=\"Schlie\u00dfen\">\u00d7</button></h2>${r?recipeLink(r):''}<form id=\"rezf\" data-d=\"${d}\"><label class=\"f\">Link zum Rezept<input name=\"url\" type=\"url\" inputmode=\"url\" placeholder=\"https://www.chefkoch.de/rezepte/\u2026\" value=\"${esc(r?r.url:'')}\" required></label><p class=\"meta\">Kopiere den Link aus Safari (Teilen \u203a Kopieren) und f\u00fcge ihn hier ein. Die App liest Name, Portionen und Zutaten aus dem Rezept.</p><div class=\"row\"><button class=\"btn main\" type=\"submit\">\u00dcbernehmen</button>${r?'<button class=\"btn warn\" type=\"button\" data-a=\"rezdel\">Link entfernen</button>':''}</div></form>${f.gericht?`<p class=\"meta\" style=\"margin-top:14px\">Noch kein Rezept? Suchen auf <a href=\"https://www.chefkoch.de/rs/s0/${q}/Rezepte.html\" target=\"_blank\" rel=\"noopener noreferrer\">Chefkoch</a> \u00b7 <a href=\"https://www.lecker.de/suche?search=${q}\" target=\"_blank\" rel=\"noopener noreferrer\">lecker.de</a> \u00b7 <a href=\"https://www.google.com/search?q=${q}+Rezept\" target=\"_blank\" rel=\"noopener noreferrer\">Google</a></p>`:''}`);\n}\nasync function saveRecipe(fm){\n  const d=fm.dataset.d,url=String(new FormData(fm).get('url')||'').trim();const b=fm.querySelector('[type=submit]');b.disabled=true;b.textContent='Lese Rezept \u2026';\n  try{\n    const r=await api('/api/rezept',{url});const fid='d-'+d;const ex=F.find(x=>x.id===fid);\n    const rez={url:r.url,titel:r.titel,quelle:r.quelle,portionen:r.portionen,zutaten:r.zutaten};\n    if(ex)await upd('essen',fid,Object.assign({rezept:rez},ex.gericht?{}:{gericht:r.titel}));else await put('essen',fid,{datum:d,gericht:r.titel,rezept:rez,by:meId});\n    closeSheet();toast(r.zutaten.length?'Rezept \u00fcbernommen: '+r.zutaten.length+' Zutaten erkannt.':'Link gespeichert. Die Seite verr\u00e4t keine Zutatenliste; die sch\u00e4tzt dann die KI.');\n  }catch(e){toast(e.message);b.disabled=false;b.textContent='\u00dcbernehmen'}\n}\nasync function saveZutaten(fm){\n  const fd=new FormData(fm);const f=F.find(x=>x.datum===fm.dataset.d);const listId=listOf(fd.get('liste'))?fd.get('liste'):'';\n  const src=(f?f.gericht:'Rezept')+' '+WD[new Date(fm.dataset.d+'T12:00:00').getDay()].slice(0,2);const out=[];closeSheet();\n  const link=f&&f.rezept?{name:f.gericht,url:f.rezept.url}:null;\n  for(let i=0;fd.has('n'+i);i++){if(!fd.get('z'+i))continue;const n=String(fd.get('n'+i)||'').trim();if(!n)continue;const r=await mergeBuy(n,String(fd.get('m'+i)||'').trim(),listId,src,link);out.push((r.merged?'zusammengef\u00fchrt: ':'')+r.titel+(r.menge?' '+r.menge:''))}\n  curList=listId;LS.set('fa-list',listId);\n  toast(['Auf \u201e'+(listOf(listId)?listOf(listId).name:'Einkauf')+'\u201c: '+out.length+' Zutaten'].concat(out.filter(x=>x.startsWith('zusammen')).slice(0,4)));\n}\n// Gleiche Artikel auf derselben Liste zusammenf\u00fchren (200 g + 500 g = 700 g)\nasync function mergeBuy(raw,menge,listId,src,link){\n  const withLink=x=>{const a=(x||[]).filter(r=>!link||r.url!==link.url);return link?a.concat(link):a};\n  const sp=splitItem(raw);const name=sp.name.slice(0,80);const qty=(menge?qtyOf(menge):null)||sp.qty;const mengeTxt=qty?fmtQty(qty):String(menge||'').slice(0,40);\n  const key=name.toLowerCase(),at=new Date().toISOString();\n  const same=e=>e.kind==='einkauf'&&(listOf(e.liste||'')?e.liste:'')===listId&&splitItem(e.titel).name.toLowerCase()===key;\n  const open=E.find(e=>same(e)&&!e.done);\n  if(open){const q1=qtyOf(open.menge)||splitItem(open.titel).qty;const sum=addQty(q1,qty);\n    const m=sum?fmtQty(sum):[open.menge,mengeTxt].filter(Boolean).join(' + ');\n    await upd('eintraege',open.id,{titel:splitItem(open.titel).name,menge:m,quellen:Array.from(new Set((open.quellen||[]).concat(src?[src]:[]))),rezepte:withLink(open.rezepte)});\n    return {merged:true,titel:open.titel,menge:m,id:open.id};}\n  const old=E.find(e=>same(e)&&e.done);\n  if(old){await upd('eintraege',old.id,{done:false,at,menge:mengeTxt,quellen:src?[src]:[],rezepte:link?[link]:[],titel:name});return {id:old.id,titel:name,menge:mengeTxt}}\n  const id=uid();await put('eintraege',id,Object.assign({kind:'einkauf',titel:name,text:name,by:meId,at,done:false,kat:katOf(name),menge:mengeTxt},src?{quellen:[src]}:{},link?{rezepte:[link]}:{},listId?{liste:listId}:{}));\n  return {id,titel:name,menge:mengeTxt,neu:true};\n}\nasync function addBuy(raw){\n  const parts=String(raw).split(/,|;|\\n| und /).map(s=>s.trim()).filter(Boolean).slice(0,20);const added=[];\n  for(const p of parts){const r=await mergeBuy(p,'',curList,'');added.push((r.merged?'Menge erh\u00f6ht: ':'')+r.titel+(r.menge?' ('+r.menge+')':''))}\n  return added;\n}\n// Einkaufsliste passend zum Essenstag vorschlagen (Liste mit Einkaufstag kurz vor dem Essen)\nfunction suggestList(d){\n  let best='',bd='';\n  for(const l of Ls.filter(l=>l.typ!=='liste'&&l.tag!==undefined&&l.tag!=='')){\n    let x=d;for(let i=0;i<7&&new Date(x+'T12:00:00').getDay()!==Number(l.tag);i++)x=addDays(x,-1);\n    if(x>=t0()&&x>bd){bd=x;best=l.id}\n  }\n  return best;\n}\nconst TAGE=[['','kein fester Tag'],['1','Montag'],['2','Dienstag'],['3','Mittwoch'],['4','Donnerstag'],['5','Freitag'],['6','Samstag'],['0','Sonntag']];\n\n/* ---------- Bedienung ---------- */\nfunction advance(s){const rh=s.rhythmus;let nx=s.next||today();do{nx=rh==='woechentlich'?addDays(nx,7):addMonths(nx,rh==='monatlich'?1:12)}while(nx<=today());return nx}\n$('#bar').addEventListener('click',ev=>{const b=ev.target.closest('.tab');if(b)go(b.dataset.v)});\n$('#counts').addEventListener('click',ev=>{const b=ev.target.closest('[data-go]');if(b)go(b.dataset.go)});\n$('#find').addEventListener('click',()=>{go('suche');setTimeout(()=>{const i=$('#sq');if(i)i.focus()},50)});\nlet rsT=null;window.addEventListener('resize',()=>{clearTimeout(rsT);rsT=setTimeout(render,200)});\n$('#gear').addEventListener('click',async()=>{go('mehr');try{quickExists=(await api('/api/token')).exists;if(window.PublicKeyCredential)fidCount=(await api('/api/passkey')).count;render()}catch(e){}});\n(function(){const fab=$('#fab');let timer=null,hold=false,hr=null,txt='',bub=null,cancel=false;\n  const bubble=m=>{if(!bub){bub=document.createElement('div');bub.className='holdbub';bub.setAttribute('role','status');document.body.appendChild(bub)}bub.textContent=m};\n  const unbubble=()=>{if(bub){bub.remove();bub=null}fab.classList.remove('rec')};\n  const finish=()=>{unbubble();const t=txt.trim();hr=null;if(cancel)return;if(t){const d=LS.get('fa-draft','');openCapture((typeof d==='string'&&d&&!/^\\[object /.test(d)?d.replace(/\\s*$/,' '):'')+t);const st=$('#st');if(st)st.textContent='Passt so? Dann \u201eMerken\u201c.'}else toast('Nichts verstanden \u2013 nochmal gedr\u00fcckt halten und sprechen.')};\n  const startRec=()=>{if(CAN_REC)return startMR();hold=true;txt='';cancel=false;if(navigator.vibrate)try{navigator.vibrate(15)}catch(e){}\n    fab.classList.add('rec');bubble('Ich h\u00f6re zu \u2026 loslassen zum Beenden');\n    try{hr=new SR();hr.lang='de-DE';hr.interimResults=true;hr.continuous=true;\n      hr.onresult=e=>{let s='';for(const r of e.results)s+=r[0].transcript;txt=s;bubble(s||'Ich h\u00f6re zu \u2026')};\n      hr.onerror=e=>{if(e&&(e.error==='not-allowed'||e.error==='service-not-allowed')){cancel=true;unbubble();hr=null;openCapture();const st=$('#st');if(st)st.textContent='Mikrofon nicht erlaubt \u2013 Mikrofon unten antippen.'}};\n      hr.onend=finish;hr.start()}catch(e){hr=null;unbubble();openCapture()}};\n  let vp=null,upEarly=false;\n  const startMR=()=>{hold=true;cancel=false;upEarly=false;if(navigator.vibrate)try{navigator.vibrate(15)}catch(e){}\n    fab.classList.add('rec');bubble('Ich h\u00f6re zu \u2026 loslassen zum Beenden');\n    vp=Voice.start().then(r=>{if(upEarly){Voice.cancel();unbubble();if(r.fresh)toast('Mikrofon ist freigegeben. Jetzt Knopf gedr\u00fcckt halten und sprechen.');return}return r},e=>{unbubble();hold=false;openCapture();const st=$('#st');if(st)st.textContent='Mikrofon nicht erlaubt. Nutze das Mikrofon der Tastatur.';return null});};\n  const endMR=async()=>{hold=false;const p=vp;vp=null;if(!p)return;upEarly=true;const r=await p;if(!r)return;upEarly=false;bubble('Wird umgesetzt \u2026');\n    try{const t=await Voice.stop();unbubble();if(cancel)return;if(t){const d=LS.get('fa-draft','');openCapture((typeof d==='string'&&d&&!/^\\[object /.test(d)?d.replace(/\\s*$/,' '):'')+t);const st=$('#st');if(st)st.textContent='Passt so? Dann \u201eMerken\u201c.'}else toast('Nichts verstanden \u2013 nochmal gedr\u00fcckt halten und sprechen.')}\n    catch(e){unbubble();toast('Das Umwandeln hat nicht geklappt. Bitte nochmal oder tippen.')}};\n  fab.addEventListener('contextmenu',e=>e.preventDefault());\n  fab.addEventListener('pointerdown',e=>{if(e.button>0)return;hold=false;if(!MIC)return;clearTimeout(timer);timer=setTimeout(startRec,320)});\n  const up=e=>{clearTimeout(timer);timer=null;if(hold&&CAN_REC){endMR();return}if(hold){if(hr){try{hr.stop()}catch(x){finish()}}hold=false}};\n  fab.addEventListener('pointerup',up);fab.addEventListener('pointercancel',()=>{clearTimeout(timer);if(hold&&CAN_REC){cancel=true;upEarly=true;Voice.cancel();unbubble();hold=false;return}if(hold&&hr){cancel=true;try{hr.abort()}catch(x){}unbubble()}hold=false});\n  fab.addEventListener('click',e=>{if(fab.classList.contains('rec')||hr||hold||vp)return;openCapture()});\n})();\nlet pressT=null,pressed=false;\n$('#p').addEventListener('pointerdown',ev=>{const t=ev.target.closest('[data-buy]');if(!t)return;pressed=false;clearTimeout(pressT);pressT=setTimeout(()=>{pressed=true;openItem('e:'+t.dataset.buy)},550)});\n['pointerup','pointercancel','pointerleave'].forEach(n=>$('#p').addEventListener(n,()=>clearTimeout(pressT)));\n$('#p').addEventListener('contextmenu',ev=>{if(ev.target.closest('[data-buy]'))ev.preventDefault()});\n$('#p').addEventListener('click',async ev=>{\n  const g=ev.target.closest('[data-go]');if(g){go(g.dataset.go==='essen'?'einkauf':g.dataset.go,g.dataset.go==='essen'?'essen':'');return}\n  const o=ev.target.closest('[data-open]');if(o){openItem(o.dataset.open);return}\n  const buy=ev.target.closest('[data-buy]');\n  if(buy){if(pressed){pressed=false;return}if(!canWrite('einkauf'))return;const e=E.find(x=>x.id===buy.dataset.buy);if(!e)return;buy.classList.add('gone');\n    setTimeout(async()=>{try{await upd('eintraege',e.id,{done:true,doneAt:new Date().toISOString()})}catch(err){toast(err.message)}},220);\n    toast('Gekauft: '+e.titel,()=>upd('eintraege',e.id,{done:false}),5000);return}\n  const again=ev.target.closest('[data-again]');if(again){const e=E.find(x=>x.id===again.dataset.again);if(e)await upd('eintraege',e.id,{done:false,at:new Date().toISOString()});return}\n  const sm=ev.target.closest('summary');if(sm){const d=sm.parentElement;const willOpen=!d.open;\n    if(d.dataset.keep)(willOpen?openD.add(d.dataset.keep):openD.delete(d.dataset.keep));else if(d.dataset.t)(willOpen?openTopics.add(d.dataset.t):openTopics.delete(d.dataset.t));return}\n  const btn=ev.target.closest('button[data-a]');if(!btn)return;const a=btn.dataset.a;\n  const tEl=btn.closest('[data-t]'),eEl=btn.closest('[data-e]'),dEl=btn.closest('[data-d]'),uEl=btn.closest('[data-u]');\n  try{\n    if(a==='pushon')return enablePush();\n    if(a==='pinnew'){openPin();return}\n    if(a==='deldone'){if(!sure(btn,'deldone','Wirklich alle l\u00f6schen?'))return;const xs=E.filter(e=>e.kind==='aufgabe'&&e.done&&fullEdit(e,'aufgaben'));for(const e of xs)await del('eintraege',e.id);toast(xs.length+' erledigte Aufgaben gel\u00f6scht.');return}\n    if(a==='tdelall'){if(!sure(btn,'tdelall','Wirklich alle l\u00f6schen?'))return;const xs=T.filter(t=>t.done&&fullEdit(t,'themen'));for(const t of xs)await deleteTheme(t);toast(xs.length+' erledigte Ideen gel\u00f6scht.');return}\n    if(a==='list'){curList=btn.dataset.l;LS.set('fa-list',curList);render();return}\n    if(a==='listadd'){openList();return}\n    if(a==='listedit'){openList(listOf(curList));return}\n    if(a==='listreset'){for(const e of E.filter(e=>e.kind==='einkauf'&&inList(e)&&e.done))await upd('eintraege',e.id,{done:false});return}\n    if(a==='shopgo'){const r=await api('/api/einkaufen',{liste:curList});toast(r.again?'Die anderen wissen schon Bescheid.':r.sent?'Die anderen haben einen Hinweis bekommen.':'Niemand sonst hat Mitteilungen an.');return}\n    if(a==='fidadd'){return addPasskey()}\n    if(a==='fiddel'){await api('/api/passkey',null,'DELETE');fidCount=0;render();toast('Face ID ist f\u00fcr die App entfernt.');return}\n    if(a==='calmode'){calMode=btn.dataset.m;LS.set('fa-cal',calMode);if(calMode!=='liste'&&!calAnchor)calAnchor=t0();render();return}\n    if(a==='calprev'||a==='calnext'){const st=calMode==='woche'?7:1;calAnchor=addDays(calAnchor||t0(),a==='calprev'?-st:st);render();return}\n    if(a==='caltoday'){calAnchor=t0();render();return}\n    if(a==='towoche'){calMode='woche';calAnchor=t0();LS.set('fa-cal',calMode);go('kalender');return}\n    if(a==='caladd'){openNew('termin',{d:btn.dataset.d});return}\n    if(a==='new'){openNew(btn.dataset.k,{d:btn.dataset.d||'',thema:btn.dataset.t||''});return}\n    if(a==='infoadd'){openInfo();return}\n    if(a==='infoedit'){openInfo(I.find(x=>x.id===btn.dataset.i));return}\n    if(a==='qnew'){const r=await api('/api/token',{});quickLink=r.link;quickExists=true;render();return}\n    if(a==='qcopy'){try{await navigator.clipboard.writeText(quickLink);toast('Link kopiert. Jetzt im Kurzbefehl einf\u00fcgen.')}catch(e){const i=btn.closest('.card').querySelector('input');i.select()}return}\n    if(a==='qoff'){await api('/api/token',null,'DELETE');quickLink='';quickExists=false;render();toast('Der alte Link funktioniert nicht mehr.');return}\n    if(a==='seen'){newSince=Date.now();LS.set('fa-seen-'+meId,newSince);render();return}\n    if(a==='mycolor'){await api('/api/prefs',{color:btn.dataset.c});USERS=(await api('/api/me')).users;render();return}\n    if(a==='ucolor'){btn.parentElement.querySelectorAll('.sw').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));return}\n    if(a==='restorebk'){if(btn.dataset.sure!=='1'){btn.dataset.sure='1';btn.textContent='Wirklich? Ersetzt alle Daten';return}const r=await api('/api/admin/restore',{backup:Number(btn.dataset.id)});toast(r.restored+' Eintr\u00e4ge wiederhergestellt.');await pull(true);return}\n    if(a==='pushtest'){const r=await api('/api/push/test',{});toast(r.results&&r.results.length?'Test gesendet. Die Mitteilung kommt gleich.':'F\u00fcr dieses Ger\u00e4t ist noch keine Mitteilung eingerichtet.');return}\n    if(a==='pw')return showAuth('password');\n    if(a==='logout'){await api('/api/logout',{});localStorage.removeItem('fa-cache');localStorage.removeItem('fa-me');location.href='/';return}\n    if(a==='mine'||a==='all'){mineOnly=a==='mine';render();return}\n    if(a==='zutaten'&&dEl)return await addZutaten(dEl.dataset.d);\n    if(a==='rezept'&&dEl){openRecipe(dEl.dataset.d);return}\n    if(a==='share'||a==='copy'){const box=btn.closest('[data-link]');if(!box)return;\n      if(a==='share'){try{await navigator.share({title:'Family App',text:'Hier ist deine Einladung zur Family App:',url:box.dataset.link})}catch(e){}}\n      else{try{await navigator.clipboard.writeText(box.dataset.link);toast('Link kopiert.')}catch(e){box.querySelector('input').select()}}\n      return}\n    if(a==='uadd'){const box=$('#newu');const name=box.querySelector('[data-k=name]').value.trim();if(!name){toast('Bitte einen Namen eingeben.');return}\n      const profil=box.querySelector('[data-k=profil]').checked;\n      const r=await api('/api/admin/users',{name,role:box.querySelector('[data-k=role]').value,perms:areasOf(box),profil});box.querySelector('[data-k=name]').value='';box.querySelector('[data-k=profil]').checked=false;\n      USERS=(await api('/api/me')).users;adminUsers=null;await loadAdmin();const nb=$('#newu');if(nb){openD.add('newu');nb.closest('details').open=true;if(r.link)linkBox(nb.querySelector('[data-k=link]'),r.link,name);else{nb.querySelector('[data-k=link]').innerHTML=`<p class=\"meta\">${esc(name)} ist angelegt und kann jetzt Aufgaben bekommen.</p>`}}return}\n    if(uEl){const id=uEl.dataset.u;const u=adminUsers.find(x=>x.id===id);\n      if(a==='usave'){const sw=uEl.querySelector('.sw[aria-pressed=true]');await api('/api/admin/users/'+id,{role:uEl.querySelector('[data-k=role]').value,active:uEl.querySelector('[data-k=active]').checked,perms:areasOf(uEl),color:sw?sw.dataset.c:undefined});USERS=(await api('/api/me')).users;adminUsers=null;await loadAdmin();toast('Gespeichert.');return}\n      if(a==='uinvite'){const r=await api('/api/admin/users/'+id+'/invite',{});linkBox(uEl.querySelector('[data-k=link]'),r.link,u.name);return}\n      if(a==='udel'){if(btn.dataset.sure!=='1'){btn.dataset.sure='1';btn.textContent='Wirklich l\u00f6schen?';return}await api('/api/admin/users/'+id,null,'DELETE');adminUsers=null;await loadAdmin();USERS=(await api('/api/me')).users;return}\n      return}\n    if(a==='calfind'){btn.disabled=true;btn.textContent='Suche \u2026';try{calList=(await api('/api/admin/calendars')).calendars}catch(e){toast(e.message)}render();return}\n    if(a==='calpick'){const c=calList[Number(btn.dataset.i)];await api('/api/admin/calendar',{url:c.url,name:c.name});CAL=c.name;calList=null;render();toast('Verbunden mit \u201e'+c.name+'\u201c.');setTimeout(()=>{pull();loadExternal(true)},4000);return}\n    if(a==='calsync'){btn.disabled=true;const r=await api('/api/admin/calsync',{});toast(`${r.synced} eingetragen, ${r.external||0} Termine gelesen${r.failed?', '+r.failed+' fehlgeschlagen':''}.`);pull();loadExternal();return}\n    if(a==='caloff'){await api('/api/admin/calendar',{});CAL=null;X=[];render();return}\n    if(tEl){const t=T.find(x=>x.id===tEl.dataset.t);if(!t)return;\n      if(a==='edel'){const e=E.find(x=>x.id===btn.dataset.e);if(!e||!fullEdit(e,'themen'))return;if(!sure(btn,'edel'+e.id,'Wirklich?'))return;await del('eintraege',e.id);toast('Gedanke gel\u00f6scht.');return}\n      if(a==='later'||a==='tedit'){openTopic(t,a);return}\n      if(a==='tdel'){if(!sure(btn,'tdel'+t.id,'Wirklich l\u00f6schen?'))return;await deleteTheme(t);toast('Gel\u00f6scht: '+t.name);return}\n      const ch={d7:{due:addDays(today(),7),done:false},m1:{due:addMonths(today(),1),done:false},tdone:{done:true},reopen:{done:false,due:addDays(today(),7)}}[a];\n      if(ch){await upd('themen',t.id,ch);if(a==='tdone')toast('Abgeschlossen: '+t.name,()=>upd('themen',t.id,{done:false}))}\n      return}\n    if(eEl){const e=E.find(x=>x.id===eEl.dataset.e);if(!e)return;\n      if(a==='pinoff'){await upd('eintraege',e.id,{done:true,doneAt:new Date().toISOString()});toast('Abgenommen.',()=>upd('eintraege',e.id,{done:false}));return}\n      if(a==='pinread'){const rb=Array.from(new Set((e.readBy||[]).concat(meId)));await upd('eintraege',e.id,{readBy:rb});toast('Ausgeblendet.',()=>upd('eintraege',e.id,{readBy:(e.readBy||[]).filter(x=>x!==meId)}));return}\n      if(a==='del'){await del('eintraege',e.id);return}\n      if(a==='x-ai'){btn.disabled=true;await capture(e.text||e.titel);await del('eintraege',e.id);return}\n      if(a.startsWith('to-')){const k=a.slice(3);\n        if(k==='einkauf'){await upd('eintraege',e.id,{kind:'einkauf',done:false,kat:katOf(e.titel)});toast('Einkauf: '+e.titel);return}\n        if(k==='aufgabe'){await upd('eintraege',e.id,{kind:'aufgabe',done:false,fuer:'wir',faellig:''});openItem('e:'+e.id);return}\n        if(k==='termin'){await upd('eintraege',e.id,{kind:'termin',start:addDays(today(),1),ganztags:true,vorschlag:!isAdult()||undefined});openItem('e:'+e.id);return}\n        if(k==='gedanke'){const name=(prompt('Zu welchem Thema?',T[0]?T[0].name:'Allgemein')||'').trim().slice(0,60);if(!name)return;const ex=T.find(t=>t.name.toLowerCase()===name.toLowerCase());const wv=addDays(today(),7);\n          if(!ex)await put('themen',slug(name)||uid(),{name:name,due:wv,done:false,at:new Date().toISOString(),sicht:isAdult()?'erwachsene':'familie'});else if(ex.done)await upd('themen',ex.id,{done:false,due:wv});\n          await upd('eintraege',e.id,{kind:'gedanke',thema:ex?ex.name:name,sicht:isAdult()?'erwachsene':'familie'});toast('Idee zu \u201e'+(ex?ex.name:name)+'\u201c');return}\n      }\n    }\n  }catch(err){toast(err&&err.message?err.message:'Das hat nicht geklappt. Bitte noch einmal versuchen.')}\n});\n$('#p').addEventListener('change',async ev=>{\n  const el=ev.target;const a=el.dataset.a;\n  try{\n    if(a==='wocheaus'){const t=el.closest('form').querySelector('[name=woche]');t.disabled=el.checked;return}\n    if(el.dataset.k==='role'){const box=el.closest('[data-u],#newu');const pr=PRESETS[el.value]||PRESETS.erwachsener;box.querySelectorAll('select[data-area]').forEach(x=>{x.value=pr[x.dataset.area]});const pa=box.querySelector('[data-k=permwrap]');if(pa)pa.hidden=el.value==='admin';return}\n    if(a==='restorefile'&&el.files&&el.files[0]){let data;try{data=JSON.parse(await el.files[0].text())}catch(e){toast('Die Datei ist keine Sicherung der Family App.');return}if(!confirmRestore())return;const r=await api('/api/admin/restore',{data});toast(r.restored+' Eintr\u00e4ge wiederhergestellt.');await pull(true);return}\n    if(a==='tick'){const id=el.closest('[data-e]').dataset.e;const e=E.find(x=>x.id===id);if(!e)return;\n      if(el.checked){await upd('eintraege',id,{done:true,doneAt:new Date().toISOString()});toast('Erledigt: '+e.titel,()=>upd('eintraege',id,{done:false}))}\n      else await upd('eintraege',id,{done:false});return}\n    if(a==='stick'){const s=S.find(x=>x.id===el.closest('[data-s]').dataset.s);if(!s)return;const old=s.next;const nx=advance(s);await upd('serien',s.id,{next:nx});toast('Erledigt. N\u00e4chstes Mal '+fmtDay(nx)+'.',()=>upd('serien',s.id,{next:old}));return}\n    if(a==='tdue'&&el.value){await upd('themen',el.closest('[data-t]').dataset.t,{due:el.value,done:false});return}\n    if(a==='tsicht'){const t=T.find(x=>x.id===el.closest('[data-t]').dataset.t);if(!t)return;await upd('themen',t.id,{sicht:el.value});for(const e of themeEntries(t.name))if(e.by===meId||isAdult())await upd('eintraege',e.id,{sicht:el.value});return}\n    if(a==='meal'){const d=el.closest('[data-d]').dataset.d;const g=el.value.trim().slice(0,120);const fid='d-'+d;const ex=F.find(f=>f.id===fid);\n      if(ex&&!g)await del('essen',fid);else if(ex)await upd('essen',fid,{gericht:g,by:meId});else if(g)await put('essen',fid,{datum:d,gericht:g,by:meId});\n      el.blur();render()}\n  }catch(err){toast(err&&err.message?err.message:'Speichern hat nicht geklappt.')}\n});\n$('#p').addEventListener('keydown',ev=>{if(ev.target.dataset&&ev.target.dataset.a==='meal'&&ev.key==='Enter'){ev.preventDefault();ev.target.blur()}});\n$('#p').addEventListener('focusout',()=>setTimeout(()=>{const a=document.activeElement;if(!(a&&a.closest&&a.closest('#p')&&a.matches('input,select')))render()},0));\n$('#p').addEventListener('input',ev=>{if(ev.target.id==='q'){q=ev.target.value.trim().toLowerCase();render()}if(ev.target.id==='sq'){sq=ev.target.value.trim();render()}});\n$('#p').addEventListener('submit',async ev=>{\n  ev.preventDefault();\n  if(ev.target.id==='addBuy'){const i=$('#buyIn');const v=i.value.trim();if(!v)return;i.value='';const added=await addBuy(v);if(!added.length)toast('Steht schon auf der Liste.');render();return}\n  if(ev.target.id==='famname'){const n=new FormData(ev.target).get('name');try{await api('/api/admin/family',{name:n});FAMILY=String(n||'').trim();renderHead();toast('Gespeichert.')}catch(e){toast(e.message)}return}\n  if(ev.target.id==='credf'){const fd=Object.fromEntries(new FormData(ev.target));const b=ev.target.querySelector('[type=submit]');b.disabled=true;b.textContent='Pr\u00fcfe bei Apple \u2026';try{await api('/api/admin/calcred',fd);credInfo=await api('/api/admin/calcred');openD.delete('cred');toast('iCloud-Zugang gespeichert. Jetzt den Kalender w\u00e4hlen.');render()}catch(e){toast(e.message);b.disabled=false;b.textContent='Pr\u00fcfen und speichern'}return}\n  if(ev.target.id==='prefs'){const fd=Object.fromEntries(new FormData(ev.target));if(fd.wocheAus)fd.woche='aus';delete fd.wocheAus;try{const r=await api('/api/prefs',fd);ME.prefs=r.prefs;toast('Zeiten gespeichert.')}catch(e){toast(e.message)}return}\n});\n\n/* ---------- Familie (Admin) ---------- */\nfunction confirmRestore(){return window.confirm?window.confirm('Alle aktuellen Eintr\u00e4ge werden durch die Sicherung ersetzt. Vorher wird automatisch eine Kopie angelegt. Fortfahren?'):true}\nasync function loadAdmin(){try{const [u,c,b]=await Promise.all([api('/api/admin/users'),api('/api/admin/calcred'),api('/api/admin/backups')]);adminUsers=u.users;credInfo=c;backups=b.backups;render()}catch(e){toast(e.message)}}\nfunction linkBox(el,link,name){\n  const canShare=!!navigator.share;\n  el.innerHTML=`<p class=\"meta\">Diesen Link an ${esc(name)} schicken. Damit legt ${esc(name)} ein eigenes Passwort fest. Er gilt nur einmal.</p><input class=\"field\" readonly value=\"${esc(link)}\" aria-label=\"Einladungslink\" style=\"font-size:13px;margin:6px 0\"><div class=\"row\">${canShare?'<button class=\"btn sm\" data-a=\"share\">Per Nachricht senden</button>':''}<button class=\"btn sm\" data-a=\"copy\">Kopieren</button></div>`;\n  el.dataset.link=link;el.dataset.name=name;\n}\nconst areasOf=el=>{const o={};el.querySelectorAll('select[data-area]').forEach(x=>{o[x.dataset.area]=x.value});return o};\nasync function enablePush(){\n  try{\n    const perm=await Notification.requestPermission();\n    if(perm!=='granted'){toast('Mitteilungen sind nicht erlaubt. \u00c4ndern unter iPhone-Einstellungen \u203a Mitteilungen \u203a Family App.');return}\n    const reg=await navigator.serviceWorker.ready;const {key}=await api('/api/push/key');\n    const raw=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4)),c=>c.charCodeAt(0));\n    let s=await reg.pushManager.getSubscription();if(!s)s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:raw});\n    await api('/api/push/subscribe',{endpoint:s.endpoint});pushOn=true;render();toast('Mitteilungen sind an.');\n  }catch(e){toast('Mitteilungen konnten nicht eingeschaltet werden: '+e.message)}\n}\n\n/* ---------- Face ID (Passkey) ---------- */\nconst b2u=buf=>{let s='';new Uint8Array(buf).forEach(c=>s+=String.fromCharCode(c));return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')};\nconst u2b=x=>{x=String(x).replace(/-/g,'+').replace(/_/g,'/');while(x.length%4)x+='=';return Uint8Array.from(atob(x),c=>c.charCodeAt(0))};\nasync function addPasskey(){\n  try{\n    const o=await api('/api/passkey/options');\n    const cred=await navigator.credentials.create({publicKey:{challenge:u2b(o.challenge),rp:o.rp,user:{id:u2b(o.user.id),name:o.user.name,displayName:o.user.displayName},pubKeyCredParams:o.pubKeyCredParams,authenticatorSelection:o.authenticatorSelection,timeout:o.timeout,attestation:'none',excludeCredentials:o.excludeCredentials.map(c=>({type:'public-key',id:u2b(c.id)}))}});\n    await api('/api/passkey/register',{id:cred.id,clientDataJSON:b2u(cred.response.clientDataJSON),attestationObject:b2u(cred.response.attestationObject)});\n    fidCount++;render();toast('Face ID ist eingerichtet.');\n  }catch(e){if(e&&e.name==='NotAllowedError')return;toast(e.message||'Face ID konnte nicht eingerichtet werden.')}\n}\nasync function loginPasskey(){\n  const o=await api('/api/passkey/login-options');\n  const c=await navigator.credentials.get({publicKey:{challenge:u2b(o.challenge),rpId:o.rpId,userVerification:'required',timeout:o.timeout}});\n  await api('/api/passkey/login',{id:c.id,clientDataJSON:b2u(c.response.clientDataJSON),authenticatorData:b2u(c.response.authenticatorData),signature:b2u(c.response.signature)});\n}\n\n/* ---------- Anmeldung ---------- */\nfunction showAuth(mode,data){\n  ['#p','#top','#bar','#fab'].forEach(s=>$(s).hidden=true);const a=$('#auth');a.hidden=false;\n  const forms={\n    login:`<form id=\"af\"><h2 style=\"margin:0\">Anmelden</h2><label>Name<input class=\"field\" name=\"name\" autocomplete=\"username\" autocapitalize=\"words\" required></label><label>Passwort<input class=\"field\" type=\"password\" name=\"password\" autocomplete=\"current-password\" required></label><p class=\"err\" id=\"aerr\"></p><button class=\"btn main\" type=\"submit\">Anmelden</button>${window.PublicKeyCredential?'<button class=\"btn\" type=\"button\" id=\"fidlogin\">Mit Face ID anmelden</button>':''}<p class=\"meta\">Noch kein Zugang? Den Einladungslink bekommst du vom Admin der Familie.</p></form>`,\n    setup:`<form id=\"af\"><h2 style=\"margin:0\">Family App einrichten</h2><p class=\"meta\">Du wirst der erste Admin. Den Einrichtungs-Code hast du bei Cloudflare als SETUP_CODE hinterlegt.</p><label>Einrichtungs-Code<input class=\"field\" name=\"code\" autocomplete=\"off\" required></label><label>Dein Name<input class=\"field\" name=\"name\" autocomplete=\"username\" required></label><label>Passwort (mindestens 8 Zeichen)<input class=\"field\" type=\"password\" name=\"password\" autocomplete=\"new-password\" minlength=\"8\" required></label><p class=\"err\" id=\"aerr\"></p><button class=\"btn main\" type=\"submit\">Einrichten</button></form>`,\n    invite:`<form id=\"af\"><h2 style=\"margin:0\">Willkommen, ${esc(data&&data.name)}</h2><p class=\"meta\">Leg dein Passwort fest. Das iPhone bietet an, es zu sichern, danach meldest du dich per Face ID an.</p><input type=\"text\" name=\"username\" autocomplete=\"username\" value=\"${esc(data&&data.name)}\" hidden><label>Neues Passwort (mindestens 8 Zeichen)<input class=\"field\" type=\"password\" name=\"password\" autocomplete=\"new-password\" minlength=\"8\" required></label><p class=\"err\" id=\"aerr\"></p><button class=\"btn main\" type=\"submit\">Passwort festlegen</button></form>`,\n    password:`<form id=\"af\"><h2 style=\"margin:0\">Passwort \u00e4ndern</h2><input type=\"text\" name=\"username\" autocomplete=\"username\" value=\"${esc(meName)}\" hidden><label>Bisheriges Passwort<input class=\"field\" type=\"password\" name=\"old\" autocomplete=\"current-password\" required></label><label>Neues Passwort (mindestens 8 Zeichen)<input class=\"field\" type=\"password\" name=\"password\" autocomplete=\"new-password\" minlength=\"8\" required></label><p class=\"err\" id=\"aerr\"></p><div class=\"row\"><button class=\"btn main\" type=\"submit\">\u00c4ndern</button><button class=\"btn\" type=\"button\" id=\"acancel\">Abbrechen</button></div></form>`\n  };\n  a.innerHTML=forms[mode];\n  const back=()=>{a.hidden=true;['#p','#top','#bar'].forEach(s=>$(s).hidden=false);$('#fab').hidden=!AREAS.some(([k])=>canWrite(k))};\n  const c=$('#acancel');if(c)c.onclick=back;\n  const fl=$('#fidlogin');if(fl)fl.onclick=async()=>{const err=$('#aerr');err.textContent='';try{await loginPasskey();location.href='/'}catch(e){if(e&&e.name==='NotAllowedError')return;err.textContent=e.message||'Face ID hat nicht geklappt. Bitte mit Passwort anmelden.'}};\n  $('#af').addEventListener('submit',async ev=>{\n    ev.preventDefault();const fd=Object.fromEntries(new FormData(ev.target));const err=$('#aerr');err.textContent='';\n    const btn=ev.target.querySelector('[type=submit]');btn.disabled=true;\n    try{\n      if(mode==='login')await api('/api/login',{name:fd.name,password:fd.password});\n      if(mode==='setup')await api('/api/setup',{code:fd.code,name:fd.name,password:fd.password});\n      if(mode==='invite'){await api('/api/invite',{t:data.t,password:fd.password});history.replaceState(null,'','/')}\n      if(mode==='password'){await api('/api/password',{old:fd.old,password:fd.password});back();toast('Passwort ge\u00e4ndert.');return}\n      location.href='/';\n    }catch(e){err.textContent=e.message;btn.disabled=false}\n  });\n}\nasync function start(offline){\n  const warnings=ME.warnings||[];FAMILY=ME.family||'';\n  meId=ME.user.id;meName=ME.user.name;USERS=ME.users;CAL=ME.calendar;ME=ME.user;ME.warnings=warnings;\n  newSince=LS.get('fa-seen-'+meId,0);if(!newSince){newSince=Date.now();LS.set('fa-seen-'+meId,newSince)}\n  booting=true;\n  $('#auth').hidden=true;['#p','#top','#bar'].forEach(s=>$(s).hidden=false);$('#fab').hidden=!AREAS.some(([k])=>canWrite(k));\n  try{const v=localStorage.getItem('fa-view');if(v&&TABS.includes(v))view=v}catch(e){}\n  X=LS.get('fa-ext',[]);\n  calMode=LS.get('fa-cal','liste');\n  if(ME.role==='tablet'){TABS=['wand','kalender','einkauf'];view='wand'}\n  renderBar();\n  col('eintraege').onSnapshot(r=>{E=rows(r);render()});\n  col('themen').onSnapshot(r=>{T=rows(r).filter(t=>t.name&&t.name!=='Eingang');render()});\n  col('serien').onSnapshot(r=>{S=rows(r).filter(s=>s.titel);render()});\n  col('essen').onSnapshot(r=>{F=rows(r).filter(f=>f.datum);render()});\n  col('infos').onSnapshot(r=>{I=rows(r).filter(x=>x.titel);render()});\n  col('listen').onSnapshot(r=>{Ls=rows(r).filter(x=>x.name);render()});\n  curList=LS.get('fa-list','');\n  const cached=loadCache();\n  if(cached)Object.keys(store).forEach(emit);\n  await pull(!cached);\n  booting=false;render();\n  loadExternal();\n  setInterval(()=>{if(!document.hidden)pull()},60000);\n  setInterval(()=>{if(!document.hidden)loadExternal()},10*60000);\n  document.addEventListener('visibilitychange',()=>{if(!document.hidden){pull();render()}else if(since){LS.set('fa-seen-'+meId,since)}});\n  if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',ev=>{if(ev.data==='pull')pull()});\n  window.addEventListener('online',()=>pull());\n  if(ME.role!=='tablet'&&!LS.get('fa-intro-'+meId,0))setTimeout(showIntro,400);\n  setInterval(()=>{if(!document.hidden&&!$('#shade'))render()},5*60000);\n  if('serviceWorker'in navigator){try{const reg=await navigator.serviceWorker.ready;const s=reg.pushManager&&await reg.pushManager.getSubscription();pushOn=!!s;pushChecked=true;if(s)api('/api/push/subscribe',{endpoint:s.endpoint}).catch(()=>{});render()}catch(e){}}\n}\nfunction showIntro(){\n  const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;\n  const s1=standalone,s2=pushOn;\n  sheet(`<h2>Willkommen in der Family App<button class=\"x\" data-a=\"introdone\" aria-label=\"Schlie\u00dfen\">\u00d7</button></h2><p class=\"meta\" style=\"margin-top:0\">Drei Schritte, dann ist alles bereit.</p><ol class=\"steps\"><li class=\"${s1?'ok':''}\"><span class=\"n\">${s1?'\u2713':'1'}</span><div><b>Auf den Home-Bildschirm</b><div class=\"meta\">${s1?'Erledigt.':'In Safari unten auf Teilen (Quadrat mit Pfeil) \u203a \u201eZum Home-Bildschirm\u201c. Danach die App \u00fcber das neue Symbol \u00f6ffnen.'}</div></div></li><li class=\"${s2?'ok':''}\"><span class=\"n\">${s2?'\u2713':'2'}</span><div><b>Mitteilungen einschalten</b><div class=\"meta\">${s2?'Erledigt.':s1?'Damit du Erinnerungen und Pinnwand-Nachrichten bekommst.':'Geht, sobald Schritt 1 erledigt ist.'}</div>${!s2&&s1?'<button class=\"btn sm main\" data-a=\"intropush\" style=\"margin-top:6px\">Einschalten</button>':''}</div></li><li><span class=\"n\">3</span><div><b>Den ersten Satz sprechen</b><div class=\"meta\">Zum Beispiel: \u201eZahnarzt Dienstag 15 Uhr, Milch kaufen.\u201c Die App sortiert es selbst.</div><button class=\"btn sm main\" data-a=\"startcap\" style=\"margin-top:6px\">Jetzt ausprobieren</button></div></li></ol><div class=\"row\" style=\"margin-top:10px\"><button class=\"btn\" data-a=\"introdone\">Sp\u00e4ter</button></div>`);\n}\nasync function boot(){\n  if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});\n  const inv=new URLSearchParams(location.search).get('einladung');\n  if(inv){try{const d=await api('/api/invite?t='+encodeURIComponent(inv));showAuth('invite',{t:inv,name:d.name})}catch(e){showAuth('login');$('#aerr').textContent=e.message}return}\n  try{ME=await api('/api/me');LS.set('fa-me',ME)}\n  catch(e){\n    if(e.status===401){localStorage.removeItem('fa-cache');showAuth(e.data&&e.data.setup?'setup':'login');return}\n    ME=LS.get('fa-me',null);if(!ME){banner('Server nicht erreichbar. Bitte sp\u00e4ter noch einmal \u00f6ffnen.');return}\n    banner('Offline. \u00c4nderungen werden nachgeholt, sobald wieder Netz da ist.');\n  }\n  start();\n}\nboot();\n}\n</script>\n</body>\n</html>\n";
const SW_JS = "const SHELL = 'fa-shell-v3';\nself.addEventListener('install', (e) => {\n  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/icon-180.png', '/manifest.webmanifest'])).catch(() => {}));\n  self.skipWaiting();\n});\nself.addEventListener('activate', (e) => e.waitUntil((async () => {\n  for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k);\n  await self.clients.claim();\n})()));\nself.addEventListener('push', (e) => {\n  e.waitUntil((async () => {\n    let title = 'Family App', body = 'Es gibt etwas Neues.', tag = 'family';\n    try {\n      const r = await fetch('/api/notify', { credentials: 'include', cache: 'no-store' });\n      if (r.ok) { const d = await r.json(); title = d.title || title; body = d.body || body; tag = d.tag || tag; }\n    } catch (x) {}\n    try { for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage('pull'); } catch (x) {}\n    await self.registration.showNotification(title, { body, icon: '/icon-180.png', badge: '/icon-180.png', tag, data: { url: '/' } });\n  })());\n});\nself.addEventListener('notificationclick', (e) => {\n  e.notification.close();\n  e.waitUntil((async () => {\n    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });\n    for (const c of cs) { if ('focus' in c) return c.focus(); }\n    return self.clients.openWindow('/');\n  })());\n});\n// App-H\u00fclle: erst Netz, ohne Netz aus dem Speicher (damit die Einkaufsliste im Laden aufgeht)\nself.addEventListener('fetch', (e) => {\n  const u = new URL(e.request.url);\n  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;\n  e.respondWith((async () => {\n    try {\n      const r = await fetch(e.request);\n      if (r.ok && (u.pathname === '/' || u.pathname.startsWith('/icon'))) { const c = await caches.open(SHELL); c.put(u.pathname === '/' ? '/' : e.request, r.clone()); }\n      return r;\n    } catch (x) {\n      const c = await caches.match(u.pathname === '/index.html' ? '/' : e.request, { ignoreSearch: true });\n      return c || caches.match('/') || Response.error();\n    }\n  })());\n});\n";
const ICON_180 = "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";
const ICON_512 = "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";
const SEED = {"owner": "u_N5ScHyNg29x7ywnvP4cSmg", "docs": [{"coll": "themen", "id": "t-urlaub-2027", "data": {"at": "2026-11-24T15:14:52.515Z", "done": false, "due": "2026-12-01", "name": "Urlaub 2027"}}, {"coll": "eintraege", "id": "e-mwuu5vc34831o", "data": {"at": "2026-11-24T15:14:52.515Z", "by": "u_N5ScHyNg29x7ywnvP4cSmg", "kind": "gedanke", "raw": "Sommerurlaub besprechen", "text": "Den Sommerurlaub besprechen.", "thema": "Urlaub 2027", "titel": "Sommerurlaub besprechen"}}, {"coll": "eintraege", "id": "e-mwuu6jw5kcw31", "data": {"at": "2026-11-24T15:15:24.341Z", "by": "u_N5ScHyNg29x7ywnvP4cSmg", "kind": "gedanke", "raw": "Urlaub frühzeitig planen. Evtl in der Weihnachtszeit", "text": "Urlaub frühzeitig planen, evtl. in der Weihnachtszeit.", "thema": "Urlaub 2027", "titel": "Urlaub frühzeitig planen"}}, {"coll": "eintraege", "id": "e-mwuu80ulxaytr", "data": {"at": "2026-11-24T15:16:32.973Z", "by": "u_N5ScHyNg29x7ywnvP4cSmg", "done": false, "kind": "einkauf", "text": "Mandarinen besorgen.", "titel": "Mandarinen"}}, {"coll": "eintraege", "id": "e-mwuu81273xqc3", "data": {"at": "2026-11-24T15:16:32.973Z", "by": "u_N5ScHyNg29x7ywnvP4cSmg", "done": false, "kind": "einkauf", "text": "Klopapier besorgen.", "titel": "Klopapier"}}, {"coll": "eintraege", "id": "e-mwuu81a76mv28", "data": {"at": "2026-11-24T15:16:32.973Z", "by": "u_N5ScHyNg29x7ywnvP4cSmg", "done": false, "kind": "einkauf", "text": "Frischkäse besorgen.", "titel": "Frischkäse"}}, {"coll": "eintraege", "id": "e-mwuu9nspcgh5a", "data": {"at": "2026-11-24T15:17:49.369Z", "by": "u_N5ScHyNg29x7ywnvP4cSmg", "done": false, "kind": "einkauf", "text": "Bananen besorgen.", "titel": "Bananen"}}, {"coll": "eintraege", "id": "e-mwuu9o04rfg0r", "data": {"at": "2026-11-24T15:17:49.369Z", "by": "u_N5ScHyNg29x7ywnvP4cSmg", "done": false, "kind": "einkauf", "text": "Buttermilch besorgen.", "titel": "Buttermilch"}}, {"coll": "eintraege", "id": "e-mwuur293jx44p", "data": {"at": "2026-11-24T15:31:21.255Z", "by": "u_N5ScHyNg29x7ywnvP4cSmg", "ende": "", "ganztags": false, "kind": "termin", "start": "2026-11-27T19:44", "text": "Kalender beplotten", "titel": "Kalender beplotten"}}, {"coll": "eintraege", "id": "e-mwuveta94qzx3", "data": {"at": "2026-11-24T15:49:49.377Z", "by": "u_N5ScHyNg29x7ywnvP4cSmg", "done": false, "faellig": "", "fuer": "u_N5ScHyNg29x7ywnvP4cSmg", "kind": "aufgabe", "text": "Den Müll rausbringen.", "titel": "Müll rausbringen"}}, {"coll": "eintraege", "id": "e-mwuvetj646lvr", "data": {"at": "2026-11-24T15:49:49.377Z", "by": "u_N5ScHyNg29x7ywnvP4cSmg", "done": false, "faellig": "", "fuer": "u_N5ScHyNg29x7ywnvP4cSmg", "kind": "aufgabe", "text": "Ans Styropor im Keller denken.", "titel": "Styropor aus dem Keller"}}]};

const AREAS = ['termine', 'aufgaben', 'einkauf', 'essen', 'themen', 'pinnwand'];
const KIND_AREA = { termin: 'termine', aufgabe: 'aufgaben', einkauf: 'einkauf', gedanke: 'themen', eingang: 'themen', nachricht: 'pinnwand' };
const COLL_AREA = { themen: 'themen', serien: 'aufgaben', essen: 'essen', infos: 'pinnwand', listen: 'einkauf' };
const COLLS = ['eintraege', 'themen', 'serien', 'essen', 'infos', 'listen'];
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
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,jwk TEXT NOT NULL,counter INTEGER NOT NULL DEFAULT 0,created TEXT)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS challenges(c TEXT PRIMARY KEY,user_id TEXT,created INTEGER NOT NULL)').run();
  let added = false;
  for (const col of ["kind TEXT NOT NULL DEFAULT ''", "due TEXT NOT NULL DEFAULT ''", 'rec INTEGER NOT NULL DEFAULT 0', 'done INTEGER NOT NULL DEFAULT 0']) {
    try { await env.DB.prepare('ALTER TABLE docs ADD COLUMN ' + col).run(); added = true; } catch (e) { /* gibt es schon */ }
  }
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS docs_due ON docs(coll,kind,due)').run();
  if (added || !(await getSetting(env, 'schema3'))) {
    const { results } = await env.DB.prepare('SELECT coll,id,data FROM docs WHERE deleted=0').all();
    for (let i = 0; i < results.length; i += 50) await env.DB.batch(results.slice(i, i + 50).map((r) => env.DB.prepare('UPDATE docs SET kind=?,due=?,rec=?,done=? WHERE coll=? AND id=?').bind(...cols(JSON.parse(r.data)), r.coll, r.id)));
    await setSetting(env, 'schema3', 1);
  }
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
// Suchspalten: Art, Datum (Termin-Start bzw. Fälligkeit), Serie, erledigt
const cols = (data) => {
  const d = data || {};
  const due = d.kind === 'termin' ? String(d.start || '').slice(0, 10) : d.kind === 'aufgabe' ? String(d.faellig || '') : '';
  return [String(d.kind || ''), due, d.wdh ? 1 : 0, d.done ? 1 : 0];
};
async function putDoc(env, coll, id, data) {
  await env.DB.prepare('INSERT INTO docs(coll,id,data,updated,deleted,kind,due,rec,done) VALUES(?,?,?,?,0,?,?,?,?) ON CONFLICT(coll,id) DO UPDATE SET data=excluded.data,updated=excluded.updated,deleted=0,kind=excluded.kind,due=excluded.due,rec=excluded.rec,done=excluded.done')
    .bind(coll, id, JSON.stringify(data), stamp(), ...cols(data))
    .run();
}
async function deleteDoc(env, coll, id) {
  await env.DB.prepare('UPDATE docs SET deleted=1,updated=? WHERE coll=? AND id=?').bind(stamp(), coll, id).run();
}
async function allDocs(env, coll) {
  const { results } = await env.DB.prepare('SELECT id,data FROM docs WHERE coll=? AND deleted=0').bind(coll).all();
  return results.map((r) => ({ id: r.id, data: JSON.parse(r.data) }));
}

/* ---------------- Rezept aus einem Link lesen (schema.org/Recipe) ---------------- */
const decodeHtml = (x) => String(x || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
function findRecipe(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) { for (const x of node) { const r = findRecipe(x, depth + 1); if (r) return r; } return null; }
  if (typeof node !== 'object') return null;
  const t = node['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return node;
  return findRecipe(node['@graph'], depth + 1) || findRecipe(node.mainEntity, depth + 1);
}
async function readRecipe(raw) {
  let u;
  try { u = new URL(raw.trim()); } catch (e) { throw new Error('Das ist kein gültiger Link.'); }
  if (u.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname) || !u.hostname.includes('.')) throw new Error('Bitte einen https-Link zu einer Rezeptseite einfügen.');
  const r = await fetch(u.toString(), { headers: { 'user-agent': 'Mozilla/5.0 (FamilyApp Rezeptleser)', accept: 'text/html' }, redirect: 'follow', cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error('Die Seite antwortet nicht (' + r.status + ').');
  const html = (await r.text()).slice(0, 2000000);
  let rec = null;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { rec = findRecipe(JSON.parse(m[1].trim())); } catch (e) { /* nächstes */ }
    if (rec) break;
  }
  const og = (k) => { const m = html.match(new RegExp('<meta[^>]+property=["\']og:' + k + '["\'][^>]+content=["\']([^"\']+)', 'i')); return m ? decodeHtml(m[1]) : ''; };
  const titel = decodeHtml((rec && rec.name) || og('title') || (html.match(/<title>([^<]+)/i) || [])[1] || u.hostname).slice(0, 120);
  const zutaten = rec && Array.isArray(rec.recipeIngredient) ? rec.recipeIngredient.map(decodeHtml).filter(Boolean).slice(0, 60) : [];
  const y = rec ? (Array.isArray(rec.recipeYield) ? rec.recipeYield.join(' ') : String(rec.recipeYield || '')) : '';
  const portionen = Number((y.match(/\d+/) || [])[0]) || 0;
  let bild = rec && rec.image ? (typeof rec.image === 'string' ? rec.image : Array.isArray(rec.image) ? (typeof rec.image[0] === 'string' ? rec.image[0] : rec.image[0] && rec.image[0].url) : rec.image.url) : og('image');
  if (bild && !/^https:\/\//.test(bild)) bild = '';
  return { url: u.toString(), quelle: u.hostname.replace(/^www\./, ''), titel, zutaten, portionen, bild: bild || '' };
}

/* ---------------- Face ID (Passkeys / WebAuthn) ---------------- */
function cbor(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let i = 0;
  const len = (ai) => {
    if (ai < 24) return ai;
    if (ai === 24) return b[i++];
    if (ai === 25) { const v = (b[i] << 8) | b[i + 1]; i += 2; return v; }
    if (ai === 26) { const v = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; i += 4; return v; }
    throw new Error('CBOR');
  };
  const item = () => {
    const ib = b[i++], mt = ib >> 5, ai = ib & 31;
    if (mt === 0) return len(ai);
    if (mt === 1) return -1 - len(ai);
    if (mt === 2) { const n = len(ai); const v = b.slice(i, i + n); i += n; return v; }
    if (mt === 3) { const n = len(ai); const v = new TextDecoder().decode(b.slice(i, i + n)); i += n; return v; }
    if (mt === 4) { const n = len(ai); const a = []; for (let k = 0; k < n; k++) a.push(item()); return a; }
    if (mt === 5) { const n = len(ai); const m = new Map(); for (let k = 0; k < n; k++) { const key = item(); m.set(key, item()); } return m; }
    if (mt === 7) return ai === 20 ? false : ai === 21 ? true : null;
    throw new Error('CBOR');
  };
  const v = item();
  if (v instanceof Map) { const o = {}; for (const [k, x] of v) o[k] = x; o.__map = v; return o; }
  return v;
}
function parseAuthData(a) {
  const ad = a instanceof Uint8Array ? a : new Uint8Array(a);
  const out = { rpIdHash: ad.slice(0, 32), flags: ad[32], counter: ((ad[33] << 24) >>> 0) + (ad[34] << 16) + (ad[35] << 8) + ad[36] };
  if (out.flags & 64) {
    const n = (ad[53] << 8) | ad[54];
    const id = ad.slice(55, 55 + n);
    const rest = ad.slice(55 + n);
    const key = cbor(rest);
    out.cred = { id, key: key.__map };
  }
  return out;
}
function derToRaw(der) {
  const d = der instanceof Uint8Array ? der : new Uint8Array(der);
  if (d.length === 64 || d[0] !== 0x30) return d;
  let i = 2;
  const part = () => { i++; const n = d[i++]; let v = d.slice(i, i + n); i += n; while (v.length > 32 && v[0] === 0) v = v.slice(1); const o = new Uint8Array(32); o.set(v, 32 - v.length); return o; };
  const r = part(), s2 = part();
  const raw = new Uint8Array(64); raw.set(r, 0); raw.set(s2, 32);
  return raw;
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
const PREF_DEF = { ruheVon: '22:00', ruheBis: '06:30', morgenWerktag: '06:30', morgenWochenende: '09:00', woche: '18:00' };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function normPrefs(raw) {
  let p = raw;
  try { p = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { p = null; }
  const o = { ...PREF_DEF };
  for (const k of Object.keys(PREF_DEF)) if (p && (HHMM.test(String(p[k] || '')) || (k === 'woche' && p[k] === 'aus'))) o[k] = p[k];
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
  if (coll === 'infos' && !adult(u)) return false; // Familien-Infos pflegen nur Erwachsene
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
    for (const k of keys) if (!['done', 'doneAt', 'notizen'].includes(k) && JSON.stringify(od[k]) !== JSON.stringify(nd[k])) return false;
  }
  return true;
}
const can = (u, area) => lvl(u, area) !== 'off';
// Sprache -> Text (Workers AI Whisper). Audio kommt als Base64 (iPhone: mp4/aac, Android/PC: webm/opus).
async function transcribe(env, b64) {
  let r;
  try { r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio: b64, language: 'de' }); }
  catch (e) { const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); r = await env.AI.run('@cf/openai/whisper', { audio: [...arr] }); }
  return String((r && (r.text || r.response)) || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}
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
  const d0 = from.slice(0, 10), d1 = addDaysIso(to.slice(0, 10), 2);
  const { results } = await env.DB.prepare("SELECT id,data FROM docs WHERE coll='eintraege' AND deleted=0 AND ((kind='termin' AND (rec=1 OR (due>=? AND due<=?))) OR (kind='aufgabe' AND done=0 AND due>=? AND due<=?))").bind(d0, d1, d0, to.slice(0, 10)).all();
  const E = results.map((x) => ({ id: x.id, ...JSON.parse(x.data) }));
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
async function weekPreview(env, u, t0 = berlin().date) {
  const E = (await allDocs(env, 'eintraege')).map((x) => x.data).filter((d) => canRead(u, 'eintraege', d) && !d.vorschlag);
  const days = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDaysIso(t0, i);
    let ter = can(u, 'termine') ? E.filter((e) => e.kind === 'termin' && onDay(e, d)).map((e) => ({ ...e, start: onDay(e, d) })) : [];
    if (seesExternal(u)) { const c = await getSetting(env, 'calext'); if (c) ter = ter.concat(c.events.filter((x) => x.start.slice(0, 10) === d)); }
    if (ter.length) days.push(WDN[new Date(d + 'T12:00:00Z').getUTCDay()].slice(0, 2) + ': ' + ter.sort((a, b) => String(a.start).localeCompare(String(b.start))).map((e) => (String(e.start).length > 10 ? String(e.start).slice(11, 16) + ' ' : '') + e.titel).join(', '));
  }
  const due = can(u, 'aufgaben') ? E.filter((e) => e.kind === 'aufgabe' && !e.done && e.faellig && e.faellig <= addDaysIso(t0, 7) && (String(e.fuer || 'wir') === 'wir' || e.fuer === u.id)).length : 0;
  const lines = days.length ? days : ['Keine Termine in der kommenden Woche.'];
  if (due) lines.push(due + (due === 1 ? ' Aufgabe ist' : ' Aufgaben sind') + ' bis nächsten Sonntag fällig.');
  return lines.join('\n');
}
async function weekly(env, from, to) {
  const users = await activeUsers(env);
  let n = 0;
  for (const u of users) {
    if (u.prefs.woche === 'aus') continue;
    for (const day of new Set([from.slice(0, 10), to.slice(0, 10)])) {
      if (new Date(day + 'T12:00:00Z').getUTCDay() !== 0) continue;
      const at = day + 'T' + u.prefs.woche;
      if (!(at > from && at <= to)) continue;
      if (!(await once(env, 'w:' + u.id + ':' + day))) continue;
      await notify(env, [u], 'Deine Woche', await weekPreview(env, u, day), true);
      n++;
    }
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
    if (ev.type === 'kommentar') await notify(env, users.filter((u) => (u.id === d.by || u.id === d.fuer) && canRead(u, 'eintraege', d)), me.name + ' zu „' + String(d.titel || '').slice(0, 40) + '“', String((ev.note && ev.note.text) || '').slice(0, 200), false);
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
      if (old && Array.isArray(data.notizen) && data.notizen.length > (old.notizen || []).length) events.push({ type: 'kommentar', data, note: data.notizen[data.notizen.length - 1] });
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
const QU={g:['g',1],gr:['g',1],gramm:['g',1],kg:['g',1000],kilo:['g',1000],ml:['ml',1],l:['ml',1000],liter:['ml',1000],stk:['Stk',1],'stück':['Stk',1],st:['Stk',1],x:['Stk',1],el:['EL',1],tl:['TL',1],pck:['Pck',1],packung:['Pck',1],packungen:['Pck',1],dose:['Dose',1],dosen:['Dose',1],bund:['Bund',1],becher:['Becher',1],flasche:['Flasche',1],flaschen:['Flasche',1],glas:['Glas',1],'gläser':['Glas',1],zehe:['Zehe',1],zehen:['Zehe',1],scheibe:['Scheibe',1],scheiben:['Scheibe',1]};
const qNum=x=>x==='½'?0.5:x==='¼'?0.25:parseFloat(String(x).replace(',','.'));
function qtyOf(s){const m=String(s||'').trim().match(/^(\d+(?:[.,]\d+)?|½|¼)\s*([A-Za-zäöüÄÖÜß]+)?\.?$/);if(!m)return null;const n=qNum(m[1]);if(!(n>0))return null;if(!m[2])return{n,u:'Stk'};const u=QU[m[2].toLowerCase()];return u?{n:n*u[1],u:u[0]}:null}
function splitItem(t){
  t=String(t||'').trim().replace(/\s+/g,' ');
  const unit=w=>w?QU[w.replace(/\.$/,'').toLowerCase()]:null;
  let m=t.match(/^(\d+(?:[.,]\d+)?|½|¼)\s*(.+)$/);
  if(m){const n=qNum(m[1]);const w=m[2].match(/^([A-Za-zäöüÄÖÜß]+\.?)\s+(.+)$/);const u=w&&unit(w[1]);if(u)return{name:w[2],qty:{n:n*u[1],u:u[0]}};const u2=unit(m[2].split(' ')[0]);if(u2&&!w)return{name:m[2],qty:null};return{name:m[2],qty:{n,u:'Stk'}}}
  m=t.match(/^(.+?)\s+(\d+(?:[.,]\d+)?|½|¼)\s*([A-Za-zäöüÄÖÜß]+\.?)?$/);
  if(m){const u=unit(m[3]);if(!m[3]||u)return{name:m[1],qty:{n:qNum(m[2])*(u?u[1]:1),u:u?u[0]:'Stk'}}}
  return{name:t,qty:null};
}
function addQty(a,b){if(!a)return b;if(!b)return a;return a.u===b.u?{n:a.n+b.n,u:a.u}:null}
function fmtQty(q){if(!q)return'';let n=q.n,u=q.u;if(u==='g'&&n>=1000){n/=1000;u='kg'}if(u==='ml'&&n>=1000){n/=1000;u='l'}return(Math.round(n*100)/100).toLocaleString('de-DE')+' '+u}

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
      const sp = splitItem(base.titel), qty = qtyOf(it.menge) || sp.qty;
      base.titel = sp.name.slice(0, 80);
      const ex = E.find((x) => x.data.kind === 'einkauf' && !x.data.done && !x.data.liste && splitItem(x.data.titel).name.toLowerCase() === base.titel.toLowerCase());
      if (ex) {
        const sum = addQty(qtyOf(ex.data.menge) || splitItem(ex.data.titel).qty, qty);
        if (qty && sum) { ops.push({ op: 'update', coll: 'eintraege', id: ex.id, data: { menge: fmtQty(sum) } }); lines.push({ text: 'Menge erhöht: ' + ex.data.titel + ' (' + fmtQty(sum) + ')', open: 'e:' + ex.id }); }
        else lines.push({ text: 'Steht schon auf der Liste: ' + ex.data.titel });
        continue;
      }
      Object.assign(base, { done: false, menge: qty ? fmtQty(qty) : String(it.menge || '').slice(0, 40) });
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
  if (p === '/api/passkey/login-options') {
    const c = rid(32);
    await env.DB.prepare('DELETE FROM challenges WHERE created<?').bind(Date.now() - 10 * 60000).run();
    await env.DB.prepare('INSERT INTO challenges(c,user_id,created) VALUES(?,NULL,?)').bind(c, Date.now()).run();
    return json({ challenge: c, rpId: url.hostname, userVerification: 'required', timeout: 120000 });
  }
  if (p === '/api/passkey/login' && req.method === 'POST') {
    const fail = (m) => bad(m || 'Anmeldung mit Face ID hat nicht geklappt.', 401);
    try {
      const cdRaw = ub64u(String(body.clientDataJSON || ''));
      const cd = JSON.parse(new TextDecoder().decode(cdRaw));
      if (cd.type !== 'webauthn.get' || cd.origin !== url.origin) return fail();
      const ch = await env.DB.prepare('SELECT * FROM challenges WHERE c=? AND user_id IS NULL').bind(cd.challenge).first();
      if (!ch || ch.created < Date.now() - 5 * 60000) return fail('Anfrage abgelaufen. Bitte noch einmal.');
      await env.DB.prepare('DELETE FROM challenges WHERE c=?').bind(cd.challenge).run();
      const pk = await env.DB.prepare('SELECT * FROM passkeys WHERE id=?').bind(String(body.id || '')).first();
      if (!pk) return fail('Diesen Face-ID-Schlüssel kennt die App nicht mehr. Bitte mit Passwort anmelden.');
      const authData = ub64u(String(body.authenticatorData || ''));
      const ad = parseAuthData(authData);
      if (b64u(ad.rpIdHash) !== b64u(await crypto.subtle.digest('SHA-256', enc.encode(url.hostname)))) return fail();
      if (!(ad.flags & 1) || !(ad.flags & 4)) return fail();
      const key = await crypto.subtle.importKey('jwk', JSON.parse(pk.jwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const signed = new Uint8Array(authData.length + 32);
      signed.set(authData, 0); signed.set(new Uint8Array(await crypto.subtle.digest('SHA-256', cdRaw)), authData.length);
      const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(ub64u(String(body.signature || ''))), signed);
      if (!ok) return fail();
      if (ad.counter && pk.counter && ad.counter <= pk.counter) return fail('Dieser Schlüssel wurde kopiert. Bitte mit Passwort anmelden.');
      await env.DB.prepare('UPDATE passkeys SET counter=? WHERE id=?').bind(ad.counter, pk.id).run();
      const u = await env.DB.prepare('SELECT * FROM users WHERE id=? AND active=1').bind(pk.user_id).first();
      if (!u) return fail();
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie(await newSession(env, u.id)) });
    } catch (e) { return fail(); }
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
    for (const k of Object.keys(PREF_DEF)) if (HHMM.test(String(body[k] || '')) || (k === 'woche' && body[k] === 'aus')) np[k] = body[k];
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
  if (p === '/api/transcribe' && req.method === 'POST') {
    if (!canCapture(me)) return bad('Dafür fehlt dir die Berechtigung.', 403);
    const a = String(body.audio || '');
    if (a.length < 200 || a.length > 8_000_000) return bad('Die Aufnahme war leer oder zu lang.');
    try { return json({ text: await transcribe(env, a) }); } catch (e) { return bad('Die Sprache konnte nicht umgewandelt werden.', 502); }
  }
  if (p === '/api/rezept' && req.method === 'POST') {
    try { return json(await readRecipe(String(body.url || ''))); } catch (e) { return bad(e.message || 'Das Rezept konnte nicht gelesen werden.', 422); }
  }
  if (p === '/api/einkaufen' && req.method === 'POST') {
    if (!['edit', 'mine'].includes(lvl(me, 'einkauf'))) return bad('Dafür fehlt dir die Berechtigung.', 403);
    const slot = Math.floor(Date.now() / (30 * 60000));
    if (!(await once(env, 'shop:' + me.id + ':' + slot))) return json({ ok: true, sent: 0, again: true });
    const open = (await allDocs(env, 'eintraege')).filter((x) => x.data.kind === 'einkauf' && !x.data.done && (!x.data.liste || x.data.liste === String(body.liste || ''))).length;
    const to = (await activeUsers(env)).filter((u) => u.id !== me.id && !u.profil && can(u, 'einkauf'));
    await notify(env, to, me.name + ' geht einkaufen', 'Fehlt noch etwas? Jetzt auf die Liste setzen. Aktuell ' + open + (open === 1 ? ' Artikel.' : ' Artikel.'), false);
    return json({ ok: true, sent: to.length });
  }
  if (p === '/api/passkey/options') {
    const c = rid(32);
    await env.DB.prepare('INSERT INTO challenges(c,user_id,created) VALUES(?,?,?)').bind(c, me.id, Date.now()).run();
    const { results } = await env.DB.prepare('SELECT id FROM passkeys WHERE user_id=?').bind(me.id).all();
    return json({ challenge: c, rp: { name: 'Family App', id: url.hostname }, user: { id: b64u(enc.encode(me.id)), name: me.name, displayName: me.name }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }], authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, timeout: 120000, excludeCredentials: results.map((r) => ({ type: 'public-key', id: r.id })), attestation: 'none' });
  }
  if (p === '/api/passkey/register' && req.method === 'POST') {
    try {
      const cd = JSON.parse(new TextDecoder().decode(ub64u(String(body.clientDataJSON || ''))));
      if (cd.type !== 'webauthn.create' || cd.origin !== url.origin) throw new Error('Herkunft passt nicht.');
      const ch = await env.DB.prepare('SELECT * FROM challenges WHERE c=? AND user_id=?').bind(cd.challenge, me.id).first();
      if (!ch || ch.created < Date.now() - 5 * 60000) throw new Error('Anfrage abgelaufen. Bitte noch einmal.');
      await env.DB.prepare('DELETE FROM challenges WHERE c=?').bind(cd.challenge).run();
      const att = cbor(ub64u(String(body.attestationObject || '')));
      const ad = parseAuthData(att.authData);
      if (!ad.cred) throw new Error('Kein Schlüssel erhalten.');
      if (b64u(ad.rpIdHash) !== b64u(await crypto.subtle.digest('SHA-256', enc.encode(url.hostname)))) throw new Error('Falsche Adresse.');
      if (!(ad.flags & 4)) throw new Error('Face ID oder Code wurde nicht bestätigt.');
      const k = ad.cred.key;
      if (k.get(1) !== 2 || k.get(3) !== -7 || k.get(-1) !== 1) throw new Error('Dieser Schlüsseltyp wird nicht unterstützt.');
      const jwk = { kty: 'EC', crv: 'P-256', x: b64u(k.get(-2)), y: b64u(k.get(-3)) };
      await env.DB.prepare('INSERT INTO passkeys(id,user_id,jwk,counter,created) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,jwk=excluded.jwk').bind(b64u(ad.cred.id), me.id, JSON.stringify(jwk), ad.counter, nowIso()).run();
      return json({ ok: true });
    } catch (e) { return bad(e.message || 'Face ID konnte nicht eingerichtet werden.'); }
  }
  if (p === '/api/passkey' && req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM passkeys WHERE user_id=?').bind(me.id).run();
    return json({ ok: true });
  }
  if (p === '/api/passkey') {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id=?').bind(me.id).first();
    return json({ count: r.n });
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
      await env.DB.prepare('DELETE FROM passkeys WHERE user_id=?').bind(target.id).run();
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
      await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id), env.DB.prepare('DELETE FROM push WHERE user_id=?').bind(target.id), env.DB.prepare('DELETE FROM passkeys WHERE user_id=?').bind(target.id), env.DB.prepare('DELETE FROM tokens WHERE user_id=?').bind(target.id), env.DB.prepare('DELETE FROM users WHERE id=?').bind(target.id)]);
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
  try { out.weekly = await weekly(env, from, to); } catch (e) { out.err = e.message; }
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
export const _test = { readRecipe, tick, parseEvents, inQuiet, normPrefs, housekeeping, weeklyBackup, getCred, onDay, buildIcs, weekPreview, cbor, derToRaw };

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
