/* Prueba de interfaz de «Ejemplos de la exposición»: carga cada uno de los 34 modelos desde la tarjeta, lo resuelve y verifica
   que la app obtiene el mismo óptimo que el archivo GAMS; carga ejemplos de algoritmos y verifica la nota y la fila resaltada.
   Uso: node pruebas/e2e_ejemplos.js http://127.0.0.1:8765 [cuántos_algoritmos]   Sale con código 1 si algo falla. */
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const EJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'datos', 'ejemplos.json'), 'utf8'));
(async () => {
  const url = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, ''), nAlg = +(process.argv[3] || 4);
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1500, height: 920 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  let fallas = 0; const chk = (n, ok, extra) => { if (!ok) fallas++; console.log((ok ? 'OK    ' : 'FALLA ') + n + (extra ? '  ' + extra : '')); };
  await p.goto(url + '/'); await p.waitForFunction(() => document.getElementById('pMotor').classList.contains('ok'), null, { timeout: 60000 });
  await p.waitForSelector('#ejSel', { timeout: 15000 });
  const correr = async (val) => {
    await p.evaluate(() => document.getElementById('cEjemplos').classList.remove('cerrada'));
    await p.selectOption('#ejSel', val); await p.evaluate(() => document.getElementById('ejCargar').click());
    await p.waitForFunction(() => App.S.corriendo, null, { timeout: 10000 }).catch(() => {});
    await p.waitForFunction(() => !App.S.corriendo && App.S.res, null, { timeout: 300000 }); await p.waitForTimeout(400);
  };
  // VRPSPD y CCVRP: en el navegador (HiGHS en WebAssembly) hallan el valor de GAMS pero tardan más de 2 min en probar el óptimo
  for (const [q, m] of EJ.modelos.entries()) { if (process.env.SOLO && !process.env.SOLO.split(',').includes(m.id)) continue;
    await correr('m' + q);
    const r = await p.evaluate(() => ({ obj: App.S.res.res.objetivo, estado: App.S.res.res.estado, seg: (+App.S.res.res.seg).toFixed(1), clave: App.S.clave, calles: /trazados por las calles/.test(document.getElementById('chipMapa').innerText), nota: (document.querySelector('#contenido .nota-ej') || {}).innerText || '' }));
    const ok = m.app != null && Math.abs(r.obj - m.app) <= 1e-3 * Math.max(1, Math.abs(m.app)) && (String(r.estado).startsWith('óptimo') || ['vrpspd', 'ccvrp'].includes(m.id)) && r.clave === 'ejemplo' && /coinciden/.test(r.nota);
    chk(`${m.archivo.padEnd(14)} ${m.ciudad.padEnd(17)} GAMS ${m.gams}`, ok, `app ${r.obj == null ? '—' : r.obj.toFixed(4)} · ${r.estado} · ${r.seg} s · nota: ${r.nota.replace(/\s+/g, " ").slice(0, 160)}${r.calles ? ' · ¡dibujó calles!' : ''}`);
  }
  for (let q = 0; q < Math.min(nAlg, EJ.algoritmos.length); q++) {
    const a = EJ.algoritmos[q === nAlg - 1 ? 11 : q * 4];   // incluye el branch and bound
    await correr('a' + EJ.algoritmos.indexOf(a));
    const r = await p.evaluate(() => ({ nota: (document.querySelector('#contenido .nota-ej') || {}).innerText || '', resaltada: (document.querySelector('#contenido tr.resaltada') || {}).innerText || '', exacto: (App.S.res.res.comparacion || []).find((c) => c.tipo === 'exacto') }));
    const ok = r.exacto && Math.abs(r.exacto.obj - 425.0513) < 1e-2 && (a.algo ? r.resaltada.includes(a.nombre) && /brecha/.test(r.nota) : /Branch and bound/.test(r.nota));
    chk(`algoritmo ${a.archivo}`, ok, (r.nota || '').replace(/\s+/g, ' ').slice(0, 150));
  }
  chk('sin errores de página', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(fallas ? `${fallas} comprobación(es) fallaron` : 'Todos los ejemplos coinciden con GAMS');
  await b.close(); process.exit(fallas ? 1 : 0);
})();
