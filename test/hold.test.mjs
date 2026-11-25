import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeEnv, serve } from './harness.mjs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const worker = (await import('../build/worker.js')).default;
const { srv } = await serve(worker, makeEnv(), 8798);
const browser = await chromium.launch();
const errs=[];
try{
const ctx = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, locale:'de-DE' });
const p = await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{const g=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('fa-intro-')?'1':g.call(this,k)};
 window.SpeechRecognition=window.webkitSpeechRecognition=class{start(){window.__rec=this;window.__started=(window.__started||0)+1}stop(){setTimeout(()=>this.onend&&this.onend(),20)}abort(){this.onend&&this.onend()}};});
await p.goto('http://localhost:8798'); await p.waitForSelector('#af input[name=code]');
await p.fill('[name=code]','geheim-123');await p.fill('[name=name]','Philippe');await p.fill('[name=password]','sicher123');await p.click('#af [type=submit]');
await p.waitForSelector('.tab[data-v=heute]');
if(await p.locator('.toast').count())await p.click('.toast [data-x=close]');
// Tippen -> Fenster, keine Aufnahme
await p.click('#fab'); await p.waitForSelector('#t'); assert.equal(await p.evaluate(()=>window.__started||0),0,'Tippen startet keine Aufnahme');
await p.click('[data-close]'); await p.waitForTimeout(300);
// Halten -> Aufnahme
const b=await p.locator('#fab').boundingBox();
await p.mouse.move(b.x+20,b.y+20);await p.mouse.down();await p.waitForTimeout(500);
assert.equal(await p.evaluate(()=>window.__started),1,'Halten startet Aufnahme');
assert.ok(await p.locator('.holdbub').count(),'Sprechblase sichtbar');
await p.evaluate(()=>window.__rec.onresult({results:[[{transcript:'Milch und Brot'}]]}));
assert.match(await p.textContent('.holdbub'),/Milch und Brot/);
await p.mouse.up(); await p.waitForSelector('#t');
assert.equal(await p.inputValue('#t'),'Milch und Brot');
assert.equal(await p.locator('.holdbub').count(),0);
assert.equal(await p.locator('.sheet').count(),1,'nur ein Fenster');
await p.screenshot({path:'test/shot-hold.png'});
assert.deepEqual(errs,[]);console.log('hold ok');
} finally { await browser.close(); srv.close(); }
