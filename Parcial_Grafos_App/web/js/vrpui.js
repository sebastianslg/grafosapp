/* Interfaz del VRP: 27 variantes, método de solución (modelo matemático / heurística / metaheurística / comparar),
   resultado con brecha (gap), convergencia, comparación y exportación a GAMS. */
(function () {
  'use strict';
  const { S, $, esc, fmt, corto, nodo, COL } = window.App;
  const Va = window.Variantes, H = window.Heur;
  const METODOS = [['exacto', 'Modelo matemático (exacto)'], ['heur', 'Heurística'], ['meta', 'Metaheurística'], ['comparar', 'Comparar todos los métodos']];
  const ALGO = {
    heur: Object.entries(H.ALGORITMOS).filter(([, a]) => a.tipo === 'heuristica'), meta: Object.entries(H.ALGORITMOS).filter(([, a]) => a.tipo === 'meta'),
  };
  const DESC_ALGO = { vecino: 'Va siempre al cliente más cercano que respeta las restricciones.', ahorros: 'Une rutas por mayor ahorro s = c₀ᵢ + c₀ⱼ − cᵢⱼ.', barrido: 'Ordena los clientes por ángulo y llena vehículos (necesita coordenadas).', insercion: 'Inserta cada cliente donde menos aumenta el costo.', vnd: 'Inserción + descenso por relocate, swap y 2-opt.', sa: 'Acepta empeoramientos con probabilidad e^(−Δ/T), enfriando T.', tabu: 'Mejor vecino no prohibido; lista tabú con aspiración.', ga: 'Población de permutaciones, cruce OX, mutación y elitismo.', aco: 'Hormigas construyen rutas guiadas por feromona τ y cercanía η.', grasp: 'Construcción voraz aleatorizada + búsqueda local, repetida.', vns: 'Agita la solución y cambia de vecindario al estancarse.' };

  function montar() {
    if ($('vrpVar')) return;
    const fam = []; Va.VARIANTES.forEach((v) => { let g = fam.find((x) => x[0] === v.fam); if (!g) fam.push((g = [v.fam, []])); g[1].push(v); });
    const filas = document.createElement('div');
    filas.innerHTML = `<div class="fila" data-c="vrpvar"><label class="campo">Variante del VRP (${Va.VARIANTES.length} modelos)<select id="vrpVar">${fam.map(([g, l]) => `<optgroup label="${g}">${l.map((v) => `<option value="${v.id}">${esc(v.nombre)}</option>`).join('')}</optgroup>`).join('')}</select></label></div>
      <p class="nota" id="vrpDesc" data-c="vrpvar" style="margin:-4px 0 10px"></p>
      <div class="fila" data-c="vrpmetodo"><label class="campo">Cómo resolver<select id="vrpMetodo">${METODOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label><label class="campo" id="vrpAlgoF">Algoritmo<select id="vrpAlgo"></select></label></div>
      <p class="nota" id="vrpAlgoDesc" data-c="vrpmetodo" style="margin:-4px 0 10px"></p>
      <div class="fila" data-c="vrpparams"><label class="campo" data-v="m">Vehículos<input id="vrpM" type="number" min="1" max="12" placeholder="de la flota"></label><label class="campo" data-v="L">Distancia máx. L<input id="vrpL" type="number" min="0" placeholder="automática"></label><label class="campo" data-v="P">Máx. clientes/ruta<input id="vrpP" type="number" min="0" placeholder="automático"></label><label class="campo" data-v="sem">Semilla<input id="vrpSem" type="number" value="1"></label></div>
      <div class="fila" data-c="vrpparams"><label class="check" data-v="cota"><input type="checkbox" id="vrpCota" checked> Calcular cota inferior para el gap</label><label class="campo" data-v="cota">Tiempo para la cota (s)<input id="vrpTc" type="number" min="2" value="8"></label></div>`;
    const ref = $('tiempo').closest('.fila'); [...filas.children].forEach((e) => ref.before(e));
    $('vrpMetodo').onchange = refrescar; $('vrpVar').onchange = () => { refrescar(); if (S.panel === 'nodos') App.renderPanel(); }; $('vrpAlgo').onchange = refrescar;
    refrescar();
  }
  function refrescar() {
    if (!$('vrpVar')) return; const v = Va.porId[$('vrpVar').value], met = $('vrpMetodo').value;
    $('vrpDesc').innerHTML = `<b>${esc(v.fam)}</b> · ${esc(v.desc)}${v.id === 'sdvrp' ? ' <span style="color:var(--warning)">Solo con modelo matemático.</span>' : ''}`;
    const sel = $('vrpAlgo'), lista = ALGO[met] || [], prev = sel.value; sel.innerHTML = lista.map(([k, a]) => `<option value="${k}">${esc(a.nombre)}</option>`).join(''); if (lista.some(([k]) => k === prev)) sel.value = prev;
    $('vrpAlgoF').classList.toggle('oculto', !lista.length);
    $('vrpAlgoDesc').textContent = met === 'exacto' ? 'Resuelve las fórmulas del curso (MILP) con HiGHS; si llega al límite de tiempo informa la brecha.' : met === 'comparar' ? 'Ejecuta el modelo matemático, 5 heurísticas y 6 metaheurísticas y compara costo, tiempo y brecha.' : (DESC_ALGO[sel.value] || '');
    document.querySelectorAll('#cProblema [data-v]').forEach((el) => { const k = el.dataset.v; const mostrar = k === 'm' ? !v.mixta && !v.m : k === 'L' ? !!v.lmaxDist : k === 'P' ? !!v.paradas : k === 'sem' ? met === 'meta' || met === 'comparar' : k === 'cota' ? met === 'heur' || met === 'meta' : true; el.classList.toggle('oculto', !mostrar); });
    const tl = $('tiempo'); if (tl) tl.closest('.fila').classList.toggle('oculto', met === 'heur' && false);
  }
  App.vrpInfo = () => { if (!$('problema') || $('problema').value !== 'vrp' || !$('vrpVar')) return null; const v = Va.porId[$('vrpVar').value]; return { vt: !!v.vt, cols: [v.f && (v.f.mode === 'backhaul' || v.f.mode === 'spd') ? 'rec' : null, v.f && v.f.mode === 'pd' ? 'par' : null, v.opcional ? 'premio' : null, v.f && v.f.locDepot ? 'costoApertura' : null].filter(Boolean), v }; };

  function proyeccion() { const ns = S.ds.nodos, la0 = ns.reduce((a, n) => a + n.lat, 0) / Math.max(1, ns.length), c = Math.cos(la0 * Math.PI / 180); return ns.map((n) => [n.lon * 111.32 * c, n.lat * 110.574]); }
  function parametros() {
    const ds = S.ds, v = Va.porId[$('vrpVar').value], met = $('vrpMetodo').value, tiempo = $('sinLimite') && $('sinLimite').checked ? 1e9 : Math.max(5, +$('tiempo').value || 120);
    if (ds.nodos.length < 3) return App.aviso('Agregue nodos primero.');
    if (v.id === 'sdvrp' && met !== 'exacto') return App.aviso('La entrega dividida (SDVRP) solo se resuelve con el modelo matemático.');
    const p = { origen: +$('origen').value, m: +$('vrpM').value || 0, Lmax: +$('vrpL').value || 0, lstops: +$('vrpP').value || 0, xy: proyeccion() };
    let c; try { c = Va.construir(v.id, { D: ds.D, nodos: ds.nodos, flota: ds.flota, vt: ds.vt }, p); } catch (e) { return App.aviso(e.message); }
    const I = c.I; if (I.veh.length > 10 && met === 'exacto') c.notas.push('Muchos vehículos (' + I.veh.length + '): el modelo exacto puede tardar; use «Vehículos» para reducirlos.');
    const algo = $('vrpAlgo').value, nombreMet = METODOS.find((x) => x[0] === met)[1];
    const opt = { metodoSol: met, algo, tiempo: met === 'meta' || met === 'exacto' ? tiempo : Math.min(tiempo, 20), semilla: +$('vrpSem').value || 1, cota: $('vrpCota').checked, tiempoCota: Math.max(2, +$('vrpTc').value || 8), tiempoMeta: Math.max(1, Math.min(10, tiempo / 12)), brecha: 1e-6, metodo: ds.metodo };
    const tit = v.nombre + ' · ' + (met === 'heur' || met === 'meta' ? H.ALGORITMOS[algo].nombre : nombreMet);
    if (c.notas.length) { $('log').classList.remove('oculto'); $('log').textContent = c.notas.map((x) => 'ℹ ' + x).join('\n') + '\n'; }
    return { kind: 'vrp', opt, datos: { I }, extra: { I, variante: v.id, notas: c.notas }, titulo: tit, keepLog: true };
  }
  const svgConv = (hist, u) => {
    if (!hist || hist.length < 2) return ''; const W = 330, Hh = 90, xs = hist.map((p) => p[0]), ys = hist.map((p) => p[1]), x0 = 0, x1 = Math.max(...xs, 0.01), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const X = (t) => 8 + (t - x0) / (x1 - x0 || 1) * (W - 16), Y = (f) => 8 + (1 - (f - y0) / (y1 - y0 || 1)) * (Hh - 24);
    let d = ''; hist.forEach((p, i) => { d += (i ? ` H${X(p[0]).toFixed(1)} V${Y(p[1]).toFixed(1)}` : `M${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`); }); d += ` H${W - 8}`;
    return `<div class="conv"><div class="nota">Convergencia: mejor costo en el tiempo (de ${fmt(y1, 1)} a ${fmt(y0, 1)} ${u})</div><svg viewBox="0 0 ${W} ${Hh}" width="100%"><path d="${d}" fill="none" stroke="var(--sys-blue)" stroke-width="2.2" stroke-linejoin="round"/><text x="8" y="${Hh - 4}" font-size="9" fill="currentColor" opacity=".6">0 s</text><text x="${W - 8}" y="${Hh - 4}" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">${fmt(x1, 1)} s</text></svg></div>`;
  };
  function resultado(r, x, u, kpis, estadoKpi) {
    const I = r.extra.I, f = I.f || {}, pc = (g) => (g == null || !isFinite(g) ? 'n/d' : (x.estado && String(x.estado).startsWith('óptimo') ? '0 %' : (g * 100).toFixed(2) + ' %'));
    const items = [estadoKpi(x), [fmt(x.objetivo, 2) + (f.obj === 'profit' || f.obj === 'top' ? '' : ' ' + u), f.obj === 'profit' ? 'Función objetivo (costo − premio)' : f.obj === 'top' ? 'Función objetivo (−premio)' : f.objetivo === 'maximo' ? 'Ruta más larga (+ε·costo)' : 'Función objetivo (costo)'], [pc(x.gap), 'Brecha (gap)']];
    if (x.cota != null && isFinite(x.cota)) items.push([fmt(x.cota, 2), 'Mejor cota (óptimo ≥)']);
    items.push([x.metodoSol || '', 'Método'], [fmt(x.seg || 0, 2) + ' s', 'Tiempo de cálculo']);
    let h = kpis(items);
    if (x.exactoRef != null && isFinite(x.exactoRef)) h += `<p class="nota">El modelo matemático (cota, ${r.opt.tiempoCota || 8} s) halló una solución de ${fmt(x.exactoRef, 2)}.</p>`;
    if (x.mejorExacto) h += `<div class="aviso">El modelo matemático encontró una solución mejor (${fmt(x.mejorExacto.objetivo, 2)}). Use «Modelo matemático» para verla.</div>`;
    if (I.optional && x.noVisitados && x.noVisitados.length) h += `<p class="nota"><b>Clientes no visitados</b> (no rentables o fuera del alcance): ${x.noVisitados.map((i) => esc(corto(i))).join(', ')}. Premio recogido: ${fmt(x.premio, 2)}.</p>`;
    if (x.abiertos) h += `<p class="nota"><b>Depósitos abiertos:</b> ${x.abiertos.map((d) => esc(corto(d) + ' ' + nodo(d).nombre)).join(', ')}</p>`;
    if (x.estado && String(x.estado).startsWith('sin solución')) h += `<div class="aviso error">No se halló una solución factible con este método. Pruebe otro algoritmo, más tiempo o el modelo matemático.</div>`;
    if (x.comparacion) {
      const mejor = Math.min(...x.comparacion.filter((c) => c.factible).map((c) => c.obj));
      h += `<h3 style="font-size:15px;margin:10px 0 6px">Comparación de métodos</h3><table><tr><th>Método</th><th>Tipo</th><th>Objetivo</th><th>Gap</th><th>s</th></tr>` + x.comparacion.map((c) => `<tr class="${c.factible && Math.abs(c.obj - mejor) < 1e-9 ? 'activa' : ''}"><td>${esc(c.metodo)}</td><td>${c.tipo === 'exacto' ? 'Exacto' : c.tipo === 'meta' ? 'Meta' : 'Heur.'}</td><td class="tabular">${c.factible ? fmt(c.obj, 2) : '—'}</td><td class="tabular">${c.gap == null ? (c.gapProp != null ? (c.gapProp * 100).toFixed(2) + ' %' : 'n/d') : (c.gap * 100).toFixed(2) + ' %'}</td><td class="tabular">${fmt(c.seg, 1)}</td></tr>`).join('') + `</table><p class="nota">Gap = (objetivo − mejor cota) / objetivo. Resaltado: la mejor solución, que es la que se dibuja.</p>`;
    }
    h += svgConv(x.historial, u);
    const multi = x.info && x.info.some((q) => q.depot !== x.info[0].depot);
    if (x.rutas && x.rutas.length) {
      h += `<table><tr><th>Ruta</th><th>Vehículo</th><th>Recorrido</th><th>Carga</th><th>${u}</th><th>Costo</th></tr>` + x.rutas.map((ru, k) => `<tr class="clic ${k === S.rutaSel ? 'activa' : ''}" data-k="${k}"><td><span class="punto" style="background:${COL[k % COL.length]}"></span>${k + 1}</td><td>${esc(x.info[k].tipo)}${multi ? ' · ' + esc(corto(x.info[k].depot)) : ''}</td><td class="recorrido">${ru.map((v) => `<span title="${esc(nodo(v).nombre)}">${esc(corto(v))}</span>`).join(' → ')}</td><td class="tabular">${fmt(x.info[k].carga, 0)}${isFinite(x.info[k].cap) ? '/' + fmt(x.info[k].cap, 0) : ''}</td><td class="tabular">${fmt(x.dists[k], 2)}</td><td class="tabular">${fmt(x.info[k].costo, 2)}</td></tr>`).join('') + '</table>';
      const k = Math.min(S.rutaSel || 0, x.rutas.length - 1); h += `<div class="sep"></div><h3 style="font-size:15px;margin-bottom:6px">Detalle · ruta ${k + 1}</h3>` + App.pasos(x.rutas[k], x.info[k].llegadas);
    }
    h += `<div class="sep"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec mini" data-e="gams">Código GAMS (.gms)</button><button class="btn sec mini" data-e="lp">Modelo LP (.lp)</button></div>`;
    return h;
  }
  function descargar(nombre, texto) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
  App.exportarVrp = (tipo) => {
    const r = S.res; if (!r || r.kind !== 'vrp') return false; const I = r.extra.I, id = r.extra.variante;
    if (tipo === 'gams') descargar('vrp_' + id + '.gms', window.Gams.generar(I, Va.porId[id].nombre)); else if (tipo === 'lp') {
      const m = new window.Solver.Model(); void m; descargar('vrp_' + id + '.txt', '* El modelo LP exacto se genera dentro del solver; use el código GAMS para ver las ecuaciones.\n' + window.Gams.generar(I, Va.porId[id].nombre));
    } else return false; return true;
  };
  window.VrpUi = { montar, refrescar, parametros, resultado };
})();
