/* Contenido de cada algoritmo: especificación, pseudocódigo, traza, lectura, claves del código y análisis. */
const { R, DEM, Q, OPT, fmt, cargaRuta, dRuta } = require('./datos.js');
const e = (x, d = 2) => fmt(x, d);
const gapTxt = (k) => `${e(R[k].gap, 2)} %`;
const cargas = (k) => R[k].rutas_dec.map(cargaRuta).join(' / ');
const T0 = 20, TF = 0.05, NIT = 4000, Tit = (it) => T0 * Math.pow(TF / T0, it / NIT);
const rob = R.robustez;
const E_ENT = 'Distancias c(i,j), demandas d(i), capacidad Q = 15 (instancia CVRP-10).';
const E_SAL = 'Tour de 10 clientes que se divide por capacidad en rutas; costo total.';

const ALG = [];
/* ---------------------------------------------------------------- 01 vecino más cercano */
ALG.push({
  id: 'nn', num: '01', nombre: 'Vecino más cercano', familia: 'Heurística constructiva', arch: '01_vecino_mas_cercano.gms', fig: 'ruta_nn', conv: null,
  extra: ["Variante: elegir el siguiente por menor incremento de costo (se convierte en inserción) o por ventana de tiempo.", "Se usa como solución inicial de 2-opt, VND, tabú, recocido y VNS.", "Mejora clásica: probarlo desde cada cliente y quedarse con el mejor tour."],
  idea: 'Parte del depósito y avanza siempre al cliente no visitado más cercano al que todavía le cabe la carga; si ninguno cabe, regresa al depósito y abre otra ruta.',
  espec: [['Tipo', 'Constructiva, voraz, determinista.'], ['Entrada', E_ENT], ['Salida', E_SAL], ['Parámetros', 'Ninguno. Desempate: menor número de cliente.'], ['Complejidad', 'O(n²): n pasos × n candidatos.'], ['Garantía', 'Ninguna: puede quedar lejos del óptimo.'], ['Cuándo usarlo', 'Solución inicial rápida o cota superior de referencia.']],
  pseudo: ['ruta ← [0]; carga ← 0; actual ← 0', 'mientras queden clientes sin visitar:', '    C ← { j sin visitar : carga + d[j] ≤ Q }', '    si C = ∅: carga ← 0; actual ← 0   (ruta nueva)', '    j* ← argmin c[actual][j], j ∈ C', '    agregar j* al tour; carga ← carga + d[j*]', '    marcar j* visitado; actual ← j*', 'dividir el tour por capacidad → rutas'],
  trazaTitulo: 'Traza paso a paso (12 decisiones)',
  traza: () => ({ cols: ['Paso', 'Desde', 'Hacia', 'Distancia', 'Carga'], w: [0.6, 0.8, 0.8, 1.1, 0.9], rows: (() => { let k = 0; return R.nn.traza.map((t) => (t[0] === 'nueva ruta' ? [{ text: '—', c: '6E6E73' }, { text: 'nueva ruta', c: 'B25000', b: true }, '', '', ''] : [++k, t[0] === 0 ? 'D' : 'c' + t[0], 'c' + t[1], e(t[2]), t[3]])); })() }),
  lectura: ['Pasos 1–4: desde D va a c3 (34,9), luego c2, c1 y c10 siempre al más cercano; la carga llega a 14/15.', 'Ningún cliente restante cabe (14 + 3 > 15): se abre la ruta 2, que termina en c5 con carga 15/15.', 'Ruta 3: desde D va a c9 y, por quedar solo c4, salta 86,9 hasta c4: la «cola larga» típica del vecino más cercano.'],
  claves: [[/cnt = sum/, 'candidatos factibles C'], [/if \(cnt = 0/, 'ruta nueva si C = ∅'], [/pick = smin/, 'argmin con desempate'], [/tr\(p\) = pick/, 'agregar al tour']],
  analisis: () => [`Costo ${e(R.nn.costo)}: ${gapTxt('nn')} sobre el óptimo (${e(OPT)}); 3 rutas con cargas ${cargas('nn')}.`, 'Las primeras decisiones son buenas y las últimas, malas: el cliente que queda al final puede estar lejos (salto de 86,9 hacia c4).', 'Es la solución inicial de 2-opt, VND, tabú, recocido y VNS: todos la mejoran.', 'Sin parámetros ni azar: el resultado es siempre el mismo.'],
});
/* ---------------------------------------------------------------- 02 barrido */
ALG.push({
  id: 'barrido', num: '02', nombre: 'Barrido (sweep)', familia: 'Heurística constructiva', arch: '02_barrido.gms', fig: 'ruta_barrido', conv: null,
  extra: ["Variante de Gillett y Miller (1974): el barrido agrupa y luego se resuelve un TSP en cada grupo.", "Necesita coordenadas; con distancias reales se usa el ángulo de una proyección.", "Es la base de heurísticas de «agrupar primero, rutear después»."],
  idea: 'Ordena los clientes por su ángulo respecto al depósito, como un radar, y llena vehículos en ese orden. Se prueban las 10 rotaciones (cliente inicial) y se conserva la mejor.',
  espec: [['Tipo', 'Constructiva geométrica, determinista.'], ['Entrada', E_ENT + ' Coordenadas de los nodos.'], ['Salida', E_SAL], ['Parámetros', 'Ninguno (se prueban todas las rotaciones).'], ['Complejidad', 'O(n log n) para ordenar + O(n²) al evaluar las n rotaciones.'], ['Garantía', 'Ninguna; buena si los clientes rodean el depósito.'], ['Cuándo usarlo', 'Clientes distribuidos en zonas alrededor del depósito.']],
  pseudo: ['para cada cliente j: θ[j] ← atan2(y[j]−y₀, x[j]−x₀)', 'ordenar los clientes por θ creciente → orden[1..n]', 'para s = 0 … n−1:                    (cliente inicial)', '    tour ← orden rotado s posiciones', '    costo ← evaluar(tour)           (dividir por capacidad)', '    si costo < mejor: mejor ← costo; tour* ← tour', 'devolver tour*'],
  trazaTitulo: 'Ángulos y costo de cada rotación',
  traza: () => ({ cols: ['Cliente', 'Ángulo', 'Rotación', 'Inicia en', 'Costo'], w: [0.8, 0.9, 0.9, 0.9, 1.0], rows: (() => { const ord = R.barrido.orden, ang = R.barrido.ang; return ord.map((c, i) => ['c' + c, `${ang[c - 1].toFixed(1)}°`, i, 'c' + R.barrido.rot[i][1], { text: e(R.barrido.rot[i][2]), b: Math.abs(R.barrido.rot[i][2] - R.barrido.costo) < 1e-6, c: Math.abs(R.barrido.rot[i][2] - R.barrido.costo) < 1e-6 ? '248A3D' : '1D1D1F' }]); })() }),
  lectura: ['Los clientes quedan ordenados de c9 (−160,7°) a c10 (160,6°) girando en sentido antihorario.', 'Con inicio en c9, c6 o c3 el costo es 426,35 (la mejor rotación); otras rotaciones dan 429,4 a 446,1.', 'Cada rotación produce 3 rutas: el orden angular evita cruces entre rutas.'],
  claves: [[/ang\(i\)\$/, 'ángulo θ de cada cliente'], [/rk\(i\)\$/, 'posición por ángulo'], [/trE\(p\) = sum/, 'rotación del orden'], [/if \(cst < bestc/, 'conservar la mejor']],
  analisis: () => [`Costo ${e(R.barrido.costo)}: ${gapTxt('barrido')} sobre el óptimo; rutas ${R.barrido.rutas_dec.map((r) => '[' + r.join('→') + ']').join(', ')}.`, 'Mucho mejor que el vecino más cercano (481,16) con solo 10 evaluaciones del costo.', 'No mira distancias entre clientes: depende de la geometría (clientes en anillo alrededor del depósito favorecen el barrido).', 'Los pasos de mejora (2-opt, VND) parten de soluciones como esta.'],
});
/* ---------------------------------------------------------------- 03 inserción */
ALG.push({
  id: 'insercion', num: '03', nombre: 'Inserción más barata', familia: 'Heurística constructiva', arch: '03_insercion_mas_barata.gms', fig: 'ruta_insercion', conv: null,
  extra: ["Variantes: inserción del más lejano, del más cercano o con arrepentimiento (regret).", "Con ventanas de tiempo se inserta solo donde la llegada es factible.", "Se usa dentro de metaheurísticas de destruir y reparar (ALNS)."],
  idea: 'En cada paso inserta el cliente y la posición (ruta y lugar) cuyo incremento Δ = c(i,k) + c(k,j) − c(i,j) es menor, respetando la capacidad; abre una ruta nueva si hace falta.',
  espec: [['Tipo', 'Constructiva voraz con rutas explícitas.'], ['Entrada', E_ENT], ['Salida', 'Rutas (matriz ruta × posición) y costo total.'], ['Parámetros', 'Máximo de 5 rutas; desempate por menor (cliente, ruta, posición).'], ['Complejidad', 'O(n³): n pasos × n clientes × n posiciones.'], ['Garantía', 'Ninguna.'], ['Cuándo usarlo', 'Cuando hay ventanas de tiempo o restricciones: se inserta solo donde se cumple.']],
  pseudo: ['rutas ← ∅; pendientes ← todos los clientes', 'mientras haya pendientes:', '    para cada k ∈ pendientes y posición (r,s) factible:', '        Δ(k,r,s) ← c[ant][k] + c[k][sig] − c[ant][sig]', '    (k*,r*,s*) ← argmin Δ', '    insertar k* en la ruta r*, posición s*', '    actualizar carga y largo de la ruta r*', 'devolver rutas'],
  trazaTitulo: 'Traza: cliente insertado en cada paso',
  traza: () => ({ cols: ['Paso', 'Cliente', 'Ruta', 'Posición', 'Δ costo'], w: [0.6, 0.9, 0.7, 0.9, 0.9], rows: R.insercion.traza.map((t, i) => [i + 1, 'c' + t[0], t[1], t[2], e(t[3])]) }),
  lectura: ['Paso 1: c3 abre la ruta 1 con Δ = 69,86 (ida y vuelta al depósito); luego c2, c1 y c10 se insertan antes, siempre en la posición 1.', 'Paso 5: c8 no cabe en la ruta 1 (carga 14) y abre la ruta 2 (Δ = 82,37).', 'Los incrementos bajos (12,1 a 31,6) indican inserciones junto a un vecino ya servido.'],
  claves: [[/rnew = /, 'primera ruta vacía'], [/okk\(kc,ro,sp\)\$\(pend/, 'inserciones factibles'], [/dl\(kc,ro,sp\)\$okk/, 'incremento Δ'], [/key = smin/, 'elegir (k, r, s) mínimo'], [/rtn\(ro,sp\)\$\(ord\(ro\) = rsel and ord\(sp\) > ssel/, 'desplazar e insertar']],
  analisis: () => [`Costo ${e(R.insercion.costo)}: ${gapTxt('insercion')} sobre el óptimo; 3 rutas con cargas ${cargas('insercion')}.`, 'Empata con el vecino más cercano porque construye las mismas rutas en sentido inverso (mismo costo, orden distinto).', 'El primer cliente insertado (c3) define la ruta: la inserción depende del orden en que se abren las rutas.', 'Es la base de las heurísticas con ventanas de tiempo: se inserta únicamente donde la llegada es factible.'],
});
/* ---------------------------------------------------------------- 04 2-opt */
ALG.push({
  id: 'dos_opt', num: '04', nombre: '2-opt', familia: 'Mejora local', arch: '04_dos_opt.gms', fig: 'ruta_dos_opt', conv: 'conv_dos_opt',
  extra: ["Generalización: 3-opt y Or-opt (mueven tramos de 1 a 3 clientes).", "Con rutas múltiples existe 2-opt* (intercambia colas entre rutas).", "Es la mejora local más usada en TSP y VRP."],
  idea: 'Parte del tour del vecino más cercano. En cada pasada invierte el tramo [a,b] que más reduce el costo y repite hasta que ningún intercambio mejora (óptimo local 2-opt).',
  espec: [['Tipo', 'Búsqueda local, mejor mejora (best improvement).'], ['Entrada', 'Tour inicial (vecino más cercano), c(i,j), d(i), Q.'], ['Salida', 'Tour localmente óptimo para el vecindario 2-opt.'], ['Parámetros', 'Vecindario: inversión de un tramo (45 pares a < b).'], ['Complejidad', 'O(n²) vecinos × O(n) evaluación por pasada.'], ['Garantía', 'Óptimo local; no necesariamente global.'], ['Cuándo usarlo', 'Para quitar cruces y pulir cualquier solución inicial.']],
  pseudo: ['tour ← vecino más cercano; costo ← evaluar(tour)', 'repetir', '    para cada par a < b:', '        tour\' ← invertir tour[a..b]; Δ ← evaluar(tour\') − costo', '    (a*,b*) ← par con menor Δ', '    si Δ* < 0: tour ← tour\'(a*,b*); costo ← costo + Δ*', 'hasta que ningún par mejore'],
  trazaTitulo: 'Mejoras aplicadas (3 pasadas con mejora)',
  traza: () => ({ cols: ['Pasada', 'Invierte', 'Costo', 'Mejora'], w: [0.9, 1.2, 1.2, 1.1], rows: R.dos_opt.hist.map((h, i) => (i === 0 ? ['inicio', '—', e(h[2]), '—'] : [h[0], `[${h[1][0]}..${h[1][1]}]`, e(h[2]), e(R.dos_opt.hist[i - 1][2] - h[2])])).concat([['4', 'ninguno', 'fin', 'óptimo local']]) }),
  lectura: ['Pasada 1: invertir las posiciones 8–9 baja el costo de 481,16 a 474,55.', 'Pasada 2: invertir 7–8 baja a 446,87; pasada 3: invertir 5–6 baja a 426,35.', 'En la pasada 4 ninguno de los 45 intercambios mejora: se detiene tras 181 evaluaciones.'],
  claves: [[/kmax = 1/, 'un solo vecindario (2-opt)'], [/trE\(p\)\$\(ord\(p\) >= a and ord\(p\) <= b\)/, 'invertir el tramo [a,b]'], [/if \(cst - cur < bd/, 'guardar la mejor mejora'], [/while \(kv <= kmax/, 'repetir mientras mejore'], [/tr\(p\) = trB\(p\)/, 'aplicar el movimiento']],
  analisis: () => [`Costo ${e(R.dos_opt.costo)}: ${gapTxt('dos_opt')} sobre el óptimo; baja ${e(481.1575 - R.dos_opt.costo)} (−11,4 %) desde el vecino más cercano.`, 'Converge en 3 mejoras y 181 evaluaciones; coincide con el mejor barrido (426,35).', 'Queda en un óptimo local: para llegar a 425,05 hacen falta otros movimientos (relocate), como hace VND.', 'Es determinista: depende solo del tour inicial.'],
});
/* ---------------------------------------------------------------- 05 VND */
ALG.push({
  id: 'vnd', num: '05', nombre: 'VND: relocate, swap y 2-opt', familia: 'Mejora local', arch: '05_vnd_relocate_swap_2opt.gms', fig: 'ruta_vnd', conv: 'conv_vnd',
  extra: ["VNS añade agitación aleatoria sobre este mismo VND (algoritmo 11).", "GRASP lo usa como mejora de cada construcción (algoritmo 10).", "Cambiar el orden de los vecindarios cambia el óptimo local alcanzado."],
  idea: 'Descenso por vecindarios variables: aplica la mejor mejora del vecindario 1 (relocate); si no hay, del 2 (swap); si no, del 3 (2-opt). Tras cada mejora vuelve al vecindario 1.',
  espec: [['Tipo', 'Búsqueda local con varios vecindarios.'], ['Entrada', 'Tour inicial (vecino más cercano), c(i,j), d(i), Q.'], ['Salida', 'Tour que es óptimo local de los tres vecindarios.'], ['Parámetros', 'Orden de vecindarios: 1 relocate, 2 swap, 3 2-opt.'], ['Complejidad', 'O(n³) por pasada de cada vecindario.'], ['Garantía', 'Óptimo local respecto de los tres movimientos.'], ['Cuándo usarlo', 'Como búsqueda local de GRASP, VNS y de las metaheurísticas.']],
  pseudo: ['tour ← vecino más cercano; k ← 1', 'mientras k ≤ 3:', '    mejor movimiento de N_k   (1 relocate · 2 swap · 3 2-opt)', '    si mejora (Δ < 0):', '        aplicar el movimiento; k ← 1', '    si no: k ← k + 1', 'devolver tour'],
  trazaTitulo: 'Mejoras aplicadas',
  traza: () => ({ cols: ['Mejora', 'Vecindario', 'Posiciones', 'Costo'], w: [0.9, 1.4, 1.2, 1.1], rows: R.vnd.hist.map((h, i) => (i === 0 ? ['inicio', '—', '—', e(h[3])] : [h[0], ['', 'relocate', 'swap', '2-opt'][h[1]], `(${h[2][0]},${h[2][1]})`, e(h[3])])).concat([['fin', 'k = 3 sin mejora', '—', 'óptimo local']]) }),
  lectura: ['Mejora 1: relocate mueve el cliente de la posición 9 a la 5 y baja de 481,16 a 426,35 (−54,8 de una vez).', 'Mejora 2: 2-opt invierte las posiciones 2–10 y llega a 425,05: el óptimo de la instancia.', 'Después, relocate, swap y 2-opt no encuentran mejoras: 451 evaluaciones en total.'],
  claves: [[/Set kn/, 'lista de vecindarios'], [/mt = sum\(kn/, 'vecindario actual'], [/if \(mt = 1,/, 'relocate / swap / 2-opt'], [/if \(cst - cur < bd/, 'mejor mejora del vecindario'], [/kv = 1; nit/, 'mejora: volver a N₁'], [/kv = kv \+ 1/, 'sin mejora: siguiente N']],
  analisis: () => [`Costo ${e(R.vnd.costo)}: ${gapTxt('vnd')} sobre el óptimo: alcanza el óptimo con solo 451 evaluaciones.`, 'Relocate aporta la mayor parte de la mejora; 2-opt la completa: los vecindarios se complementan.', 'Es determinista; su resultado depende del tour inicial.', 'Es el motor de búsqueda local dentro de GRASP y VNS.'],
});
/* ---------------------------------------------------------------- 06 tabú */
ALG.push({
  id: 'tabu', num: '06', nombre: 'Búsqueda tabú', familia: 'Metaheurística de trayectoria', arch: '06_busqueda_tabu.gms', fig: 'ruta_tabu', conv: 'conv_tabu',
  extra: ["Extensiones: memoria de largo plazo (frecuencia), intensificación y diversificación.", "La lista tabú puede guardar atributos (clientes) en lugar de posiciones.", "Hace falta ajustar la permanencia tabú (aquí 7 iteraciones)."],
  idea: 'En cada iteración aplica el mejor intercambio de dos posiciones que no esté prohibido (lista tabú), aunque empeore el costo. Aspiración: un movimiento tabú se permite si mejora el mejor costo conocido.',
  espec: [['Tipo', 'Trayectoria, memoria de corto plazo, determinista.'], ['Entrada', 'Tour inicial (vecino más cercano).'], ['Salida', 'Mejor tour visitado en la trayectoria.'], ['Parámetros', 'Iteraciones = 60; permanencia tabú = 7; vecindario swap (45 pares).'], ['Complejidad', 'O(n²·n) por iteración × 60 iteraciones.'], ['Garantía', 'Ninguna; puede escapar de óptimos locales.'], ['Cuándo usarlo', 'Cuando la búsqueda local se estanca y se quiere explorar de forma dirigida.']],
  pseudo: ['tour ← vecino más cercano; mejor ← tour; tabú ← ∅', 'para it = 1 … 60:', '    para cada par a < b: costo ← evaluar(swap(tour,a,b))', '    elegir (a,b) de menor costo tal que', '        (a,b) no sea tabú  o  costo < mejor − ε   (aspiración)', '    tour ← swap(tour,a,b); tabú(a,b) ← it + 7', '    si costo < mejor: mejor ← costo; tour* ← tour', 'devolver tour*'],
  trazaTitulo: 'Primeras 12 iteraciones',
  traza: () => ({ cols: ['Iter.', 'Swap', 'Costo actual', 'Mejor'], w: [0.7, 1.0, 1.4, 1.2], rows: R.tabu.hist.slice(1, 13).map((h) => [h[0], `(${h[1][0]},${h[1][1]})`, { text: e(h[2]), c: h[2] > R.tabu.hist[Math.max(0, h[0] - 1)][2] + 1e-9 ? 'B25000' : '1D1D1F', b: h[2] > R.tabu.hist[Math.max(0, h[0] - 1)][2] + 1e-9 }, e(h[3])]) }),
  lectura: ['Iteraciones 1–4: el costo baja (459,34 → 429,43) y el mejor llega a 425,05 en la iteración 4.', 'Iteraciones 6–8 (naranja): el costo sube a 444,69, 463,26 y 464,51: se acepta empeorar porque todo movimiento que mejora está prohibido o ya se usó.', 'Iteración 9: vuelve a 425,05 con otro tour: la trayectoria salió y regresó al óptimo sin repetirse.'],
  claves: [[/tabuf = 1\$/, '¿el movimiento es tabú?'], [/skip  = 1\$/, 'aspiración: tabú pero mejora'], [/if \(skip = 0 and \(found/, 'mejor movimiento admisible'], [/tb\(pa,pb\)\$/, 'marcar (a,b) tabú 7 iteraciones'], [/trMejor\(p\) = tr\(p\)/, 'guardar el mejor tour']],
  analisis: () => [`Costo ${e(R.tabu.costo)}: ${gapTxt('tabu')} (óptimo). Lo encuentra en la iteración 4 y no mejora en las 56 restantes.`, 'Total: 2.701 evaluaciones (60 iteraciones × 45 vecinos + 1): más caro que VND, pero explora más.', 'Aceptar empeoramientos controlados le permite salir y volver al óptimo con rutas distintas.', 'Es determinista: sin azar, el resultado es reproducible.'],
});
/* ---------------------------------------------------------------- 07 recocido */
ALG.push({
  id: 'sa', num: '07', nombre: 'Recocido simulado', familia: 'Metaheurística de trayectoria', arch: '07_recocido_simulado.gms', fig: 'ruta_sa', conv: 'conv_sa',
  extra: ["Con enfriamiento más lento (más iteraciones) mejora la calidad.", "Variante: reinicios (reheating) cuando se estanca.", "La semilla fija hace la corrida reproducible; con otras semillas varía la trayectoria."],
  idea: 'Genera un vecino aleatorio (relocate, swap o 2-opt) y lo acepta si mejora o, si empeora en Δ, con probabilidad e^(−Δ/T). La temperatura T baja de 20 a 0,05, de modo que al final solo acepta mejoras.',
  espec: [['Tipo', 'Trayectoria, estocástica (Park-Miller, semilla 2024).'], ['Entrada', 'Tour inicial (vecino más cercano).'], ['Salida', 'Mejor tour encontrado.'], ['Parámetros', 'T₀ = 20; T_f = 0,05; enfriamiento geométrico en 4.000 iteraciones (α = 0,9985).'], ['Complejidad', 'O(n) por evaluación × 4.000 iteraciones.'], ['Garantía', 'Converge al óptimo con enfriamiento infinitamente lento; en la práctica, sin garantía.'], ['Cuándo usarlo', 'Cuando hay muchos óptimos locales y basta una buena solución.']],
  pseudo: ['tour ← vecino más cercano; T ← 20; α ← (0,05/20)^(1/4000)', 'para it = 1 … 4000:', '    generar vecino: tipo y posiciones a, b al azar', '    Δ ← costo(vecino) − costo(tour)', '    si Δ < 0  ó  u < exp(−Δ/T):  tour ← vecino', '    si costo(tour) < mejor: mejor ← costo(tour)', '    T ← α·T', 'devolver mejor'],
  trazaTitulo: 'Historial cada 200 iteraciones (de 4.000)',
  traza: () => ({ cols: ['Iter.', 'T', 'Costo actual', 'Mejor'], w: [0.8, 0.8, 1.3, 1.2], rows: R.sa.hist.filter((h, i) => i <= 9 || h[0] % 1000 === 0).map((h) => [h[0], e(Tit(h[0]), 2), e(h[1]), e(h[2])]) }),
  lectura: ['Con T alta (≈ 15) el costo actual oscila (513,9 en la iteración 200) mientras el mejor baja a 434,6.', 'En la iteración 600 el mejor ya es 425,05; el costo actual sigue subiendo y bajando (448,6) mientras T > 3.', 'Con T < 1 (desde la iteración ≈ 2.000) el costo actual se estabiliza en 426,35 y, desde la 2.800, en 425,05: solo acepta mejoras.'],
  claves: [[/alpha = \(Tf/, 'enfriamiento geométrico'], [/seed = mod\(16807/, 'generador pseudoaleatorio'], [/mt = 3;/, 'elegir el tipo de movimiento'], [/acc = 1\$\(uu < exp/, 'criterio de Metropolis'], [/Temp = Temp\*alpha/, 'bajar la temperatura']],
  analisis: () => [`Costo ${e(R.sa.costo)}: ${gapTxt('sa')} (óptimo) con semilla 2024; ${R.sa.acept} de 4.000 movimientos aceptados (${e(R.sa.acept / 40, 1)} %).`, `Robustez (20 semillas): óptimo en ${rob.sa.optimas}/20 corridas; peor ${e(rob.sa.peor)}.`, 'Cuesta 4.001 evaluaciones: 9 veces más que VND, pero no depende de la solución inicial.', 'La temperatura define el compromiso entre explorar (T alta) y refinar (T baja).'],
  stoc: 'sa',
});
/* ---------------------------------------------------------------- 08 genético */
const gaPrimero = R.ga.hist.find((h) => h[1] <= OPT + 1e-6); 
ALG.push({
  id: 'ga', num: '08', nombre: 'Algoritmo genético', familia: 'Metaheurística poblacional', arch: '08_algoritmo_genetico.gms', fig: 'ruta_ga', conv: 'conv_ga',
  extra: ["Cruce alternativo: PMX o por ciclos; mutación por inversión.", "Memético: aplicar búsqueda local a los hijos (muy efectivo en VRP).", "Prins (2004) usa tour gigante + división óptima, como esta representación."],
  idea: 'Población de 30 permutaciones de clientes (cada una se divide por capacidad). En 60 generaciones: selección por torneo binario, cruce OX, mutación por intercambio y elitismo de los 2 mejores.',
  espec: [['Tipo', 'Poblacional, estocástico (Park-Miller, semilla 7).'], ['Entrada', 'Ninguna solución inicial: población aleatoria.'], ['Salida', 'Mejor individuo de la última generación.'], ['Parámetros', 'P = 30; G = 60; p_mutación = 0,5; elitismo = 2; cruce OX.'], ['Complejidad', 'O(P·n) por generación.'], ['Garantía', 'Ninguna; la diversidad evita el estancamiento.'], ['Cuándo usarlo', 'Cuando la solución es una permutación y el costo se calcula con rapidez.']],
  pseudo: ['P ← 30 permutaciones aleatorias (Fisher–Yates)', 'para gen = 0 … 60:', '    evaluar y ordenar P por costo', '    si gen = 60: parar', '    nueva ← los 2 mejores (elitismo)', '    mientras |nueva| < 30:', '        A, B ← dos torneos binarios', '        hijo ← OX(A,B,c₁,c₂)', '        con prob. 0,5: intercambiar 2 genes del hijo', '        agregar hijo a nueva', '    P ← nueva', 'devolver el mejor de P'],
  trazaTitulo: 'Evolución por generación (cada 6)',
  traza: () => ({ cols: ['Gen.', 'Mejor', 'Promedio'], w: [0.9, 1.3, 1.3], rows: R.ga.hist.filter((h) => h[0] % 6 === 0).map((h) => [h[0], e(h[1]), e(h[2], 1)]) }),
  lectura: [`Generación 0: el mejor de 30 permutaciones aleatorias cuesta ${e(R.ga.hist[0][1])} (promedio ${e(R.ga.hist[0][2], 1)}).`, `El mejor llega a 425,05 en la generación ${gaPrimero[0]}; el promedio sigue bajando (479,0 al final) porque la población converge.`, 'Cruce OX: copia un tramo del padre A y completa con el orden del padre B, así el hijo es siempre una permutación válida.'],
  claves: [[/Fisher|ii = 11 - ord\(fy\)/, 'barajado de Fisher–Yates'], [/rk\(g\) = 1/, 'ordenar por costo (ranking)'], [/pop2\(g,p\)\$\(ord\(g\) <= nelite\)/, 'elitismo'], [/if \(ca < cb or/, 'torneo binario'], [/chd\(p\)\$\(ord\(p\) >= c1/, 'cruce OX: tramo de A'], [/while \(w >= c1/, 'cruce OX: completar con B'], [/if \(ut < pm/, 'mutación por intercambio']],
  analisis: () => [`Costo ${e(R.ga.costo)}: ${gapTxt('ga')} (óptimo) con semilla 7 en la generación ${gaPrimero[0]}.`, `Robustez (20 semillas): óptimo en ${rob.ga.optimas}/20; media ${e(rob.ga.media)}; peor ${e(rob.ga.peor)}: es el más sensible a la semilla.`, '1.830 evaluaciones (30 individuos × 61 generaciones): costo moderado.', 'Ventaja: no necesita solución inicial; límite: con P pequeño la diversidad se agota y se estanca.'],
  stoc: 'ga', largo: true,
});
/* ---------------------------------------------------------------- 09 hormigas */
const acoPrimero = R.aco.hist.find((h) => h[2] <= R.aco.costo + 1e-6);
ALG.push({
  id: 'aco', num: '09', nombre: 'Colonia de hormigas', familia: 'Metaheurística poblacional', arch: '09_colonia_de_hormigas.gms', fig: 'ruta_aco', conv: 'conv_aco',
  extra: ["Variantes: Ant Colony System, MAX-MIN (límites de feromona) y elitista.", "Se combina con búsqueda local sobre cada hormiga.", "La feromona acumula el aprendizaje del grupo sobre los arcos buenos."],
  idea: '10 hormigas construyen tours eligiendo el siguiente cliente con probabilidad proporcional a τ(i,j)·(1/c(i,j))³ (feromona y cercanía). Tras cada iteración la feromona se evapora (ρ = 0,3) y cada hormiga deposita 100/costo en los arcos de su solución.',
  espec: [['Tipo', 'Poblacional, estocástica (Park-Miller, semilla 11).'], ['Entrada', 'Feromona inicial τ = 1; visibilidad η = 1/c.'], ['Salida', 'Mejor tour construido por alguna hormiga.'], ['Parámetros', '10 hormigas; 30 iteraciones; α = 1; β = 3; ρ = 0,3; Qd = 100.'], ['Complejidad', 'O(M·n²) por iteración.'], ['Garantía', 'Ninguna; la feromona sesga la búsqueda.'], ['Cuándo usarlo', 'Problemas de rutas donde la estructura de arcos buenos se aprende (TSP, VRP).']],
  pseudo: ['τ[i][j] ← 1; η[i][j] ← 1/c[i][j]', 'para it = 1 … 30:', '    para cada hormiga h = 1 … 10:', '        construir tour: desde el nodo actual elegir j factible', '            con prob. p_ij ∝ τ_ij · η_ij³', '        costo ← evaluar(tour); guardar si es el mejor', '        depositar Qd/costo en cada arco del tour', '    τ ← (1−ρ)·τ + depósitos      (ρ = 0,3)', 'devolver el mejor tour'],
  trazaTitulo: 'Evolución por iteración (cada 3)',
  traza: () => ({ cols: ['Iter.', 'Mejor de la iter.', 'Mejor global'], w: [0.8, 1.6, 1.4], rows: R.aco.hist.filter((h) => h[0] % 3 === 1 || h[0] === 30).map((h) => [h[0], e(h[1]), e(h[2])]) }),
  lectura: ['Iteración 1: la mejor hormiga cuesta 479,05 (casi vecino más cercano) porque la feromona es uniforme.', `El mejor global llega a ${e(R.aco.costo)} en la iteración ${acoPrimero[0]} y ya no cambia.`, `La mejor de cada iteración sigue oscilando entre ${e(Math.min(...R.aco.hist.slice(5).map((h) => h[1])), 1)} y ${e(Math.max(...R.aco.hist.slice(5).map((h) => h[1])), 1)}: las hormigas exploran, pero la feromona se concentró en un tour que no es el óptimo.`],
  claves: [[/tau\(i,j\) = 1/, 'feromona inicial'], [/w\(i\)\$\(cand\(i\) = 1\) =/, 'peso τ·η³ de cada candidato'], [/rr0 = seed/, 'ruleta: umbral aleatorio'], [/if \(cum >= rr0/, 'elegir el candidato de la ruleta'], [/delt\(i,j\)\$\(ord\(i\) = pv\+1 and ord\(j\) = cn\+1\)/, 'depositar feromona en el arco'], [/tau\(i,j\) = \(1 - rho\)/, 'evaporación + depósito']],
  analisis: () => [`Costo ${e(R.aco.costo)}: ${gapTxt('aco')} sobre el óptimo; 300 evaluaciones (10 hormigas × 30 iteraciones).`, `Robustez: las 20 semillas terminan en ${e(rob.aco.media)}: se estanca siempre en el mismo tour.`, 'Causa: la construcción es del tipo vecino más cercano y con β = 3 pesa demasiado la cercanía; el óptimo requiere pasos poco «cercanos».', 'Mejoras habituales: búsqueda local sobre cada hormiga, menor β o feromona mínima/máxima.'],
  stoc: 'aco', largo: true,
});
/* ---------------------------------------------------------------- 10 GRASP */
ALG.push({
  id: 'grasp', num: '10', nombre: 'GRASP', familia: 'Metaheurística de multiarranque', arch: '10_grasp.gms', fig: 'ruta_grasp', conv: 'conv_grasp',
  extra: ["Con α = 0 es vecino más cercano puro; con α = 1 es construcción aleatoria.", "Versión reactiva: ajusta α según el desempeño.", "Es fácil de paralelizar: cada iteración es independiente."],
  idea: '20 iteraciones; cada una construye una solución voraz aleatorizada (el siguiente cliente se sortea entre los de la lista restringida: distancia ≤ dmin + 0,3·(dmax − dmin)) y la mejora con VND. Conserva la mejor.',
  espec: [['Tipo', 'Multiarranque: construcción aleatorizada + búsqueda local.'], ['Entrada', 'Ninguna solución inicial.'], ['Salida', 'Mejor solución tras 20 construcciones + VND.'], ['Parámetros', 'Iteraciones = 20; amplitud de la lista restringida α = 0,3; semilla 5.'], ['Complejidad', 'Iteraciones × (O(n²) + VND).'], ['Garantía', 'Ninguna; mejora con más iteraciones.'], ['Cuándo usarlo', 'Cuando se dispone de una buena búsqueda local y se quiere diversidad de arranques.']],
  pseudo: ['para it = 1 … 20:', '    tour ← ∅; actual ← depósito', '    mientras falten clientes:', '        RCL ← { j : c[a][j] ≤ dmin + α·(dmax−dmin) }', '        j ← elemento al azar de RCL; agregar j al tour', '    tour ← VND(tour)                  (búsqueda local)', '    si costo(tour) < mejor: mejor ← costo(tour)', 'devolver mejor'],
  trazaTitulo: 'Primeras 10 iteraciones',
  traza: () => ({ cols: ['Iter.', 'Construcción', 'Tras VND', 'Mejor'], w: [0.7, 1.4, 1.2, 1.1], rows: R.grasp.hist.slice(0, 10).map((h) => [h[0], e(h[1], 1), e(h[2]), e(h[3])]) }),
  lectura: ['Las 10 primeras construcciones aleatorizadas cuestan 490 a 558: peores que el vecino más cercano (481), pero distintas entre sí.', 'La búsqueda local VND las lleva a 425,05–435,49: la diversidad de arranques compensa la calidad inicial.', 'En la iteración 4 alcanza 425,05 y las demás iteraciones no lo mejoran.'],
  claves: [[/lim  = dmin/, 'límite de la lista restringida'], [/rcl\(i\)\$/, 'lista restringida (RCL)'], [/kth = 1/, 'sorteo en la RCL'], [/if \(cum = kth/, 'elemento elegido de la RCL'], [/VND completo/, 'búsqueda local VND'], [/if \(cur < best/, 'conservar la mejor']],
  analisis: () => [`Costo ${e(R.grasp.costo)}: ${gapTxt('grasp')} (óptimo) con semilla 5; ${rob.grasp.optimas}/20 semillas alcanzan el óptimo.`, '8.095 evaluaciones: es la más cara de las de trayectoria, porque cada iteración ejecuta un VND completo.', 'Las construcciones aleatorizadas aportan diversidad; el VND aporta calidad.', 'Con α = 0 es vecino más cercano puro; con α = 1 es totalmente aleatorio.'],
  stoc: 'grasp',
});
/* ---------------------------------------------------------------- 11 VNS */
ALG.push({
  id: 'vns', num: '11', nombre: 'VNS: búsqueda de vecindario variable', familia: 'Metaheurística de trayectoria', arch: '11_vns.gms', fig: 'ruta_vns', conv: 'conv_vns',
  extra: ["Variantes: VNS reducido (sin búsqueda local) y VNS sesgado.", "La agitación usa vecindarios más grandes que los del VND.", "Se puede combinar con GRASP o recocido como primera fase."],
  idea: 'Parte del vecino más cercano. En cada iteración agita la solución con k + 1 movimientos aleatorios (k = 1..3), la mejora con VND y la acepta si mejora (entonces k = 1); si no, aumenta k.',
  espec: [['Tipo', 'Trayectoria con agitación de intensidad variable.'], ['Entrada', 'Tour inicial (vecino más cercano).'], ['Salida', 'Solución incumbente al terminar.'], ['Parámetros', 'Iteraciones = 12; k_max = 3; agitación de k + 1 movimientos (relocate o swap); VND; semilla 3.'], ['Complejidad', 'Iteraciones × k_max × VND.'], ['Garantía', 'Ninguna.'], ['Cuándo usarlo', 'Cuando una búsqueda local se estanca y conviene cambiar de «escala» de vecindario.']],
  pseudo: ['tour ← vecino más cercano', 'para it = 1 … 12:', '    k ← 1', '    mientras k ≤ 3:', '        t ← agitar(tour, k+1 movimientos al azar)', '        t ← VND(t)                         (búsqueda local)', '        si costo(t) < costo(tour): tour ← t; k ← 1', '        si no: k ← k + 1', 'devolver tour'],
  trazaTitulo: 'Primeros 10 intentos (agitación + VND)',
  traza: () => ({ cols: ['Intento', 'Iter.', 'k', 'Costo tras VND', 'Acepta'], w: [0.8, 0.6, 0.5, 1.4, 0.8], rows: R.vns.intentos.slice(0, 10).map((t) => [t[0], t[1], t[2], e(t[3]), { text: t[4] ? 'sí' : 'no', c: t[4] ? '248A3D' : '6E6E73', b: !!t[4] }]) }),
  lectura: ['Intento 1 (k = 1): la agitación y el VND llevan de 481,16 a 425,05: se acepta y k vuelve a 1.', 'Intentos 2–4: con k = 1, 2, 3 el VND regresa a 425,05 sin mejorar: k sube hasta k_max.', `En las 12 iteraciones (${R.vns.intentos.length} intentos en total) no aparece nada mejor que 425,05.`],
  claves: [[/loop\(sk\$/, 'agitación: k + 1 movimientos'], [/mt = 2;/, 'relocate o swap al azar'], [/\[VND completo/, 'búsqueda local VND'], [/histk\(att,'aceptado'\)/, 'registrar el intento'], [/if \(cur < curC - 1e-9/, 'aceptar si mejora'], [/kk = kk \+ 1/, 'aumentar la intensidad k']],
  analisis: () => [`Costo ${e(R.vns.costo)}: ${gapTxt('vns')} (óptimo) con semilla 3; ${rob.vns.optimas}/20 semillas alcanzan el óptimo.`, '18.308 evaluaciones: la más costosa, por 12 iteraciones × 3 intensidades × un VND completo.', 'En esta instancia el óptimo se alcanza en el primer intento; el resto confirma que no hay mejora cercana.', 'En instancias grandes la agitación creciente es lo que permite escapar de valles amplios.'],
  stoc: 'vns', largo: true,
});
/* ---------------------------------------------------------------- 12 B&B */
const lg = R.optimo.log;
ALG.push({
  id: 'bb', num: '12', nombre: 'Branch and bound (modelo exacto)', familia: 'Método exacto', arch: '12_branch_and_bound_exacto.gms', fig: 'ruta_exacto', conv: 'conv_bb',
  extra: ["Mejoras: cortes de subtours (branch and cut) y generación de columnas (branch and price).", "El solver (CBC, CPLEX, HiGHS) decide la variable de ramificación y el recorrido del árbol.", "La brecha se cierra cuando cota inferior = mejor solución entera."],
  idea: 'Resuelve la relajación lineal del modelo CVRP; si hay variables binarias fraccionarias, ramifica en x = 0 y x = 1 y poda las ramas que no pueden mejorar la mejor solución entera. Al terminar, el óptimo está demostrado.',
  espec: [['Tipo', 'Exacto: modelo MILP de 2 índices con carga acumulada (MTZ).'], ['Entrada', 'Mismos datos; K = 5 vehículos como máximo.'], ['Salida', 'Óptimo probado, cota de la raíz, brecha y nodos.'], ['Parámetros', 'optcr = 0 (brecha relativa 0); tiempo máximo 300 s.'], ['Complejidad', 'Exponencial en el peor caso; 110 binarias + 10 continuas aquí.'], ['Garantía', 'Óptimo global demostrado (brecha = 0).'], ['Cuándo usarlo', 'Instancias pequeñas, para validar heurísticas o fijar una cota.']],
  pseudo: ['L ← { problema original }; z* ← +∞', 'mientras L ≠ ∅:', '    tomar P de L; resolver su relajación lineal → z_P', '    si P infactible ó z_P ≥ z*: descartar (poda)', '    si la solución de P es entera: z* ← z_P', '    si no: elegir x_ij fraccionaria;', '        crear P₀ (x_ij = 0) y P₁ (x_ij = 1)', 'devolver z* y su solución'],
  trazaTitulo: 'Evolución de las cotas (registro de HiGHS)',
  traza: () => ({ cols: ['Tiempo (s)', 'Nodos', 'Cota inferior', 'Mejor entera'], w: [1.0, 0.8, 1.3, 1.3], rows: lg.map((f) => [f.t.toFixed(1), f.nodos, f.cota === null ? '—' : e(f.cota), f.inc === null ? '—' : e(f.inc)]).concat([['', '', '', ''], [{ text: 'Relajación lineal (raíz)', b: true }, '', { text: e(R.optimo.relajacion), b: true }, '']]) }),
  lectura: ['La relajación lineal de la raíz da 308,47 (con cortes, 318,76): lejos del óptimo porque las restricciones MTZ son débiles.', 'Una heurística interna encuentra soluciones enteras: 675,70 → 483,04 → 425,05 en 0,1 s.', 'Demostrar que 425,05 es óptimo exige explorar 1.369 nodos (1,7 s): la cota sube de 318,76 a 425,05.'],
  claves: [[/Binary Variable x/, 'variables binarias de arco'], [/obj\.\./, 'objetivo: distancia total'], [/sale\(i\)|entra\(j\)/, 'cada cliente: 1 entrada y 1 salida'], [/carga\(i,j\)\$/, 'carga acumulada (MTZ)'], [/solve cvrp using rmip/, 'relajación lineal: cota de la raíz'], [/solve cvrp using mip/, 'branch and bound sobre las binarias'], [/nodos = cvrp.nodUsd/, 'nodos explorados']],
  analisis: () => [`Óptimo ${e(OPT, 4)} con 3 rutas [5→4→3], [8→7→6], [9→10→1→2]; cargas 12 / 12 / 14.`, `Brecha de la relajación: ${e(100 * (OPT - R.optimo.relajacion) / OPT, 1)} %: por eso el árbol necesita ${R.optimo.nodos_highs.toLocaleString('es-CO')} nodos (HiGHS; CBC o CPLEX darán otro conteo).`, 'Resuelve en 1,7 s esta instancia; con 25 clientes ya tarda mucho más: de ahí las heurísticas.', 'Sirve de referencia para medir la brecha de todos los demás algoritmos.'],
  exacto: true,
});
module.exports = { ALG, rob, gaPrimero, acoPrimero };
