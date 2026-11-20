/* Sistema de diseño de la exposición (principios de Apple HIG adaptados a diapositivas densas):
   superficie gris claro, tarjetas blancas con radio, jerarquía por tamaño y peso, un solo color de acento (azul),
   control segmentado como firma (Especificación · Ejemplo · GAMS · Resultados), contraste ≥ 4,5:1. */
const pptxgen = require('pptxgenjs');
const pres = new pptxgen(); pres.layout = 'LAYOUT_WIDE';
pres.title = 'Ruteo de vehículos: algoritmos, modelos y GAMS'; pres.author = 'Juan Sebastián Salas Lugo';
const C = { BG: 'F5F5F7', CARD: 'FFFFFF', INK: '1D1D1F', SUB: '6E6E73', LINE: 'D2D2D7', TRACK: 'E5E5EA', BLUE: '0071E3', BLUE_T: '0058B0', GREEN: '248A3D', GREEN_BG: 'E6F4EA', ORANGE: 'B25000', ORANGE_BG: 'FFF1DC', RED: 'C4001A', PURPLE: '7B3FA0',
  CODE_BG: '1D1D1F', CODE_TX: 'F5F5F7', CODE_KW: '64D2FF', CODE_FN: 'FFD60A', CODE_CM: '9A9AA0', CODE_NUM: 'FF9F0A', CODE_STR: 'A6E3A1', CODE_GUT: '6E6E73', BLUE_BG: 'E8F1FC' };
const F = { T: 'Arial', M: 'Courier New' };
let nSlide = 0; const W = 13.333, H = 7.5; let seccionActual = '';

