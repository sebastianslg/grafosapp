/* Deck B: los 27 modelos VRP en GAMS */
const fs = require('fs');
const L = require('./lib.js'); const { C, F, pres, nuevaSlide, txt, card, cabecera, etiqueta, chip, bullets, tabla, img, nota } = L;
const G = require('./general_slides.js'); const M = require('./modelos_slides.js'); const { MD, fmt } = M;
const IMG = '../img/';
const CV = MD.find((m) => m.id === 'cvrp').z;
const AGREGA = { tsp: 'Caso base: 1 vehículo, MTZ', otsp: 'Sin regreso al depósito', mtsp: 'm viajantes', mtspb: 'Contador exacto 3–4 clientes', omtsp: 'm viajantes sin regreso', omtspb: 'Abierto + balanceado', mtspmm: 'Min-max: ruta más larga', cvrp: 'Capacidad Q (carga MTZ)', ovrp: 'CVRP sin regreso', dcvrp: 'Distancia máxima L', vrpl: 'Máximo de paradas P', minveh: 'Primero mínima flota', cvrpb: 'Rutas de 2–3 clientes', vrptw: 'Ventanas de tiempo', ovrptw: 'Ventanas + sin regreso', hfvrp: 'Tipos de vehículo', fsmvrp: 'Costo fijo: mezcla de flota', hfvrptw: 'Flota mixta + ventanas', mdvrp: 'Varios depósitos', mdvrptw: 'Depósitos + ventanas', lrp: 'Abrir depósitos', vrpb: 'Entregas antes que recogidas', vrpspd: 'Entrega y recogida a la vez', vrppd: 'Pares recogida → entrega', sdvrp: 'Entrega dividida', pcvrp: 'Visitas opcionales: beneficio', top: 'Máximo premio con L' };

function agenda() {
  const s = nuevaSlide(); cabecera(s, 'Contenido', 'Ruta de la exposición: 27 modelos del VRP');
  const fams = [['Un vehículo y varios viajantes', 'TSP, TSP abierto, mTSP, balanceados, abiertos y min-max.', '01–07'], ['Capacidad', 'CVRP, abierto, distancia máxima, máximo de paradas, mínima flota y balanceado.', '08–13'], ['Tiempo y flota', 'Ventanas de tiempo (cerrado y abierto), flota heterogénea, mezcla de flota y su versión con ventanas.', '14–18'], ['Depósitos', 'Múltiples depósitos, con ventanas y localización-ruteo (LRP).', '19–21'], ['Cargas', 'Backhauls, entrega y recogida simultáneas, pares recogida-entrega y entrega dividida.', '22–25'], ['Selectivos', 'VRP con beneficios y orienteering por equipos.', '26–27']];
  fams.forEach(([t, d, r], i) => { const col = i % 3, fila = Math.floor(i / 3); const x = 0.5 + col * 4.15, y = 1.2 + fila * 1.62; card(s, x, y, 4.0, 1.5); chip(s, 'Modelos ' + r, x + 0.18, y + 0.14, 1.45, { size: 9 }); txt(s, t, { x: x + 0.18, y: y + 0.48, w: 3.65, h: 0.3, fontSize: 13.5, bold: true }); txt(s, d, { x: x + 0.18, y: y + 0.8, w: 3.65, h: 0.65, fontSize: 10.5, color: C.SUB }); });
  card(s, 0.5, 4.5, 12.33, 2.45); etiqueta(s, 'Cada modelo ocupa cuatro diapositivas con el mismo control segmentado', 0.7, 4.62, 9);
  [['Problema', 'Qué es, qué cambia frente al modelo base, dónde se aplica y qué datos necesita.'], ['Modelo', 'Conjuntos, parámetros, variables, función objetivo y cada restricción con su significado.'], ['Ejemplo', 'Instancia resuelta: figura de las rutas, valor óptimo, tamaño del modelo y lectura del resultado.'], ['Código GAMS', 'El modelo y el solve tal como están en el archivo .gms, con las restricciones señaladas.']].forEach(([t, d], i) => { const x = 0.7 + i * 3.02, w = 2.85; card(s, x, 4.95, w, 1.8, { fill: i === 0 ? C.BLUE_BG : 'F5F5F7' }); chip(s, `${i + 1} · ${t}`, x + 0.15, 5.08, 1.6, { fill: C.BLUE, color: 'FFFFFF', size: 9 }); txt(s, d, { x: x + 0.15, y: 5.45, w: w - 0.3, h: 1.25, fontSize: 12 }); });
  nota(s, 'Seis familias de variantes. Cada modelo tiene cuatro diapositivas: problema, modelo, ejemplo y código.');
}

