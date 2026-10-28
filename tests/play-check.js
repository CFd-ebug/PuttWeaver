// Closed-loop putts with a realistic (projector-lit) yellow ball. usage: node play-check.js "<game>" [ref|hue] [shadow] [shots]
const { chromium } = require('playwright');
const { dist, out } = require('./lib');
const gameName = process.argv[2] || 'Paint Wars', method = process.argv[3] || 'ref', shadow = process.argv[4] === 'shadow', nShots = +(process.argv[5] || 3);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('test.html')); await page.waitForTimeout(500);
  await page.getByRole('button', { name: new RegExp('^' + gameName) }).click();
  await page.locator('#btnLive').click(); await page.waitForTimeout(300);
  await page.selectOption('#lpSource', 'sim'); await page.locator('#lpStart').click(); await page.waitForTimeout(800);
  await page.evaluate(q => { const L = window.__lab; L.LIVE.simYellow = true; L.simCam.noise = 0.04; if (q) L.simCam.quad = q; }, process.env.SIMQUAD ? JSON.parse(process.env.SIMQUAD) : null);   // SIMQUAD='[[x,y],...]' puts the camera at another angle
  await page.locator('#lpCal').click();
  await page.waitForFunction(() => { const L = window.__lab.LIVE; return L.cal && L.cal.checkAvg != null && !L.calib; }, null, { timeout: 90000 });
  await page.locator('#lpSample').click(); await page.waitForTimeout(1800);
  await page.evaluate(m => { const L = window.__lab.LIVE; L.method = m; }, method);
  await page.locator('#lpPlay').click(); await page.waitForTimeout(300);
  if (shadow) await page.evaluate(() => { const L = window.__lab; L.LIVE.simPerson = {body:[L.W*0.62, L.D*0.45]}; });   // someone standing still mid-sheet: their shadow
  const shots = [];
  for (let k = 0; k < nShots; k++){
    try { await page.waitForFunction(() => window.__lab.LIVE.state === 'ready' && window.__lab.mode === 'aim', null, { timeout: 40000 }); }
    catch (e) { const st = await page.evaluate(() => { const L = window.__lab, V = L.LIVE; return {state:V.state, mode:L.mode, busy:V.busy, motion:V.motion, floor:V.floor, lastSeen:V.lastSeen, clock:0, ball:L.ball, det:V.det && V.det.best && [V.det.best.x, V.det.best.y], log:V.log.slice(-8).map(e => e.msg)}; }); console.log('STUCK', JSON.stringify(st));
      const tr = await page.evaluate(() => new Promise(res => { const V = window.__lab.LIVE, out = []; let k = 0; const id = setInterval(() => { out.push([V.busy ? 1 : 0, +(V.motion*100).toFixed(2), +(V.floor*100).toFixed(2), V.det && V.det.best ? [+V.det.best.x.toFixed(2), +V.det.best.y.toFixed(2), V.det.best.area] : 0, +V.lastSeen.toFixed(2), +V.busyAt.toFixed(2), +V.resultAt.toFixed(2), V.log.length ? +V.log[V.log.length-1].clock.toFixed(2) : 0].join(' ')); if (++k > 40){ clearInterval(id); res(out); } }, 100); }));
      console.log(tr.join('\n')); await page.screenshot({ path: out + '/' + ('stuck.png') }); break; }
    const f0 = await page.evaluate(() => ({fr:window.__lab.LIVE.stats.frames, hits:window.__lab.LIVE.stats.hits, log:window.__lab.LIVE.log.length}));
    const dx = [-25, 15, 40, -40, 5][k % 5], dy = [70, 85, 60, 95, 75][k % 5];
    await page.mouse.move(640, 650); await page.mouse.down(); await page.mouse.move(640 + dx, 650 + dy, { steps: 5 }); await page.mouse.up();
    await page.waitForFunction(() => window.__lab.mode === 'result' || window.__lab.mode === 'over', null, { timeout: 40000 });
    const r = await page.evaluate(f0 => { const L = window.__lab, s = L.shot, V = L.LIVE; return {title:document.getElementById('rTitle').textContent, rest:s.rest ? [+s.rest.x.toFixed(2), +s.rest.y.toFixed(2)] : null, why:s.why, ball:[+L.ball.x.toFixed(2), +L.ball.y.toFixed(2)], samples:s.delivered.length, seenDuringShot:V.stats.hits - f0.hits, frames:V.stats.frames - f0.fr, log:V.log.slice(f0.log).map(e => e.msg).filter(m => /Lost|left|wasn’t|found at rest/.test(m))}; }, f0);
    r.errIn = r.rest ? +(Math.hypot(r.rest[0]-r.ball[0], r.rest[1]-r.ball[1])*12).toFixed(2) : null;
    shots.push(r);
  }
  const errs = shots.filter(s => s.errIn != null).map(s => s.errIn);
  console.log(`${gameName} · ${method}${shadow ? ' · shadow' : ''}: ${errs.length}/${shots.length} scored · max error ${errs.length ? Math.max(...errs).toFixed(2) : '-'} in · samples per shot ${shots.map(s => s.samples).join(', ')}`);
  for (const s of shots) console.log('  ', JSON.stringify(s));
  if (shadow){ await page.keyboard.press('d'); await page.waitForTimeout(600); await page.screenshot({ path: out + '/' + ('shadow.png') }); }
  console.log('ERRORS', errors.length ? errors.join('; ') : 'none');
  await browser.close();
})();
