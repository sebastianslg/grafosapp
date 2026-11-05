const { chromium } = require('playwright');
(async () => {
  const [,, url, modelo] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e)); p.on('console', m => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errs.push('console ' + m.text()); });
  await p.goto(url); await p.waitForFunction(() => document.getElementById('pMotor').innerText.includes('HiGHS'), null, { timeout: 60000 });
  console.log('motor:', await p.innerText('#pMotor')); await p.waitForTimeout(1500);
  await p.click(`#modelos [data-m="${modelo}"]`); await p.check('#sinLimite');
  await p.click('#bResolver'); await p.waitForTimeout(process.argv[4] ? 3000 : 14000);
  console.log('VIVO:', (await p.innerText('#vivo')).replace(/\n/g, ' | '));
  await p.screenshot({ path: '/tmp/a1.png' });
  if (!process.argv[4]) await p.click('#bParar'); await p.waitForFunction(() => document.querySelector('.kpi'), null, { timeout: 180000 });
  console.log((await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | '));
  await p.waitForTimeout(8000); console.log('SIM:', await p.innerText('#sTxt').catch(() => 'sin barra'));
  await p.screenshot({ path: '/tmp/a2.png' });
  await p.click('#tabsDer [data-p="gantt"]'); await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/a3.png' });
  console.log('errores', errs); await b.close();
})();
