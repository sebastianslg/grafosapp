/* Interfaz del VRP: 34 variantes, método de solución (modelo matemático / heurística / metaheurística / comparar),
   resultado con brecha (gap), convergencia, comparación y exportación a GAMS. */
(function () {
  'use strict';
  const { S, $, esc, fmt, corto, nodo, COL } = window.App;
  const Va = window.Variantes, H = window.Heur;
  /* Solo optimización: el modelo matemático es la solución. Las heurísticas y metaheurísticas se usan como referencia (comparación). */
  const METODOS = [['exacto', 'Modelo matemático (exacto)'], ['comparar', 'Comparar con heurísticas (referencia)']];
  const ALGO = {
    heur: Object.entries(H.ALGORITMOS).filter(([, a]) => a.tipo === 'heuristica'), meta: Object.entries(H.ALGORITMOS).filter(([, a]) => a.tipo === 'meta'),
  };
  const DESC_ALGO = { vecino: 'Va siempre al cliente más cercano que respeta las restricciones.', ahorros: 'Une rutas por mayor ahorro s = c₀ᵢ + c₀ⱼ − cᵢⱼ.', barrido: 'Ordena los clientes por ángulo y llena vehículos (necesita coordenadas).', insercion: 'Inserta cada cliente donde menos aumenta el costo.', vnd: 'Inserción + descenso por relocate, swap y 2-opt.', sa: 'Acepta empeoramientos con probabilidad e^(−Δ/T), enfriando T.', tabu: 'Mejor vecino no prohibido; lista tabú con aspiración.', ga: 'Población de permutaciones, cruce OX, mutación y elitismo.', aco: 'Hormigas construyen rutas guiadas por feromona τ y cercanía η.', grasp: 'Construcción voraz aleatorizada + búsqueda local, repetida.', vns: 'Agita la solución y cambia de vecindario al estancarse.', ils: 'Perturba la mejor solución y vuelve a aplicar búsqueda local.', lns: 'Quita una parte de los clientes y los reinserta de la forma más barata.' };

  function montar() {
    if ($('vrpVar')) return;
    const fam = []; Va.VARIANTES.forEach((v) => { let g = fam.find((x) => x[0] === v.fam); if (!g) fam.push((g = [v.fam, []])); g[1].push(v); });
    const filas = document.createElement('div');
    filas.innerHTML = `<div class="fila" data-c="vrpvar"><label class="campo">Variante del VRP (${Va.VARIANTES.length} modelos)<select id="vrpVar">${fam.map(([g, l]) => `<optgroup label="${g}">${l.map((v) => `<option value="${v.id}">${esc(v.nombre)}</option>`).join('')}</optgroup>`).join('')}</select></label></div>
      <p class="nota" id="vrpDesc" data-c="vrpvar" style="margin:-4px 0 10px"></p>
      <div class="fila" data-c="vrpmetodo"><label class="campo">Cómo resolver<select id="vrpMetodo">${METODOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label><label class="campo" id="vrpAlgoF">Algoritmo<select id="vrpAlgo"></select></label></div>
      <p class="nota" id="vrpAlgoDesc" data-c="vrpmetodo" style="margin:-4px 0 10px"></p>
      <div class="fila" data-c="vrpparams"><label class="campo" data-v="m">Vehículos<input id="vrpM" type="number" min="1" max="12" placeholder="de la flota"></label><label class="campo" data-v="L">Distancia máx. L<input id="vrpL" type="number" min="0" placeholder="automática"></label><label class="campo" data-v="P">Máx. clientes/ruta<input id="vrpP" type="number" min="0" placeholder="automático"></label><label class="campo" data-v="sem">Semilla<input id="vrpSem" type="number" value="1"></label></div>
      <div class="fila" data-c="vrpparams"><label class="campo" data-v="T">Jornada máx. por ruta (h)<input id="vrpT" type="number" min="0" step="0.5" placeholder="automática"></label><label class="campo" data-v="pen">Penalización por hora de retraso<input id="vrpPen" type="number" min="0" placeholder="automática"></label></div>
      <div class="fila" data-c="vrpparams"><label class="check" data-v="cota"><input type="checkbox" id="vrpCota" checked> Calcular cota inferior para el gap</label><label class="campo" data-v="cota">Tiempo para la cota (s)<input id="vrpTc" type="number" min="2" value="8"></label></div>`;
    const ref = $('tiempo').closest('.fila'); [...filas.children].forEach((e) => ref.before(e));
    $('vrpMetodo').onchange = refrescar; $('vrpVar').onchange = () => { refrescar(); if (['nodos', 'modelo', 'graficas'].includes(S.panel)) App.renderPanel(); }; $('vrpAlgo').onchange = refrescar;
    refrescar();
  }
  function refrescar() {
    if (!$('vrpVar')) return; const v = Va.porId[$('vrpVar').value], met = $('vrpMetodo').value;
    $('vrpDesc').innerHTML = `<b>${esc(v.fam)}</b> · ${esc(v.desc)} <i>(en inglés: ${esc(v.en)})</i>`;
    const sel = $('vrpAlgo'), lista = ALGO[met] || [], prev = sel.value; sel.innerHTML = lista.map(([k, a]) => `<option value="${k}">${esc(a.nombre)}</option>`).join(''); if (lista.some(([k]) => k === prev)) sel.value = prev;
    $('vrpAlgoF').classList.toggle('oculto', !lista.length);
    $('vrpAlgoDesc').textContent = met === 'exacto' ? 'Resuelve las fórmulas del curso (MILP) con HiGHS; si llega al límite de tiempo informa la brecha.' : met === 'comparar' ? 'El modelo matemático da la solución óptima. Las heurísticas y metaheurísticas se ejecutan solo para comparar: cada una muestra su brecha frente al óptimo.' : (DESC_ALGO[sel.value] || '');
    document.querySelectorAll('#cProblema [data-v]').forEach((el) => { const k = el.dataset.v; const mostrar = k === 'm' ? !v.mixta && !v.m : k === 'L' ? !!v.lmaxDist : k === 'P' ? !!v.paradas : k === 'sem' ? met === 'meta' || met === 'comparar' : k === 'cota' ? met === 'heur' || met === 'meta' : k === 'T' ? !!v.jornada : k === 'pen' ? !!v.blandas : true; el.classList.toggle('oculto', !mostrar); });
    const tl = $('tiempo'); if (tl) tl.closest('.fila').classList.toggle('oculto', met === 'heur' && false);
    /* la eliminación de subtours (MTZ / DFJ) solo afecta al modelo matemático */
    const fm = document.querySelector('#cProblema [data-c="metodo"]'); if (fm) fm.classList.toggle('oculto', met !== 'exacto');
  }
  App.vrpInfo = () => { if (!$('problema') || $('problema').value !== 'vrp' || !$('vrpVar')) return null; const v = Va.porId[$('vrpVar').value]; return { vt: !!v.vt, cols: [v.f && (v.f.mode === 'backhaul' || v.f.mode === 'spd') ? 'rec' : null, v.f && v.f.mode === 'pd' ? 'par' : null, v.opcional ? 'premio' : null, v.f && v.f.locDepot ? 'costoApertura' : null].filter(Boolean), v }; };

  function proyeccion() { const ns = S.ds.nodos, la0 = ns.reduce((a, n) => a + n.lat, 0) / Math.max(1, ns.length), c = Math.cos(la0 * Math.PI / 180); return ns.map((n) => [n.lon * 111.32 * c, n.lat * 110.574]); }
  function parametros() {
    const ds = S.ds, v = Va.porId[$('vrpVar').value], met = $('vrpMetodo').value, tiempo = $('sinLimite') && $('sinLimite').checked ? 1e9 : App.num($('tiempo').value, 120, 5, 1e7);
    if (ds.nodos.length < 3) return App.aviso('Agregue nodos primero.');
    const p = { origen: +$('origen').value, m: Math.round(App.num($('vrpM').value, 0, 0, 30)), Lmax: App.num($('vrpL').value, 0, 0, 1e12), lstops: Math.round(App.num($('vrpP').value, 0, 0, 1e4)), xy: proyeccion() };
    extraParams(p);
    let c; try { c = Va.construir(v.id, { D: ds.D, nodos: ds.nodos, flota: ds.flota, vt: ds.vt }, p); } catch (e) { return App.aviso(e.message); }
    const I = c.I; if (I.veh.length > 10 && met === 'exacto') c.notas.push('Muchos vehículos (' + I.veh.length + '): el modelo exacto puede tardar; use «Vehículos» para reducirlos.');
    if (met === 'exacto' && I.cust.length >= 40) { const aplica = window.Vrp && Vrp.arcoAplica && Vrp.arcoAplica(I); c.notas.push('Modelo grande: ' + I.cust.length + ' clientes. ' + (aplica ? 'Se usa la formulación de dos índices con cortes de capacidad (más ajustada que la de vehículo-arco). ' : '') + 'Primero se muestra una solución heurística con su brecha; el modelo la mejora en etapas. Puede parar en cualquier momento («Parar y ver lo mejor») y verá el tiempo estimado y la brecha.'); }
    if (met === 'exacto' && ds.metodo === 'arco' && !(window.Vrp && Vrp.arcoAplica && Vrp.arcoAplica(I))) c.notas.push('La formulación de dos índices solo aplica a flota homogénea sin ventanas, sin depósitos múltiples ni recogidas; se usa MTZ.');
    const algo = $('vrpAlgo').value, nombreMet = METODOS.find((x) => x[0] === met)[1];
    const metodoSub = ds.metodoElegido || I.cust.length < 40 ? ds.metodo : 'arco';   // con 40 o más clientes, dos índices salvo que el usuario elija otro
    const opt = { metodoSol: met, algo, tiempo: met === 'meta' || met === 'exacto' ? tiempo : Math.min(tiempo, 20), semilla: Math.round(App.num($('vrpSem').value, 1, 1, 1e9)), cota: $('vrpCota').checked, tiempoCota: App.num($('vrpTc').value, 8, 2, 3600), tiempoMeta: Math.max(1, Math.min(10, tiempo / 12)), brecha: 1e-6, metodo: metodoSub };
    const tit = v.nombre + ' · ' + (met === 'heur' || met === 'meta' ? H.ALGORITMOS[algo].nombre : nombreMet);
    if (c.notas.length) { $('log').classList.remove('oculto'); $('log').textContent = c.notas.map((x) => 'ℹ ' + x).join('\n') + '\n'; }
    return { kind: 'vrp', opt, datos: { I }, extra: { I, variante: v.id, notas: c.notas }, titulo: tit, keepLog: true };
  }
  function extraParams(p) { p.tmax = App.num($('vrpT') && $('vrpT').value, 0, 0, 1e4); p.pen = App.num($('vrpPen') && $('vrpPen').value, 0, 0, 1e9); return p; }
  /* datos base de la variante elegida (para el análisis de sensibilidad) */
  function base() {
    const ds = S.ds; if (!$('vrpVar') || ds.nodos.length < 3) { App.aviso('Agregue nodos primero.'); return null; } const v = Va.porId[$('vrpVar').value];
    if (v.id === 'sdvrp' || (v.f && v.f.minVeh)) { /* también se puede: se resuelve con el modelo matemático */ }
    const p = { origen: +$('origen').value, m: Math.round(App.num($('vrpM').value, 0, 0, 30)), Lmax: App.num($('vrpL').value, 0, 0, 1e12), lstops: Math.round(App.num($('vrpP').value, 0, 0, 1e4)), xy: proyeccion() };
    extraParams(p);
    return { v, p, S: { D: ds.D, nodos: ds.nodos, flota: ds.flota, vt: ds.vt } };
  }
  const svgConv = (hist, u) => {
    if (!hist || hist.length < 2) return ''; const W = 330, Hh = 90, xs = hist.map((p) => p[0]), ys = hist.map((p) => p[1]), x0 = 0, x1 = Math.max(...xs, 0.01), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const X = (t) => 8 + (t - x0) / (x1 - x0 || 1) * (W - 16), Y = (f) => 8 + (1 - (f - y0) / (y1 - y0 || 1)) * (Hh - 24);
    let d = ''; hist.forEach((p, i) => { d += (i ? ` H${X(p[0]).toFixed(1)} V${Y(p[1]).toFixed(1)}` : `M${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`); }); d += ` H${W - 8}`;
    return `<div class="conv"><div class="nota">Convergencia: mejor costo en el tiempo (de ${fmt(y1, 1)} a ${fmt(y0, 1)} ${u})</div><svg viewBox="0 0 ${W} ${Hh}" width="100%"><path d="${d}" fill="none" stroke="var(--sys-blue)" stroke-width="2.2" stroke-linejoin="round"/><text x="8" y="${Hh - 4}" font-size="9" fill="currentColor" opacity=".6">0 s</text><text x="${W - 8}" y="${Hh - 4}" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">${fmt(x1, 1)} s</text></svg></div>`;
  };
  function resultado(r, x, u, kpis, estadoKpi) {
    const I = r.extra.I, f = I.f || {}, pc = (g) => (g == null || !isFinite(g) ? 'n/d' : (x.estado && String(x.estado).startsWith('óptimo') ? '0 %' : fmt(g * 100, 2) + ' %'));
    const items = [estadoKpi(x), [fmt(x.objetivo, 2) + (f.obj === 'profit' || f.obj === 'top' ? '' : ' ' + u), f.obj === 'profit' ? 'Función objetivo (costo − premio)' : f.obj === 'top' ? 'Función objetivo (−premio)' : f.obj === 'latencia' ? 'Función objetivo (Σ llegadas en h + 0,001·costo)' : f.objetivo === 'maximo' ? 'Ruta más larga (+ε·costo)' : f.blandas ? 'Función objetivo (costo + retrasos)' : 'Función objetivo (costo)'], [pc(x.gap), 'Brecha (gap)']];
    if (x.latencia != null && isFinite(x.latencia)) items.push([fmt(x.latencia, 2) + ' h', 'Suma de las horas de llegada']);
    if (x.retraso != null && isFinite(x.retraso)) items.push([fmt(x.retraso * 60, 0) + ' min', 'Retraso total' + (x.tarde && x.tarde.length ? ' (' + x.tarde.length + ' cliente' + (x.tarde.length > 1 ? 's' : '') + ')' : '')]);
    if (x.cota != null && isFinite(x.cota)) items.push([fmt(x.cota, 2), 'Mejor cota (óptimo ≥)']);
    if (x.flota) items.push([x.flota + ' vehículos', 'Flota mínima (fase 1)']);
    items.push([x.metodoSol || '', 'Método', 'texto'], [fmt(x.seg || 0, 2) + ' s', 'Tiempo de cálculo']);
    let h = kpis(items);
    if (x.avisos && x.avisos.length) h += x.avisos.map((a) => `<p class="nota">ℹ ${esc(a)}</p>`).join('');
    if (x.informe) { const q = x.informe; h += `<details class="nota" open><summary><b>Informe de la corrida</b></summary><table><tr><th>Concepto</th><th>Valor</th></tr>` + [['Modelo', q.modelo], ['Estado', q.estado], ['Objetivo', q.objetivo != null ? fmt(q.objetivo, 4) : '—'], ['Mejor cota inferior', q.cota != null && isFinite(q.cota) ? fmt(q.cota, 4) : '—'], ['Brecha (gap)', q.gap != null && isFinite(q.gap) ? fmt(q.gap * 100, 3) + ' %' : '—'], ['Variables (binarias)', q.variables + ' (' + q.binarias + ')'], ['Restricciones', q.restricciones], ['Cortes de subtours', q.cortes], ['Rutas', q.rutas], ...(q.vehiculos != null ? [['Vehículos', q.vehiculos]] : []), ['Tiempo', fmt(q.tiempo, 2) + ' s (límite ' + q.tiempoLimite + ' s)']].map(([a, b]) => `<tr><td>${esc(a)}</td><td class="tabular">${esc(String(b))}</td></tr>`).join('') + `</table></details>`; }
    if (x.exactoRef != null && isFinite(x.exactoRef)) h += `<p class="nota">El modelo matemático (cota, ${r.opt.tiempoCota || 8} s) halló una solución de ${fmt(x.exactoRef, 2)}.</p>`;
    if (x.mejorExacto) h += `<div class="aviso">El modelo matemático encontró una solución mejor (${fmt(x.mejorExacto.objetivo, 2)}). Use «Modelo matemático» para verla.</div>`;
    if (I.optional && x.noVisitados && x.noVisitados.length) h += `<p class="nota"><b>Clientes no visitados</b> (no rentables o fuera del alcance): ${x.noVisitados.map((i) => esc(corto(i))).join(', ')}. Premio recogido: ${fmt(x.premio, 2)}.</p>`;
    if (x.tarde && x.tarde.length) h += `<p class="nota"><b>Llegan tarde</b> (pagan penalización): ${x.tarde.map((i) => esc(corto(i))).join(', ')}.</p>`;
    if (x.abiertos) h += `<p class="nota"><b>Depósitos abiertos:</b> ${x.abiertos.map((d) => esc(corto(d) + ' ' + nodo(d).nombre)).join(', ')}</p>`;
    if (x.estado && String(x.estado).startsWith('sin solución')) h += `<div class="aviso error">No se halló una solución factible con este método. Pruebe otro algoritmo, más tiempo o el modelo matemático.</div>`;
    if (x.comparacion) {
      const mejor = Math.min(...x.comparacion.filter((c) => c.factible).map((c) => c.obj));
      const conVeh = x.comparacion.some((c) => c.veh != null);
      h += `<h3 style="font-size:15px;margin:10px 0 6px">Comparación de métodos</h3><table><tr><th>Método</th><th>Tipo</th><th>Objetivo</th>${conVeh ? '<th>Vehículos</th>' : ''}<th>Gap</th><th>s</th></tr>` + x.comparacion.map((c) => `<tr class="${c.factible && Math.abs(c.obj - mejor) < 1e-9 ? 'activa' : ''}"><td>${esc(c.metodo)}</td><td>${c.tipo === 'exacto' ? 'Exacto' : c.tipo === 'meta' ? 'Meta' : 'Heur.'}</td><td class="tabular">${c.factible ? fmt(c.obj, 2) : '—'}</td>${conVeh ? `<td class="tabular">${c.veh == null ? '—' : c.veh}</td>` : ''}<td class="tabular">${c.gap == null ? (c.gapProp != null ? fmt(c.gapProp * 100, 2) + ' %' : 'n/d') : fmt(c.gap * 100, 2) + ' %'}</td><td class="tabular">${fmt(c.seg, 1)}</td></tr>`).join('') + `</table><p class="nota">Gap = (objetivo − mejor cota) / objetivo. Resaltado: la mejor solución, que es la que se dibuja.</p>`;
    }
    h += svgConv(x.historial, u);
    const multi = x.info && x.info.some((q) => q.depot !== x.info[0].depot);
    if (x.rutas && x.rutas.length) {
      h += `<table><tr><th>Ruta</th><th>Vehículo</th><th>Recorrido</th><th>Carga</th><th>${u}</th><th>Costo</th></tr>` + x.rutas.map((ru, k) => `<tr class="clic ${k === S.rutaSel ? 'activa' : ''}" data-k="${k}"><td><span class="punto" style="background:${COL[k % COL.length]}"></span>${k + 1}</td><td>${esc(x.info[k].tipo)}${multi ? ' · ' + esc(corto(x.info[k].depot)) : ''}</td><td class="recorrido">${ru.map((v) => `<span title="${esc(nodo(v).nombre)}">${esc(corto(v))}</span>`).join(' → ')}</td><td class="tabular">${fmt(x.info[k].carga, 0)}${isFinite(x.info[k].cap) ? '/' + fmt(x.info[k].cap, 0) : ''}</td><td class="tabular">${fmt(x.dists[k], 2)}</td><td class="tabular">${fmt(x.info[k].costo, 2)}</td></tr>`).join('') + '</table>';
      const k = Math.min(S.rutaSel || 0, x.rutas.length - 1); h += `<div class="sep"></div><h3 style="font-size:15px;margin-bottom:6px">Detalle · ruta ${k + 1}</h3>` + App.pasos(x.rutas[k], x.info[k].llegadas);
    }
    h += `<div class="sep"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec mini" data-e="informe">Informe (imprimir o PDF)</button><button class="btn sec mini" data-e="gams">Código GAMS (.gms)</button><button class="btn sec mini" data-e="lp">Modelo LP (.lp)</button></div>`;
    return h;
  }
  function descargar(nombre, texto) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
  /* informe de la corrida: página sencilla para imprimir o guardar como PDF (sin datos de otros proyectos) */
  function informe(r) {
    const I = r.extra.I, x = r.res, u = S.ds.unidad, v = Va.porId[r.extra.variante], q = x.informe || {}, esc = App.esc, fecha = new Date().toLocaleString('es-CO');
    const filas = (x.rutas || []).map((ru, k) => `<tr><td>${k + 1}</td><td>${esc((x.info[k] && x.info[k].tipo) || '')}</td><td>${esc(ru.map((c) => corto(c)).join(' → '))}</td><td>${fmt(x.info[k] ? x.info[k].carga : 0, 1)}</td><td>${fmt(x.dists[k], 2)} ${u}</td></tr>`).join('');
    const pc = (g) => (g == null || !isFinite(g) ? 'n/d' : fmt(g * 100, 2) + ' %');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe · ${esc(v ? v.nombre : 'VRP')}</title>
      <style>body{font:14px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1c1e;margin:32px;max-width:820px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px}
      table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #d9d9de;padding:6px 8px;text-align:left;vertical-align:top}th{font-size:12px;color:#66666b;font-weight:600}
      .k{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.k div{background:#f2f2f7;border-radius:8px;padding:8px 10px}.k b{display:block;font-size:17px}.k span{font-size:11px;color:#66666b}
      .nota{color:#66666b;font-size:12px;margin-top:14px}@media print{body{margin:14mm}}</style></head><body>
      <h1>Informe de la corrida · ${esc(v ? v.nombre : 'VRP')}</h1>
      <div class="nota">Proyecto: ${esc(S.ds.titulo || '')} · Generado el ${esc(fecha)} · Parcial de Grafos (optimización exacta, HiGHS)</div>
      <h2>Resultado</h2>
      <div class="k"><div><b>${esc(String(x.estado || '').split(' (')[0])}</b><span>Estado</span></div><div><b>${fmt(x.objetivo, 2)} ${u}</b><span>Función objetivo</span></div><div><b>${pc(x.gap)}</b><span>Brecha frente a la cota</span></div><div><b>${x.cota != null && isFinite(x.cota) ? fmt(x.cota, 2) + ' ' + u : 'n/d'}</b><span>Mejor cota (límite teórico)</span></div></div>
      <p class="nota">${esc(x.estado || '')}</p>
      <h2>Datos del modelo</h2>
      <table><tr><th>Método</th><td>${esc(x.metodoSol || 'exacto')} · ${esc(q.modelo || '')}</td></tr><tr><th>Clientes</th><td>${I.cust.length}</td></tr><tr><th>Vehículos disponibles</th><td>${I.veh.length}</td></tr><tr><th>Tiempo de cálculo</th><td>${fmt(x.seg || 0, 2)} s (límite ${esc(String(q.tiempoLimite ?? '—'))} s)</td></tr><tr><th>Variables / binarias / restricciones</th><td>${esc(String(q.variables ?? '—'))} / ${esc(String(q.binarias ?? '—'))} / ${esc(String(q.restricciones ?? '—'))}</td></tr></table>
      <h2>Rutas</h2>
      <table><tr><th>Ruta</th><th>Vehículo</th><th>Recorrido (índices de nodo)</th><th>Carga</th><th>Distancia</th></tr>${filas}</table>
      <p class="nota">Índices de nodo: el 0 es el depósito. Si la brecha es mayor que 0, la solución es buena pero no está probada óptima; la brecha indica cuánto podría mejorar como máximo.</p>
      <script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>`;
    const w = window.open('', '_blank'); if (!w) return App.chip('El navegador bloqueó la ventana del informe: permita ventanas emergentes para este sitio'); w.document.open(); w.document.write(html); w.document.close();
  }
  App.exportarVrp = (tipo) => {
    const r = S.res; if (!r || r.kind !== 'vrp') return false; const I = r.extra.I, id = r.extra.variante;
    if (tipo === 'informe') { informe(r); return true; }
    if (tipo === 'gams') descargar('vrp_' + id + '.gms', window.Gams.generar(I, Va.porId[id].nombre)); else if (tipo === 'lp') {
      const m = new window.Solver.Model(); void m; descargar('vrp_' + id + '.txt', '* El modelo LP exacto se genera dentro del solver; use el código GAMS para ver las ecuaciones.\n' + window.Gams.generar(I, Va.porId[id].nombre));
    } else return false; return true;
  };
  window.VrpUi = { montar, refrescar, parametros, resultado, base };
})();
