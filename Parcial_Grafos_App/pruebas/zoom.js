const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  await p.goto(process.argv[2] + '?motor=servidor&tab=china'); await p.waitForFunction(() => document.getElementById('pMotor').innerText.includes('HiGHS'), null, { timeout: 30000 });
  await p.waitForTimeout(1200); await p.click('#pArbol'); await p.waitForFunction(() => /tramos/.test(document.getElementById('chipMapa').innerText), null, { timeout: 120000 });
  await p.waitForTimeout(1800); await p.evaluate(() => Mapa.map.setView([31.2, 113.5], 8, { animate: false })); await p.waitForTimeout(2500);
  await p.screenshot({ path: process.argv[3] }); await b.close();
})();
