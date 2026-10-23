const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('index.html')); await page.waitForTimeout(400);
  await page.locator('#btnLive').click(); await page.waitForTimeout(200);
  await page.selectOption('#lpSource', 'camera'); await page.locator('#lpStart').click();
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => [...document.querySelectorAll('.lp-st')].map(e => e.textContent).join(' | '));
  const devices = await page.evaluate(() => [...document.querySelectorAll('#lpDevice option')].map(o => o.textContent));
  await page.locator('#lpLock').click(); await page.waitForTimeout(500);
  const ctl = await page.locator('#lpCamCtl').textContent();
  const log = await page.evaluate(() => [...document.querySelectorAll('#lpLog li')].map(l => l.textContent).join(' / '));
  await page.screenshot({ path: out + '/' + ('live-panel.png') });
  console.log('status:', st); console.log('devices:', devices.join(', ')); console.log('controls:', ctl); console.log('log:', log);
  // the message a blocked page shows
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page2.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { value: undefined }); });
  await page2.goto(dist('index.html')); await page2.waitForTimeout(300);
  await page2.locator('#btnLive').click(); await page2.locator('#lpStart').click(); await page2.waitForTimeout(300);
  console.log('blocked message:', await page2.locator('#lpCamNote').textContent());
  console.log('ERRORS', errors.length ? errors.join('; ') : 'none');
  await browser.close();
})();
