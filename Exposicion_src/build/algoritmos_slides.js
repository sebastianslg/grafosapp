const L = require('./lib.js'); const { C, F, pres, nuevaSlide, txt, card, cabecera, segmentado, etiqueta, chip, stat, bullets, kv, codigo, pseudo, tabla, img, nota, envolver } = L;
const D = require('./datos.js'); const { R, fmt, OPT, rutasTxt, nucleo } = D; const { ALG, rob } = require('./contenido.js');
const IMG = '../img/';
const e = (x, d = 2) => fmt(x, d);
const hLineas = (t, w, size) => Math.max(1, Math.ceil(t.length * size * 0.0075 / w)); // líneas estimadas

function slideEspec(a) {
  const s = nuevaSlide(); cabecera(s, `C · Algoritmo ${a.num} · ${a.familia}`, a.nombre, { wTitulo: 7.8 }); segmentado(s, 0);
  // columna izquierda: idea, tipo, entrada, salida, cuándo usarlo
  card(s, 0.5, 1.2, 4.95, 5.75); etiqueta(s, 'Idea', 0.7, 1.35, 3);
  const nIdea = hLineas(a.idea, 4.45, 13.5); const hIdea = 0.2 + 0.235 * nIdea;
  txt(s, a.idea, { x: 0.7, y: 1.62, w: 4.55, h: hIdea, fontSize: 13.5 });
  const filas = a.espec.slice(0, 3); const hs = filas.map(([, v]) => 0.12 + 0.215 * hLineas(v, 3.3, 11.5));
  const hCb = 1.0 + 0.2 * hLineas(a.espec[6][1], 4.2, 12.5); const libre = 5.75 - 0.42 - hIdea - hs.reduce((x, y) => x + y, 0) - hCb - 0.15; const gap = Math.max(0.1, libre / 4);
  let y = 1.62 + hIdea + gap;
  filas.forEach(([k, v], i) => { txt(s, k.toUpperCase(), { x: 0.7, y: y + 0.02, w: 1.0, h: 0.2, fontSize: 8.5, bold: true, color: C.SUB, charSpacing: 0.6 }); txt(s, v, { x: 1.7, y, w: 3.6, h: hs[i], fontSize: 11.5 }); y += hs[i] + gap; });
  const yc = 6.95 - 0.15 - hCb; card(s, 0.7, yc, 4.55, hCb, { fill: C.BLUE_BG, sombra: false });
  etiqueta(s, 'Cuándo usarlo', 0.85, yc + 0.12, 3, { color: C.BLUE_T }); txt(s, a.espec[6][1], { x: 0.85, y: yc + 0.4, w: 4.25, h: hCb - 0.45, fontSize: 12.5 });
  // derecha: pseudocódigo
  const n = a.pseudo.length, maxL = Math.max(...a.pseudo.map((l) => l.length)) + 5, psz = Math.min(n <= 8 ? 12.5 : (n <= 10 ? 12 : 11.5), Math.floor((6.8 * 72 / 0.6) / maxL * 2) / 2), hp = 0.28 + n * (psz * 1.2 / 72 + 0.025);
  etiqueta(s, 'Pseudocódigo', 5.7, 1.2, 3); pseudo(s, a.pseudo, 5.7, 1.45, 7.13, hp, { size: psz });
  const yb = 1.45 + hp + 0.15, hb = n >= 11 ? 1.2 : 1.3, tiles = [['Parámetros', a.espec[3][1]], ['Complejidad', a.espec[4][1]], ['Garantía', a.espec[5][1]]];
  const w3 = (7.13 - 0.3) / 3; tiles.forEach(([k, v], i) => { const x = 5.7 + i * (w3 + 0.15); card(s, x, yb, w3, hb); etiqueta(s, k, x + 0.15, yb + 0.1, w3 - 0.3); txt(s, v, { x: x + 0.15, y: yb + 0.34, w: w3 - 0.3, h: hb - 0.4, fontSize: 10.5 }); });
  const ye = yb + hb + 0.15; card(s, 5.7, ye, 7.13, 6.95 - ye); etiqueta(s, 'Variantes y relación con otros métodos', 5.9, ye + 0.1, 6);
  bullets(s, a.extra, 5.9, ye + 0.38, 6.75, 6.95 - ye - 0.42, { size: (6.95 - ye) >= 1.7 ? 11.5 : 10.5, gap: 4 });
  nota(s, `${a.nombre}. ${a.idea} Entrada: ${a.espec[1][1]} Salida: ${a.espec[2][1]} ${a.espec[3][0]}: ${a.espec[3][1]} ${a.espec[4][0]}: ${a.espec[4][1]}`);
}
function slideEjemplo(a) {
  const s = nuevaSlide(); cabecera(s, `C · Algoritmo ${a.num} · ${a.nombre}`, 'Problema de ejemplo y traza', { wTitulo: 7.8 }); segmentado(s, 1);
  const t = a.traza();
  card(s, 0.5, 1.2, 5.75, 5.75); etiqueta(s, 'Instancia CVRP-10', 0.7, 1.35, 3);
  txt(s, '10 clientes, capacidad Q = 15, demanda total 38 (mínimo 3 rutas). Óptimo conocido: 425,05.', { x: 0.7, y: 1.58, w: 5.35, h: 0.45, fontSize: 10.5, color: C.SUB });
  etiqueta(s, a.trazaTitulo, 0.7, 2.1, 5.3);
  const filas = [t.cols].concat(t.rows); const nf = filas.length; const rh = Math.min(0.36, 4.5 / nf); const tot = t.w.reduce((x, y) => x + y, 0), esc = 5.35 / tot; const cw = t.w.map((x) => x * esc);
  tabla(s, filas, 0.7, 2.35, 5.35, cw, { size: 10.5, rowH: rh, zebra: true });
  const yTab = 2.35 + nf * rh; if (6.8 - yTab >= 0.95) { const k = a.id === 'bb' ? { costo: R.optimo.costo, gap: 0, nev: null } : R[a.id]; const hh = Math.min(1.25, 6.8 - yTab - 0.15), yy = 6.8 - hh; card(s, 0.7, yy, 5.35, hh, { fill: C.BLUE_BG, sombra: false });
    [['Costo final', e(k.costo)], ['Brecha', e(k.gap < 1e-6 ? 0 : k.gap) + ' %'], ['Evaluaciones', k.nev === null ? '—' : fmt(k.nev, 0)]].forEach(([l, v], i) => { const x = 0.85 + i * 1.75; txt(s, l.toUpperCase(), { x, y: yy + 0.12, w: 1.6, h: 0.2, fontSize: 8.5, bold: true, color: C.BLUE_T, charSpacing: 1 }); txt(s, v, { x, y: yy + 0.36, w: 1.6, h: hh - 0.45, fontSize: 18, bold: true, color: C.BLUE_T, valign: 'top' }); }); }
  // derecha: figura
  card(s, 6.45, 1.2, 6.38, 3.45);
  etiqueta(s, a.conv ? 'Evolución del costo' : 'Rutas construidas', 6.65, 1.33, 4);
  const fi = a.conv ? a.conv : a.fig.replace('ruta_', 'rutaw_'); img(s, IMG + fi + '.png', 6.65, 1.58, 6.0, a.conv ? 3.0 : 3.0);
  card(s, 6.45, 4.8, 6.38, 2.15); etiqueta(s, 'Lectura de la traza', 6.65, 4.92, 4);
  bullets(s, a.lectura, 6.65, 5.17, 6.0, 1.75, { size: 11.5, gap: 4 });
  nota(s, `Ejemplo: ${a.trazaTitulo}. ` + a.lectura.join(' '));
}
function claveLineas(lineas, claves) {
  const out = []; claves.forEach(([re, txtc]) => { const i = lineas.findIndex((l) => re.test(l)); if (i >= 0) out.push([i + 1, txtc]); });
  return out;
}
function planCodigo(lineas) {
  const lh = (sz) => sz * 1.22 / 72, chars = (w, sz) => Math.floor((w - 0.65) * 72 / (0.6 * sz)), HMAX = 4.7;
  const cuenta = (ancho) => lineas.map((l) => envolver(l, ancho).length);
  const sum = (v) => v.reduce((x, y) => x + y, 0);
  for (const sz of [12, 11.5, 11, 10.5, 10]) { const c = cuenta(chars(12.33, sz)); if (sum(c) * lh(sz) <= HMAX) return { modo: 'una', size: sz, paginas: [[0, lineas.length]] }; }
  const cand = []; lineas.forEach((l, i) => { if (i < lineas.length - 1 && (/[;)]\s*$/.test(l) || /^\s*\*/.test(l))) cand.push(i); });
  for (const sz of [11, 10.5, 10]) {
    const c = cuenta(chars(6.13, sz)); const tot = sum(c); const cm = []; c.reduce((ac, v, i) => (cm[i] = ac + v, ac + v), 0);
    let mejor = cand[0], d = 1e9; cand.forEach((i) => { const dd = Math.abs(cm[i] - tot / 2); if (dd < d) { d = dd; mejor = i; } }); const k = mejor + 1;
    if (Math.max(sum(c.slice(0, k)), sum(c.slice(k))) * lh(sz) <= HMAX) return { modo: 'dos', size: sz, corte: k, paginas: [[0, lineas.length]] };
  }
  let sz = 10.5, c = cuenta(chars(12.33, sz)), tot = sum(c), np = Math.max(2, Math.ceil(tot * lh(sz) / HMAX)); { const c2 = cuenta(chars(12.33, 10)), t2 = sum(c2), n2 = Math.max(2, Math.ceil(t2 * lh(10) / HMAX)); if (n2 < np) { sz = 10; c = c2; tot = t2; np = n2; } } const cum = []; c.reduce((ac, v, i) => (cum[i] = ac + v, ac + v), 0);
  const cortes = []; for (let k = 1; k < np; k++) { const objetivo = k * tot / np; let mejor = cand[0], d = 1e9; cand.forEach((i) => { const dd = Math.abs(cum[i] - objetivo); if (dd < d && !cortes.includes(i)) { d = dd; mejor = i; } }); cortes.push(mejor); }
  cortes.sort((x, y) => x - y); const pag = []; let ini = 0; cortes.forEach((i) => { pag.push([ini, i + 1]); ini = i + 1; }); pag.push([ini, lineas.length]); return { modo: 'una', size: sz, paginas: pag };
}
function slideCodigo(a) {
  slidesCodigo({ eyebrow: `C · Algoritmo ${a.num} · ${a.nombre}`, titulo: 'Código GAMS: núcleo del algoritmo', arch: a.arch, lineas: nucleo(a.id), claves: claveLineas(nucleo(a.id), a.claves), seg: 2,
    leyenda: 'Ejecutar: GAMS Studio → Run (F9)   ·   Salida: archivo .lst (display)   ·   El archivo completo incluye datos, evaluación y reporte', nota: `Código GAMS del núcleo de ${a.nombre}. Archivo: ${a.arch}.` });
}
function slidesCodigo(o) {
  const lineas = o.lineas, plan = planCodigo(lineas), size = plan.size, lh = size * 1.22 / 72; const claves = o.claves;
  plan.paginas.forEach(([i0, i1], pi) => {
    const s = nuevaSlide(); cabecera(s, o.eyebrow, `${o.titulo}${plan.paginas.length > 1 ? ` (${pi + 1}/${plan.paginas.length})` : ''}`, { wTitulo: 7.8 }); segmentado(s, o.seg, o.pasos);
    chip(s, o.arch, 0.5, 1.13, 3.6, { size: 9.5 }); txt(s, o.leyenda, { x: 4.25, y: 1.15, w: 8.5, h: 0.24, fontSize: 9.5, color: C.SUB, valign: 'middle' });
    const dosCol = plan.modo === 'dos', wcol = dosCol ? 6.13 : 12.33, ancho = Math.floor((wcol - 0.65) * 72 / (0.6 * size));
    const trozos = dosCol ? [[0, plan.corte], [plan.corte, lineas.length]] : [[i0, i1]];
    const cols = trozos.map(([x0, x1]) => { const f = []; for (let i = x0; i < x1; i++) envolver(lineas[i], ancho).forEach((t, k) => f.push({ t, num: k === 0 ? i + 1 : null })); return f; });
    const hCode = Math.min(5.05, Math.max(1.6, Math.max(...cols.map((c) => c.length)) * lh + 0.34));
    cols.forEach((col, ci) => {
      const x = 0.5 + ci * 6.2; card(s, x, 1.5, wcol, hCode, { fill: C.CODE_BG, sombra: false, r: 0.1 });
      const runs = []; col.forEach((f, i) => { runs.push({ text: (f.num === null ? '   ' : String(f.num).padStart(2, ' ') + ' '), options: { fontFace: F.M, fontSize: size, color: C.CODE_GUT } }); runs.push(...L.runsGams(f.t === '' ? ' ' : f.t, size)); runs[runs.length - 1].options.breakLine = i < col.length - 1; });
      txt(s, runs, { x: x + 0.15, y: 1.62, w: wcol - 0.3, h: hCode - 0.2, paraSpaceAfter: 0 });
    });
    const ks = claves.filter(([ln]) => ln > i0 && ln <= i1); const yk = 1.5 + hCode + 0.15, hk = 6.95 - yk;
    const maxRows = Math.floor((hk - 0.3) / 0.46); if (maxRows >= 1 && ks.length > maxRows * 3) ks.splice(maxRows * 3);
    if (ks.length && hk >= 0.8) {
      etiqueta(s, 'Claves del código', 0.5, yk, 4); const nc = 3, wk = (12.33 - 0.3) / nc; const ky = yk + 0.27; const rows = Math.ceil(ks.length / nc), hrow = Math.min(0.62, (hk - 0.3) / rows - 0.08);
      ks.forEach(([ln, tx], i) => { const col = i % nc, fila = Math.floor(i / nc); const x = 0.5 + col * (wk + 0.15), y = ky + fila * (hrow + 0.08); card(s, x, y, wk, hrow); chip(s, `L${ln}`, x + 0.12, y + hrow / 2 - 0.13, 0.5, { size: 9 }); txt(s, tx, { x: x + 0.72, y: y + 0.02, w: wk - 0.85, h: hrow - 0.04, fontSize: 11.5, valign: 'middle' }); });
    } else if (ks.length) { const m = ks.slice(0, 4), w = 12.33 / m.length; m.forEach(([ln, tx], i) => { chip(s, `L${ln}`, 0.5 + i * w, yk + 0.05, 0.45, { size: 8.5 }); txt(s, tx.split(/[:(]/)[0].trim(), { x: 1.0 + i * w, y: yk + 0.03, w: w - 0.6, h: 0.3, fontSize: 9, valign: 'middle' }); }); }
    nota(s, o.nota);
  });
}
function slideResultados(a) {
  const r = R[a.id] || null; const s = nuevaSlide(); cabecera(s, `C · Algoritmo ${a.num} · ${a.nombre}`, 'Resultados y análisis', { wTitulo: 7.8 }); segmentado(s, 3);
  const exacto = !!a.exacto; const costo = exacto ? OPT : r.costo, gap = exacto ? 0 : r.gap, nev = exacto ? null : r.nev;
  const rutas = exacto ? R.optimo.rutas : r.rutas_dec;
  // mapas
  card(s, 0.5, 1.2, 4.35, 3.45); etiqueta(s, exacto ? 'Solución óptima' : 'Solución del algoritmo', 0.68, 1.32, 3.8); img(s, IMG + a.fig.replace('ruta_', 'rutav_') + '.png', 0.62, 1.55, 4.1, 3.05);
  card(s, 5.0, 1.2, 4.35, 3.45); etiqueta(s, 'Óptimo (modelo exacto)', 5.18, 1.32, 3.8); img(s, IMG + 'rutav_exacto.png', 5.12, 1.55, 4.1, 3.05);
  // tiles
  const tx = 9.5, tw = 3.33, th = 0.8;
  stat(s, tx, 1.2, tw, th, e(costo), 'costo total (distancia)', C.INK);
  stat(s, tx, 2.08, tw, th, `${e(gap, 2)} %`, gap < 1e-6 ? 'brecha: óptimo alcanzado' : 'brecha frente al óptimo 425,05', gap < 1e-6 ? C.GREEN : (gap < 2 ? C.ORANGE : C.RED));
  stat(s, tx, 2.96, tw, th, exacto ? `${R.optimo.nodos_highs.toLocaleString('es-CO')} nodos` : `${nev.toLocaleString('es-CO')}`, exacto ? 'nodos explorados (HiGHS, 1,7 s)' : 'evaluaciones de la función de costo', C.INK);
  const extra = a.stoc ? [`${rob[a.stoc].optimas} / 20`, `semillas que alcanzan el óptimo (media ${e(rob[a.stoc].media)})`, rob[a.stoc].optimas >= 18 ? C.GREEN : (rob[a.stoc].optimas > 0 ? C.ORANGE : C.RED)] : [rutas.length + ' rutas', 'cargas ' + (exacto ? '12 / 12 / 14' : rutas.map(D.cargaRuta).join(' / ')) + ' de 15', C.INK];
  stat(s, tx, 3.84, tw, th, extra[0], extra[1], extra[2]);
  // salida de referencia
  card(s, 0.5, 4.8, 5.0, 2.15, { fill: C.CODE_BG, sombra: false, r: 0.1 }); 
  const tour = exacto ? null : r.tour; const lines = exacto ? ['* display z.l, cota_raiz, gap_raiz, nodos, veh', `z.l        = ${e(OPT, 4)}`, `cota_raiz  = ${e(R.optimo.relajacion, 4)}`, `gap_raiz   = ${e(100 * (OPT - R.optimo.relajacion) / OPT, 2)}`, 'veh        = 3', 'inicio     = c3? no: c5, c8, c9 (primer cliente)'] : [
    '* display tr, dr, costo_final, gap_pct, nev', `tr  = ${tour.join(' ')}`, ...rutas.map((ru, k) => `r${k + 1}: ${ru.join('-').padEnd(12)} carga ${String(D.cargaRuta(ru)).padStart(2)}  dist ${e(D.dRuta(ru), 2)}`), `costo_final = ${e(costo, 2)}`, `gap_pct     = ${e(gap, 2)}`, `nev         = ${nev}`];
  if (exacto) lines[5] = 'inicio     = c5, c8, c9 (primer cliente de cada ruta)';
  const runs = lines.map((l, i) => ({ text: l, options: { fontFace: F.M, fontSize: 9.5, color: i === 0 ? C.CODE_CM : C.CODE_TX, italic: i === 0, breakLine: i < lines.length - 1 } }));
  txt(s, runs, { x: 0.68, y: 4.95, w: 4.7, h: 1.9 }); 
  txt(s, 'Valores de referencia del .lst (formato abreviado)', { x: 0.68, y: 6.72, w: 4.7, h: 0.2, fontSize: 8, color: C.CODE_CM, italic: true });
  card(s, 5.65, 4.8, 7.18, 2.15); etiqueta(s, 'Análisis', 5.85, 4.92, 3);
  bullets(s, a.analisis(), 5.85, 5.17, 6.8, 1.75, { size: 11.5, gap: 4 });
  nota(s, `Resultados de ${a.nombre}: costo ${e(costo)}, brecha ${e(gap)} %. ` + a.analisis().join(' '));
}
function algoritmoCompleto(a) { slideEspec(a); slideEjemplo(a); slideCodigo(a); slideResultados(a); }
module.exports = { slidesCodigo, planCodigo, algoritmoCompleto, slideEspec, slideEjemplo, slideCodigo, slideResultados };
