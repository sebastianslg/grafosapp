const { chromium } = require('playwright');
(async () => {
  const [,, url, dir] = process.argv;
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errs.push('console ' + m.text()); });
  await p.goto(url + (process.env.MOTOR ? '' : '?motor=servidor')); await p.waitForFunction(() => /HiGHS/.test(document.getElementById('pMotor').innerText), null, { timeout: 30000 }); await p.waitForTimeout(1500);
  const S = (f, a) => p.evaluate(f, a); const kpis = async () => (await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | ');
  console.log('1) recuadros:', (await p.innerText('#stats')).replace(/\n+/g, ' | '));
  // matriz euclidiana
  await p.click('#tabsDer [data-p="matriz"]'); await p.selectOption('#tipoMatriz', 'euclidiana'); await p.waitForFunction(() => /Matriz recalculada/.test(document.getElementById('chipMapa').innerText), null, { timeout: 30000 });
  const chk = await S(() => { const ds = App.S.ds, a = ds.nodos[0], c = ds.nodos[1]; return [ds.D[0][1], Datos.euclid(a.lat, a.lon, c.lat, c.lon, ds.centro[0]), ds.modoDist]; });
  console.log('2) matriz euclidiana D[0][1] =', chk[0].toFixed(4), 'esperado', chk[1].toFixed(4), 'modo', chk[2], '| recuadros:', (await p.innerText('#stats')).replace(/\n+/g, ' | '));
  // TSP: pesos bloqueados
  await p.click('#tabsDer [data-p="nodos"]'); console.log('3) TSP · peso editable?', await p.$$eval('input[data-f="peso"]', a => a.slice(0, 3).map(e => e.readOnly + ':' + e.value).join(', ')));
  await p.click('#tabsDer [data-p="aristas"]'); console.log('   TSP · peso de aristas editable?', await p.$$eval('input[data-f="w"]', a => a.slice(0, 2).map(e => e.readOnly + ':' + e.value).join(', ')));
  // proyecto pequeño para m-TSP con flota y ventanas
  await p.click('#bMas'); await p.fill('#npNombre', 'Flota'); await p.selectOption('#npPlantilla', 'cd'); await p.click('#hoja [data-x="ok"]'); await p.waitForFunction(() => App.S.ds.usuario, null, { timeout: 15000 }); await p.waitForTimeout(800);
  await p.selectOption('#problema', 'mtsp'); await p.waitForSelector('#flotaTabla input');
  console.log('4) m-TSP · peso editable?', await (async () => { await p.click('#tabsDer [data-p="nodos"]'); return p.$$eval('input[data-f="peso"]', a => a.slice(0, 2).map(e => e.readOnly + ':' + e.value).join(', ')); })());
  // pesos: nodos 1..6 con peso 2; flota 2 camiones cap 6 + 1 tractocamión
  for (let i = 1; i <= 6; i++) { await p.fill(`input[data-i="${i}"][data-f="peso"]`, '2'); await p.press(`input[data-i="${i}"][data-f="peso"]`, 'Enter'); }
  await p.fill('#flotaTabla input[data-i="0"][data-f="n"]', '2'); await p.fill('#flotaTabla input[data-i="0"][data-f="cap"]', '6'); await p.fill('#flotaTabla input[data-i="1"][data-f="n"]', '1'); await p.fill('#flotaTabla input[data-i="1"][data-f="cap"]', '0');
  await p.fill('#flotaTabla input[data-i="1"][data-f="n"]', '1'); await p.press('#flotaTabla input[data-i="1"][data-f="n"]', 'Enter');
  await p.check('#balanceado'); await p.check('#abierto'); await p.check('#vtUsar'); await p.waitForTimeout(500);
  console.log('   columnas VT visibles:', await p.$$eval('#contenido th', a => a.map(e => e.innerText).join(',')));
  await p.fill('#vtDesde', '08:00'); await p.fill('#vtHasta', '08:40'); await p.click('#vtMarcar'); await p.click('#vtAplicar');
  await p.click('#bResolver'); await p.waitForTimeout(6000); console.log('   errs:', JSON.stringify(errs));
  console.log('   log:', JSON.stringify((await p.innerText('#log')).slice(-300)), '| panel:', JSON.stringify((await p.innerText('#contenido')).slice(0, 160)));
  await p.waitForFunction(() => /Vehículos usados/.test(document.getElementById('contenido').innerText), null, { timeout: 90000 });
  console.log('   resultado:', await kpis()); console.log('   tabla:', (await p.$$eval('#contenido table:first-of-type tr', a => a.slice(1).map(r => r.innerText.replace(/\s+/g, ' ')))).join(' // '));
  const ver = await S(() => { const r = App.S.res; const ds = App.S.ds; const bad = []; r.res.rutas.forEach((ru, k) => ru.forEach((v, q) => { const t = r.res.info[k].llegadas && r.res.info[k].llegadas[q]; if (v !== r.opt.deposito && ds.nodos[v].vtOn && (t < ds.nodos[v].vtA - 1e-6 || t > ds.nodos[v].vtB + 1e-6)) bad.push([v, t]); })); return { fueraDeVentana: bad.length, abiertas: r.res.rutas.every(ru => ru[ru.length - 1] !== r.opt.deposito), cargas: r.res.info.map(i => i.carga + '/' + i.cap), clientes: r.res.rutas.map(ru => ru.length - 1) }; });
  console.log('   verificación:', JSON.stringify(ver));
  await p.waitForTimeout(1500); await p.screenshot({ path: dir + '/reglas.png' });
  console.log('errores:', errs); await b.close();
})();
