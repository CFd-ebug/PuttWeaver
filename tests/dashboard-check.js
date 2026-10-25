// The Manager dashboard: shot replays, play statistics, and that only games played on the projector count.
// A Host and a wide Manager (a touch screen) talk through the fake database. The Host plays Map Quest on its projector view.
const { chromium } = require('playwright');
const { dist, out } = require('./lib');
const { startFake } = require('./fake-rtdb');
const fails = [], notes = [];
const check = (ok, what) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 100) => { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > ms) return false; await sleep(step); } };

(async () => {
  const fake = await startFake();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  async function phone(role, file, vp) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(url => { try { if (!localStorage.getItem('putt-lab-relay-url')) localStorage.setItem('putt-lab-relay-url', url); } catch (e) {} }, fake.url);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(role + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(role + ' console: ' + m.text()); });
    await page.goto(dist(file, role)); await page.waitForTimeout(400);
    return { ctx, page };
  }
  const host = await phone('host', 'test.html', { width: 1280, height: 800 });
  await host.page.locator('#btnPair').click();
  const code = await until(async () => { const t = (await host.page.locator('#pairCode').innerText()).replace('-', '').trim(); return t.length === 8 && t; });
  const room = fake.get('pair/' + code).room;
  const mgr = await phone('manage', 'index.html', { width: 2560, height: 1600 });
  await mgr.page.fill('#mgrCodeIn', code); await mgr.page.click('#mgrJoinBtn');
  check(await until(() => mgr.page.locator('#mgrRun').isVisible()), 'The Manager joins');
  await host.page.locator('#pairClose').click();

  // ---- the Host plays one Map Quest hole on its projector view ----
  await host.page.evaluate(() => { const L = window.__lab; L.set('latency', 0); L.select(1); L.enterProj(); });
  await sleep(300);
  const play = () => host.page.evaluate(async () => {
    const L = window.__lab, g = L.game, a = g.autoPutt(); L.putt(a.angle, a.frac);
    for (let i = 0; i < 4000 && L.mode !== 'result' && L.mode !== 'over'; i++) L.tick(1 / 60);
    await new Promise(r => setTimeout(r, 1200));                 // let the frame loop draw the result (the snapshot is taken there)
    return L.mode;
  });
  for (let k = 0; k < 4; k++) {
    const m = await play();
    if (k < 3) check(m === 'result', 'Shot ' + (k + 1) + ' has a result');
    await host.page.evaluate(() => window.__lab.advance());
    if (k === 1) {
      const shots = await until(() => { const s = fake.get('rooms/' + room + '/shots'); return s && Object.keys(s).length >= 2 && s; });
      const first = shots && (Array.isArray(shots) ? shots.filter(Boolean)[0] : Object.values(shots)[0]);
      check(!!first && first.tgt && first.tgt.name && Array.isArray(first.path) && first.path.length > 3, 'A shot record carries the target, the ball path and the result');
      check(!!first && typeof first.img === 'string' && first.img.startsWith('data:image/jpeg') && first.img.length < 60000, 'A shot record carries a small picture of the projected sheet (' + (first && first.img ? Math.round(first.img.length / 1000) + ' kB' : 'none') + ')');
    }
  }
  check(await until(() => (fake.get('rooms/' + room + '/stats') || {}).n === 1), 'Finishing a hole adds it to the running totals');
  const stats = fake.get('rooms/' + room + '/stats') || {};
  check(Object.values(stats.places || {}).reduce((a, p) => a + p.n, 0) === 4, 'Each of the four places is counted once');
  check(!!stats.holes && stats.holes.map && Object.values(stats.holes.map).reduce((a, b) => a + b, 0) === 1, 'The hole score is counted under its game');

  // ---- the dashboard ----
  await mgr.page.waitForTimeout(800);
  check(await until(async () => (await mgr.page.locator('#mgrShots .d-shot').count()) === 4, 8000), 'The dashboard lists the four shots of the hole');
  check(await until(async () => /1 played/i.test(await mgr.page.locator('#mgrLadder .eyebrow').innerText())), 'The score ladder shows how many holes were played');
  check(await mgr.page.locator('#mgrShots .d-pst').count() >= 1, 'Shot cards show how all players did on that place');
  check(await mgr.page.locator('#mgrRepSw button').count() === 4, 'The replay has a switch for each shot');
  const canvasInk = async sel => mgr.page.locator(sel).evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] && (d[i] < 200 || d[i + 2] < 200)) n++; return n; });
  check(await canvasInk('#mgrReplay') > 50, 'The replay canvas is drawing');
  check(await canvasInk('#mgrWorld') > 50, 'The world map of everyone’s results is drawn');
  const seen = new Set(); for (let i = 0; i < 14; i++) { seen.add(await mgr.page.locator('#mgrReplay').evaluate(c => c.toDataURL())); await sleep(300); }
  check(seen.size >= 5, 'The replay keeps looping (' + seen.size + ' different frames in four seconds)');
  await mgr.page.screenshot({ path: out + '/dashboard.png' });
  await mgr.page.setViewportSize({ width: 420, height: 860 }); await sleep(300);
  check(await mgr.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'The dashboard fits a phone without sideways scrolling');
  await mgr.page.screenshot({ path: out + '/dashboard-phone.png', fullPage: true });
  await mgr.page.setViewportSize({ width: 2560, height: 1600 });

  // ---- touch confirm ----
  const idx0 = await mgr.page.evaluate(() => 0), g0 = await mgr.page.locator('#mgrGame').innerText();
  await mgr.page.locator('[data-cmd="next"]').click(); await sleep(700);
  check((await host.page.locator('#gTitle').innerText()) === g0, 'One tap on Next game only arms it');
  check(/Tap again/.test(await mgr.page.locator('[data-cmd="next"]').innerText()), 'The armed key says Tap again');
  await mgr.page.locator('[data-cmd="next"]').click();
  check(await until(async () => (await host.page.locator('#gTitle').innerText()) !== g0), 'A second tap sends it');

  // ---- reset ----
  fake.put('rooms/' + room + '/cmd/-Nreset', { type: 'resetstats', args: {}, ts: Date.now(), ttl: 8000 });
  check(await until(() => !fake.get('rooms/' + room + '/stats') && !fake.get('rooms/' + room + '/shots')), 'The reset command clears the totals and the replays');
  check(await until(async () => /nobody has finished one yet/i.test(await mgr.page.locator('#mgrLadder .eyebrow').innerText().catch(() => ''))), 'The dashboard shows empty totals after a reset');

  // ---- an Evaluator never counts ----
  const ev = await phone('play', 'test.html', { width: 1280, height: 800 });
  await ev.page.evaluate(async () => { const L = window.__lab; L.select(1); for (let k = 0; k < 4; k++) { const a = L.game.autoPutt(); L.putt(a.angle, a.frac); for (let i = 0; i < 4000 && L.mode !== 'result'; i++) L.tick(1 / 60); L.advance(); } });
  await sleep(2500);
  check(!fake.get('rooms/' + room + '/stats') && !fake.get('rooms/' + room + '/shots'), 'Holes played on an Evaluator add nothing to the database');

  await browser.close(); await fake.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
