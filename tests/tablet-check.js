// The Manager console on a wide tablet (the event display is 2960 x 1848): Run, Setup and Debug each fit one screen with no scrolling,
// with a full hole of shot cards on the Run tab. Also checks a few other wide screens and that the game picker fits.
const { chromium } = require('playwright');
const { dist, out, unlockManager } = require('./lib');
const { startFake } = require('./fake-rtdb');
const fails = [], notes = [];
const check = (ok, what) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > ms) return false; await sleep(100); } };

(async () => {
  const fake = await startFake();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  async function open(role, file, vp) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(u => { try { localStorage.setItem('putt-lab-relay-url', u); } catch (e) {} }, fake.url);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(role + ' pageerror: ' + e.message));
    await page.goto(dist(file, role)); await page.waitForTimeout(400);
    return { ctx, page };
  }
  const host = (await open('host', 'test.html', { width: 1280, height: 800 })).page;
  await host.locator('#btnPair').click();
  const code = await until(async () => { const t = (await host.locator('#pairCode').innerText()).replace('-', '').trim(); return t.length === 8 && t; });
  let played = false;
  const sizes = [[2960, 1848], [2560, 1600], [1920, 1080]];
  for (const [w, h] of sizes) {
    const m = (await open('manage', 'index.html', { width: w, height: h })).page;
    await m.fill('#mgrCodeIn', code); await m.click('#mgrJoinBtn'); await until(() => m.locator('#mgrRun').isVisible());
    if (!played) { played = true;
    await host.locator('#pairClose').click();
    await host.evaluate(() => { const L = window.__lab; L.set('latency', 0); L.select(1); L.enterProj(); }); await sleep(300);
    for (let k = 0; k < 4; k++) {          // a whole hole of four shots, the most the Run tab ever lists
      await host.evaluate(async () => { const L = window.__lab, a = L.game.autoPutt(); L.putt(a.angle, a.frac); for (let i = 0; i < 4000 && L.mode !== 'result' && L.mode !== 'over'; i++) L.tick(1 / 60); await new Promise(r => setTimeout(r, 1200)); });
      if (k < 3) await host.evaluate(() => window.__lab.advance());
    }
    }
    await until(() => m.locator('#mgrShots .d-shot').count().then(n => n >= 4), 15000); await sleep(1500);
    const fits = async name => { const r = await m.evaluate(() => { const d = document.documentElement; return { sh: d.scrollHeight, ih: innerHeight, sw: d.scrollWidth, iw: innerWidth }; }); check(r.sh <= r.ih && r.sw <= r.iw, `${w}x${h} ${name} tab fits one screen (${r.sw}x${r.sh} in ${r.iw}x${r.ih})`); };
    check(await m.locator('#mgrShots .d-shot').count() >= 4, `${w}x${h} four shot cards are listed`);
    await fits('Run'); await m.screenshot({ path: out + `/tablet-${w}-run.png` });
    await unlockManager(m);
    await m.click('.mgr-tab[data-tab="setup"]'); await sleep(700); await fits('Setup'); await m.screenshot({ path: out + `/tablet-${w}-setup.png` });
    await m.click('.mgr-tab[data-tab="debug"]'); await sleep(700); await fits('Debug');
    if (w === 2960) {
      await m.click('.mgr-tab[data-tab="run"]'); await sleep(300); await m.click('#mgrPickBtn'); await sleep(900);
      const r = await m.evaluate(() => { const o = document.getElementById('mgrPick'); return { sh: o.scrollHeight, ch: o.clientHeight }; });
      check(r.sh <= r.ch, `${w}x${h} the game picker fits one screen (${r.sh} in ${r.ch})`); await m.screenshot({ path: out + `/tablet-${w}-picker.png` });
    }
    await m.context().close();
  }
  await browser.close(); await fake.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
