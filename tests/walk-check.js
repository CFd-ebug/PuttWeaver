const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('test.html')); await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Map Quest/ }).click();
  await page.locator('#btnLive').click(); await page.waitForTimeout(300);
  await page.selectOption('#lpSource', 'sim'); await page.locator('#lpStart').click(); await page.waitForTimeout(800);
  await page.evaluate(() => { const L = window.__lab; L.LIVE.simYellow = true; L.simCam.noise = 0.05; L.LIVE.simManual = true; });
  await page.locator('#lpCal').click();
  await page.waitForFunction(() => { const L = window.__lab.LIVE; return L.cal && L.cal.checkAvg != null && !L.calib; }, null, { timeout: 90000 });
  await page.locator('#lpSample').click(); await page.waitForTimeout(1800);
  await page.locator('#lpPlay').click(); await page.waitForTimeout(300);
  for (const skin of ['#c68642', '#e2b48f', '#8d5524', '#f1c27d']){
    await page.waitForFunction(() => window.__lab.LIVE.state === 'ready', null, { timeout: 40000 });
    const w = await page.evaluate(skin => new Promise(res => { const L = window.__lab, V = L.LIVE, W = L.W, D = L.D, t0 = performance.now(); let busy = 0, k = 0, maxM = 0; const dets = [], s0 = V.stats.moveStarts + V.stats.restStarts;
      const id = setInterval(() => { const t = (performance.now() - t0)/1000, u = Math.min(1, t/6);
        V.simPerson = t < 6 ? {body:[(0.1 + 0.8*u)*W, (0.85 - 0.4*u)*D], x:(0.13 + 0.8*u)*W, y:(0.6 - 0.3*u)*D, arm:[(0.1 + 0.8*u)*W, (0.75 - 0.3*u)*D], skin, head: t > 2 && t < 4 ? [(0.2 + 0.8*u)*W, (0.4 - 0.3*u)*D] : null} : null;
        busy += V.busy ? 1 : 0; k++; maxM = Math.max(maxM, V.motion);
        const b = V.det && V.det.best; if (b && V.state !== 'collect') dets.push([+b.x.toFixed(2), +b.y.toFixed(2), b.area, +b.ratio.toFixed(2), +b.fill.toFixed(2), +b.aspect.toFixed(1), V.det.weak ? 'W' : 'S', V.state, V.busy ? 'busy' : 'calm']);
        if (t > 8){ clearInterval(id); V.simPerson = null; res({busy:busy/k, maxM, state:V.state, starts:V.stats.moveStarts + V.stats.restStarts - s0, dets}); } }, 50); }), skin);
    console.log(`${skin}: guard on ${Math.round(w.busy*100)}%, peak ${(w.maxM*100).toFixed(1)}% · ${w.state} · false starts ${w.starts} · frames with a false ball ${w.dets.length}`);
    const seen = new Set(); for (const d of w.dets){ const k = d.join(' '); if (!seen.has(k)){ seen.add(k); console.log('   ', k); } }
    if (w.state !== 'ready' && w.state !== 'arming') await page.keyboard.press('n');
  }
  const log = await page.evaluate(() => window.__lab.LIVE.log.slice(-12).map(e => e.clock.toFixed(1) + ' ' + e.msg));
  for (const l of log) console.log('   log:', l);
  console.log('ERRORS', errors.length ? errors.join('; ') : 'none');
  await browser.close();
})();
