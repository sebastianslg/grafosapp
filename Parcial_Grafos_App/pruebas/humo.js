const { chromium } = require('playwright');
(async () => {
  const [,, url, shot] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errs.push('console ' + m.text()); });
  await p.goto(url + '?motor=servidor'); await p.waitForTimeout(3000);
  console.log('motor:', await p.innerText('#pMotor')); console.log('tabs:', await p.$$eval('#tabs button', a => a.map(e => e.innerText)));
  console.log('paneles:', await p.$$eval('#tabsDer button', a => a.map(e => e.innerText)));
  await p.screenshot({ path: shot });
  console.log('errores:', errs); await b.close();
})();
