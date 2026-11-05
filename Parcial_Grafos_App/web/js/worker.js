/* Worker: ejecuta los modelos de optimización sin congelar la interfaz.
   Motor 1: HiGHS (WebAssembly, dentro del navegador). Motor 2: HiGHS de Python vía el servidor local. */
importScripts('../vendor/highs.js', 'solver.js', 'vrp.js', 'heur.js');
let motor = null, highsP = null;
let lineaLog = null;   // función que recibe cada línea del registro de HiGHS durante una resolución
const enLog = (t) => { if (lineaLog) lineaLog(String(t)); };
let corrida = { t0: 0 };

function adaptar(r) {
  const st = r.Status, cols = r.Columns || {}, k0 = Object.keys(cols)[0];
  const tiene = k0 !== undefined && cols[k0].Primal !== undefined;
  const status = st === 'Optimal' ? 'óptimo' : st === 'Infeasible' ? 'infactible'
    : st === 'Time limit reached' ? 'límite de tiempo (mejor solución encontrada, no probada óptima)' : st;
  const ok = (st === 'Optimal' || st === 'Time limit reached') && tiene && isFinite(r.ObjectiveValue);
  const todos = {}; if (ok) for (const k of Object.keys(cols)) todos[k] = cols[k].Primal;
  return { ok, st, dual: r.DualBound, status: /unbounded/i.test(st) ? 'no acotado' : status, obj: r.ObjectiveValue, gap: st === 'Optimal' ? 0 : null, todos, val: (n) => (cols[n] ? cols[n].Primal : 0) };
}

async function iniciarWasm() {
  if (!highsP) highsP = Module({ print: (t) => enLog(t), printErr: () => {}, locateFile: (f) => new URL('../vendor/' + f, self.location.href).href });
  const h = await highsP;
  // autoprueba: mochila entera con óptimo conocido (-20 en x=4, y=0)
  const r = h.solve('Minimize\n obj: - 5 x - 4 y\nSubject To\n c1: 6 x + 4 y <= 24\n c2: x + 2 y <= 6\nBounds\n 0 <= x <= 10\n 0 <= y <= 10\nGeneral\n x y\nEnd', { output_flag: false });
  if (r.Status !== 'Optimal' || Math.abs(r.ObjectiveValue + 20) > 1e-6) throw new Error('autoprueba del solver falló: ' + r.Status);
  return h;
}

function xhr(url, cuerpo) {
  const x = new XMLHttpRequest(); x.open('POST', url, false); x.setRequestHeader('Content-Type', 'application/json');
  x.send(JSON.stringify(cuerpo));
  return { codigo: x.status, texto: x.responseText };
}

const hayParar = () => { try { const r = xhr('/api/parar_estado', {}); return r.codigo === 200 && !!JSON.parse(r.texto).on; } catch (e) { return false; } };

/* Una etapa de HiGHS con tope de tiempo `tl`. `cota` (opcional) = valor de la mejor solución ya conocida: poda lo peor. */
async function etapa(lp, tl, gap, cota) {
  let dual = null;
  if (motor === 'wasm') {
    const h = await highsP; const t0 = performance.now();
    lineaLog = (t) => {
      let m = t.match(/Dual bound\s+(\S+)/); if (m) dual = parseFloat(m[1]);
      m = t.match(/^\s*[A-Za-z]?\s+\d+\s+\d+\s+\d+\s+[\d.]+%\s+(\S+)\s+(\S+)\s+(\S+)\s+\d+\s+\d+\s+\d+\s+\d+\s+([\d.]+)s/);
      if (m) postMessage({ tipo: 'progreso', cota: parseFloat(m[1]), mejor: m[2] === 'inf' ? null : parseFloat(m[2]), t: (performance.now() - corrida.t0) / 1000 });
    };
    const op = { time_limit: tl, mip_rel_gap: gap, output_flag: true, log_to_console: true };
    if (cota != null) op.objective_bound = cota;
    let r; try { r = h.solve(lp, op); } finally { lineaLog = null; }
    const a = adaptar(r); a.dual = dual; a.seg = (performance.now() - t0) / 1000; return a;
  }
  const t0 = performance.now(), x = xhr('/api/solve', { lp, tl, gap, cota });
  if (x.codigo !== 200) throw new Error('El solver del servidor no respondió (' + x.codigo + ')');
  const a = adaptar(JSON.parse(x.texto)); a.seg = (performance.now() - t0) / 1000; return a;
}

/* Resolución «en cualquier momento»: etapas de duración creciente (6 s, ×1,7, …) hasta probar el óptimo,
   agotar el tiempo o recibir la orden de parar. Tras cada etapa se informa el mejor valor, la cota y la brecha. */
