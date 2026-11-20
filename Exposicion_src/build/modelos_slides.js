/* Diapositivas de los 27 modelos VRP: Problema · Modelo · Ejemplo · Código GAMS */
const fs = require('fs'), path = require('path');
const L = require('./lib.js'); const { C, F, pres, nuevaSlide, txt, card, cabecera, segmentado, etiqueta, chip, stat, bullets, tabla, img, nota } = L;
const { slidesCodigo } = require('./algoritmos_slides.js');
const MD = JSON.parse(fs.readFileSync(path.join(__dirname, '../ref/modelos_deck.json'), 'utf8'));
const DIR = path.join(__dirname, '../../GAMS_modelos/'); const IMG = '../img/';
const PASOS_M = ['Problema', 'Modelo', 'Ejemplo', 'Código GAMS'];
const fmt = (x, d = 2) => Number(x).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const ceja = (m) => `B · Modelo ${m.num} · ${m.fam}`;
const titulo = (m) => `${m.sigla}: ${m.nombre}`;
const SEL = new Set(['pcvrp', 'top']);

function slideProblema(m) {
  const s = nuevaSlide(); cabecera(s, ceja(m), titulo(m), { wTitulo: 7.8 }); segmentado(s, 0, PASOS_M);
  if (m.clase) chip(s, 'Visto en clase', 6.45, 0.3, 1.5, { size: 9, fill: C.GREEN_BG, color: C.GREEN });
  card(s, 0.5, 1.2, 6.25, 5.75); etiqueta(s, 'Qué es', 0.7, 1.33, 3);
  txt(s, m.desc, { x: 0.7, y: 1.58, w: 5.85, h: 1.95, fontSize: m.desc.length > 330 ? 13 : 14.5 });
  card(s, 0.7, 3.6, 5.85, 1.3, { fill: C.BLUE_BG }); etiqueta(s, 'Qué cambia respecto al modelo base', 0.85, 3.7, 5, { color: C.BLUE_T });
  txt(s, m.cambia, { x: 0.85, y: 3.95, w: 5.55, h: 0.9, fontSize: 11.5 });
  etiqueta(s, 'Supuestos del ejemplo', 0.7, 5.05, 4);
  bullets(s, m.sup, 0.7, 5.3, 5.85, 1.6, { size: 12, gap: 5 });
  card(s, 6.9, 1.2, 5.93, 3.05); etiqueta(s, 'Dónde se aplica', 7.1, 1.33, 4);
  m.aplic.forEach((a, i) => { const y = 1.62 + i * 0.85; card(s, 7.1, y + 0.04, 0.36, 0.36, { fill: C.BLUE, r: 0.18 }); txt(s, String(i + 1), { x: 7.1, y: y + 0.04, w: 0.36, h: 0.36, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }); txt(s, a, { x: 7.6, y, w: 5.05, h: 0.78, fontSize: 13, valign: 'middle' }); });
  card(s, 6.9, 4.4, 5.93, 2.55); etiqueta(s, 'Datos que necesita el modelo', 7.1, 4.53, 5);
  const filas = m.par.slice(0, 6); const hrow = Math.min(0.36, 2.0 / filas.length);
  filas.forEach(([k, v], i) => { const y = 4.82 + i * hrow; txt(s, k, { x: 7.1, y, w: 1.9, h: hrow, fontSize: 10, fontFace: F.M, bold: true, color: C.BLUE_T, valign: 'middle' }); txt(s, v, { x: 9.05, y, w: 3.65, h: hrow, fontSize: 10.5, valign: 'middle' }); });
  nota(s, `${m.sigla}. ${m.desc} Qué cambia: ${m.cambia} Aplicaciones: ${m.aplic.join(' ')}`);
}

