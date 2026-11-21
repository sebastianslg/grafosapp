/* Prueba de caos: miles de acciones al azar sobre la interfaz (clics, entradas absurdas, cambios rápidos de pestaña,
   clics en el mapa, resolver/parar/cancelar a destiempo, importar archivos dañados) buscando:
   errores de JavaScript, promesas rechazadas, textos inválidos (NaN, undefined, [object Object]),
   tareas largas que congelan la página y pérdida de respuesta.
   Uso: node pruebas/caos.js [url] [acciones] [semilla]   (con ejecutar_app.py en marcha). Sale con código 1 si algo falla. */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const url = process.argv[2] || 'http://127.0.0.1:8765/';
const N = +(process.argv[3] || 600), SEM = +(process.argv[4] || 7);
let s = SEM >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const elige = (a) => a[Math.floor(rnd() * a.length)];
const RAROS = ['', '-1', '0', '1', '2', '3.7', '-0', '1e9', '1e400', '-1e400', 'abc', 'NaN', '  ', '99999999999', '0.0000001', '12,5', '<b>x</b>', '😀', "'; DROP", '1/0', '-999', '7', '15', '30'];
const TEXTOS = ['', 'a', 'Nodo <script>x</script>', '"comillas"', 'ñandú', 'x'.repeat(300), '😀🚚', '   ', '\\n', '0', '-3'];   // sin «NaN»/«undefined» literales: la prueba los busca en pantalla

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caos-'));
  const archivos = {
    'vacio.csv': '', 'basura.csv': '\u0000\u0001ÿþ,,,\n;;;', 'nodos.csv': 'id,nombre,lat,lon\n1,A,3.4,-76.5\n2,B,3.41,-76.51\n3,C,abc,xyz\n',
    'matriz.csv': ',1,2\n1,0,5\n2,5,0\n', 'roto.json': '{"nodos": [', 'raro.json': '{"nodos":[{"lat":"x"}],"D":[[0]]}', 'grande.csv': 'id,lat,lon\n' + Array.from({ length: 400 }, (_, i) => `${i + 1},${3.4 + (i % 20) / 500},${-76.5 + Math.floor(i / 20) / 500}`).join('\n'),
    'aristas.csv': 'origen,destino,costo\n1,2,3\n2,3,-4\n3,1,x\n', 'falso.xlsx': 'esto no es un excel',
  };
  for (const [n, c] of Object.entries(archivos)) fs.writeFileSync(path.join(tmp, n), c);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 880 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const fallas = []; const nota = (t) => { if (fallas.length < 200) fallas.push(t); };
  p.on('pageerror', (e) => nota('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|tile|ERR_|net::/.test(m.text())) nota('console: ' + m.text()); });
  p.on('dialog', (d) => d.accept().catch(() => {}));
  p.on('download', (d) => d.cancel().catch(() => {}));
  await p.addInitScript(() => {
    window.__largas = []; window.__rech = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.duration > 400) window.__largas.push(Math.round(e.duration)); })).observe({ entryTypes: ['longtask'] }); } catch (e) { /* */ }
    window.addEventListener('unhandledrejection', (e) => window.__rech.push(String(e.reason && e.reason.message || e.reason)));
    window.print = () => {};
  });
  await p.goto(url);
  await p.waitForFunction(() => /HiGHS|no disponible/.test(document.getElementById('pMotor').innerText), null, { timeout: 60000 });
  await p.waitForTimeout(1200);

  const ultimas = [];
  const registrar = (t) => { ultimas.push(t); if (ultimas.length > 12) ultimas.shift(); };
  const visibles = async (sel) => p.$$eval(sel, (els) => els.map((e, i) => { const r = e.getBoundingClientRect(), st = getComputedStyle(e); return { i, ok: r.width > 2 && r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none' && !e.disabled && !e.closest('.oculto') && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth }; }).filter((x) => x.ok).map((x) => x.i));
  const accion = async () => {
    const t = rnd();
    if (t < 0.38) {   // clic en un botón visible
      const sel = 'button, [role="tab"], tr.clic, .celda, .chipm, summary';
      const ids = await visibles(sel); if (!ids.length) return;
      const i = elige(ids); const h = (await p.$$(sel))[i]; if (!h) return;
      const txt = (await h.innerText().catch(() => '')).slice(0, 40).replace(/\s+/g, ' ');
      if (/Eliminar|Borrar todo|Restablecer/i.test(txt) && rnd() < 0.8) return;   // no destruir todo el tiempo
      registrar('clic «' + txt + '»'); await h.click({ timeout: 1500, force: rnd() < 0.2 }).catch(() => {});
    } else if (t < 0.55) {   // select al azar
      const ids = await visibles('select'); if (!ids.length) return; const h = (await p.$$('select'))[elige(ids)];
      const vals = await h.$$eval('option', (o) => o.map((x) => x.value)); if (!vals.length) return; const v = elige(vals);
      registrar('select ' + (await h.getAttribute('id')) + '=' + v); await h.selectOption(v, { timeout: 1500 }).catch(() => {});
    } else if (t < 0.72) {   // entrada absurda
      const ids = await visibles('input:not([type=file]):not([type=checkbox]):not([type=range]), textarea'); if (!ids.length) return;
      const h = (await p.$$('input:not([type=file]):not([type=checkbox]):not([type=range]), textarea'))[elige(ids)];
      const ty = await h.getAttribute('type'); const v = ty === 'number' ? elige(RAROS) : ty === 'time' ? elige(['00:00', '23:59', '12:30', '']) : elige(TEXTOS.concat(RAROS.filter((x) => x !== 'NaN')));
      registrar('fill ' + ((await h.getAttribute('id')) || ty) + '=' + JSON.stringify(v).slice(0, 30));
      await h.fill(v, { timeout: 1500 }).catch(() => {}); await h.dispatchEvent('change').catch(() => {}); if (rnd() < 0.3) await h.press('Enter').catch(() => {});
    } else if (t < 0.78) {   // casillas y deslizadores
      const ids = await visibles('input[type=checkbox], input[type=range]'); if (!ids.length) return; const h = (await p.$$('input[type=checkbox], input[type=range]'))[elige(ids)];
      if ((await h.getAttribute('type')) === 'range') { registrar('range'); await h.fill(String(Math.floor(rnd() * 1000)), { timeout: 1500 }).catch(() => {}); await h.dispatchEvent('input').catch(() => {}); }
      else { registrar('check ' + (await h.getAttribute('id'))); await h.click({ timeout: 1500 }).catch(() => {}); }
    } else if (t < 0.86) {   // mapa: clic, doble clic, arrastre, zoom
      const box = await p.$eval('#mapa', (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
      const x = box[0] + 20 + rnd() * (box[2] - 40), y = box[1] + 20 + rnd() * (box[3] - 40); const q = rnd();
      registrar('mapa ' + (q < 0.5 ? 'clic' : q < 0.7 ? 'dblclic' : q < 0.85 ? 'arrastre' : 'rueda'));
      if (q < 0.5) await p.mouse.click(x, y); else if (q < 0.7) await p.mouse.dblclick(x, y);
      else if (q < 0.85) { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 60 - rnd() * 120, y + 60 - rnd() * 120, { steps: 4 }); await p.mouse.up(); }
      else await p.mouse.wheel(0, rnd() < 0.5 ? -300 : 300);
    } else if (t < 0.9) {   // teclado
      const k = elige(['Escape', 'Enter', 'Tab', 'Space', 'ArrowDown']); registrar('tecla ' + k); await p.keyboard.press(k).catch(() => {});
    } else if (t < 0.95) {   // resolver y luego parar / cancelar / cambiar de problema a destiempo
      const res = await p.$('#bResolver'); if (!res || !(await res.isEnabled().catch(() => false))) return;
      if ((await p.$eval('#tiempo', (e) => e.value).catch(() => '')) > 30 || rnd() < 0.5) await p.fill('#tiempo', String(5 + Math.floor(rnd() * 8))).catch(() => {});
      registrar('resolver ' + (await p.$eval('#problema', (e) => e.value)));
      await res.click({ timeout: 1500 }).catch(() => {}); await p.waitForTimeout(200 + rnd() * 2500);
      const q = rnd();
      if (q < 0.3) { registrar('parar'); await p.click('#bParar', { timeout: 800 }).catch(() => {}); }
      else if (q < 0.5) { registrar('cancelar'); await p.click('#bDetener', { timeout: 800 }).catch(() => {}); }
      else if (q < 0.65) { registrar('cambiar problema en plena corrida'); const vals = await p.$$eval('#problema option', (o) => o.map((x) => x.value)); await p.selectOption('#problema', elige(vals)).catch(() => {}); }
      const libre = () => p.waitForFunction(() => !document.getElementById('bDetener') || document.getElementById('bDetener').disabled, null, { timeout: 40000 }).then(() => true).catch(() => false);
      if (!(await libre())) {   // corrida larga (p. ej. «sin límite»): «Parar» debe responder; si no, «Cancelar» debe cortar de inmediato
        registrar('parar (corrida larga)'); await p.click('#bParar', { timeout: 1500 }).catch(() => {});
        if (!(await libre())) { nota('«Parar» no detuvo la corrida en 40 s tras: ' + ultimas.slice(-5).join(' · ')); await p.click('#bDetener', { timeout: 1500 }).catch(() => {}); if (!(await libre())) nota('«Cancelar» tampoco detuvo la corrida'); }
      }
    } else {   // importar un archivo dañado o raro
      const n = elige(Object.keys(archivos)); registrar('importar ' + n);
      await p.click('#bImportar').catch(() => {}); await p.setInputFiles('#archivo', path.join(tmp, n)).catch(() => {}); await p.waitForTimeout(500);
      if (rnd() < 0.5) await p.click('[data-x="ok"]', { timeout: 800 }).catch(() => {}); else await p.keyboard.press('Escape');
    }
  };

  const t0 = Date.now(); let k = 0;
  for (; k < N; k++) {
    const e0 = fallas.length;
    await accion().catch((e) => { if (!/Target closed|detached|Execution context/.test(e.message)) nota('acción: ' + e.message.split('\n')[0]); });
    // la página sigue respondiendo
    const vivo = await Promise.race([p.evaluate(() => 1).catch(() => 0), new Promise((r) => setTimeout(() => r(-1), 8000))]);
    if (vivo !== 1) { nota('LA PÁGINA NO RESPONDE tras: ' + ultimas.slice(-5).join(' · ')); break; }
    if (k % 5 === 0) {
      const malo = await p.evaluate(() => { const t = document.body.innerText; const m = t.match(/.{0,40}(NaN|undefined|\[object Object\]|Infinity(?! *[)\]])|null km).{0,30}/); return m ? m[0].replace(/\s+/g, ' ') : null; });
      if (malo) nota('texto inválido «' + malo + '» tras: ' + ultimas.slice(-4).join(' · '));
      const lg = await p.evaluate(() => { const a = window.__largas.splice(0); const r = window.__rech.splice(0); return { a, r }; });
      if (lg.a.some((d) => d > 1500)) nota('tarea larga (congelamiento) de ' + Math.max(...lg.a) + ' ms tras: ' + ultimas.slice(-4).join(' · '));
      lg.r.forEach((x) => nota('promesa rechazada: ' + x + ' tras: ' + ultimas.slice(-3).join(' · ')));
    }
    if (fallas.length > e0) { for (let q = e0; q < fallas.length; q++) if (!/ tras: /.test(fallas[q])) fallas[q] += '   ⟵ ' + ultimas.slice(-4).join(' · '); }
  }
  const unicos = [...new Set(fallas.map((f) => f.slice(0, 400)))];
  console.log(`Semilla ${SEM}: ${k} acciones en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  unicos.forEach((f) => console.log('FALLA ' + f));
  console.log(unicos.length ? `${unicos.length} problema(s) distintos` : 'Sin errores, textos inválidos ni congelamientos');
  await b.close(); fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(unicos.length ? 1 : 0);
})();
