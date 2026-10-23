const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('test.html')); await page.waitForTimeout(500);
  const pin = process.argv[2] === 'pin'; const blur = process.argv[2] === 'blur' ? 0.06 : process.argv[2] === 'hide' ? 5 : 0;
  await page.getByRole('button', { name: /^Map Quest/ }).click();
  await page.locator('#btnLive').click(); await page.waitForTimeout(300);
  if (pin) await page.evaluate(() => { const L = window.__lab, c = L.sheetCornersFrac(); L.LIVE.pin = [[c[0][0]+0.04, c[0][1]+0.03],[c[1][0]-0.02, c[1][1]+0.06],[c[2][0]-0.05, c[2][1]-0.02],[c[3][0]+0.01, c[3][1]-0.05]]; });
  await page.selectOption('#lpSource', 'sim'); await page.locator('#lpStart').click(); await page.waitForTimeout(800);
  const t0 = Date.now();
  await page.locator('#lpCal').click();
  await page.waitForFunction(() => { const L = window.__lab.LIVE; return L.cal && L.cal.checkAvg != null && !L.calib; }, null, { timeout: 90000 });
  const cal = await page.evaluate(() => { const c = window.__lab.LIVE.cal; return {n:c.n, of:c.of, fitAvg:+c.fitAvg.toFixed(2), fitMax:+c.fitMax.toFixed(2), checkAvg:+c.checkAvg.toFixed(2), checkMax:+c.checkMax.toFixed(2)}; });
  console.log('calibration', JSON.stringify(cal), 'took', ((Date.now()-t0)/1000).toFixed(1), 's');
  await page.locator('#lpSample').click(); await page.waitForTimeout(1500);
  console.log('color:', await page.locator('#lpColorNote').textContent());
  await page.locator('#lpDelay').click();
  await page.waitForFunction(() => /delay/i.test(document.getElementById('lpCalNote').textContent) || /never saw/.test(document.getElementById('lpCalNote').textContent), null, { timeout: 30000 });
  console.log('delay:', await page.locator('#lpCalNote').textContent());
  await page.locator('#lpPlay').click(); await page.waitForTimeout(500);
  if (blur) await page.evaluate(b => { window.__lab.LIVE.simBlur = b; }, blur);
  const shots = [];
  for (let k = 0; k < 3; k++){
    await page.waitForFunction(() => window.__lab.LIVE.state === 'ready' && window.__lab.mode === 'aim', null, { timeout: 30000 });
    const sx = 640 + (k-1)*30, sy = 650;
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + (k-1)*10, sy + 60 + k*25, { steps: 5 }); await page.mouse.up();
    await page.waitForFunction(() => window.__lab.mode === 'result' || window.__lab.mode === 'over', null, { timeout: 30000 });
    const r = await page.evaluate(() => { const L = window.__lab; const s = L.shot; return {title: document.getElementById('rTitle').textContent, rest: s && s.rest ? [+s.rest.x.toFixed(3), +s.rest.y.toFixed(3)] : null, ball: [+L.ball.x.toFixed(3), +L.ball.y.toFixed(3)], samples: s ? s.delivered.length : 0, state: L.LIVE.state}; });
    r.errIn = r.rest ? +(Math.hypot(r.rest[0]-r.ball[0], r.rest[1]-r.ball[1])*12).toFixed(2) : null;
    shots.push(r);
    if (k === 1){ await page.keyboard.press('d'); await page.waitForTimeout(400); await page.screenshot({ path: out + '/' + (pin ? 'live-debug-pin.png' : 'live-debug.png') }); }
  }
  await page.waitForFunction(() => window.__lab.LIVE.state === 'ready', null, { timeout: 30000 });
  for (const s of shots) console.log('shot', JSON.stringify(s));
  const rep = await page.evaluate(() => window.__lab.liveReport());
  console.log(rep.split('\n').slice(0, 14).join('\n'));
  console.log('--- log tail ---\n' + rep.split('\n').slice(-12).join('\n'));
  console.log('ERRORS', errors.length ? errors.join('; ') : 'none');
  await browser.close();
})();