function bloques() {
  const s = nuevaSlide(); cabecera(s, 'B · Marco común', 'Bloques comunes: así se construyen las 27 formulaciones');
  card(s, 0.5, 1.2, 6.1, 5.75); etiqueta(s, 'Notación (igual a la del código GAMS)', 0.7, 1.33, 5);
  const filas = [['i, j, h', 'nodos: depósito d y clientes c1…c10'], ['c(i)', 'clientes'], ['dist(i,j)', 'distancia euclidiana = tiempo de viaje'], ['dem(i), Q, K', 'demanda, capacidad y vehículos'], ['x(i,j)', 'binaria: 1 si se recorre el arco i → j'], ['x(i,j,t) / x(i,j,k)', 'arco por tipo de vehículo o por vehículo'], ['ql(i), u(i), f(i)', 'carga acumulada, posición y contador'], ['a(i), tL(i)', 'distancia acumulada y hora de llegada'], ['z', 'función objetivo']];
  filas.forEach(([k, v], i) => { const y = 1.65 + i * 0.5; txt(s, k, { x: 0.7, y, w: 2.2, h: 0.45, fontSize: 11, fontFace: F.M, bold: true, color: C.BLUE_T, valign: 'middle' }); txt(s, v, { x: 2.95, y, w: 3.5, h: 0.45, fontSize: 11.5, valign: 'middle' }); });
  card(s, 6.75, 1.2, 6.08, 5.75); etiqueta(s, 'Piezas que se combinan', 6.95, 1.33, 4);
  const piezas = [['Grado', 'Σ j x(i,j) = 1 y Σ i x(i,j) = 1: cada cliente entra y sale una vez (≤ 1 si la ruta es abierta).'], ['Subtours (MTZ)', 'u(j) ≥ u(i) + 1 o ql(j) ≥ ql(i) + dem(j) cuando se usa i → j: sin ciclos que no pasen por el depósito.'], ['Big-M', 'Activa una desigualdad solo si x(i,j) = 1: ... − M·(1 − x(i,j)). Sirve para carga, distancia y tiempo.'], ['Índice extra', 't (tipo) o k (vehículo) cuando la ruta debe recordar algo: capacidad, costo, depósito o pareja.'], ['Objetivo', 'Distancia, costo fijo + variable, ruta más larga o beneficio, según la variante.']];
  piezas.forEach(([t, d], i) => { const y = 1.65 + i * 1.04; txt(s, t, { x: 6.95, y, w: 5.7, h: 0.3, fontSize: 13, bold: true }); txt(s, d, { x: 6.95, y: y + 0.32, w: 5.7, h: 0.66, fontSize: 11 }); });
  nota(s, 'Todas las formulaciones combinan las mismas piezas: grado, eliminación de subtours, restricciones big-M e índices adicionales.');
}

function mapa(parte) {
  const s = nuevaSlide(); cabecera(s, 'B · Marco común', `Las 27 variantes y su óptimo en el ejemplo (${parte + 1}/2)`);
  const grupo = parte === 0 ? MD.slice(0, 14) : MD.slice(14);
  const filas = [['N.º', 'Sigla', 'Nombre', 'Qué agrega', 'Objetivo', 'Rutas', 'Archivo']].concat(grupo.map((m) => [m.num, { text: m.sigla, b: true }, m.nombre, AGREGA[m.id], fmt(m.z), m.rutas.length, m.arch]));
  card(s, 0.5, 1.2, 12.33, 5.75); tabla(s, filas, 0.65, 1.3, 12.03, [0.45, 1.05, 3.6, 2.75, 1.0, 0.6, 2.58], { size: 10, rowH: 0.36, zebra: true, align: ['left', 'left', 'left', 'left', 'right', 'right', 'left'], maxY: 6.9 });
  nota(s, 'Tabla de las variantes con su valor objetivo en el problema de ejemplo.');
}

