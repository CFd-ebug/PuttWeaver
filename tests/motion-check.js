// For each game: how much of the sheet the game's own animation changes (must stay under the movement guard),
// and whether a round sets itself up (empty-sheet photo) and becomes ready. Then a person walks across the sheet.
const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('test.html')); await page.waitForTimeout(500);
  await page.locator('#btnLive').click(); await page.waitForTimeout(300);
  await page.selectOption('#lpSource', 'sim'); await page.locator('#lpStart').click(); await page.waitForTimeout(800);
  await page.evaluate(() => { const L = window.__lab; L.LIVE.simYellow = true; L.simCam.noise = 0.035; L.LIVE.simManual = true; });
  await page.locator('#lpCal').click();
  await page.waitForFunction(() => { const L = window.__lab.LIVE; return L.cal && L.cal.checkAvg != null && !L.calib; }, null, { timeout: 90000 });
  await page.locator('#lpSample').click(); await page.waitForTimeout(1800);
  await page.locator('#lpPlay').click(); await page.waitForTimeout(300);
  const n = await page.evaluate(() => document.querySelectorAll('#gameList button, .game-btn').length);
  for (let i = 0; i < 10; i++){
    await page.evaluate(i => { const L = window.__lab; L.select(i); L.LIVE.on && window.__lab.LIVE.state; }, i);
    await page.keyboard.press('n');   // re-arm for the new game
    const t0 = Date.now();
    let ok = true;
    try { await page.waitForFunction(() => window.__lab.LIVE.state === 'ready', null, { timeout: 30000 }); } catch (e) { ok = false; }
    const armS = ((Date.now() - t0)/1000).toFixed(1);
    const m = await page.evaluate(() => new Promise(res => { const V = window.__lab.LIVE, xs = []; let busy = 0, k = 0; const id = setInterval(() => { xs.push(V.motion); busy += V.busy ? 1 : 0; k++; if (k >= 20){ clearInterval(id); res({max:Math.max(...xs), avg:xs.reduce((a,b)=>a+b,0)/xs.length, floor:V.floor, busy:busy/k, hits:V.det && V.det.best ? 1 : 0}); } }, 150); }));
    const name = await page.evaluate(() => window.__lab.game.name);
    console.log(`${name.padEnd(18)} ready ${ok ? 'yes' : 'NO '} in ${armS} s · motion max ${(m.max*100).toFixed(2)}% avg ${(m.avg*100).toFixed(2)}% floor ${(m.floor*100).toFixed(2)}% · guard on ${Math.round(m.busy*100)}% · false ball ${m.hits}`);
  }
  // someone walks across the sheet while it's ready: the guard must hold shot starts
  await page.evaluate(() => window.__lab.select(1)); await page.keyboard.press('n');
  await page.waitForFunction(() => window.__lab.LIVE.state === 'ready', null, { timeout: 30000 });
  const w = await page.evaluate(() => new Promise(res => { const L = window.__lab, V = L.LIVE, W = L.W, D = L.D, t0 = performance.now(); let busy = 0, k = 0, maxM = 0;
    const id = setInterval(() => { const t = (performance.now() - t0)/1000, u = t/5; V.simPerson = {body:[(0.1 + 0.8*u)*W, (0.85 - 0.4*u)*D], x:(0.13 + 0.8*u)*W, y:(0.6 - 0.3*u)*D, arm:[(0.1 + 0.8*u)*W, (0.75 - 0.3*u)*D], skin:'#c68642'};
      busy += V.busy ? 1 : 0; k++; maxM = Math.max(maxM, V.motion);
      if (t > 5){ clearInterval(id); V.simPerson = null; res({busy:busy/k, maxM, state:V.state, starts:V.stats.moveStarts + V.stats.restStarts}); } }, 50); }));
  console.log(`Person walking across: guard on ${Math.round(w.busy*100)}% of the time, peak ${(w.maxM*100).toFixed(1)}% · state ${w.state} · shots started so far ${w.starts}`);
  const log = await page.evaluate(() => window.__lab.LIVE.log.slice(-40).map(e => e.clock.toFixed(1) + " " + e.msg));
  for (const l of log) console.log('   log:', l);
  console.log('ERRORS', errors.length ? errors.join('; ') : 'none');
  await browser.close();
})();
