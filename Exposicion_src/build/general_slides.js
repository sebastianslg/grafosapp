/* Diapositivas generales: portada, agenda, contexto, instancia, núcleo común, ejecución en GAMS, comparación y cierre. */
const fs = require('fs'), path = require('path');
const L = require('./lib.js'); const { C, F, pres, nuevaSlide, txt, card, cabecera, etiqueta, chip, stat, bullets, tabla, img, nota, envolver, runsGams } = L;
const D = require('./datos.js'); const { R, COORD, DEM, Q, OPT, fmt, dRuta, cargaRuta, ARCHIVOS } = D; const { ALG, rob } = require('./contenido.js');
const IMG = '../img/'; const e = (x, d = 2) => fmt(x, d);
const NOMBRES = ['d', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];
const FAM = { nn: 'Constructiva', barrido: 'Constructiva', insercion: 'Constructiva', dos_opt: 'Mejora local', vnd: 'Mejora local', tabu: 'Trayectoria', sa: 'Trayectoria', ga: 'Poblacional', aco: 'Poblacional', grasp: 'Multiarranque', vns: 'Trayectoria', bb: 'Exacto' };

function portada() {
  const s = nuevaSlide();
  txt(s, 'DISTRIBUCIÓN Y TRANSPORTE · UTB', { x: 0.7, y: 0.75, w: 7, h: 0.3, fontSize: 11, bold: true, color: C.BLUE_T, charSpacing: 2 });
  txt(s, 'Ruteo de vehículos', { x: 0.7, y: 1.35, w: 7.2, h: 0.95, fontSize: 48, bold: true });
  txt(s, 'Algoritmos heurísticos, metaheurísticos y exacto, cada uno con su código GAMS ejecutable y un problema de ejemplo', { x: 0.7, y: 2.45, w: 6.9, h: 1.0, fontSize: 20, color: C.SUB });
  [['12 algoritmos', 0.7], ['12 archivos .gms', 2.35], ['1 instancia común', 4.35]].forEach(([t, x]) => { card(s, x, 3.85, t.length > 15 ? 2.0 : 1.55, 0.42, { r: 0.21 }); txt(s, t, { x, y: 3.85, w: t.length > 15 ? 2.0 : 1.55, h: 0.42, fontSize: 11, bold: true, color: C.BLUE_T, align: 'center', valign: 'middle' }); });
  txt(s, [{ text: 'Juan Sebastián Salas Lugo', options: { bold: true, breakLine: true } }, { text: 'Profesor: Jaime Acevedo Chedid', options: { color: C.SUB, breakLine: true } }, { text: 'Universidad Tecnológica de Bolívar', options: { color: C.SUB } }], { x: 0.7, y: 5.6, w: 6, h: 0.9, fontSize: 13, paraSpaceAfter: 3 });
  card(s, 8.1, 0.65, 4.75, 6.2); img(s, IMG + 'instancia.png', 8.25, 0.8, 4.45, 5.7);
  txt(s, 'Instancia CVRP-10 usada en todos los algoritmos', { x: 8.25, y: 6.45, w: 4.45, h: 0.25, fontSize: 9.5, color: C.SUB, align: 'center' });
  nota(s, 'Presentación de la sección de algoritmos del ruteo de vehículos. Cada algoritmo tiene cuatro diapositivas: especificación, ejemplo con traza, código GAMS y resultados. Los archivos .gms se pueden ejecutar en clase.');
}

function agenda() {
  const s = nuevaSlide(); cabecera(s, 'Contenido', 'Ruta de la exposición');
  const cols = [['1', 'Marco común', 'Por qué no basta el modelo exacto, mapa de métodos, instancia CVRP-10, evaluación y vecindarios, cómo ejecutar los archivos GAMS.', 'Diapositivas 3–8'],
    ['2', 'Constructivas y mejora local', 'Vecino más cercano, barrido, inserción más barata, 2-opt y VND (relocate, swap y 2-opt).', 'Algoritmos 01–05'],
    ['3', 'Metaheurísticas', 'Búsqueda tabú, recocido simulado, algoritmo genético, colonia de hormigas, GRASP y VNS.', 'Algoritmos 06–11'],
    ['4', 'Exacto y comparación', 'Branch and bound (modelo MILP), comparación de los 12 métodos, robustez, parámetros y guía de decisión.', 'Algoritmo 12 y cierre']];
  cols.forEach(([n, t, d, r], i) => { const x = 0.5 + i * 3.1; card(s, x, 1.2, 2.95, 2.95); txt(s, n, { x: x + 0.2, y: 1.32, w: 0.6, h: 0.5, fontSize: 26, bold: true, color: C.BLUE }); txt(s, t, { x: x + 0.2, y: 1.9, w: 2.6, h: 0.55, fontSize: 14, bold: true }); txt(s, d, { x: x + 0.2, y: 2.5, w: 2.6, h: 1.2, fontSize: 12.5, color: C.INK }); chip(s, r, x + 0.2, 3.72, 1.75, { size: 9 }); });
  card(s, 0.5, 4.3, 12.33, 2.65); etiqueta(s, 'Cómo está organizado cada algoritmo: cuatro diapositivas con el mismo control segmentado', 0.7, 4.42, 11);
  const pasos = [['Especificación', 'Idea, tipo, entrada y salida, pseudocódigo, parámetros, complejidad y garantía.'], ['Ejemplo', 'Problema CVRP-10 resuelto paso a paso: tabla de la traza y figura de las rutas o de la convergencia.'], ['Código GAMS', 'Núcleo del programa con numeración de líneas y las claves del código explicadas.'], ['Resultados', 'Salida del .lst, costo, brecha frente al óptimo, rutas y análisis de lo que se observa.']];
  pasos.forEach(([t, d], i) => { const x = 0.7 + i * 3.02, w = 2.85; card(s, x, 4.78, w, 1.95, { fill: i === 0 ? C.BLUE_BG : 'F5F5F7', sombra: false }); chip(s, String(i + 1) + ' · ' + t, x + 0.15, 4.92, 1.7, { fill: C.BLUE, color: 'FFFFFF', size: 9 }); txt(s, d, { x: x + 0.15, y: 5.3, w: w - 0.3, h: 1.35, fontSize: 12.5 }); });
  nota(s, 'La exposición sigue cuatro bloques. En el segundo y el tercero, cada algoritmo ocupa cuatro diapositivas con la misma estructura para que se compare fácilmente.');
}

