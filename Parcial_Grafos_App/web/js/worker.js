/* Worker: ejecuta los modelos de optimización sin congelar la interfaz.
   Motor 1: HiGHS (WebAssembly, dentro del navegador). Motor 2: HiGHS de Python vía el servidor local. */
importScripts('../vendor/highs.js', 'solver.js');
let motor = null, highsP = null;

function adaptar(r) {
  const st = r.Status, cols = r.Columns || {}, k0 = Object.keys(cols)[0];
  const tiene = k0 !== undefined && cols[k0].Primal !== undefined;
  const status = st === 'Optimal' ? 'óptimo' : st === 'Infeasible' ? 'infactible'
    : st === 'Time limit reached' ? 'límite de tiempo (mejor solución encontrada, no probada óptima)' : st;
  const ok = (st === 'Optimal' || st === 'Time limit reached') && tiene && isFinite(r.ObjectiveValue);
  return { ok, status, obj: r.ObjectiveValue, gap: st === 'Optimal' ? 0 : null, val: (n) => (cols[n] ? cols[n].Primal : 0) };
}

async function iniciarWasm() {
  if (!highsP) highsP = Module({ locateFile: (f) => new URL('../vendor/' + f, self.location.href).href });
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

async function resolverLP(lp, o) {
  if (motor === 'wasm') {
    const h = await highsP;
    return adaptar(h.solve(lp, { time_limit: o.timeLimit, mip_rel_gap: o.gap, output_flag: false }));
  }
  const r = xhr('/api/solve', { lp, tl: o.timeLimit, gap: o.gap });
  if (r.codigo !== 200) throw new Error('El solver del servidor no respondió (' + r.codigo + ')');
  return adaptar(JSON.parse(r.texto));
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
      const ctx = { log: (s) => postMessage({ tipo: 'log', s }), solve: resolverLP };
      let res;
      switch (d.kind) {
        case 'tsp': res = await Solver.tsp(d.D, ctx, d.opt); break;
        case 'mtsp': res = await Solver.mtsp(d.D, ctx, d.opt); break;
        case 'camino': res = await Solver.camino(d.D, ctx, d.opt); break;
        case 'desde': res = await Solver.caminosDesde(d.D, ctx, d.opt); break;
        case 'arbol': res = await Solver.arbol(d.D, ctx, d.opt); break;
        default: throw new Error('Problema desconocido: ' + d.kind);
      }
      postMessage({ tipo: 'fin', id: d.id, res });
    }
  } catch (err) { postMessage({ tipo: 'error', id: d.id, msg: String(err && err.message || err) }); }
};
