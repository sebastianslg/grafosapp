/* Genera web/datos/ejemplos.json: un ejemplo por modelo (34, los mismos datos de GAMS_modelos/) y uno por algoritmo
   (18, la instancia CVRP-10 de GAMS_algoritmos/), cada uno ubicado en una ciudad distinta del mapa.
   Las distancias son EXACTAMENTE las de los archivos GAMS (euclidianas en sus unidades); las coordenadas de la ciudad solo
   sirven para dibujar (se conserva la forma: escala proporcional). Además resuelve cada modelo con el solver para guardar
   el valor que debe mostrar la app (lo comprueba pruebas/e2e_ejemplos.js).
   Uso: node pruebas/generar_ejemplos.js */
const fs = require('fs'); const path = require('path');
require('../web/js/solver.js'); const Vrp = require('../web/js/vrp.js'); const Va = require('../web/js/variantes.js');
const { instancia, ctx } = require('./validar_gams.js');
const G = JSON.parse(fs.readFileSync(path.join(__dirname, 'cvrp10_gams.json'), 'utf8'));
const DEP3 = { d1: [30, 70], d2: [72, 30], d3: [50, 50] };

const ARCHIVO = { tsp: '01_tsp', otsp: '02_otsp', mtsp: '03_mtsp', mtspb: '04_bmtsp', omtsp: '05_omtsp', omtspb: '06_obmtsp', mtspmm: '07_mm_mtsp', cvrp: '08_cvrp', ovrp: '09_ovrp', dcvrp: '10_dcvrp', vrpl: '11_cvrp_l', minveh: '12_minveh', cvrpb: '13_bcvrp', vrptw: '14_vrptw', ovrptw: '15_ovrptw', hfvrp: '16_hfvrp', fsmvrp: '17_fsmvrp', hfvrptw: '18_hfvrptw', mdvrp: '19_mdvrp', mdvrptw: '20_mdvrptw', lrp: '21_lrp', vrpb: '22_vrpb', vrpspd: '23_vrpspd', vrppd: '24_vrppd', sdvrp: '25_sdvrp', pcvrp: '26_pcvrp', top: '27_top', cvrpmm: '28_cvrp_mm', vrpstw: '29_vrpstw', dvrpt: '30_dvrpt', ccvrp: '31_ccvrp', omdvrp: '32_omdvrp', op: '33_op', ptp: '34_ptp' };
// valor que reporta GAMS (README de GAMS_modelos) y cómo se lee en la app
const GAMS = { tsp: 312.78, otsp: 268.21, mtsp: 415.54, mtspb: 422.97, omtsp: 291.99, omtspb: 309.68, mtspmm: 148.10, cvrp: 425.05, ovrp: 292.92, dcvrp: 426.35, vrpl: 476.80, minveh: 477.01, cvrpb: 483.04, vrptw: 468.72, ovrptw: 325.20, hfvrp: 442.37, fsmvrp: 526.76, hfvrptw: 522.57, mdvrp: 377.94, mdvrptw: 405.37, lrp: 577.94, vrpb: 364.68, vrpspd: 534.37, vrppd: 315.74, sdvrp: 472.01, pcvrp: 635.66, top: 885.00, cvrpmm: 117.93, vrpstw: 468.72, dvrpt: 534.05, ccvrp: 565.24, omdvrp: 226.89, op: 464.99, ptp: 812.22 };
const LECTURA = { pcvrp: 'GAMS maximiza el beneficio neto (premio − costo); la app minimiza −beneficio, por eso muestra el mismo valor con signo negativo.', top: 'GAMS maximiza el premio recogido; la app minimiza −premio (+ un costo de desempate mínimo).', op: 'GAMS maximiza el premio; la app minimiza −premio.', ptp: 'GAMS maximiza premio − costo; la app minimiza −(premio − costo).', minveh: 'Primero la flota mínima y luego la distancia con esa flota: se compara la distancia.' };
const CIUDADES = [['Cali', 3.4516, -76.532], ['Bogotá', 4.711, -74.0721], ['Medellín', 6.2442, -75.5812], ['Barranquilla', 10.9685, -74.7813], ['Cartagena', 10.391, -75.4794], ['Bucaramanga', 7.1193, -73.1227], ['Pereira', 4.8133, -75.6961], ['Santa Marta', 11.2408, -74.199], ['Manizales', 5.0703, -75.5138], ['Cúcuta', 7.8939, -72.5078], ['Ibagué', 4.4389, -75.2322], ['Pasto', 1.2136, -77.2811], ['Villavicencio', 4.142, -73.6266], ['Montería', 8.7479, -75.8814], ['Neiva', 2.9273, -75.2819], ['Armenia', 4.5339, -75.6811], ['Popayán', 2.4448, -76.6147], ['Tunja', 5.5353, -73.3678], ['Valledupar', 10.4631, -73.2532], ['Quito', -0.1807, -78.4678], ['Lima', -12.0464, -77.0428], ['Ciudad de México', 19.4326, -99.1332], ['Madrid', 40.4168, -3.7038], ['Buenos Aires', -34.6037, -58.3816], ['Santiago de Chile', -33.4489, -70.6693], ['Ciudad de Panamá', 8.9824, -79.5199], ['San José', 9.9281, -84.0907], ['Guayaquil', -2.1709, -79.9224], ['Monterrey', 25.6866, -100.3161], ['Barcelona', 41.3874, 2.1686], ['Lisboa', 38.7223, -9.1393], ['París', 48.8566, 2.3522], ['Montevideo', -34.9011, -56.1645], ['São Paulo', -23.5558, -46.6396], ['Roma', 41.9028, 12.4964], ['Berlín', 52.52, 13.405], ['Londres', 51.5072, -0.1276], ['Nueva York', 40.7128, -74.006], ['Toronto', 43.6532, -79.3832], ['Miami', 25.7617, -80.1918], ['Guadalajara', 20.6597, -103.3496], ['La Paz', -16.4897, -68.1193], ['Asunción', -25.2637, -57.5759], ['Río de Janeiro', -22.9068, -43.1729], ['Tokio', 35.6762, 139.6503], ['Sídney', -33.8688, 151.2093], ['Ámsterdam', 52.3676, 4.9041], ['Viena', 48.2082, 16.3738], ['Praga', 50.0755, 14.4378], ['Seúl', 37.5665, 126.978], ['Singapur', 1.3521, 103.8198], ['Ciudad del Cabo', -33.9249, 18.4241]];
const ESC = 0.0009;   // grados por unidad de GAMS (100 unidades ≈ 10 km): solo para dibujar
const aLatLon = ([x, y], [, la, lo]) => [+(la + (y - 50) * ESC).toFixed(6), +(lo + (x - 50) * ESC / Math.cos(la * Math.PI / 180)).toFixed(6)];

