const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://127.0.0.1:8765/'); await p.click('#bEjemplo');
  for (const [t, ex] of [['tsp:ciclo'], ['mtsp']]) {
    await p.selectOption('#tipo', t); if (t === 'mtsp') { await p.fill('#lmin', '4'); await p.fill('#lmax', '5'); }
    await p.click('#bResolver'); await p.waitForFunction(() => !document.getElementById('bResolver').disabled, null, { timeout: 120000 });
    console.log(t, (await p.$$eval('#cards .k', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | '));
  }
  console.log('errores', errs); await b.close();
})();
