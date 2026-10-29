const { chromium } = require('playwright');
(async () => {
  const [,, url, shot] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e)); p.on('console', m => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errs.push('console ' + m.text()); });
  await p.goto(url + '?motor=servidor'); await p.waitForFunction(() => document.getElementById('pMotor').innerText.includes('HiGHS'), null, { timeout: 30000 });
  console.log('motor:', await p.innerText('#pMotor'));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: shot + '_inicio.png' });
  // Cali: TSP del parcial
  await p.click('#c1'); await p.waitForFunction(() => !document.getElementById('bResolver').disabled && document.querySelector('.kpi'), null, { timeout: 120000 });
  await p.waitForFunction(() => /tramos/.test(document.getElementById('chipMapa').innerText), null, { timeout: 120000 });
  console.log('cali tsp:', (await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | '), '|', await p.innerText('#chipMapa'));
  await p.waitForTimeout(1600); await p.screenshot({ path: shot + '_cali_tsp.png' });
  await p.click('#c3'); await p.waitForFunction(() => /Suma de las rutas|Suma/.test(document.getElementById('contenido').innerText), null, { timeout: 180000 });
  await p.waitForFunction(() => /tramos/.test(document.getElementById('chipMapa').innerText), null, { timeout: 120000 });
  console.log('cali mtsp:', (await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | '));
  await p.waitForTimeout(1600); await p.screenshot({ path: shot + '_cali_mtsp.png' });
  // China
  await p.click('#tabs button[data-tab="china"]'); await p.waitForTimeout(1500);
  await p.click('#pCamino'); await p.waitForFunction(() => /Distancia mínima/.test(document.getElementById('contenido').innerText), null, { timeout: 60000 });
  await p.waitForFunction(() => /Camino|tramos/.test(document.getElementById('chipMapa').innerText), null, { timeout: 60000 });
  console.log('china camino:', (await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | '), '|', await p.innerText('#chipMapa'));
  await p.waitForTimeout(1600); await p.screenshot({ path: shot + '_china_camino.png' });
  await p.click('#pMatrizBtn'); await p.waitForFunction(() => /Pares resueltos/.test(document.getElementById('contenido').innerText), null, { timeout: 120000 });
  console.log('china matriz:', (await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | '));
  await p.click('.celda >> nth=1'); await p.waitForTimeout(2500); await p.screenshot({ path: shot + '_china_matriz.png' });
  await p.click('#pArbol'); await p.waitForFunction(() => /Costo total del árbol/.test(document.getElementById('contenido').innerText), null, { timeout: 180000 });
  await p.waitForFunction(() => /tramos/.test(document.getElementById('chipMapa').innerText), null, { timeout: 120000 });
  console.log('china arbol:', (await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | '), '|', await p.innerText('#chipMapa'));
  await p.waitForTimeout(1800); await p.screenshot({ path: shot + '_china_arbol.png' });
  console.log('errores:', errs);
  await b.close();
})();