function ejecutar() {
  const s = nuevaSlide(); cabecera(s, 'B · Marco común', 'Cómo ejecutar los 27 modelos en GAMS');
  card(s, 0.5, 1.2, 6.1, 5.75); etiqueta(s, 'Pasos', 0.7, 1.33, 3);
  [['Abrir', 'El archivo de la carpeta GAMS_modelos en GAMS Studio.'], ['Elegir solver', 'Cualquier solver MIP. HiGHS es gratuito y viene con GAMS: descomentar «option mip = highs;».'], ['Ejecutar', 'Run (F9). Cada archivo trae datos, modelo, solve y reporte.'], ['Leer la salida', 'En el .lst: z.l, modelStat (1 = óptimo) y las tablas ruta, largo y cargaR.'], ['Modificar', 'Cambiar Q, K, L, ventanas o premios y volver a resolver.']].forEach(([t, d], i) => { const y = 1.65 + i * 1.04; card(s, 0.7, y + 0.03, 0.4, 0.4, { fill: C.BLUE, r: 0.2 }); txt(s, String(i + 1), { x: 0.7, y: y + 0.03, w: 0.4, h: 0.4, fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }); txt(s, t, { x: 1.25, y, w: 5.2, h: 0.3, fontSize: 13, bold: true }); txt(s, d, { x: 1.25, y: y + 0.32, w: 5.2, h: 0.66, fontSize: 11, color: C.SUB }); });
  card(s, 6.75, 1.2, 6.08, 2.9); etiqueta(s, 'Tamaño de los modelos', 6.95, 1.33, 4);
  const v = MD.map((m) => m.stats.vars), b = MD.map((m) => m.stats.bin), t = MD.map((m) => m.stats.tiempo);
  bullets(s, [`Entre ${Math.min(...v)} y ${Math.max(...v)} variables (${Math.min(...b)} a ${Math.max(...b)} binarias).`, 'Son modelos pequeños. Si la licencia de demostración de GAMS los limita, la licencia académica de la universidad o GAMSPy los resuelven sin problema.', `Tiempo de solución con HiGHS: de ${fmt(Math.min(...t), 1)} s a ${fmt(Math.max(...t), 0)} s (SDVRP, dos solves).`], 6.95, 1.62, 5.7, 2.4, { size: 11.5, gap: 6 });
  card(s, 6.75, 4.25, 6.08, 2.7, { fill: C.ORANGE_BG }); etiqueta(s, 'Sobre los resultados', 6.95, 4.38, 4, { color: '8A4500' });
  txt(s, 'Cada archivo se ejecutó completo con gamsx, un intérprete del subconjunto de GAMS usado que construye el modelo y lo resuelve con HiGHS. Los valores objetivo son óptimos (brecha 0 %) y deben coincidir en GAMS; el número de nodos cambia con el solver. Conviene correr cada archivo una vez antes de la clase.', { x: 6.95, y: 4.65, w: 5.7, h: 2.2, fontSize: 11.5, color: '5C3300' });
  nota(s, 'Cómo ejecutar los modelos y qué esperar.');
}

