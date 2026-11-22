/* Prueba en el navegador con 100 clientes (CVRP): importa 100 clientes, resuelve con MTZ y con DFJ, para a mitad de
   camino y verifica la solución que se muestra (cada cliente una vez, capacidad, costo recalculado).
   Uso: node pruebas/e2e_100.js [url] [archivo.csv] [segundos_antes_de_parar]
   Sale con código 1 si la solución mostrada no es válida o si la parada tarda más de 30 s. */
const { chromium } = require('playwright');
const url = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, ''), csv = process.argv[3], parar = +(process.argv[4] || 80);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1500, height: 920 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load/.test(m.text())) errs.push(m.text()); });
  let fallas = 0; const chk = (n, ok, extra) => { if (!ok) fallas++; console.log((ok ? 'OK    ' : 'FALLA ') + n + (extra ? '  ' + extra : '')); };
  await p.goto(url + '/'); await p.waitForFunction(() => document.getElementById('pMotor').classList.contains('ok'), null, { timeout: 60000 });
  await p.click('#bImportar'); await p.setInputFiles('#archivo', csv); await p.waitForTimeout(1200); await p.click('[data-x="ok"]'); await p.waitForTimeout(2500);
  const nodos = await p.evaluate(() => App.S.ds.nodos.length); chk('proyecto de 101 nodos (100 clientes + CD)', nodos === 101, 'nodos=' + nodos);
  for (const metodo of ['mtz', 'dfj']) {
    console.log(`\n== Eliminación de subtours: ${metodo.toUpperCase()}`);
    await p.selectOption('#problema', 'vrp'); await p.selectOption('#vrpVar', 'cvrp'); await p.selectOption('#vrpMetodo', 'exacto'); await p.selectOption('#metodo', metodo);
    await p.fill('#tiempo', '240'); await p.fill('#vrpM', '5');
    await p.fill('#flotaTabla input[data-f="cap"]', '80'); await p.dispatchEvent('#flotaTabla input[data-f="cap"]', 'change');
    await p.fill('#flotaTabla input[data-f="n"]', '5'); await p.dispatchEvent('#flotaTabla input[data-f="n"]', 'change');
    const t0 = Date.now(); await p.click('#bResolver');
    const primera = await p.waitForFunction(() => { const e = document.getElementById('vivo'); return e && /mejor solución/.test(e.innerText) && /\d+,\d+ km/.test(e.innerText.split('mejor cota')[0]); }, null, { timeout: 120000 }).then(() => (Date.now() - t0) / 1000).catch(() => -1);
    chk('primera solución visible', primera >= 0, primera >= 0 ? primera.toFixed(1) + ' s' : '');
    await p.waitForTimeout(Math.max(0, parar * 1000 - (Date.now() - t0)));
    const vivo = (await p.innerText('#vivo')).replace(/\s+/g, ' ');
    console.log('  en vivo a los ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s:', vivo.slice(0, 240));
    const tp = Date.now(); await p.click('#bParar');
    await p.waitForFunction(() => !App.S.corriendo, null, { timeout: 60000 }).catch(() => {});
    const lat = (Date.now() - tp) / 1000; chk('la parada responde en menos de 30 s', lat < 30, lat.toFixed(1) + ' s');
    await p.waitForTimeout(2500);
    const v = await p.evaluate(() => {
      const r = App.S.res && App.S.res.res; if (!r || !r.rutas || !r.rutas.length) return { ok: false, motivo: 'sin solución', estado: r && r.estado };
      const ds = App.S.ds, w = (i) => ds.nodos[i].peso || 1, cnt = {}; let costo = 0, malo = null;
      r.rutas.forEach((ru, k) => { const h = ru[0], vis = ru.slice(1).filter((v, q, a) => !(q === a.length - 1 && v === h)); let carga = 0; vis.forEach((c) => { cnt[c] = (cnt[c] || 0) + 1; carga += w(c); }); const cap = (r.info[k] && r.info[k].cap) || Infinity; if (carga > cap + 1e-6) malo = 'capacidad en ruta ' + (k + 1); let d = 0; for (let q = 1; q < ru.length; q++) d += ds.D[ru[q - 1]][ru[q]]; costo += d * 1; });
      const dep = r.rutas[0][0], faltan = ds.nodos.map((_, i) => i).filter((i) => i !== dep).filter((i) => cnt[i] !== 1).length;   // todos los clientes, una vez; el depósito no cuenta
      return { ok: !malo && faltan === 0 && Math.abs(costo - r.objetivo) < 1e-4 * Math.max(1, costo), faltan, malo, costo, objetivo: r.objetivo, estado: r.estado, cota: r.cota, gap: r.gap, rutas: r.rutas.length, kpi: [...document.querySelectorAll('.kpi b')].slice(0, 3).map((e) => e.textContent) };
    });
    await p.waitForTimeout(1500);
    console.log('  resultado:', JSON.stringify(v));
    chk('la solución mostrada es válida (cada cliente una vez, capacidad, costo recalculado)', v.ok, v.motivo || (v.faltan ? v.faltan + ' clientes mal atendidos' : '') || v.malo || '');
    chk('la brecha y la cota se muestran', v.gap != null && v.cota != null, v.gap != null ? (v.gap * 100).toFixed(2) + ' %' : 'n/d');
  }
  chk('sin errores de página', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(fallas ? `\n${fallas} comprobación(es) fallaron` : '\nTodas las comprobaciones con 100 clientes pasaron');
  await b.close(); process.exit(fallas ? 1 : 0);
})();