function porque() {
  const s = nuevaSlide(); cabecera(s, 'C · Marco común', '¿Por qué no basta con el modelo exacto?');
  const st = [['6–7 %', 'del precio final de los productos corresponde a costos de transporte'], ['40–60 %', 'de los costos logísticos totales los generan las decisiones de transporte'], ['8 %', 'del PIB de Estados Unidos (2021) está anclado a la logística']];
  st.forEach(([v, t], i) => { const x = 0.5 + i * 4.15; card(s, x, 1.2, 4.0, 1.45); txt(s, v, { x: x + 0.25, y: 1.3, w: 3.5, h: 0.65, fontSize: 32, bold: true, color: C.BLUE }); txt(s, t, { x: x + 0.25, y: 1.95, w: 3.55, h: 0.6, fontSize: 12 }); });
  card(s, 0.5, 2.8, 6.1, 4.15); etiqueta(s, 'El VRP es NP-difícil', 0.7, 2.93, 4);
  bullets(s, ['Generaliza al TSP: el número de rutas crece de forma factorial con los clientes.', 'Los métodos exactos resuelven decenas o pocos cientos de clientes; en la práctica hay miles y poco tiempo.', 'Una buena solución rápida vale más que el óptimo que llega tarde.', 'Aun así, el modelo exacto sigue siendo útil para validar: da el óptimo y una cota inferior con la que se mide la brecha (gap) de cada heurística.', `En la instancia CVRP-10 el exacto tarda ${e(R.optimo.tiempo_highs, 1)} s y explora ${fmt(R.optimo.nodos_highs, 0)} nodos; con 100 clientes el mismo modelo ya no es práctico.`], 0.7, 3.25, 5.75, 3.6, { size: 13.5, gap: 8 });
  card(s, 6.75, 2.8, 6.08, 4.15); etiqueta(s, 'Evolución de los métodos', 6.95, 2.93, 4);
  const era = [['1960–70', 'Heurísticas simples', 'Intuición y mejora local: vecino más cercano, barrido, 2-opt.'], ['1970–80', 'Programación matemática', 'Asignación, agrupamiento y ramificación: modelos MILP y branch and bound.'], ['1980–hoy', 'Metaheurísticas e IA', 'Tabú, recocido, genético, colonias, GRASP, VNS; búsqueda guiada por datos.']];
  era.forEach(([a, b, c], i) => { const y = 3.3 + i * 1.18; txt(s, a, { x: 6.95, y, w: 1.15, h: 0.3, fontSize: 13, bold: true, color: C.BLUE_T }); txt(s, b, { x: 8.2, y, w: 4.45, h: 0.3, fontSize: 13, bold: true }); txt(s, c, { x: 8.2, y: y + 0.35, w: 4.45, h: 0.6, fontSize: 12.5, color: C.SUB }); if (i < 2) s.addShape(pres.shapes.LINE, { x: 6.95, y: y + 1.0, w: 5.7, h: 0, line: { color: C.LINE, width: 0.75 } }); });
  nota(s, 'El transporte pesa entre 6 y 7 % del precio final. Como el VRP es NP-difícil, se usan heurísticas y metaheurísticas para tamaños reales; el modelo exacto sirve para validar.');
}

