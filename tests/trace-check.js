// trace the live state machine after one simulated putt
const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('test.html')); await page.waitForTimeout(500);
  await page.getByRole('button', { name: new RegExp('^' + (process.argv[2] || 'Map Quest')) }).click();
  await page.locator('#btnLive').click(); await page.waitForTimeout(300);
  await page.selectOption('#lpSource', 'sim'); await page.locator('#lpStart').click(); await page.waitForTimeout(800);
  await page.locator('#lpCal').click();
  await page.waitForFunction(() => { const L = window.__lab.LIVE; return L.cal && L.cal.checkAvg != null && !L.calib; }, null, { timeout: 90000 });
  await page.locator('#lpSample').click(); await page.waitForTimeout(1500);
  await page.locator('#lpPlay').click(); await page.waitForTimeout(300);
  await page.evaluate(() => { const L = window.__lab; window.__tr = []; setInterval(() => { const V = L.LIVE; window.__tr.push([performance.now()|0, V.state, L.mode, V.busy?1:0, +(V.motion*100).toFixed(2), +(V.floor*100).toFixed(2), +(L.ball && 0), V.det && V.det.best ? 1 : 0, V.det ? V.det.count : -1]); }, 250); });
  await page.waitForFunction(() => window.__lab.LIVE.state === 'ready', null, { timeout: 30000 });
  const sx = 640, sy = 650;
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx, sy + 70, { steps: 5 }); await page.mouse.up();
  await page.waitForFunction(() => window.__lab.mode === 'result', null, { timeout: 30000 });
  await page.waitForFunction(() => window.__lab.LIVE.state === 'ready', null, { timeout: 40000 });
  const tr = await page.evaluate(() => window.__tr);
  let last = '';
  for (const r of tr){ const k = r.slice(1).join(' '); if (k !== last) console.log(((r[0]-tr[0][0])/1000).toFixed(2), k); last = k; }
  console.log('ERRORS', errors.length ? errors.join('; ') : 'none');
  await browser.close();
})();
