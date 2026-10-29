const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } }); const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(process.argv[2]);
  await p.waitForFunction(() => /HiGHS|no disponible/.test(document.getElementById('pMotor').innerText), null, { timeout: 60000 });
  console.log('motor:', await p.innerText('#pMotor'));
  await p.click('#c1'); await p.waitForFunction(() => document.querySelector('.kpi') && !document.getElementById('bResolver').disabled, null, { timeout: 120000 });
  console.log((await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | '));
  await p.click('#c3'); await p.waitForFunction(() => /Suma de las rutas/.test(document.getElementById('contenido').innerText), null, { timeout: 300000 });
  console.log((await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | '));
  console.log('errores', errs); await b.close();
})();