async function resolverLP(lp, o) {
  const largo = o.timeLimit > 7 && /^\s*minimi[sz]e/i.test(lp);
  if (!largo) { const r = await etapa(lp, Math.max(1, o.timeLimit), o.gap, null); if (r.st === 'Time limit reached' && r.dual != null && r.ok) r.gap = Math.max(0, (r.obj - r.dual) / Math.max(Math.abs(r.obj), 1e-9)); return r; }
  if (!corrida.t0) corrida.t0 = performance.now();
  let tl = 6, usado = 0, mejor = null, cota = -Infinity;
  for (;;) {
    const lim = Math.min(tl, o.timeLimit - usado);
    const r = await etapa(lp, Math.max(1, lim), o.gap, mejor ? mejor.obj + 1e-7 * Math.max(1, Math.abs(mejor.obj)) : null);
    usado += r.seg;
    if (r.ok && (!mejor || r.obj < mejor.obj - 1e-9)) mejor = r;
    if (r.st === 'Optimal') { if (r.ok && mejor && r !== mejor && mejor.obj < r.obj) return mejor; r.gap = 0; return r; }
    if (r.st === 'Infeasible' && mejor) { mejor.gap = 0; mejor.status = 'óptimo'; return mejor; }   // nada mejor que lo ya hallado
    if (!r.ok && r.st !== 'Time limit reached' && !mejor) return r;
    if (r.dual != null && isFinite(r.dual)) cota = Math.max(cota, r.dual);
    if (mejor) {
      mejor.gap = cota > -Infinity ? Math.max(0, (mejor.obj - cota) / Math.max(Math.abs(mejor.obj), 1e-9)) : null; mejor.cota = cota;
      postMessage({ tipo: 'progreso', cota: isFinite(cota) ? cota : null, mejor: mejor.obj, gap: mejor.gap, t: (performance.now() - corrida.t0) / 1000, etapa: true });
      if (mejor.gap != null && mejor.gap <= o.gap) { mejor.gap = 0; mejor.status = 'óptimo'; return mejor; }
    }
    const parar = hayParar();
    if (parar || usado >= o.timeLimit - 0.5) {
      if (!mejor) return r;
      mejor.status = parar ? 'detenido por el usuario (mejor solución encontrada, no probada óptima)' : 'límite de tiempo (mejor solución encontrada, no probada óptima)';
      if (parar) detenido = true; return mejor;
    }
    tl = tl * 1.7;
  }
}
let detenido = false;

/* VRP: modelo matemático, heurística, metaheurística o comparación de todos */
async function correrVrp(d, ctx) {
  const I = d.I, o = d.opt, t0 = performance.now(), prog = (h, f) => postMessage({ tipo: 'progreso', mejor: f, cota: null, t: (performance.now() - corrida.t0) / 1000 });
  let ultimoParar = 0, parado = false; const parar = () => { const t = performance.now(); if (t - ultimoParar > 300) { ultimoParar = t; parado = hayParar() || parado; } return parado; };
  const conGap = (r, cota, exactoRef) => { if (cota != null && isFinite(cota) && isFinite(r.objetivo)) { r.cota = cota; r.gap = Math.max(0, (r.objetivo - cota) / Math.max(Math.abs(r.objetivo), 1e-9)); } if (exactoRef) r.exactoRef = exactoRef; return r; };
  const cotaExacta = async (tiempo) => { const b = await Vrp.vrp(I, ctx, { tiempo, brecha: 1e-6, metodo: o.metodo }); return b; };
  if (o.metodoSol === 'exacto') { const r = await Vrp.vrp(I, ctx, Object.assign({}, o, { tiempo: o.tiempo })); r.metodoSol = 'Modelo matemático (MILP · HiGHS)'; return r; }
  if (o.metodoSol === 'comparar') {
    const filas = []; let cota = null, mejor = null; const tm = Math.max(1, o.tiempoMeta || 3);
    ctx.log('Calculando el modelo matemático (' + (o.tiempoCota || 10) + ' s)…'); const ex = await cotaExacta(o.tiempoCota || 10);
    if (ex.rutas && ex.rutas.length) { filas.push({ metodo: 'Modelo matemático (MILP)', tipo: 'exacto', obj: ex.objetivo, seg: ex.seg, factible: true, gapProp: ex.gap }); mejor = ex; cota = ex.cota; }
    for (const a of Object.keys(Heur.ALGORITMOS)) { if (hayParar()) break; if (I.f && I.f.mode === 'split') break; ctx.log(Heur.ALGORITMOS[a].nombre + '…');
      const r = Heur.resolver(I, a, { tiempo: Heur.ALGORITMOS[a].tipo === 'meta' ? tm : 1, semilla: o.semilla || 1, parar });
      filas.push({ metodo: Heur.ALGORITMOS[a].nombre, tipo: Heur.ALGORITMOS[a].tipo, obj: r.objetivo, seg: r.seg, factible: r.factible }); if (r.factible && (!mejor || r.objetivo < mejor.objetivo - 1e-9)) mejor = r; }
    if (!mejor) return { estado: 'sin solución factible', rutas: [] };
    filas.forEach((x) => { x.gap = cota != null && x.factible ? Math.max(0, (x.obj - cota) / Math.max(Math.abs(x.obj), 1e-9)) : null; });
    const res = Object.assign({}, mejor); res.comparacion = filas; res.cota = cota; res.gap = cota != null ? Math.max(0, (res.objetivo - cota) / Math.max(Math.abs(res.objetivo), 1e-9)) : null; res.metodoSol = 'Comparación de métodos'; res.estado = res.gap != null && res.gap < 1e-6 ? 'óptimo' : (mejor.estado || 'mejor solución encontrada'); res.seg = (performance.now() - t0) / 1000; return res;
  }
  const r = Heur.resolver(I, o.algo, { tiempo: o.tiempo, semilla: o.semilla, params: o.params, inicial: o.inicial, progreso: prog, parar });
  if (parado) r.estado = 'detenido por el usuario (' + (r.factible ? 'mejor solución encontrada' : 'sin solución factible') + ')';
  if (o.cota && r.factible && !(I.f && I.f.mode === 'split')) { ctx.log('Calculando la cota inferior con el modelo matemático (' + (o.tiempoCota || 8) + ' s)…'); const b = await cotaExacta(o.tiempoCota || 8);
    if (b.cota != null && b.rutas && b.rutas.length || (b.cota != null && isFinite(b.cota))) { conGap(r, Math.min(b.cota, r.objetivo), b.rutas && b.rutas.length ? b.objetivo : null); if (b.rutas && b.rutas.length && b.objetivo < r.objetivo - 1e-9) r.mejorExacto = b; if (r.gap !== null && r.gap < 1e-6 && !parado) r.estado = 'óptimo (coincide con la cota)'; } }
  return r;
}

