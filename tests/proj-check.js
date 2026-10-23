const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('index.html')); await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Map Quest/ }).click();
  await page.locator('#btnProj').click(); await page.waitForTimeout(400);
  const dims = await page.evaluate(() => { const c = document.getElementById('stage').getBoundingClientRect(); return {w: c.width, h: c.height, fs: !!document.fullscreenElement}; });
  // putt by dragging up from the bottom of the screen
  await page.mouse.move(960, 900); await page.mouse.down(); await page.mouse.move(975, 1060, {steps: 5});
  await page.screenshot({ path: out + '/' + ('proj-aim.png') });
  await page.mouse.up();
  await page.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/' + ('proj-result.png') });
  await page.keyboard.press('t'); await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/' + ('proj-test.png') });
  await page.keyboard.press('t');
  await page.keyboard.press('Enter'); await page.keyboard.press('g'); await page.waitForTimeout(150);
  const gameAfterG = await page.locator('#gTitle').textContent();
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const after = await page.evaluate(() => { const c = document.getElementById('stage').getBoundingClientRect(); return {w: Math.round(c.width), h: Math.round(c.height), projClass: document.getElementById('stageSec').classList.contains('proj'), fs: !!document.fullscreenElement}; });
  console.log('in projector mode:', JSON.stringify(dims), '| after G:', gameAfterG, '| after Esc:', JSON.stringify(after));
  console.log('ERRORS', errors.length ? errors.join('; ') : 'none');
  await browser.close();
})();
