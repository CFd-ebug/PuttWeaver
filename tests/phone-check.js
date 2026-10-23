const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, colorScheme:'dark' });
  const page = await ctx.newPage(); const errors=[]; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('index.html')); await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Crowd Search/ }).click(); await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.locator('#btnExport').click(); await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/' + ('phone-export.png') });
  console.log('horizontal overflow px:', overflow, '| errors:', errors.length ? errors.join('; ') : 'none');
  await browser.close();
})();