function slideModelo(m) {
  const s = nuevaSlide(); cabecera(s, ceja(m), `${m.sigla}: modelo matemático`, { wTitulo: 7.8 }); segmentado(s, 1, PASOS_M);
  card(s, 0.5, 1.2, 4.55, 5.75);
  let y = 1.33; const todas = m.conj.concat(m.par, m.var); const alto = (b) => 1.33 + 3 * (0.26 + (b ? 0.18 : 0.1)) + todas.reduce((acc, [, v]) => acc + 0.22 * (v.length > (b ? 30 : 37) ? 2 : 1) + 0.08 + (b ? 0.12 : 0.04), 0); const big = alto(true) <= 6.9; const bloque = (t, filas) => { etiqueta(s, t, 0.7, y, 3); y += 0.26; filas.forEach(([k, v]) => { const largo = v.length > (big ? 30 : 37) ? 2 : 1; const h = 0.22 * largo + 0.08; txt(s, k, { x: 0.7, y, w: 1.55, h, fontSize: big ? 10.5 : 9.5, fontFace: F.M, bold: true, color: C.BLUE_T }); txt(s, v, { x: 2.3, y, w: 2.6, h, fontSize: big ? 11 : 10 }); y += h + (big ? 0.12 : 0.04); }); y += big ? 0.18 : 0.1; };
  bloque('Conjuntos', m.conj); bloque('Parámetros', m.par); bloque('Variables', m.var);
  if (y > 6.97) console.warn('AVISO: notación excede la tarjeta en', m.sigla, y.toFixed(2));
  card(s, 5.2, 1.2, 7.63, 0.82, { fill: C.BLUE_BG }); etiqueta(s, 'Función objetivo', 5.38, 1.28, 3, { color: C.BLUE_T });
  txt(s, m.fo, { x: 5.38, y: 1.5, w: 7.3, h: 0.46, fontSize: 13, fontFace: F.M, bold: true, valign: 'middle' });
  const n = m.res.length, size = n > 9 ? 9.5 : (n > 6 ? 10.5 : 11.5), rowH = Math.min(n > 6 ? 0.5 : 0.62, (6.82 - 2.35) / (n + 1));
  const filas = [['Restricción (nombre GAMS)', 'Expresión', 'Qué garantiza']].concat(m.res.map(([a, b, c]) => [{ text: a, b: true }, b, c]));
  card(s, 5.2, 2.15, 7.63, 4.8); tabla(s, filas, 5.3, 2.23, 7.43, [1.85, 3.0, 2.58], { size, rowH, zebra: true, maxY: 6.9 });
  nota(s, `Modelo de ${m.sigla}. Objetivo: ${m.fo}. Restricciones: ` + m.res.map((r) => `${r[0]}: ${r[1]} (${r[2]})`).join('; '));
}