function nuevaSlide(opts) {
  opts = opts || {}; const s = pres.addSlide(); nSlide++; s.background = { color: opts.bg || C.BG };
  s._n = nSlide; return s;
}
function txt(s, t, o) { return s.addText(t, Object.assign({ fontFace: F.T, color: C.INK, margin: 0, fontSize: 12, valign: 'top', isTextBox: true }, o)); }
function card(s, x, y, w, h, o) {
  o = o || {};
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: o.r === undefined ? 0.12 : o.r, fill: { color: o.fill || C.CARD }, line: { color: o.line || o.fill || C.CARD, width: o.line ? 0.75 : 0 },
    shadow: o.sombra === false ? undefined : { type: 'outer', color: '000000', opacity: 0.07, blur: 8, offset: 1.5, angle: 90 } });
}
function cabecera(s, eyebrow, titulo, o) {
  o = o || {};
  txt(s, eyebrow.toUpperCase(), { x: 0.5, y: 0.3, w: 8, h: 0.22, fontSize: 9.5, bold: true, color: C.BLUE_T, charSpacing: 1.5 });
  txt(s, titulo, { x: 0.5, y: 0.52, w: o.wTitulo || 12.3, h: 0.5, fontSize: o.sizeTitulo || 23, bold: true, color: C.INK });
  txt(s, 'Ruteo de vehículos · algoritmos, GAMS y pruebas', { x: 0.5, y: 7.13, w: 7, h: 0.2, fontSize: 8.5, color: C.SUB });
  txt(s, String(s._n), { x: 12.3, y: 7.13, w: 0.55, h: 0.2, fontSize: 8.5, color: C.SUB, align: 'right' });
}
const PASOS = ['Especificación', 'Ejemplo', 'Código GAMS', 'Resultados'];
function segmentado(s, activo) {
  const x0 = 8.45, w = 4.4, wp = w / 4;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x0, y: 0.3, w, h: 0.3, rectRadius: 0.15, fill: { color: C.TRACK }, line: { color: C.TRACK, width: 0 } });
  PASOS.forEach((p, i) => {
    if (i === activo) s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x0 + i * wp + 0.02, y: 0.32, w: wp - 0.04, h: 0.26, rectRadius: 0.13, fill: { color: C.BLUE }, line: { color: C.BLUE, width: 0 } });
    txt(s, p, { x: x0 + i * wp, y: 0.32, w: wp, h: 0.26, align: 'center', valign: 'middle', fontSize: 9, bold: i === activo, color: i === activo ? 'FFFFFF' : C.SUB });
  });
}
function etiqueta(s, t, x, y, w, o) { o = o || {}; return txt(s, t.toUpperCase(), { x, y, w, h: 0.2, fontSize: 8.5, bold: true, color: o.color || C.SUB, charSpacing: 1.2 }); }
function chip(s, t, x, y, w, o) {
  o = o || {}; s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.26, rectRadius: 0.13, fill: { color: o.fill || C.BLUE_BG }, line: { color: o.fill || C.BLUE_BG, width: 0 } });
  txt(s, t, { x, y, w, h: 0.26, align: 'center', valign: 'middle', fontSize: o.size || 9, bold: true, color: o.color || C.BLUE_T });
}
function stat(s, x, y, w, h, valor, texto, color) {
  card(s, x, y, w, h);
  txt(s, valor, { x: x + 0.12, y: y + 0.08, w: w - 0.24, h: h * 0.5, fontSize: 19, bold: true, color: color || C.INK, valign: 'middle' });
  txt(s, texto, { x: x + 0.12, y: y + h * 0.55, w: w - 0.24, h: h * 0.4, fontSize: 9, color: C.SUB, valign: 'top' });
}
function bullets(s, items, x, y, w, h, o) {
  o = o || {};
  const runs = []; items.forEach((it, i) => {
    const partes = Array.isArray(it) ? it : [it];
    partes.forEach((p, j) => { const esObj = typeof p === 'object'; runs.push({ text: esObj ? p.t : p, options: Object.assign({ bullet: j === 0 ? { indent: 11 } : false, breakLine: j === partes.length - 1 && i < items.length - 1, bold: esObj && p.b, color: esObj && p.c ? p.c : C.INK }, j > 0 ? {} : {}) }); });
  });
  return txt(s, runs, { x, y, w, h, fontSize: o.size || 11.5, paraSpaceAfter: o.gap === undefined ? 4 : o.gap, color: C.INK });
}
function kv(s, filas, x, y, w, o) {
  /* lista de pares (rótulo, texto) con rótulo en gris y texto en tinta; devuelve y final estimado */
  o = o || {}; const sz = o.size || 10.5, wl = o.wLabel || 1.05;
  filas.forEach(([k, v, h]) => {
    txt(s, k, { x, y, w: wl, h: 0.2, fontSize: 8.5, bold: true, color: C.SUB, charSpacing: 0.6 });
    txt(s, v, { x: x + wl, y: y - 0.02, w: w - wl, h: h || 0.4, fontSize: sz });
    y += (h || 0.4) + (o.gap === undefined ? 0.04 : o.gap);
  });
  return y;
}
/* ---- resaltado de sintaxis GAMS / pseudocódigo ---- */
const KW = new Set(['loop', 'while', 'if', 'elseif', 'else', 'display', 'option', 'set', 'sets', 'alias', 'parameter', 'parameters', 'scalar', 'scalars', 'solve', 'model', 'using', 'minimizing', 'binary', 'positive', 'variable', 'variables', 'equations', 'equation', 'and', 'or', 'not', 'yes', 'no']);
const FN = new Set(['sum', 'smin', 'smax', 'ord', 'mod', 'floor', 'sqrt', 'sqr', 'exp', 'min', 'max', 'arctan2', 'card', 'abs']);
function runsGams(linea, size) {
  const base = { fontFace: F.M, fontSize: size, color: C.CODE_TX };
  if (/^\s*\*/.test(linea)) return [{ text: linea, options: Object.assign({}, base, { color: C.CODE_CM, italic: true }) }];
  const out = []; const re = /('[^']*'|\d+\.?\d*(?:e[-+]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|\s+|.)/gy; let m;
  while ((m = re.exec(linea)) !== null) {
    const t = m[0], low = t.toLowerCase(); let col = C.CODE_TX, b = false;
    if (t[0] === "'") col = C.CODE_STR; else if (/^\d/.test(t)) col = C.CODE_NUM; else if (KW.has(low)) { col = C.CODE_KW; b = true; } else if (FN.has(low)) col = C.CODE_FN;
    out.push({ text: t, options: Object.assign({}, base, { color: col, bold: b }) });
  }
  return out;
}
function envolver(l, ancho) {
  const out = []; let r = l; const ind = (r.match(/^ */)[0]) + '    ';
  if (/^\s*\*/.test(l)) { while (r.length > ancho) { let c = r.lastIndexOf(' ', ancho); if (c < ancho * 0.5) c = ancho; out.push(r.slice(0, c)); r = '* ' + r.slice(c).trim(); } out.push(r); return out; }
  while (r.length > ancho) { let c = r.lastIndexOf(' ', ancho); if (c < ancho * 0.55) c = ancho; out.push(r.slice(0, c)); r = ind + r.slice(c).trim(); }
  out.push(r); return out;
}
/* bloque de código: lineas = [texto]; numeradas opcional; devuelve nº de líneas (con envoltura) */
function codigo(s, lineas, x, y, w, h, o) {
  o = o || {}; const size = o.size || 10; const ch = Math.floor((w - 0.35 - (o.num ? 0.3 : 0)) * 72 / (0.6 * size));
  card(s, x, y, w, h, { fill: C.CODE_BG, sombra: false, r: 0.1 });
  const runs = []; let n = 0; const filas = [];
  lineas.forEach((l, i) => { const env = envolver(l, ch); env.forEach((e, k) => filas.push({ t: e, num: k === 0 ? i + 1 : null })); });
  filas.forEach((f, i) => {
    if (o.num) runs.push({ text: (f.num === null ? '   ' : String(f.num).padStart(2, ' ') + ' ') , options: { fontFace: F.M, fontSize: size, color: C.CODE_GUT } });
    runs.push(...runsGams(f.t === '' ? ' ' : f.t, size)); runs[runs.length - 1].options.breakLine = i < filas.length - 1;
  });
  txt(s, runs, { x: x + 0.15, y: y + 0.12, w: w - 0.3, h: h - 0.24, paraSpaceAfter: 0, lineSpacingMultiple: 1.0 });
  return filas.length;
}
/* pseudocódigo en tarjeta clara con palabras de control en azul */
const PKW = /(mientras|para cada|para|si no|si|repetir|hasta que|hasta|devolver|elegir|ordenar|agregar|insertar|invertir|aplicar|dividir|marcar|generar|construir|depositar|evaluar|descartar|crear|tomar|guardar|parar|con prob\.|con probabilidad|argmin)/g;
function pseudo(s, lineas, x, y, w, h, o) {
  o = o || {}; const size = o.size || 10.5; card(s, x, y, w, h, { fill: 'FBFBFD', line: C.LINE });
  const runs = [];
  lineas.forEach((l, i) => {
    runs.push({ text: String(i + 1).padStart(2, ' ') + '  ', options: { fontFace: F.M, fontSize: size, color: '9A9AA0' } });
    const ind = l.match(/^ */)[0], body = l.trim(); if (ind) runs.push({ text: ind, options: { fontFace: F.M, fontSize: size } });
    let last = 0, m; PKW.lastIndex = 0;
    while ((m = PKW.exec(body))) { if (m.index > last) runs.push({ text: body.slice(last, m.index), options: { fontFace: F.M, fontSize: size, color: C.INK } }); runs.push({ text: m[0], options: { fontFace: F.M, fontSize: size, color: C.BLUE_T, bold: true } }); last = m.index + m[0].length; }
    runs.push({ text: body.slice(last), options: { fontFace: F.M, fontSize: size, color: C.INK, breakLine: i < lineas.length - 1 } });
  });
  txt(s, runs, { x: x + 0.14, y: y + 0.1, w: w - 0.28, h: h - 0.2, paraSpaceAfter: 1.5 });
}
function tabla(s, filas, x, y, w, colW, o) {
  o = o || {}; const size = o.size || 10, rowH = o.rowH || 0.27;
  const celdas = filas.map((r, i) => r.map((t, j) => {
    const esH = i === 0; const obj = (typeof t === 'object' && t !== null) ? t : { text: String(t) };
    return { text: obj.text, options: { fontFace: (o.mono && o.mono.includes(j) && !esH) ? F.M : F.T, fontSize: size, bold: esH || obj.b || (j === 0 && o.boldFirst), color: esH ? C.SUB : (obj.c || C.INK), fill: { color: esH ? 'EFEFF2' : (obj.fill || (i % 2 === 0 && o.zebra ? 'FAFAFC' : 'FFFFFF')) },
      valign: 'middle', align: (o.align && o.align[j]) || 'left', margin: [0.03, 0.08, 0.03, 0.08], border: [{ type: 'none' }, { type: 'none' }, { pt: 0.5, color: C.LINE }, { type: 'none' }] } };
  }));
  s.addTable(celdas, { x, y, w, colW, rowH, fontFace: F.T, autoPage: false });
}
const fsl = require('fs');
function dimPng(ruta) { const b = fsl.readFileSync(ruta); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
function img(s, ruta, x, y, w, h, o) { /* ajusta la imagen dentro de la caja conservando la proporción y la centra */
  const [iw, ih] = dimPng(ruta); const k = Math.min(w / iw, h / ih), ww = iw * k, hh = ih * k;
  s.addImage(Object.assign({ path: ruta, x: x + (w - ww) / 2, y: y + (h - hh) / 2, w: ww, h: hh }, o || {})); }
function nota(s, t) { s.addNotes(t); }
module.exports = { pres, C, F, W, H, nuevaSlide, txt, card, cabecera, segmentado, etiqueta, chip, stat, bullets, kv, codigo, pseudo, tabla, img, nota, envolver, runsGams, PASOS, getN: () => nSlide };