/* coordenadas GAMS de cada nodo de la instancia de una variante (mismo orden que instancia(id)) */
function coords(id) {
  const multi = ['mdvrp', 'mdvrptw', 'lrp', 'omdvrp'].includes(id), nDep = multi ? (id === 'lrp' ? 3 : 2) : 1;
  const deps = multi ? ['d1', 'd2', 'd3'].slice(0, nDep) : ['d'];
  const cs = id === 'sdvrp' || id === 'ccvrp' ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return { xy: deps.map((d) => (d === 'd' ? G.coord[0] : DEP3[d])).concat(cs.map((k) => G.coord[k])), nombres: deps.map((d) => (d === 'd' ? 'Depósito d' : 'Depósito ' + d)).concat(cs.map((k) => 'c' + k)) };
}
function proyecto(id, ciudad, clave, titulo, subtitulo) {
  const { S, p } = instancia(id), { xy, nombres } = coords(id);
  const nodos = S.nodos.map((n, i) => { const [lat, lon] = aLatLon(xy[i], ciudad); return Object.assign({}, n, { id: i, nombre: nombres[i], lat, lon, extra: 0 }); });
  return { ds: { clave, titulo, subtitulo, unidad: 'u', centro: aLatLon([50, 50], ciudad), zoom: 13, nodos, D: S.D.map((f, i) => f.map((v, j) => (i === j ? null : +v.toFixed(6)))), flota: S.flota, vt: S.vt, modoDist: 'euclidiana', ejemplo: true, base: 'calles' }, p };
}