function slideEjemplo(m) {
  const s = nuevaSlide(); cabecera(s, ceja(m), `${m.sigla}: problema de ejemplo y resultado`, { wTitulo: 7.8 }); segmentado(s, 2, PASOS_M);
  card(s, 0.5, 1.2, 6.55, 3.85); img(s, IMG + 'mod_' + m.id + '.png', 0.6, 1.27, 6.35, 3.7);
  const st = m.stats; const zlab = m.id === 'pcvrp' ? 'beneficio neto (máx.)' : m.id === 'top' ? 'premio total (máx.)' : m.id === 'mtspmm' ? 'z = ruta más larga + desempate' : 'función objetivo z (mín.)';
  const tiles = [[fmt(m.z), zlab], [String(m.rutas.length), m.rutas.length === 1 ? 'ruta' : 'rutas'], [`${st.vars} / ${st.ecs}`, 'variables / ecuaciones'], [`${st.bin} bin.`, `${fmt(st.nodos, 0)} nodos · ${fmt(st.tiempo, 1)} s`]];
  tiles.forEach(([v, t], i) => { const x = 0.5 + i * 1.66; card(s, x, 5.18, 1.56, 0.85); txt(s, v, { x: x + 0.1, y: 5.22, w: 1.38, h: 0.42, fontSize: v.length > 9 ? 13 : 16, bold: true, color: i === 0 ? C.BLUE_T : C.INK, valign: 'middle' }); txt(s, t, { x: x + 0.1, y: 5.64, w: 1.4, h: 0.36, fontSize: 8.5, color: C.SUB }); });
  card(s, 0.5, 6.15, 6.55, 0.8, { fill: 'FFF8EC' }); txt(s, 'Resuelto ejecutando el archivo .gms completo (intérprete gamsx + HiGHS); tiempo y nodos son de HiGHS. En GAMS el objetivo debe coincidir; los nodos dependen del solver.', { x: 0.65, y: 6.18, w: 6.25, h: 0.74, fontSize: 9.5, color: '5C3300', valign: 'middle' });
  card(s, 7.2, 1.2, 5.63, 1.62); etiqueta(s, 'Datos del ejemplo', 7.4, 1.33, 4);
  txt(s, m.ej, { x: 7.4, y: 1.58, w: 5.25, h: 1.18, fontSize: 11.5 });
  card(s, 7.2, 2.95, 5.63, 4.0); etiqueta(s, 'Resultado y lectura', 7.4, 3.08, 4);
  const items = m.lect.map((t) => (/^D\d? →|^D →|^D1 →|^D2 →/.test(t) ? { t, ruta: true } : { t }));
  const runs = []; items.forEach((it, i) => { runs.push({ text: it.t, options: { bullet: it.ruta ? false : { indent: 11 }, fontFace: it.ruta ? F.M : F.T, fontSize: it.ruta ? 10.5 : 12, color: it.ruta ? C.BLUE_T : C.INK, bold: !!it.ruta, indentLevel: it.ruta ? 1 : 0, breakLine: i < items.length - 1 } }); });
  txt(s, runs, { x: 7.4, y: 3.35, w: 5.25, h: 3.5, fontSize: 12, paraSpaceAfter: 5 });
  nota(s, `Ejemplo de ${m.sigla}: ${m.ej} Resultado: ${m.lect.join(' ')}`);
}

function lineasModelo(m) {
  const t = fs.readFileSync(DIR + m.arch, 'utf8').split('\n');
  const a = t.findIndex((l) => l.startsWith('* ------------------------------------- MODELO'));
  let b = t.findIndex((l) => l.startsWith('* ------------------------------------- REPORTE'));
  if (b < 0) b = t.findIndex((l) => l.startsWith('option decimals'));
  return t.slice(a, b).map((l) => l.replace(/\s+$/, '')).filter((l, i, arr) => !(l === '' && (i === arr.length - 1)));
}

function slideCodigoM(m) {
  const lineas = lineasModelo(m);
  const nombres = new Map(m.res.map((r) => [r[0].split(/[(, ]/)[0].toLowerCase(), r[2]]));
  const claves = []; lineas.forEach((l, i) => { const mm = /^(\w+)(\(|\.\.|\$)/.exec(l); if (mm && /\.\./.test(l)) { const k = mm[1].toLowerCase(); if (nombres.has(k) && claves.length < 6 && !claves.some((c) => c[2] === k)) claves.push([i + 1, nombres.get(k), k]); } if (/^solve /.test(l) && claves.length < 6) claves.push([i + 1, 'resolver el modelo (MIP)', 'solve' + i]); });
  slidesCodigo({ eyebrow: ceja(m), titulo: `${m.sigla}: código GAMS del modelo`, arch: m.arch, lineas, claves: claves.map((c) => [c[0], c[1]]), seg: 3, pasos: PASOS_M,
    leyenda: 'Se muestra el modelo y el solve; el archivo trae además los datos (arriba) y el reporte de rutas (abajo)   ·   Run (F9) en GAMS Studio', nota: `Código GAMS del modelo ${m.sigla}. Archivo ${m.arch}.` });
}

function modeloCompleto(m) { slideProblema(m); slideModelo(m); slideEjemplo(m); slideCodigoM(m); }

module.exports = { MD, modeloCompleto, slideProblema, slideModelo, slideEjemplo, slideCodigoM, fmt };
