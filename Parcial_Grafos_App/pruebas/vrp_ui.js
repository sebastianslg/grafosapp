const { chromium } = require('playwright');
(async () => {
  const [,, url, variante, metodo, algo] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e)); p.on('console', m => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errs.push('console ' + m.text()); });
  await p.goto(url); await p.waitForFunction(() => document.getElementById('pMotor').innerText.includes('HiGHS'), null, { timeout: 60000 }); await p.waitForTimeout(1000);
  await p.selectOption('#problema', 'vrp'); await p.selectOption('#vrpVar', variante); await p.selectOption('#vrpMetodo', metodo); if (algo) await p.selectOption('#vrpAlgo', algo);
  await p.fill('#tiempo', '20'); await p.click('#bResolver');
  await p.waitForFunction(() => document.querySelector('.kpi') || /No se|Error|infactible/.test(document.getElementById('log').innerText), null, { timeout: 240000 });
  await p.waitForTimeout(1500);
  console.log((await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | ') || await p.innerText('#log'));
  const tab = await p.$$eval('#contenido table', ts => ts.map(t => [...t.rows].map(r => [...r.cells].map(c => c.innerText.replace(/\n/g,' ')).join(' | ')).join('\n'))); console.log(tab[0]);
  await p.screenshot({ path: '/tmp/v_' + variante + '_' + metodo + '.png' });
  console.log('errores', errs); await b.close();
})();