(async () => {
  const modelos = [], algoritmos = [];
  const ids = Object.keys(ARCHIVO).sort((a, b) => ARCHIVO[a].localeCompare(ARCHIVO[b]));
  for (const [q, id] of ids.entries()) {
    const v = Va.porId[id], ciudad = CIUDADES[q % CIUDADES.length];
    const { ds, p } = proyecto(id, ciudad, 'ejemplo', 'Ejemplo · ' + v.nombre.split(' (')[0], `${ARCHIVO[id]}.gms · ${v.nombre} · ${ciudad[0]} (distancias del archivo GAMS)`);
    const { I } = Va.construir(id, Object.assign({}, ds, { D: ds.D.map((f) => f.map((x) => (x == null ? Infinity : x))) }), Object.assign({ origen: 0 }, p));
    const r = await Vrp.vrp(I, ctx, { tiempo: 120, brecha: 1e-6, metodo: 'arco' });
    const app = String(r.estado).startsWith('óptimo') ? +r.objetivo.toFixed(4) : null;
    console.log(`${ARCHIVO[id].padEnd(12)} ${id.padEnd(8)} ${ciudad[0].padEnd(18)} GAMS ${GAMS[id]}  app ${app}  (${r.estado})`);
    modelos.push({ id, archivo: ARCHIVO[id] + '.gms', nombre: v.nombre, ciudad: ciudad[0], gams: GAMS[id], app, lectura: LECTURA[id] || '', p, ds });
  }
  const ALG = [['01_vecino_mas_cercano', 'vecino'], ['02_barrido', 'barrido'], ['03_insercion_mas_barata', 'insercion'], ['04_dos_opt', 'dosopt'], ['05_vnd_relocate_swap_2opt', 'vnd'], ['06_busqueda_tabu', 'tabu'], ['07_recocido_simulado', 'sa'], ['08_algoritmo_genetico', 'ga'], ['09_colonia_de_hormigas', 'aco'], ['10_grasp', 'grasp'], ['11_vns', 'vns'], ['12_branch_and_bound_exacto', null], ['13_or_opt', 'oropt'], ['14_ils', 'ils'], ['15_lns', 'lns'], ['16_split_ruta_primero', 'split'], ['17_fisher_jaikumar', 'fisher'], ['18_petalos', 'petalos']];
  const REF = { '01': 481.16, '02': 426.35, '03': 481.16, '04': 426.35, '05': 425.05, '06': 425.05, '07': 425.05, '08': 425.05, '09': 429.43, '10': 425.05, '11': 425.05, '12': 425.05, '13': 426.35, '14': 425.05, '15': 425.05, '16': 425.05, '17': 425.05, '18': 425.05 };
  const Heur = require('../web/js/heur.js');
  ALG.forEach(([arch, algo], q) => {
    const ciudad = CIUDADES[(34 + q) % CIUDADES.length], nombre = algo ? Heur.ALGORITMOS[algo].nombre : 'Branch and bound (modelo exacto)';
    const { ds, p } = proyecto('cvrp', ciudad, 'ejemplo', 'Ejemplo · ' + nombre.split(' (')[0], `${arch}.gms · ${nombre} · CVRP-10 en ${ciudad[0]} (distancias del archivo GAMS)`);
    algoritmos.push({ algo, archivo: arch + '.gms', nombre, ciudad: ciudad[0], gams: REF[arch.slice(0, 2)], optimo: 425.0513, p, ds });
  });
  const out = path.join(__dirname, '..', 'web', 'datos', 'ejemplos.json');
  fs.writeFileSync(out, JSON.stringify({ generado: 'pruebas/generar_ejemplos.js', modelos, algoritmos }));
  console.log(`\n${modelos.length} modelos y ${algoritmos.length} algoritmos → ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
})();