function mapa() {
  const s = nuevaSlide(); cabecera(s, 'C · Marco común', 'Mapa de métodos de resolución y los 12 algoritmos de esta exposición');
  const g = (n) => ALG.find((a) => a.id === n); const chipA = (x, y, w, id) => { const a = g(id); card(s, x, y, w, 0.5, { fill: C.BLUE_BG, sombra: false, r: 0.1 }); const CORTO = { vns: 'VNS', bb: 'Branch and bound (exacto)', vnd: 'VND: relocate, swap y 2-opt' }; txt(s, [{ text: a.num + '  ', options: { bold: true, color: C.BLUE_T } }, { text: CORTO[id] || a.nombre }], { x: x + 0.12, y, w: w - 0.2, h: 0.5, fontSize: 11.5, valign: 'middle' }); };
  card(s, 0.5, 1.2, 12.33, 0.55, { fill: C.INK, sombra: false }); txt(s, 'Resolver un VRP', { x: 0.5, y: 1.2, w: 12.33, h: 0.55, fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
  // exactos
  card(s, 0.5, 1.95, 2.9, 3.35); etiqueta(s, 'Exactos', 0.7, 2.08, 2); txt(s, 'Garantizan el óptimo; escalan poco.', { x: 0.7, y: 2.33, w: 2.55, h: 0.5, fontSize: 10.5, color: C.SUB }); chipA(0.7, 2.95, 2.5, 'bb'); txt(s, 'Variantes: branch & cut y branch & price.', { x: 0.7, y: 3.6, w: 2.5, h: 0.6, fontSize: 10.5, color: C.SUB });
  // heurísticas
  card(s, 3.55, 1.95, 6.0, 3.35); etiqueta(s, 'Heurísticas', 3.75, 2.08, 3); txt(s, 'Sin garantía de optimalidad; rápidas.', { x: 3.75, y: 2.33, w: 4, h: 0.3, fontSize: 10.5, color: C.SUB });
  etiqueta(s, 'Constructivas', 3.75, 2.75, 2.5, { color: C.BLUE_T }); ['nn', 'barrido', 'insercion'].forEach((id, i) => chipA(3.75, 3.0 + i * 0.58, 2.7, id));
  etiqueta(s, 'Mejora local', 6.65, 2.75, 2.5, { color: C.BLUE_T }); ['dos_opt', 'vnd'].forEach((id, i) => chipA(6.65, 3.0 + i * 0.58, 2.7, id));
  txt(s, 'Entre ambas: relocate, swap y 2-opt sobre un tour inicial.', { x: 6.65, y: 4.2, w: 2.7, h: 0.8, fontSize: 10, color: C.SUB });
  // metaheurísticas
  card(s, 9.7, 1.95, 3.13, 3.35); etiqueta(s, 'Metaheurísticas', 9.9, 2.08, 3); txt(s, 'Guían la búsqueda para escapar de óptimos locales.', { x: 9.9, y: 2.33, w: 2.8, h: 0.45, fontSize: 10.5, color: C.SUB });
  etiqueta(s, 'Trayectoria y multiarranque', 9.9, 2.8, 2.9, { color: C.BLUE_T }); ['tabu', 'sa', 'vns', 'grasp'].forEach((id, i) => chipA(9.9, 3.02 + i * 0.5, 2.75, id));
  card(s, 0.5, 5.45, 12.33, 1.5); etiqueta(s, 'Poblacionales e híbridos', 0.7, 5.57, 4); chipA(0.7, 5.88, 3.1, 'ga'); chipA(0.7, 6.4, 3.1, 'aco');
  txt(s, 'Las poblacionales mantienen varias soluciones a la vez (cruce, feromona). Los híbridos o matheurísticas combinan una heurística con un solver MILP: LNS fija parte de la solución y resuelve el resto de forma exacta; no se implementan aquí.', { x: 4.1, y: 5.62, w: 8.5, h: 1.2, fontSize: 13.5 });
  nota(s, 'Mapa de métodos. Los números 01 a 12 son los archivos GAMS. Las matheurísticas se mencionan pero no se implementan.');
}

function instancia() {
  const s = nuevaSlide(); cabecera(s, 'C · Marco común', 'Instancia común CVRP-10');
  card(s, 0.5, 1.2, 4.65, 5.75); img(s, IMG + 'instancia.png', 0.65, 1.35, 4.35, 5.45);
  card(s, 5.3, 1.2, 4.05, 5.75); etiqueta(s, 'Datos (depósito d y 10 clientes)', 5.5, 1.33, 3.5);
  const filas = [['Nodo', 'x', 'y', 'Demanda']].concat(NOMBRES.map((n, i) => [n, COORD[i][0], COORD[i][1], DEM[i]]));
  tabla(s, filas, 5.5, 1.62, 3.65, [0.9, 0.8, 0.8, 1.15], { size: 11, rowH: 0.42, zebra: true, align: ['left', 'right', 'right', 'right'] });
  const t = [['Capacidad Q', '15'], ['Demanda total', '38'], ['Rutas mínimas', '⌈38 / 15⌉ = 3'], ['Distancia', 'euclidiana']];
  t.forEach(([k, v], i) => { const x = 9.5, y = 1.2 + i * 0.92; card(s, x, y, 3.33, 0.82); txt(s, k.toUpperCase(), { x: x + 0.15, y: y + 0.1, w: 3, h: 0.2, fontSize: 8.5, bold: true, color: C.SUB, charSpacing: 1 }); txt(s, v, { x: x + 0.15, y: y + 0.33, w: 3, h: 0.4, fontSize: 18, bold: true }); });
  card(s, 9.5, 4.95, 3.33, 2.0, { fill: C.BLUE_BG, sombra: false }); etiqueta(s, 'Óptimo del modelo exacto', 9.65, 5.07, 3, { color: C.BLUE_T });
  txt(s, e(OPT), { x: 9.65, y: 5.32, w: 3, h: 0.5, fontSize: 26, bold: true, color: C.BLUE_T });
  txt(s, R.optimo.rutas.map((r, i) => `R${i + 1}: d→${r.map((c) => 'c' + c).join('→')}→d`).join('\n'), { x: 9.65, y: 5.9, w: 3.1, h: 0.95, fontSize: 10, fontFace: F.M });
  nota(s, 'Todos los algoritmos usan los mismos datos; así sus resultados son comparables. El óptimo 425,05 lo obtiene el modelo exacto (archivo 12) y se usa para calcular la brecha de los demás.');
}

function evaluacion() {
  const s = nuevaSlide(); cabecera(s, 'C · Marco común', 'Representación y evaluación: tour gigante y división por capacidad');
  const tour = R.nn.tour; const rutas = R.nn.rutas_dec;
  card(s, 0.5, 1.2, 5.35, 5.75); etiqueta(s, 'Idea', 0.7, 1.33, 3);
  txt(s, 'Una solución es una permutación tr(p) de los 10 clientes (tour gigante). La función EVALUAR la recorre en orden y abre una ruta nueva cuando el siguiente cliente excede la capacidad Q = 15. El costo es la suma de las distancias, con regreso al depósito al cerrar cada ruta.', { x: 0.7, y: 1.6, w: 4.95, h: 1.5, fontSize: 12 });
  etiqueta(s, `Ejemplo con el tour del vecino más cercano (costo ${e(R.nn.costo)})`, 0.7, 3.2, 5);
  tour.forEach((c, i) => { const x = 0.7 + i * 0.49; card(s, x, 3.5, 0.44, 0.44, { fill: C.BLUE_BG, sombra: false, r: 0.08 }); txt(s, String(c), { x, y: 3.5, w: 0.44, h: 0.44, fontSize: 12, bold: true, color: C.BLUE_T, align: 'center', valign: 'middle' }); });
  let k = 0; rutas.forEach((ru, i) => { const y = 4.15 + i * 0.62; txt(s, `Ruta ${i + 1}`, { x: 0.7, y, w: 0.8, h: 0.5, fontSize: 11, bold: true, valign: 'middle' }); ru.forEach((c, j) => { const x = 1.6 + j * 0.5; card(s, x, y + 0.04, 0.44, 0.42, { fill: i === 0 ? 'E8F1FC' : i === 1 ? 'E6F4EA' : 'FFF1DC', sombra: false, r: 0.08 }); txt(s, String(c), { x, y: y + 0.04, w: 0.44, h: 0.42, fontSize: 11.5, bold: true, align: 'center', valign: 'middle' }); }); txt(s, `q = ${cargaRuta(ru)}/15 · ${e(dRuta(ru), 1)}`, { x: 3.95, y, w: 1.8, h: 0.5, fontSize: 10.5, color: C.SUB, valign: 'middle' }); });
  txt(s, 'Con esta representación todo vecindario (relocate, swap, 2-opt) es un cambio en la permutación, y toda permutación es factible: el límite de capacidad lo impone la división.', { x: 0.7, y: 6.05, w: 5, h: 0.8, fontSize: 10.5, color: C.SUB });
  const ev = fs.readFileSync(path.join(__dirname, '../../GAMS_algoritmos/' + ARCHIVOS.dos_opt + '.gms'), 'utf8'); const a = ev.indexOf('* ---- EVALUAR'); const mm = /\);\n\s*cst = cst \+ sum\(i\$\(ord\(i\) = pv\+1\), dist\(i,'d'\)\);/.exec(ev.slice(a)); const b = a + mm.index + mm[0].length;
  const lineas = ev.slice(a, b).split('\n').map((l) => l.replace(/\s+$/, '')); const size = 12; const ancho = Math.floor((6.7 - 0.65) * 72 / (0.6 * size));
  card(s, 6.0, 1.2, 6.83, 3.95, { fill: C.CODE_BG, sombra: false, r: 0.1 }); const runs = [];
  const filas = []; lineas.forEach((l, i) => envolver(l, ancho).forEach((t, kk) => filas.push({ t, num: kk === 0 ? i + 1 : null })));
  filas.forEach((f, i) => { runs.push({ text: (f.num === null ? '   ' : String(f.num).padStart(2, ' ') + ' '), options: { fontFace: F.M, fontSize: size, color: C.CODE_GUT } }); runs.push(...runsGams(f.t === '' ? ' ' : f.t, size)); runs[runs.length - 1].options.breakLine = i < filas.length - 1; });
  txt(s, runs, { x: 6.15, y: 1.32, w: 6.55, h: 3.75, paraSpaceAfter: 0 });
  card(s, 6.0, 5.3, 6.83, 1.65); etiqueta(s, 'Bloque EVALUAR (común a los archivos 04 a 11)', 6.2, 5.42, 5);
  bullets(s, ['Variables: ld es la carga acumulada, pv el nodo anterior (0 es el depósito), rn el número de ruta y nev cuenta las evaluaciones.', 'Si ld + demanda > Q se cierra la ruta (regreso al depósito) y se abre otra.', 'rr(p) guarda la ruta de cada posición para el reporte.'], 6.2, 5.7, 6.45, 1.2, { size: 10.5, gap: 3 });
  nota(s, 'EVALUAR es la función objetivo común. Cada algoritmo la usa para costear una permutación; el número de evaluaciones (nev) mide el esfuerzo computacional.');
}

function vecindarios() {
  const s = nuevaSlide(); cabecera(s, 'C · Marco común', 'Vecindarios y generador pseudoaleatorio');
  const base = R.nn.tour.slice(); const caja = (x, y, v, hi) => { card(s, x, y, 0.38, 0.38, { fill: hi ? C.BLUE : 'F5F5F7', sombra: false, r: 0.07 }); txt(s, String(v), { x, y, w: 0.38, h: 0.38, fontSize: 10.5, bold: true, color: hi ? 'FFFFFF' : C.INK, align: 'center', valign: 'middle' }); };
  const relocate = (t, a, b) => { const r = t.slice(); const [v] = r.splice(a, 1); r.splice(b, 0, v); return r; }; const swap = (t, a, b) => { const r = t.slice(); [r[a], r[b]] = [r[b], r[a]]; return r; }; const opt2 = (t, a, b) => t.slice(0, a).concat(t.slice(a, b + 1).reverse(), t.slice(b + 1));
  const casos = [['1 · Relocate', 'Saca un cliente y lo reinserta en otra posición.', relocate(base, 3, 7), [3, 7], 'relocate(a, b): trasladar la posición 4 a la 8.'], ['2 · Swap', 'Intercambia dos clientes de lugar.', swap(base, 1, 6), [1, 6], 'swap(a, b): intercambiar las posiciones 2 y 7.'], ['3 · 2-opt', 'Invierte un tramo del tour (elimina dos arcos que se cruzan).', opt2(base, 2, 5), [2, 3, 4, 5], '2-opt(a, b): invertir las posiciones 3 a 6.']];
  casos.forEach(([t, d, nuevo, hi, f], i) => { const y = 1.2 + i * 1.62; card(s, 0.5, y, 8.1, 1.5); txt(s, t, { x: 0.7, y: y + 0.1, w: 2.6, h: 0.3, fontSize: 14, bold: true }); txt(s, d, { x: 2.9, y: y + 0.13, w: 5.5, h: 0.3, fontSize: 10.5, color: C.SUB });
    txt(s, 'antes', { x: 0.7, y: y + 0.55, w: 0.8, h: 0.38, fontSize: 9.5, color: C.SUB, valign: 'middle' }); txt(s, 'después', { x: 0.7, y: y + 1.0, w: 0.8, h: 0.38, fontSize: 9.5, color: C.SUB, valign: 'middle' });
    base.forEach((v, j) => caja(1.55 + j * 0.45, y + 0.55, v, hi.includes(j))); nuevo.forEach((v, j) => caja(1.55 + j * 0.45, y + 1.0, v, hi.includes(j))); txt(s, f, { x: 6.2, y: y + 0.55, w: 2.3, h: 0.83, fontSize: 9.5, color: C.SUB, valign: 'middle' }); });
  card(s, 0.5, 6.05, 8.1, 0.9, { fill: C.BLUE_BG, sombra: false }); txt(s, 'Tras cada movimiento se llama a EVALUAR: el tour modificado se divide de nuevo por capacidad y el costo cambia. Relocate y swap actúan entre rutas; 2-opt actúa dentro de una ruta y entre rutas contiguas del tour gigante.', { x: 0.7, y: 6.1, w: 7.7, h: 0.8, fontSize: 10.5, valign: 'middle' });
  card(s, 8.75, 1.2, 4.08, 5.75); etiqueta(s, 'Generador Park-Miller', 8.95, 1.33, 3);
  txt(s, 'Los algoritmos estocásticos (recocido, genético, hormigas, GRASP, VNS) usan un generador congruencial con semilla fija:', { x: 8.95, y: 1.62, w: 3.7, h: 0.95, fontSize: 11 });
  card(s, 8.95, 2.65, 3.68, 0.7, { fill: C.CODE_BG, sombra: false, r: 0.08 }); txt(s, 'seed = mod(16807*seed, 2147483647);\nu    = seed/2147483647;', { x: 9.05, y: 2.7, w: 3.5, h: 0.6, fontFace: F.M, fontSize: 9.5, color: C.CODE_TX, valign: 'middle' });
  bullets(s, ['Misma semilla, misma corrida: el profesor obtiene los mismos números en clase.', 'Se cambia la semilla en el archivo (por ejemplo 2024 por 2025) para ver la variabilidad.', 'GAMS no trae un generador que fije la semilla de forma portátil; con esta fórmula el resultado no depende de la versión.', 'u ∈ (0, 1) se transforma con floor(u·n) para elegir posiciones.'], 8.95, 3.55, 3.7, 3.3, { size: 10.5, gap: 5 });
  nota(s, 'Los tres vecindarios son cambios en la permutación. El generador Park-Miller es determinista; así las corridas son reproducibles y se pueden verificar contra la tabla de resultados de cada algoritmo.');
}

function ejecutar() {
  const s = nuevaSlide(); cabecera(s, 'C · Marco común', 'Cómo ejecutar los 12 programas GAMS en clase');
  card(s, 0.5, 1.2, 4.15, 5.75); etiqueta(s, 'Pasos', 0.7, 1.33, 3);
  [['1', 'Abrir', 'Abrir el archivo .gms en GAMS Studio (o gams archivo.gms en consola).'], ['2', 'Ejecutar', 'Run (F9). Todos son autocontenidos: datos, algoritmo y reporte en un solo archivo.'], ['3', 'Leer la salida', 'En el archivo .lst buscar las instrucciones display: tour, costo_final, gap_pct y nev.'], ['4', 'Comparar', 'Contrastar con la diapositiva «Resultados» del algoritmo; deben coincidir.'], ['5', 'Variar', 'Cambiar una semilla o un parámetro (T₀, tamaño de población, α, β) y volver a ejecutar.']].forEach(([n, t, d], i) => { const y = 1.65 + i * 1.04; card(s, 0.7, y + 0.03, 0.4, 0.4, { fill: C.BLUE, sombra: false, r: 0.2 }); txt(s, n, { x: 0.7, y: y + 0.03, w: 0.4, h: 0.4, fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }); txt(s, t, { x: 1.25, y, w: 3.2, h: 0.28, fontSize: 12.5, bold: true }); txt(s, d, { x: 1.25, y: y + 0.3, w: 3.25, h: 0.7, fontSize: 10.5, color: C.SUB }); });
  card(s, 4.8, 1.2, 8.03, 5.75); etiqueta(s, 'Los doce archivos', 5.0, 1.33, 3);
  const ln = { nn: 76, barrido: 88, insercion: 97, dos_opt: 144, vnd: 142, tabu: 134, sa: 154, ga: 141, aco: 129, grasp: 178, vns: 204, bb: 65 };
  const filas = [['N.º', 'Archivo', 'Familia', 'Líneas', 'Costo', 'Evaluaciones']].concat(ALG.map((a) => { const k = R[a.id] || null; const cost = a.id === 'bb' ? R.optimo.costo : k.costo; const nev = a.id === 'bb' ? '—' : fmt(k.nev, 0); return [a.num, ARCHIVOS[a.id] + '.gms', FAM[a.id], ln[a.id], e(cost), nev]; }));
  tabla(s, filas, 5.0, 1.62, 7.65, [0.5, 3.1, 1.25, 0.65, 0.95, 1.2], { size: 10, rowH: 0.34, zebra: true, mono: [1], align: ['left', 'left', 'left', 'right', 'right', 'right'] });
  card(s, 5.0, 6.15, 7.65, 0.68, { fill: C.ORANGE_BG, sombra: false }); txt(s, 'Los costos son valores de referencia calculados con una implementación equivalente (misma lógica y mismo generador). El archivo 12 tiene 131 columnas, pensado para caber en la licencia de demostración de GAMS (300).', { x: 5.15, y: 6.17, w: 7.4, h: 0.64, fontSize: 10, valign: 'middle', color: '5C3300' });
  nota(s, 'Guía de ejecución. Cada archivo es independiente. Los resultados de cada diapositiva son valores de referencia; al ejecutar en GAMS deben coincidir, lo que sirve para comprobar el código en clase.');
}

function comparacionGrafica() {
  const s = nuevaSlide(); cabecera(s, 'Cierre · Comparación', 'Comparación gráfica: brecha y esfuerzo de los métodos');
  card(s, 0.5, 1.2, 12.33, 4.45); img(s, IMG + 'comparacion.png', 0.65, 1.3, 12.03, 4.25);
  [['Constructivas', 'Sin parámetros y casi sin evaluaciones; la calidad depende de la geometría: 13,2 % de brecha en vecino más cercano e inserción, 0,31 % en el barrido.'], ['Mejora local', '2-opt (181 evaluaciones) baja a 0,31 %; VND con tres vecindarios llega al óptimo con 451 evaluaciones.'], ['Metaheurísticas', 'Tabú, recocido, genético, GRASP y VNS llegan al óptimo con 1.830 a 18.308 evaluaciones; hormigas se queda en 1,03 %.']].forEach(([t, d], i) => { const x = 0.5 + i * 4.15; card(s, x, 5.8, 4.0, 1.15); etiqueta(s, t, x + 0.18, 5.9, 3.6, { color: C.BLUE_T }); txt(s, d, { x: x + 0.18, y: 6.15, w: 3.65, h: 0.78, fontSize: 10.5 }); });
  nota(s, 'Brecha frente al óptimo (izquierda) y número de evaluaciones de la función de costo (derecha, escala logarítmica).');
}

function comparacion() {
  const s = nuevaSlide(); cabecera(s, 'Cierre · Comparación', 'Tabla comparativa de los 12 métodos sobre la misma instancia');
  const filas = [['N.º', 'Algoritmo', 'Familia', 'Costo', 'Brecha', 'Evaluaciones', 'Lectura']].concat(ALG.map((a) => { const k = a.id === 'bb' ? { costo: R.optimo.costo, gap: 0, nev: null } : R[a.id]; const lect = { nn: 'Rápido; arrastra una mala decisión al final', barrido: 'Casi óptimo; prueba 10 rotaciones', insercion: 'Mismo costo que el vecino más cercano en esta instancia', dos_opt: 'Mejora al vecino más cercano en 3 pasadas', vnd: 'Óptimo con tres vecindarios', tabu: 'Óptimo; la memoria evita ciclos', sa: 'Óptimo; escapa de óptimos locales', ga: 'Óptimo con 30 individuos y 60 generaciones', aco: 'Se estanca en 429,43 (feromona concentrada)', grasp: 'Óptimo en 20 construcciones con VND', vns: 'Óptimo; agitación creciente más VND', bb: 'Óptimo probado con 1.369 nodos' }[a.id];
    return [a.num, { text: a.nombre, b: true }, FAM[a.id], e(k.costo), e(k.gap < 1e-6 ? 0 : k.gap) + ' %', k.nev === null ? '—' : fmt(k.nev, 0), lect]; }));
  card(s, 0.5, 1.2, 12.33, 5.75); tabla(s, filas, 0.7, 1.35, 11.93, [0.55, 2.9, 1.5, 1.05, 1.0, 1.3, 3.63], { size: 11, rowH: 0.4, zebra: true, align: ['left', 'left', 'left', 'right', 'right', 'right', 'left'] });
  txt(s, 'Valores de referencia sobre la instancia CVRP-10 (óptimo 425,05). Brecha = (costo − óptimo) / óptimo. Evaluaciones = llamadas a EVALUAR.', { x: 0.7, y: 6.62, w: 11.9, h: 0.25, fontSize: 9.5, color: C.SUB });
  nota(s, 'Todos llegan a 425,05 salvo vecino más cercano e inserción (481,16, 13,2 %), barrido y 2-opt (426,35) y hormigas (429,43). El costo no es la única medida: las evaluaciones muestran el esfuerzo.');
}

function robustez() {
  const s = nuevaSlide(); cabecera(s, 'Cierre · Robustez', 'Robustez de las metaheurísticas estocásticas: 20 semillas distintas');
  card(s, 0.5, 1.2, 7.2, 4.1); img(s, IMG + 'robustez.png', 0.65, 1.3, 6.9, 3.9);
  const filas = [['Algoritmo', 'Media', 'Mejor', 'Peor', 'Óptimo']].concat(['sa', 'ga', 'aco', 'grasp', 'vns'].map((k) => { const r = rob[k]; return [ALG.find((a) => a.id === k).nombre, e(r.media), e(r.mejor), e(r.peor), `${r.optimas} / 20`]; }));
  card(s, 7.85, 1.2, 4.98, 4.1); etiqueta(s, 'Resumen sobre 20 semillas', 8.05, 1.33, 4); tabla(s, filas, 8.05, 1.62, 4.6, [1.45, 0.75, 0.75, 0.75, 0.9], { size: 10, rowH: 0.5, zebra: true, align: ['left', 'right', 'right', 'right', 'right'] });
  txt(s, 'Valores en distancia; óptimo = 425,05.', { x: 8.05, y: 4.8, w: 4.6, h: 0.3, fontSize: 9.5, color: C.SUB });
  card(s, 0.5, 5.45, 12.33, 1.5); etiqueta(s, 'Qué se observa', 0.7, 5.57, 3);
  bullets(s, ['Recocido, GRASP y VNS llegan al óptimo en las 20 semillas: la búsqueda local o el enfriamiento corrigen la semilla.', `El algoritmo genético es el más variable (mejor ${e(rob.ga.mejor)}, peor ${e(rob.ga.peor)}): con población pequeña depende de la semilla; aumentar generaciones o población lo estabiliza.`, 'Colonia de hormigas converge siempre a 429,43: la feromona fija pronto la misma estructura (β alto). Ajustar ρ y β cambia el resultado.'], 0.7, 5.85, 11.95, 1.1, { size: 11.5, gap: 4 });
  nota(s, 'Robustez: 20 semillas. Los métodos con búsqueda local (VNS, GRASP) y el recocido son estables; el genético es el más sensible a la semilla.');
}

function parametros() {
  const s = nuevaSlide(); cabecera(s, 'Cierre · Parámetros', 'Qué hay que ajustar en cada metaheurística');
  const efecto = { tabu: 'Permanencia larga: explora más; corta: repite ciclos.', sa: 'T alta: acepta casi todo; T baja: mejora local pura.', ga: 'Más población y generaciones: más diversidad y tiempo.', aco: 'α pesa la memoria (feromona); β pesa la cercanía 1/c; ρ olvida.', grasp: 'Lista restringida amplia: más aleatoria; estrecha: más voraz.', vns: 'k_max grande: agita más; si no mejora, se escapa del vecindario.' };
  const filas = [['Método', 'Parámetros usados en el archivo GAMS', 'Efecto de moverlos']].concat(['tabu', 'sa', 'ga', 'aco', 'grasp', 'vns'].map((k) => { const a = ALG.find((x) => x.id === k); return [{ text: a.nombre, b: true }, a.espec[3][1], efecto[k]]; }));
  card(s, 0.5, 1.2, 12.33, 4.5); tabla(s, filas, 0.7, 1.35, 11.93, [2.2, 5.9, 3.83], { size: 10.5, rowH: 0.58, zebra: true });
  card(s, 0.5, 5.85, 6.1, 1.1, { fill: C.BLUE_BG, sombra: false }); etiqueta(s, 'Regla práctica', 0.7, 5.95, 3, { color: C.BLUE_T }); txt(s, 'Empezar con valores de la literatura y ajustar con pruebas sobre instancias parecidas a las reales; fijar la semilla para comparar de forma justa.', { x: 0.7, y: 6.2, w: 5.7, h: 0.72, fontSize: 11 });
  card(s, 6.73, 5.85, 6.1, 1.1); etiqueta(s, 'En clase', 6.93, 5.95, 3); txt(s, 'En cada archivo los parámetros están en la sección de declaraciones: cambiar un valor y volver a ejecutar muestra su efecto en el costo y en las evaluaciones.', { x: 6.93, y: 6.2, w: 5.7, h: 0.72, fontSize: 11 });
  nota(s, 'Parámetros de cada metaheurística, con los valores que usan los programas GAMS y su efecto.');
}

function decision() {
  const s = nuevaSlide(); cabecera(s, 'Cierre · Decisión', '¿Qué método elijo? Guía de decisión');
  const caja = (x, y, w, h, t, o) => { o = o || {}; card(s, x, y, w, h, { fill: o.fill || C.CARD, line: o.line }); txt(s, t, { x: x + 0.1, y, w: w - 0.2, h, fontSize: o.size || 11, bold: o.b, align: 'center', valign: 'middle', color: o.color || C.INK }); };
  card(s, 0.5, 1.2, 12.33, 3.25); caja(0.8, 1.4, 3.0, 0.95, '¿Pocos clientes (≲ 30–50) y hace falta probar el óptimo?', { fill: C.BLUE_BG, b: true, size: 12 });
  s.addShape(pres.shapes.LINE, { x: 3.8, y: 1.87, w: 0.9, h: 0, line: { color: C.SUB, width: 1.25, endArrowType: 'triangle' } }); txt(s, 'Sí', { x: 3.95, y: 1.57, w: 0.6, h: 0.25, fontSize: 10, bold: true, color: C.GREEN });
  caja(4.7, 1.4, 3.2, 0.95, 'Modelo exacto (MILP, MTZ o DFJ): archivo 12', { fill: C.GREEN_BG, b: true, color: C.GREEN, size: 12 });
  s.addShape(pres.shapes.LINE, { x: 2.3, y: 2.35, w: 0, h: 0.6, line: { color: C.SUB, width: 1.25, endArrowType: 'triangle' } }); txt(s, 'No', { x: 2.4, y: 2.5, w: 0.6, h: 0.25, fontSize: 10, bold: true, color: C.ORANGE });
  caja(0.8, 2.95, 3.0, 0.95, 'Heurística constructiva + mejora local: archivos 01–05', { b: true, size: 12 }); caja(4.05, 2.95, 3.6, 0.95, 'Metaheurística (tabú, recocido, genético, hormigas, GRASP, VNS): archivos 06–11', { b: true, size: 11.5 }); caja(7.9, 2.95, 3.9, 0.95, 'Matheurística (LNS con MILP): rigor del modelo y escala de la heurística', { b: true, size: 11.5 });
  s.addShape(pres.shapes.LINE, { x: 3.8, y: 3.42, w: 0.25, h: 0, line: { color: C.SUB, width: 1, endArrowType: 'triangle' } }); s.addShape(pres.shapes.LINE, { x: 7.65, y: 3.42, w: 0.25, h: 0, line: { color: C.SUB, width: 1, endArrowType: 'triangle' } });
  txt(s, 'Rápida; sirve de solución inicial.', { x: 0.8, y: 4.0, w: 3.0, h: 0.4, fontSize: 11, color: C.SUB, align: 'center' }); txt(s, 'Calidad alta en miles de clientes.', { x: 4.05, y: 4.0, w: 3.6, h: 0.4, fontSize: 11, color: C.SUB, align: 'center' }); txt(s, 'Usa el solver dentro de la búsqueda.', { x: 7.9, y: 4.0, w: 3.9, h: 0.4, fontSize: 11, color: C.SUB, align: 'center' });
  const filas = [['', 'Exacto (MILP)', 'Heurística', 'Metaheurística'], [{ text: 'Calidad', b: true }, 'Óptima probada', 'Aceptable', 'Muy buena'], [{ text: 'Tiempo', b: true }, 'Crece rápido', 'Segundos', 'Segundos a minutos'], [{ text: 'Tamaño', b: true }, 'Decenas a pocos cientos', 'Miles', 'Miles'], [{ text: 'Cambiar restricciones', b: true }, 'Agregar ecuaciones', 'Reprogramar', 'Reprogramar operadores'], [{ text: 'Mejor para', b: true }, 'Decisiones estratégicas y validar', 'Solución inicial rápida', 'Operación diaria a gran escala']];
  card(s, 0.5, 4.6, 8.1, 2.35); tabla(s, filas, 0.65, 4.7, 7.8, [1.9, 2.1, 1.7, 2.1], { size: 10, rowH: 0.37, zebra: true });
  card(s, 8.75, 4.6, 4.08, 2.35, { fill: C.BLUE_BG, sombra: false }); etiqueta(s, 'Aplicación real', 8.95, 4.72, 3, { color: C.BLUE_T }); txt(s, 'Una tienda con 25 puntos usa el modelo exacto; una distribuidora con 2.000 pedidos diarios combina heurística y metaheurística. En la práctica: heurística para empezar, metaheurística para mejorar y modelo exacto para validar.', { x: 8.95, y: 5.0, w: 3.7, h: 1.9, fontSize: 11 });
  nota(s, 'Guía de decisión por tamaño y garantías. Se resume en: heurística para empezar, metaheurística para mejorar, modelo exacto para validar.');
}

function verificacion() {
  const s = nuevaSlide(); cabecera(s, 'Cierre · Validación', 'Cómo se validaron los programas y los resultados');
  const t = [['Lógica de los programas 01 a 11', 'Cada .gms se ejecutó con un intérprete del subconjunto de GAMS usado (bucles, condiciones, sum, smin, ord, mod) y se comparó con una implementación equivalente en Python: coinciden el tour, el costo y el número de evaluaciones.', C.GREEN], ['Óptimo exacto', `El modelo del archivo 12 se resolvió con HiGHS (scipy.milp): óptimo ${e(OPT, 4)}, ${fmt(R.optimo.nodos_highs, 0)} nodos en ${e(R.optimo.tiempo_highs, 1)} s; la relajación lineal da ${e(R.optimo.relajacion)} (brecha de la raíz 27,4 %).`, C.BLUE], ['Ejecución en GAMS', 'Los valores de las diapositivas son de referencia: al correr los .gms con GAMS deben coincidir porque el generador es determinista. Conviene compilar una vez antes de la clase y, si algo difiere, revisar primero la sintaxis.', C.ORANGE]];
  t.forEach(([h, d, c], i) => { const x = 0.5 + i * 4.15; card(s, x, 1.2, 4.0, 3.25); s.addShape(pres.shapes.RECTANGLE, { x: x + 0.2, y: 1.38, w: 0.5, h: 0.06, fill: { color: c }, line: { color: c, width: 0 } }); txt(s, h, { x: x + 0.2, y: 1.55, w: 3.6, h: 0.55, fontSize: 14, bold: true }); txt(s, d, { x: x + 0.2, y: 2.15, w: 3.6, h: 2.5, fontSize: 13 }); });
  card(s, 0.5, 4.6, 12.33, 2.35); etiqueta(s, 'Qué verificar en clase al ejecutar', 0.7, 4.73, 5);
  bullets(s, ['Algoritmos deterministas (01–06 y 12): el costo debe ser idéntico al de la tabla, por ejemplo 481,16 para vecino más cercano y 425,05 para VND, tabú y exacto.', 'Algoritmos con semilla (07–11): con la semilla indicada reproducen el mismo valor; cambiar la semilla modifica la trayectoria pero casi siempre el recocido, GRASP y VNS terminan en 425,05.', 'Archivo 12: debe informar modelStat = 1 (óptimo) y solveStat = 1, con z = 425,05 y cota de la raíz 308,47.'], 0.7, 5.05, 11.95, 1.85, { size: 13, gap: 7 });
  nota(s, 'Honestidad sobre la validación: la lógica se verificó con un intérprete y Python; el óptimo con HiGHS. La compilación en GAMS es el paso final que se hace al abrir los archivos.');
}

function conclusiones() {
  const s = nuevaSlide(); cabecera(s, 'Cierre', 'Conclusiones');
  const c = [['1', 'Un mismo núcleo', 'Todos los algoritmos usan la misma instancia, la misma representación (tour gigante) y la misma función EVALUAR: la comparación es justa.'], ['2', 'Constructivas rápidas, sin garantía', 'Vecino más cercano e inserción dan 481,16 (13,2 %) sin parámetros; el barrido llega a 426,35 con solo 10 evaluaciones.'], ['3', 'La búsqueda local cierra la brecha', '2-opt baja a 426,35 y VND con relocate, swap y 2-opt alcanza el óptimo 425,05 en 451 evaluaciones.'], ['4', 'Las metaheurísticas añaden exploración', 'Tabú, recocido, GRASP, VNS y genético llegan al óptimo; hormigas se estanca en 429,43; el genético es el más sensible a la semilla.'], ['5', 'El exacto valida', 'Branch and bound prueba el óptimo 425,05 con 1.369 nodos; sirve de referencia para medir la brecha de los demás.'], ['6', 'Se pueden ejecutar y modificar', 'Los 12 programas GAMS son autocontenidos y reproducibles: en clase se cambian semillas y parámetros para ver el efecto.']];
  c.forEach(([n, t, d], i) => { const col = i % 3, fila = Math.floor(i / 3); const x = 0.5 + col * 4.15, y = 1.2 + fila * 2.9; card(s, x, y, 4.0, 2.75); txt(s, n, { x: x + 0.22, y: y + 0.15, w: 0.6, h: 0.5, fontSize: 26, bold: true, color: C.BLUE }); txt(s, t, { x: x + 0.22, y: y + 0.75, w: 3.6, h: 0.6, fontSize: 14, bold: true }); txt(s, d, { x: x + 0.22, y: y + 1.4, w: 3.6, h: 1.3, fontSize: 13 }); });
  nota(s, 'Conclusiones. Se resumen los resultados con cifras de la instancia común.');
}

function referencias() {
  const s = nuevaSlide(); cabecera(s, 'APA 7', 'Referencias');
  const refs = ['Acevedo-Chedid, J. (2025). Capítulo 4: Ruteo de vehículos [Diapositivas]. Universidad Tecnológica de Bolívar.', 'Croes, G. A. (1958). A method for solving traveling-salesman problems. Operations Research, 6(6), 791–812.', 'Dantzig, G. B., & Ramser, J. H. (1959). The truck dispatching problem. Management Science, 6(1), 80–91.', 'Dorigo, M., Maniezzo, V., & Colorni, A. (1996). Ant system: Optimization by a colony of cooperating agents. IEEE Transactions on Systems, Man, and Cybernetics, Part B, 26(1), 29–41.', 'Feo, T. A., & Resende, M. G. C. (1995). Greedy randomized adaptive search procedures. Journal of Global Optimization, 6(2), 109–133.', 'Gillett, B. E., & Miller, L. R. (1974). A heuristic algorithm for the vehicle-dispatch problem. Operations Research, 22(2), 340–349.', 'Glover, F. (1986). Future paths for integer programming and links to artificial intelligence. Computers & Operations Research, 13(5), 533–549.', 'Holland, J. H. (1975). Adaptation in natural and artificial systems. University of Michigan Press.', 'Huangfu, Q., & Hall, J. A. J. (2018). Parallelizing the dual revised simplex method. Mathematical Programming Computation, 10(1), 119–142.', 'Kirkpatrick, S., Gelatt, C. D., & Vecchi, M. P. (1983). Optimization by simulated annealing. Science, 220(4598), 671–680.'];
  const refs2 = ['Land, A. H., & Doig, A. G. (1960). An automatic method of solving discrete programming problems. Econometrica, 28(3), 497–520.', 'Laporte, G. (1992). The vehicle routing problem: An overview of exact and approximate algorithms. European Journal of Operational Research, 59(3), 345–358.', 'Miller, C. E., Tucker, A. W., & Zemlin, R. A. (1960). Integer programming formulation of traveling salesman problems. Journal of the ACM, 7(4), 326–329.', 'Mladenović, N., & Hansen, P. (1997). Variable neighborhood search. Computers & Operations Research, 24(11), 1097–1100.', 'Mole, R. H., & Jameson, S. R. (1976). A sequential route-building algorithm employing a generalised savings criterion. Operational Research Quarterly, 27(2), 503–511.', 'Park, S. K., & Miller, K. W. (1988). Random number generators: Good ones are hard to find. Communications of the ACM, 31(10), 1192–1201.', 'Prins, C. (2004). A simple and effective evolutionary algorithm for the vehicle routing problem. Computers & Operations Research, 31(12), 1985–2002.', 'Ropke, S., & Pisinger, D. (2006). An adaptive large neighborhood search heuristic for the pickup and delivery problem with time windows. Transportation Science, 40(4), 455–472.', 'Rosenkrantz, D. J., Stearns, R. E., & Lewis, P. M. (1977). An analysis of several heuristics for the traveling salesman problem. SIAM Journal on Computing, 6(3), 563–581.', 'Toth, P., & Vigo, D. (Eds.). (2014). Vehicle routing: Problems, methods, and applications (2.ª ed.). SIAM.'];
  [[refs, 0.5], [refs2, 6.75]].forEach(([r, x]) => { card(s, x, 1.2, 6.08, 5.75); const runs = []; r.forEach((t, i) => { runs.push({ text: t, options: { breakLine: i < r.length - 1 } }); }); txt(s, runs, { x: x + 0.2, y: 1.35, w: 5.7, h: 5.5, fontSize: 11.5, paraSpaceAfter: 9, indent: 14 }); });
  nota(s, 'Referencias en formato APA 7.');
}

module.exports = { portada, agenda, porque, mapa, instancia, evaluacion, vecindarios, ejecutar, comparacionGrafica, comparacion, robustez, parametros, decision, verificacion, conclusiones, referencias };
