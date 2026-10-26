const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(dist('test.html')); await page.waitForTimeout(500);
  // time limit: 20 s, then let the clock run out
  await page.getByRole('button', { name: /^Crowd Search/ }).click();
  await page.locator('label:has(#opt-seek-time-20)').click();
  await page.evaluate(() => { for (let i = 0; i < 460; i++) window.__lab.tick(0.05); });
  await page.waitForTimeout(100);
  const timeout = await page.evaluate(() => [document.getElementById('rTitle').textContent, document.getElementById('rDetail').textContent, window.__lab.mode]);
  await page.locator('label:has(#opt-seek-time-none)').click();
  // play one Crowd Search hole with real drags
  const box = await page.locator('#stage').boundingBox();
  for (let i = 0; i < 4; i++){
    const sx = box.x + box.width/2, sy = box.y + box.height*0.78;
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + (i-1.5)*20, sy + 120, { steps: 4 }); await page.mouse.up();
    await page.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 20000 });
    await page.locator('#btnNext').click(); await page.waitForTimeout(50);
  }
  const over = await page.evaluate(() => [document.getElementById('rEyebrow').textContent, document.getElementById('rTitle').textContent, !document.getElementById('rRate').hidden]);
  // rate from the hole-end prompt, then a few from the rankings list
  await page.locator('#rRateStars button[data-v="5"]').click();
  await page.locator('#rankList button[data-g="map"][data-v="4"]').click();
  await page.locator('#rankList button[data-g="ttt"][data-v="4"]').click();
  await page.locator('#rankList button[data-g="bowling"][data-v="2"]').click();
  await page.locator('#rankList button[data-g="bowling"][data-v="3"]').click();
  await page.locator('#rankList button[data-g="paint"][data-v="1"]').click();
  await page.locator('#rankList button[data-g="paint"][data-v="1"]').click(); // clicking the same star again clears it
  await page.locator('#btnExport').click();
  await page.locator('#raterName').fill('Alec');
  await page.locator('#btnCopy').click(); await page.waitForTimeout(200);
  const msg = await page.locator('#copyMsg').textContent();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  await page.screenshot({ path: out + '/' + ('shot-export.png') });
  await page.locator('#dlgClose').click();
  const dlgOpen = await page.evaluate(() => document.getElementById('exportDlg').open);
  console.log('time limit:', JSON.stringify(timeout));
  console.log('hole end:', JSON.stringify(over));
  console.log('copy message:', msg, '| dialog open after close:', dlgOpen);
  console.log('--- clipboard ---\n' + clip + '\n---');
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