onmessage = async (e) => {
  const d = e.data;
  try {
    if (d.tipo === 'iniciar') {
      motor = null; let detalleWasm = '';
      if (d.motor !== 'servidor') {
        try { await iniciarWasm(); motor = 'wasm'; } catch (err) { detalleWasm = String(err && err.message || err); highsP = null; }
      }
      if (!motor) {
        const r = xhr('/api/estado', {});
        if (r.codigo === 200 && JSON.parse(r.texto).highspy) motor = 'servidor';
        else { postMessage({ tipo: 'listo', motor: null, detalle: detalleWasm || 'WebAssembly no disponible', puedeInstalar: r.codigo === 200 }); return; }
      }
      postMessage({ tipo: 'listo', motor, detalle: detalleWasm });
    } else if (d.tipo === 'resolver') {
      detenido = false; corrida = { t0: performance.now() };
      const ctx = { log: (s) => postMessage({ tipo: 'log', s }), solve: resolverLP, detenido: () => detenido };
      let res;
      switch (d.kind) {
        case 'tsp': res = await Solver.tsp(d.D, ctx, d.opt); break;
        case 'mtsp': res = await Solver.mtsp(d.D, ctx, d.opt); break;
        case 'camino': res = await Solver.camino(d.D, ctx, d.opt); break;
        case 'desde': res = await Solver.caminosDesde(d.D, ctx, d.opt); break;
        case 'arbol': res = await Solver.arbol(d.D, ctx, d.opt); break;
        case 'flujomax': res = await Solver.flujoMax(d.D, d.cap, ctx, d.opt); break;
        case 'flujocosto': res = await Solver.flujoCosto(d.D, d.cap, ctx, d.opt); break;
        case 'cartero': res = await Solver.cartero(d.D, ctx, d.opt); break;
        case 'ubicar': res = await Solver.ubicar(d.dist, ctx, d.opt); break;
        case 'ubicarruta': res = await Solver.ubicarRuta(d.opt, ctx); break;
        case 'flota': res = await Solver.flota(d.D, ctx, d.opt); break;
        case 'cvrp': res = await Solver.cvrp(d.D, ctx, d.opt); break;
        case 'libre': res = await Solver.modeloLibre(d.lp, ctx, d.opt); break;
        case 'vrp': res = await correrVrp(d, ctx); break;
        default: throw new Error('Problema desconocido: ' + d.kind);
      }
      postMessage({ tipo: 'fin', id: d.id, res });
    }
  } catch (err) { postMessage({ tipo: 'error', id: d.id, msg: String(err && err.message || err) }); }
};