function resumen(parte) {
  const s = nuevaSlide(); cabecera(s, 'Cierre', `Resumen comparativo de los 27 modelos (${parte + 1}/2)`);
  const grupo = parte === 0 ? MD.slice(0, 14) : MD.slice(14);
  const filas = [['Modelo', 'Objetivo', 'vs. CVRP', 'Rutas', 'Variables', 'Binarias', 'Ecuaciones', 'Nodos', 'Tiempo (s)']].concat(grupo.map((m) => [{ text: m.sigla, b: true }, fmt(m.z), (['pcvrp', 'top', 'mtspmm'].includes(m.id) ? '—' : (m.z >= CV ? '+' : '') + fmt(100 * (m.z / CV - 1), 1) + ' %'), m.rutas.length, m.stats.vars, m.stats.bin, m.stats.ecs, fmt(m.stats.nodos, 0), fmt(m.stats.tiempo, 1)]));
  card(s, 0.5, 1.2, 12.33, 5.75); tabla(s, filas, 0.65, 1.3, 12.03, [1.55, 1.35, 1.25, 0.9, 1.3, 1.3, 1.4, 1.4, 1.58], { size: 10.5, rowH: 0.34, zebra: true, align: ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'], maxY: 6.6 });
  txt(s, '«vs. CVRP»: diferencia del objetivo frente al CVRP (425,05). Para PCVRP y TOP (maximización) y el min-max no aplica.', { x: 0.7, y: 6.62, w: 11.9, h: 0.25, fontSize: 9.5, color: C.SUB });
  nota(s, 'Resumen de tamaño y resultado de cada modelo.');
}

function conclusiones() {
  const s = nuevaSlide(); cabecera(s, 'Cierre', 'Conclusiones');
  const c = [['1', 'Un mismo núcleo', 'Las 27 variantes combinan grado, eliminación de subtours y restricciones big-M sobre x(i,j).'], ['2', 'Pocas ecuaciones nuevas', 'Abrir rutas, limitar distancia o paradas, o agregar ventanas cambia 1 a 4 restricciones.'], ['3', 'Índices cuando hace falta memoria', 'Tipo de vehículo, vehículo o depósito: se agregan solo si la ruta debe recordarlo.'], ['4', 'El modelo cambia la solución', 'Con los mismos clientes el óptimo va de 268 (TSP abierto) a 578 (LRP con apertura).'], ['5', 'Resolubles con software libre', 'Todos se resuelven con HiGHS en segundos para 10 clientes.'], ['6', 'Para instancias grandes', 'Los mismos modelos validan heurísticas y metaheurísticas (sección C).']];
  c.forEach(([n, t, d], i) => { const col = i % 3, fila = Math.floor(i / 3); const x = 0.5 + col * 4.15, y = 1.2 + fila * 2.9; card(s, x, y, 4.0, 2.75); txt(s, n, { x: x + 0.22, y: y + 0.15, w: 0.6, h: 0.5, fontSize: 26, bold: true, color: C.BLUE }); txt(s, t, { x: x + 0.22, y: y + 0.75, w: 3.6, h: 0.6, fontSize: 14, bold: true }); txt(s, d, { x: x + 0.22, y: y + 1.4, w: 3.6, h: 1.3, fontSize: 12.5 }); });
  nota(s, 'Conclusiones de la sección de modelos.');
}

const REFS = ['Acevedo-Chedid, J. (2025). Capítulo 4: Ruteo de vehículos [Diapositivas]. Universidad Tecnológica de Bolívar.', 'Bektas, T. (2006). The multiple traveling salesman problem: An overview of formulations and solution procedures. Omega, 34(3), 209–219.', 'Chao, I.-M., Golden, B. L., & Wasil, E. A. (1996). The team orienteering problem. European Journal of Operational Research, 88(3), 464–474.', 'Cordeau, J.-F., Gendreau, M., & Laporte, G. (1997). A tabu search heuristic for periodic and multi-depot vehicle routing problems. Networks, 30(2), 105–119.', 'Dantzig, G. B., & Ramser, J. H. (1959). The truck dispatching problem. Management Science, 6(1), 80–91.', 'Dror, M., & Trudeau, P. (1989). Savings by split delivery routing. Transportation Science, 23(2), 141–145.', 'Feillet, D., Dejax, P., & Gendreau, M. (2005). Traveling salesman problems with profits. Transportation Science, 39(2), 188–205.', 'Golden, B., Assad, A., Levy, L., & Gheysens, F. (1984). The fleet size and mix vehicle routing problem. Computers & Operations Research, 11(1), 49–66.', 'Huangfu, Q., & Hall, J. A. J. (2018). Parallelizing the dual revised simplex method. Mathematical Programming Computation, 10(1), 119–142.', 'Kara, I., & Bektas, T. (2006). Integer linear programming formulations of multiple salesman problems and its variations. European Journal of Operational Research, 174(3), 1449–1458.', 'Li, F., Golden, B., & Wasil, E. (2007). The open vehicle routing problem: Algorithms, large-scale test problems, and computational results. Computers & Operations Research, 34(10), 2918–2930.', 'Miller, C. E., Tucker, A. W., & Zemlin, R. A. (1960). Integer programming formulation of traveling salesman problems. Journal of the ACM, 7(4), 326–329.', 'Min, H. (1989). The multiple vehicle routing problem with simultaneous delivery and pick-up points. Transportation Research Part A, 23(5), 377–386.', 'Prodhon, C., & Prins, C. (2014). A survey of recent research on location-routing problems. European Journal of Operational Research, 238(1), 1–17.', 'Savelsbergh, M. W. P., & Sol, M. (1995). The general pickup and delivery problem. Transportation Science, 29(1), 17–29.', 'Solomon, M. M. (1987). Algorithms for the vehicle routing and scheduling problems with time window constraints. Operations Research, 35(2), 254–265.', 'Toth, P., & Vigo, D. (1997). An exact algorithm for the vehicle routing problem with backhauls. Transportation Science, 31(4), 372–385.', 'Toth, P., & Vigo, D. (Eds.). (2014). Vehicle routing: Problems, methods, and applications (2.ª ed.). SIAM.'];

G.portadaGen({ eyebrow: 'DISTRIBUCIÓN Y TRANSPORTE · SECCIÓN B', titulo: 'Modelos matemáticos del VRP en GAMS', sub: 'Veintisiete variantes formuladas como MILP, cada una con un problema de ejemplo resuelto y su código GAMS ejecutable', chips: ['27 modelos', '27 archivos .gms', 'solver gratuito: HiGHS'], fig: IMG + 'mod_cvrp_portada.png', pieFig: 'CVRP óptimo del ejemplo común (425,05)', nota: 'Presentación de los 27 modelos del VRP. Cada uno tiene problema, modelo, ejemplo y código GAMS.' });
agenda(); bloques(); mapa(0); mapa(1); ejecutar();
MD.forEach((m) => M.modeloCompleto(m));
resumen(0); resumen(1); conclusiones(); G.refsSlide('Referencias', REFS);
const out = process.argv[2] || 'deck_modelos.pptx';
fs.writeFileSync(out.replace(/\.pptx$/, '') + '_log.json', JSON.stringify(L.LOG));
L.pres.writeFile({ fileName: out }).then(() => { require('child_process').execSync(`python3 ${__dirname}/../ref/comprimir_pptx.py ${out}`); console.log('ok', L.getN(), out); });
