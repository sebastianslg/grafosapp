/* Grafos Lab — frontend sin paso de build (Cytoscape + Leaflet locales). */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (x, d = 2) => (x === null || x === undefined) ? '—' : (typeof x === 'number' ? (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(d)) : String(x));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PAL = ['--r1', '--r2', '--r3', '--r4', '--r5', '--r6', '--r7', '--r8'];
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const CRIT = { cost: 'Costo', distance: 'Distancia (km)', time: 'Tiempo (min)', emissions: 'Emisiones', hops: 'N.º de arcos' };
const MODE = { min: 'Mínimo', max: 'Máximo' };
const SAMPLE_DESC = {
  pequeno: 'Red de 14 puntos con coordenadas, demanda y capacidades. Ideal para caminos mínimos, árboles, flujos, TSP y rutas con capacidad.',
  flota: '25 puntos con ventanas horarias y una flota mixta (diésel y eléctrica). Ideal para VRPTW, flota heterogénea, camión + drones.',
  transbordo: '7 nodos sin coordenadas con oferta y demanda. Ideal para transbordo a costo mínimo y transporte.'
};

const S = { project: null, catalog: [], runs: [], result: null, expl: null, runId: null, origin: null, dest: null, cy: null, map: null, view: 'graph',
  steps: [], stepIdx: 0, timer: null, job: null, dataTab: 'nodes', resTab: 'answer', upload: null, groups: {}, algo: null, cat: 'Todos', q: '', pick: null, tab: 'inicio', editSum: false, genBusy: false };

/* ---------- utilidades ---------- */
function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; const box = $('#toasts'); while (box.children.length >= 3) box.firstChild.remove(); box.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 10000 : 4000);
}
async function api(path, opt = {}) {
  const o = { ...opt };
  if (o.json !== undefined) { o.method = o.method || 'POST'; o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.json); delete o.json; }
  let r;
  try { r = await fetch('/api' + path, o); } catch (e) { toast('Sin conexión con el servidor. ¿Sigue encendido? (' + e.message + ')', 'err'); throw e; }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.blob();
  if (!r.ok) { const m = (data && (data.error || data.detail)) || ('Error ' + r.status); const e = new Error(typeof m === 'string' ? m : JSON.stringify(m)); e.data = data; throw e; }
  return data;
}
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { if (e && e.message) toast(e.message, 'err'); } };
function openModal(html) { $('#mcontent').innerHTML = html; $('#modal').hidden = false; const f = $('#mcontent input,#mcontent button,#mcontent select'); if (f) f.focus(); }
function closeModal() { $('#modal').hidden = true; $('#mcontent').innerHTML = ''; }
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if ($('#stage').classList.contains('fs')) toggleFs(); } });
const needProject = () => { if (!S.project) { toast('Primero cargue datos o elija un ejemplo (paso 1).', 'err'); showTab('inicio'); return false; } return true; };
const downloadBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ]+/g, '_'); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 600); };

/* ---------- tema, pestañas, barra de proyecto ---------- */
$('#themeBtn').onclick = () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur === 'dark' || (cur === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('theme', document.documentElement.dataset.theme); } catch { }
  if (S.cy) styleCy();
};
try { const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch { }
$('#helpBtn').onclick = () => openModal(`<h2>Cómo usar Grafos Lab</h2><ol><li><b>Cargar:</b> suba su archivo (o un informe) o elija un ejemplo. Revise cómo se leyó y confirme.</li><li><b>Revisar datos:</b> corrija nodos, aristas, flota y parámetros. Si no hay aristas, use «Generar aristas».</li><li><b>Analizar:</b> elija «¿Qué quiere hacer?», complete los datos y pulse <b>Ejecutar</b>. Clic izquierdo = origen, clic derecho = destino. Use ▶ para ver el algoritmo paso a paso.</li><li><b>Resumen ejecutivo:</b> en el panel de resultados, pestaña «Resumen ejecutivo», genere el resumen completo con comparaciones y escenarios; puede editarlo.</li><li><b>Exportar:</b> Word/PDF/Excel, y el paquete para Grafos v.1.3.5.</li></ol><p class="muted small">Los resultados marcados «Heurístico» no son óptimos probados; el resumen ejecutivo mide cuánto varían entre corridas.</p><div class="row"><button class="primary" onclick="closeModal()">Entendido</button></div>`);
function showTab(name) {
  if (S.tab === 'datos') collectData();
  S.tab = name;
  $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  window.scrollTo({ top: 0 });
  if (name === 'datos') renderData();
  if (name === 'analisis') { setTimeout(() => { drawGraph(); }, 30); renderRunList(); }
  if (name === 'escenarios') renderScenarioLists();
  if (name === 'preguntas') renderQEx();
  if (name === 'exportar') renderExportLists();
  renderPBar();
}
$$('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
function renderPBar() {
  const p = S.project, b = $('#pbar');
  $$('#tabs button').forEach(x => x.classList.toggle('done', (x.dataset.tab === 'inicio' && !!p) || (x.dataset.tab === 'analisis' && S.runs.length > 0)));
  if (!p) { b.hidden = true; return; }
  b.hidden = false;
  const warns = (p.meta?.warnings || []).length;
  let next = '';
  if (!p.edges.length) next = 'Siguiente: genere las aristas en «Revisar datos».';
  else if (!S.runs.length) next = 'Siguiente: elija un algoritmo en «Analizar».';
  else if (!(S.result && S.result.full_summary)) next = 'Siguiente: genere el resumen ejecutivo completo en «Analizar» → pestaña «Resumen ejecutivo».';
  else next = 'Siguiente: descargue el informe en «Exportar».';
  b.innerHTML = `<span>Proyecto: <b>${esc(p.name)}</b></span><span class="chip">${p.nodes.length} nodos</span><span class="chip">${p.edges.length} aristas</span><span class="chip">${p.vehicles.length} tipo(s) de vehículo</span>` +
    (warns ? `<button class="ghost small" id="warnLink" style="color:var(--warn)">⚠ ${warns} advertencia(s) de datos</button>` : '<span class="badge ok">datos sin advertencias</span>') + `<span class="next">${esc(next)}</span>`;
  const wl = $('#warnLink'); if (wl) wl.onclick = () => showTab('datos');
}

/* ---------- proyectos ---------- */
async function refreshProjects(selectId) {
  const list = await api('/projects');
  const sel = $('#projectSel');
  sel.innerHTML = '<option value="">— sin proyecto —</option>' + list.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${p.nodes}n/${p.edges}a)</option>`).join('');
  if (selectId) sel.value = selectId;
}
async function loadProject(id) {
  if (!id) { S.project = null; S.runs = []; S.result = null; renderPBar(); renderResult(); return; }
  S.project = await api('/projects/' + id);
  S.origin = S.dest = null; S.result = null; S.expl = null; S.runId = null; S.pick = null;
  S.runs = await api(`/projects/${id}/runs`);
  $('#projectSel').value = id;
  renderRunList(); renderResult(); renderPBar();
  if (S.tab === 'analisis') drawGraph();
  if (S.tab === 'datos') renderData();
}
$('#projectSel').onchange = guard(async e => { await loadProject(e.target.value); });

/* ---------- 1 · CARGAR ---------- */
async function initInicio() {
  const smp = await api('/samples');
  $('#samples').innerHTML = smp.map(s => `<button class="sample" data-s="${esc(s.key)}"><b>${esc(s.name)}</b><span>${esc(SAMPLE_DESC[s.key] || '')}</span></button>`).join('');
  $$('#samples button').forEach(b => b.onclick = guard(async () => {
    const p = await api('/samples/' + b.dataset.s, { method: 'POST' });
    await refreshProjects(p.id); await loadProject(p.id); toast('Ejemplo cargado: ' + p.name, 'ok'); showTab('analisis');
  }));
  const tpl = await api('/templates'), TN = { nodos_aristas: 'Nodos y aristas', matriz_costos: 'Matriz de costos', flota: 'Flota', transbordo: 'Transbordo', parametros: 'Parámetros' };
  $('#templates').innerHTML = tpl.map(t => `<a href="/api/templates/${esc(t)}"><button type="button">⬇ ${esc(TN[t] || t)}</button></a>`).join('');
  const drop = $('#drop'), inp = $('#fileInput');
  drop.onclick = () => inp.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => upload(e.dataTransfer.files));
  inp.onchange = () => { upload(inp.files); };
}
const upload = guard(async files => {
  if (!files.length) return;
  const fd = new FormData(); [...files].forEach(f => fd.append('files', f));
  $('#uploadErr').innerHTML = '<p class="muted"><span class="spin"></span>Leyendo y analizando los archivos…</p>';
  let pv;
  try { pv = await api('/ingest/preview', { method: 'POST', body: fd }); }
  catch (e) { $('#uploadErr').innerHTML = `<div class="warnbox error">${esc(e.message)}${(e.data?.errores || []).map(x => `<br>• ${esc(x.archivo)}: ${esc(x.error)}`).join('')}</div>`; throw e; }
  $('#uploadErr').innerHTML = (pv.errores || []).map(x => `<div class="warnbox">${esc(x.archivo)}: ${esc(x.error)}</div>`).join('');
  $('#fileInput').value = '';
  S.upload = pv; renderMapping();
  $('#mappingCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
const ROLES = [['nodes', 'Nodos (puntos)'], ['edges', 'Aristas (conexiones)'], ['vehicles', 'Vehículos (flota)'], ['matrix', 'Matriz NxN'], ['coords', 'Coordenadas XY (Grafos)'], ['values', 'Valores de nodo (Grafos)'], ['params', 'Parámetros'], ['ignore', 'Ignorar esta tabla']];
const ROLE_TXT = { nodes: 'una tabla de NODOS (puntos con coordenadas, demanda, etc.)', edges: 'una tabla de ARISTAS (conexiones entre puntos)', vehicles: 'una tabla de FLOTA de vehículos', matrix: 'una MATRIZ de costos o distancias', coords: 'coordenadas X,Y de los nodos (formato Grafos)', values: 'valores por nodo (formato Grafos)', params: 'una tabla de PARÁMETROS', ignore: 'una tabla sin estructura de grafo reconocible' };
const FIELDS = {
  nodes: ['id', 'name', 'lat', 'lon', 'x', 'y', 'demand', 'supply', 'type', 'tw_start', 'tw_end', 'service', 'capacity', 'frequency'],
  edges: ['source', 'target', 'distance', 'time', 'cost', 'capacity', 'directed', 'emissions'],
  vehicles: ['type', 'capacity', 'fixed_cost', 'cost_per_km', 'speed', 'range', 'count', 'emissions_per_km', 'depot'], matrix: [], coords: [], values: [], params: [], ignore: []
};
const FLABEL = { id: 'Identificador', name: 'Nombre', lat: 'Latitud', lon: 'Longitud', x: 'X', y: 'Y', demand: 'Demanda', supply: 'Oferta', type: 'Tipo', tw_start: 'Ventana: inicio', tw_end: 'Ventana: fin', service: 'Tiempo de servicio', capacity: 'Capacidad', frequency: 'Frecuencia', source: 'Origen', target: 'Destino', distance: 'Distancia', time: 'Tiempo', cost: 'Costo', directed: 'Dirigida', emissions: 'Emisiones', fixed_cost: 'Costo fijo', cost_per_km: 'Costo por km', speed: 'Velocidad', range: 'Autonomía', count: 'Cantidad', emissions_per_km: 'Emisiones por km', depot: 'Depósito' };
function renderMapping() {
  const pv = S.upload; $('#mappingCard').hidden = false;
  let h = `<div class="row"><label class="grow">Nombre del proyecto<input id="pName" value="${esc((pv.files[0]?.name || 'Proyecto').replace(/\.[^.]+$/, ''))}"></label></div>`;
  h += pv.files.map(f => `<p class="small muted">📄 <b>${esc(f.name)}</b> (${esc(f.format)}) ${f.notes.map(n => esc(n)).join(' · ')}</p>`).join('');
  pv.tables.forEach((t, i) => {
    const conf = t.confidence ?? 0;
    h += `<div class="sbox" data-t="${i}" style="margin:8px 0"><div class="row between"><b>${esc(t.name.split('::').pop())}</b><span class="badge ${conf > .7 ? 'ok' : conf > .4 ? 'warn' : 'err'}">confianza ${(conf * 100).toFixed(0)}%</span></div>
    <p class="small">Parece ${ROLE_TXT[t.role] || ''} · ${t.rows} filas. <span class="muted">${esc(t.razon || '')}</span></p>
    <label>Cómo usar esta tabla<select class="roleSel">${ROLES.map(([k, l]) => `<option value="${k}" ${k === t.role ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <details><summary>Ajustar columnas y ver datos</summary><div class="mapFields"></div>
    <div class="tablewrap" style="max-height:170px"><table><thead><tr>${t.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.sample.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details></div>`;
  });
  if (pv.extracted_params?.length) {
    h += `<h4>Parámetros encontrados en el texto del informe</h4><p class="small muted">Confirme los que sean correctos. Lo que no estaba en el texto no se inventa.</p><div class="tablewrap"><table><thead><tr><th></th><th>Parámetro</th><th>Valor</th><th>Confianza</th><th>Cita de origen</th></tr></thead><tbody>` +
      pv.extracted_params.map((p, i) => `<tr><td><input type="checkbox" class="exp" data-i="${i}" ${p.confianza >= .8 ? 'checked' : ''} aria-label="Aceptar"></td><td>${esc(p.descripcion)}</td><td><input class="expv" data-i="${i}" value="${esc(p.valor)}"></td><td>${(p.confianza * 100).toFixed(0)}%</td><td class="small">${esc(p.cita)}</td></tr>`).join('') + '</tbody></table></div>';
  }
  h += `<h4>Opciones</h4><div class="row wrap">
    <label>Unidad de las distancias<select id="unitSel"><option value="1">kilómetros</option><option value="1000">metros</option><option value="1.609344">millas</option></select></label>
    <label>Si faltan aristas<select id="genSel"><option value="">no generar (usar las cargadas)</option><option value="knn">conectar con los k vecinos más cercanos</option><option value="threshold">conectar si distancia ≤ umbral</option><option value="delaunay">triangulación de Delaunay</option><option value="complete">grafo completo</option></select></label>
    <label>k o umbral (km)<input id="genK" value="4" size="5"></label><label class="chk"><input type="checkbox" id="genDir"> aristas dirigidas</label></div>
    <div class="row" style="margin-top:12px"><button id="commitBtn" class="primary big">Crear proyecto</button><span class="muted small">Podrá corregir todo en «Revisar datos».</span></div>`;
  $('#mappingBody').innerHTML = h;
  $$('#mappingBody .sbox').forEach(d => {
    const i = +d.dataset.t, t = pv.tables[i], sel = $('.roleSel', d);
    const draw = () => {
      const role = sel.value, cols = t.columns, cur = (role === t.role ? t.mapping : {}) || {};
      $('.mapFields', d).innerHTML = FIELDS[role].length ? `<div class="row wrap" style="margin:6px 0">` + FIELDS[role].map(f => `<label>${FLABEL[f] || f}<select data-f="${f}"><option value="">—</option>${cols.map(c => `<option ${cur[f] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`).join('') + '</div>'
        : (role === 'matrix' ? `<label style="margin:6px 0">La matriz representa<select class="mAttr"><option value="cost">costo</option><option value="distance">distancia</option><option value="time">tiempo</option><option value="capacity">capacidad / máximo</option></select></label>` : (role === 'values' ? `<label style="margin:6px 0">Los valores son<select class="vField"><option value="demand">demanda</option><option value="supply">oferta</option></select></label>` : ''));
    };
    sel.onchange = draw; draw();
  });
  $('#commitBtn').onclick = guard(commit);
}
async function commit() {
  const pv = S.upload, decisions = {};
  $$('#mappingBody .sbox').forEach(d => {
    const t = pv.tables[+d.dataset.t], role = $('.roleSel', d).value, mapping = {};
    $$('select[data-f]', d).forEach(s => { if (s.value) mapping[s.dataset.f] = s.value; });
    const dec = { role, mapping, confidence: t.confidence };
    if (role === 'nodes' && !mapping.id) mapping.id = null;
    const ma = $('.mAttr', d); if (ma) dec.matrix_attr = ma.value;
    const vf = $('.vField', d); if (vf) dec.mapping = { ...(t.mapping || {}), value_field: vf.value };
    decisions[t.name] = dec;
  });
  const accepted = $$('.exp').filter(c => c.checked).map(c => ({ param: pv.extracted_params[+c.dataset.i].param, valor: parseFloat($(`.expv[data-i="${c.dataset.i}"]`).value) || $(`.expv[data-i="${c.dataset.i}"]`).value }));
  const gen = $('#genSel').value ? { method: $('#genSel').value, k: +$('#genK').value || 4, threshold: parseFloat($('#genK').value), directed: $('#genDir').checked } : null;
  const body = { upload_id: pv.upload_id, name: $('#pName').value, decisions, accepted_params: accepted, generate: gen, units: { distance_divisor: parseFloat($('#unitSel').value) } };
  const p = await api('/ingest/commit', { json: body });
  await refreshProjects(p.id); await loadProject(p.id);
  $('#mappingCard').hidden = true;
  toast(`Proyecto creado: ${p.nodes.length} nodos, ${p.edges.length} aristas`, 'ok');
  showTab(p.meta.warnings.length || !p.edges.length ? 'datos' : 'analisis');
}

/* ---------- 2 · DATOS ---------- */
function renderWarnings() {
  const w = S.project?.meta?.warnings || [];
  $('#warnings').innerHTML = w.length ? w.map(x => `<div class="warnbox ${x.nivel === 'error' ? 'error' : ''}"><b>${x.nivel === 'error' ? 'Error' : 'Advertencia'}:</b> ${esc(x.mensaje)}</div>`).join('') : '<div class="warnbox ok">Sin advertencias: los datos pasaron todas las validaciones.</div>';
}
const NCOLS = ['id', 'name', 'lat', 'lon', 'x', 'y', 'demand', 'supply', 'type', 'tw_start', 'tw_end', 'service', 'capacity', 'frequency'];
const ECOLS = ['source', 'target', 'distance', 'time', 'cost', 'capacity', 'directed', 'emissions'];
const VCOLS = ['type', 'capacity', 'fixed_cost', 'cost_per_km', 'speed', 'range', 'count', 'emissions_per_km', 'depot'];
function renderData() {
  renderWarnings();
  const p = S.project, b = $('#dataBody');
  if (!p) { b.innerHTML = '<div class="empty2"><h3>Todavía no hay datos</h3><p class="muted">Vaya al paso 1 y cargue un archivo o un ejemplo.</p><button class="primary" id="goLoad">Ir a «Cargar»</button></div>'; $('#goLoad').onclick = () => showTab('inicio'); return; }
  $$('#dataTabs button').forEach(x => x.classList.toggle('on', x.dataset.d === S.dataTab));
  $('#dataSearch').hidden = ['params', 'versions'].includes(S.dataTab);
  const tab = S.dataTab;
  if (tab === 'params') {
    const D = { c_km: 'Costo por km', c_hora: 'Costo por hora', speed: 'Velocidad media (km/h)', e_km: 'Emisiones por km', road_factor: 'Factor vial (× Haversine)', scale: 'Factor de escala para exportar enteros', depots: 'Depósitos (ids separados por coma)', directed_default: 'Aristas dirigidas por defecto (true/false)' };
    b.innerHTML = `<table><tbody>${Object.entries(p.params).map(([k, v]) => `<tr><th style="width:42%">${esc(D[k] || k)} <span class="muted small">(${esc(k)})</span></th><td><input data-k="${esc(k)}" value="${esc(Array.isArray(v) ? v.join(',') : v)}"></td></tr>`).join('')}</tbody></table>`;
    return;
  }
  if (tab === 'versions') { api(`/projects/${p.id}/versions`).then(v => { b.innerHTML = `<table><thead><tr><th>Versión</th><th>Nota</th><th>Fecha</th><th></th></tr></thead><tbody>${v.map(x => `<tr><td>${x.version}</td><td>${esc(x.note)}</td><td>${new Date(x.created * 1000).toLocaleString()}</td><td><button data-v="${x.version}">Restaurar</button></td></tr>`).join('')}</tbody></table>`; $$('button[data-v]', b).forEach(bt => bt.onclick = guard(async () => { await api(`/projects/${p.id}/restore/${bt.dataset.v}`, { method: 'POST' }); await loadProject(p.id); renderData(); toast('Versión restaurada', 'ok'); })); }); return; }
  const cols = { nodes: NCOLS, edges: ECOLS, vehicles: VCOLS }[tab], rows = p[tab], q = norm($('#dataSearch').value);
  const MAXR = 500;
  const idx = rows.map((r, i) => i).filter(i => !q || cols.some(c => norm(rows[i][c]).includes(q)));
  const show = idx.slice(0, MAXR);
  if (!rows.length) { b.innerHTML = `<div class="empty2"><p class="muted">No hay ${tab === 'edges' ? 'aristas' : tab === 'nodes' ? 'nodos' : 'vehículos'}.${tab === 'edges' ? ' Use «Generar aristas…» si sus nodos tienen coordenadas.' : ''}</p><button id="addRow">+ Agregar fila</button></div>`; $('#addRow').onclick = () => { rows.push(Object.fromEntries(cols.map(c => [c, null]))); renderData(); }; return; }
  b.innerHTML = `<table><thead><tr>${cols.map(c => `<th data-c="${c}" title="Clic para ordenar">${esc(FLABEL[c] || c)} ↕</th>`).join('')}<th></th></tr></thead><tbody>${show.map(i => `<tr>${cols.map(c => `<td><input data-i="${i}" data-c="${c}" value="${esc(rows[i][c] ?? '')}" aria-label="${esc(FLABEL[c] || c)}"></td>`).join('')}<td><button data-del="${i}" class="ghost" aria-label="Eliminar fila" title="Eliminar fila">✕</button></td></tr>`).join('')}</tbody></table>` + `<div class="row" style="margin:8px"><button id="addRow">+ Agregar fila</button><span class="muted small">${idx.length} de ${rows.length} filas${idx.length > MAXR ? ` (se muestran ${MAXR}; use el buscador)` : ''}</span></div>`;
  $$('th[data-c]', b).forEach(th => th.onclick = () => { collectData(); const c = th.dataset.c, d = th.dataset.dir === 'a' ? -1 : 1; th.dataset.dir = d === 1 ? 'a' : 'd'; rows.sort((a, z) => (a[c] ?? '') > (z[c] ?? '') ? d : -d); renderData(); });
  $$('button[data-del]', b).forEach(bt => bt.onclick = () => { collectData(); rows.splice(+bt.dataset.del, 1); renderData(); });
  $('#addRow').onclick = () => { collectData(); rows.push(Object.fromEntries(cols.map(c => [c, null]))); renderData(); };
}
$('#dataSearch').oninput = () => { collectData(); renderData(); };
$$('#dataTabs button').forEach(b => b.onclick = () => { collectData(); S.dataTab = b.dataset.d; renderData(); });
function collectData() {
  const p = S.project; if (!p || S.tab !== 'datos') return;
  const b = $('#dataBody');
  if (S.dataTab === 'params') {
    $$('input[data-k]', b).forEach(i => { const k = i.dataset.k, old = p.params[k]; let v = i.value; if (Array.isArray(old)) v = v.split(',').map(s => s.trim()).filter(Boolean); else if (typeof old === 'boolean') v = v === 'true'; else if (typeof old === 'number' || old === null || (!isNaN(parseFloat(v)) && isFinite(v))) { const n = parseFloat(v); v = isNaN(n) ? old : n; } p.params[k] = v; });
    return;
  }
  if (!['nodes', 'edges', 'vehicles'].includes(S.dataTab)) return;
  const numeric = new Set(['lat', 'lon', 'x', 'y', 'demand', 'supply', 'tw_start', 'tw_end', 'service', 'capacity', 'frequency', 'distance', 'time', 'cost', 'emissions', 'fixed_cost', 'cost_per_km', 'speed', 'range', 'count', 'emissions_per_km']);
  $$('input[data-i]', b).forEach(i => {
    const r = p[S.dataTab][+i.dataset.i]; if (!r) return; const c = i.dataset.c; let v = i.value.trim();
    if (c === 'directed') v = v === '' ? null : ['true', '1', 'si', 'sí'].includes(v.toLowerCase());
    else if (numeric.has(c)) v = v === '' ? null : (isNaN(parseFloat(v)) ? null : parseFloat(v));
    else if (v === '') v = null;
    r[c] = v;
  });
}
$('#saveData').onclick = guard(async () => {
  if (!needProject()) return; collectData();
  const p = S.project;
  const out = await api('/projects/' + p.id, { method: 'PUT', json: { name: p.name, nodes: p.nodes, edges: p.edges, vehicles: p.vehicles, params: p.params, note: 'edición manual' } });
  S.project = { ...p, ...out }; renderData(); renderPBar(); toast('Guardado (versión ' + out.version + ')', 'ok'); refreshProjects(p.id);
});
$('#genEdgesBtn').onclick = () => {
  if (!needProject()) return;
  openModal(`<h2>Generar aristas desde las coordenadas</h2><div class="stack">
    <label>Método<select id="geM"><option value="knn">Cada nodo con sus k vecinos más cercanos</option><option value="threshold">Conectar nodos a distancia ≤ umbral</option><option value="delaunay">Triangulación de Delaunay</option><option value="complete">Grafo completo</option></select></label>
    <div class="row"><label class="grow">k (vecinos)<input id="geK" value="4"></label><label class="grow">Umbral (km)<input id="geT" value="5"></label></div>
    <label class="chk"><input type="checkbox" id="geD"> Aristas dirigidas</label><label class="chk"><input type="checkbox" id="geR" checked> Reemplazar las aristas actuales</label>
    <p class="muted small">La distancia es Haversine × el factor vial de «Parámetros».</p>
    <div class="row"><button id="geGo" class="primary">Generar</button><button onclick="closeModal()">Cancelar</button></div></div>`);
  $('#geGo').onclick = guard(async () => {
    const r = await api(`/projects/${S.project.id}/generate-edges`, { json: { method: $('#geM').value, k: +$('#geK').value || 4, threshold: parseFloat($('#geT').value), directed: $('#geD').checked, replace: $('#geR').checked } });
    closeModal(); S.project = r.project; renderData(); renderPBar(); refreshProjects(S.project.id); toast(`${r.added} aristas generadas`, 'ok');
  });
};
$('#layoutBtn').onclick = guard(async () => { if (!needProject()) return; S.project = await api(`/projects/${S.project.id}/layout`, { json: { reset: true, separate: true } }); toast('Nodos reordenados y separados', 'ok'); });

/* ---------- 3 · ANALIZAR: grafo ---------- */
function nodeColor(n) {
  const t = (n.type || '').toString().toLowerCase();
  if (/dep[oó]sito|depot|base|almac/.test(t)) return '#222222';
  if (/donante|oferta|origen/.test(t)) return css('--r3'); if (/receptor|destino/.test(t)) return css('--r2');
  return css('--node');
}
function styleCy() {
  if (!S.cy) return;
  const ink = css('--ink'), edge = css('--edge');
  S.cy.style().fromJson([
    { selector: 'node', style: { 'background-color': 'data(color)', 'width': 'data(size)', 'height': 'data(size)', 'label': 'data(label)', 'font-size': 10, 'color': ink, 'text-valign': 'bottom', 'text-margin-y': 3, 'text-background-color': css('--bg'), 'text-background-opacity': .8, 'text-background-padding': 1, 'border-width': 1, 'border-color': css('--card') } },
    { selector: 'node[?depot]', style: { 'shape': 'rectangle' } },
    { selector: 'edge', style: { 'width': 1.3, 'line-color': edge, 'target-arrow-color': edge, 'curve-style': 'bezier', 'target-arrow-shape': 'data(arrow)', 'label': 'data(w)', 'font-size': 8, 'color': css('--muted'), 'text-rotation': 'autorotate', 'text-opacity': 0 } },
    { selector: '.showw', style: { 'text-opacity': 1 } }, { selector: '.nolbl', style: { 'label': '' } }, { selector: '.hidden', style: { 'display': 'none' } },
    { selector: '.origin', style: { 'background-color': css('--origin'), 'border-width': 3, 'border-color': '#000' } },
    { selector: '.dest', style: { 'background-color': css('--dest'), 'border-width': 3, 'border-color': '#000' } },
    { selector: '.hl', style: { 'background-color': css('--origin') } }, { selector: '.visited', style: { 'background-color': css('--r2') } },
    { selector: 'edge.acc', style: { 'line-color': css('--r3'), 'target-arrow-color': css('--r3'), 'width': 3 } },
    { selector: 'edge.rej', style: { 'line-color': css('--r1'), 'target-arrow-color': css('--r1'), 'line-style': 'dashed', 'width': 2 } },
    { selector: 'edge.ghost', style: { 'line-style': 'dotted', 'curve-style': 'straight' } },
    { selector: '.pickable', style: { 'overlay-color': css('--accent'), 'overlay-opacity': .25, 'overlay-padding': 6 } },
    ...PAL.map((v, i) => ({ selector: 'edge.g' + i, style: { 'line-color': css(v), 'target-arrow-color': css(v), 'width': 3.5, 'z-index': 9 } })),
    { selector: 'edge.arr', style: { 'target-arrow-shape': 'triangle' } }
  ]).update();
}
function projectedXY(n, i, N) {
  if (n.x != null && n.y != null) return { x: n.x, y: n.y };
  const a = 2 * Math.PI * i / Math.max(N, 1); return { x: 450 + 300 * Math.cos(a), y: 320 + 300 * Math.sin(a) };
}
function drawGraph() {
  const p = S.project, em = $('#empty');
  if (!p) { if (S.cy) { S.cy.destroy(); S.cy = null; } em.hidden = false; em.innerHTML = '<div><h3>Aún no hay un proyecto</h3><p>Cargue sus datos o pruebe un ejemplo.</p><button class="primary" id="emGo">Ir a «Cargar»</button></div>'; $('#emGo').onclick = () => showTab('inicio'); return; }
  em.hidden = true;
  const types = [...new Set(p.nodes.map(n => n.type).filter(Boolean))];
  $('#typeFilter').innerHTML = '<option value="">Todos los tipos</option>' + types.map(t => `<option>${esc(t)}</option>`).join('');
  const maxD = Math.max(1, ...p.nodes.map(n => n.demand || 0));
  const els = [];
  p.nodes.forEach((n, i) => { const pos = projectedXY(n, i, p.nodes.length); els.push({ group: 'nodes', data: { id: n.id, label: n.name && n.name !== n.id ? `${n.id} · ${n.name}` : String(n.id), color: nodeColor(n), size: 13 + 14 * Math.sqrt((n.demand || 0) / maxD), type: n.type || '', depot: (p.params.depots || []).includes(n.id) }, position: pos }); });
  const dirDefault = !!p.params.directed_default;
  p.edges.forEach((e, i) => { const dir = e.directed ?? dirDefault; els.push({ group: 'edges', data: { id: 'e' + i, source: e.source, target: e.target, w: fmt(e.distance ?? e.cost), arrow: dir ? 'triangle' : 'none', dir } }); });
  if (S.cy) S.cy.destroy();
  S.cy = cytoscape({ container: $('#cy'), elements: els, layout: { name: 'preset' }, minZoom: .1, maxZoom: 6, boxSelectionEnabled: false });
  styleCy();
  $('#cy').oncontextmenu = e => e.preventDefault();
  S.cy.on('tap', 'node', e => { if (e.originalEvent && e.originalEvent.button === 2) return; if (S.pick) return fillPick(e.target.id()); setSel('origin', e.target.id()); });
  S.cy.on('cxttap', 'node', e => { if (S.pick) return fillPick(e.target.id()); setSel('dest', e.target.id()); });
  S.cy.on('dragfree', 'node', e => { const n = S.project.nodes.find(x => x.id === e.target.id()); const q = e.target.position(); n.x = +q.x.toFixed(1); n.y = +q.y.toFixed(1); });
  S.cy.on('mouseover', 'node', e => showTip(e.target)); S.cy.on('mouseout', 'node', () => { $('#nodeTip').hidden = true; }); S.cy.on('pan zoom drag', () => { $('#nodeTip').hidden = true; });
  S.cy.fit(undefined, 30);
  if (!p.edges.length) { em.hidden = false; em.style.pointerEvents = 'none'; em.innerHTML = '<div style="background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 16px;pointer-events:auto"><b>Este proyecto no tiene aristas.</b><br>Vaya a «Revisar datos» y use «Generar aristas…».</div>'; }
  applyToggles(); applySel(); if (S.result) applyResultHighlights(true); renderMapIfNeeded();
}
function showTip(n) {
  const x = S.project.nodes.find(q => q.id === n.id()); if (!x) return;
  const rows = [['Id', x.id], ['Nombre', x.name], ['Tipo', x.type], ['Demanda', x.demand], ['Oferta', x.supply], ['Ventana', x.tw_start != null ? `${x.tw_start}–${x.tw_end}` : null], ['Servicio (min)', x.service]].filter(r => r[1] != null && r[1] !== '' && r[1] !== x.id || r[0] === 'Id');
  const t = $('#nodeTip'); t.innerHTML = rows.map(r => `<div><b>${esc(r[0])}:</b> ${esc(r[1])}</div>`).join('');
  const p = n.renderedPosition(); t.style.left = Math.min(p.x + 14, $('#stage').clientWidth - 200) + 'px'; t.style.top = Math.max(4, p.y - 10) + 'px'; t.hidden = false;
}
function applyToggles() {
  if (!S.cy) return;
  S.cy.edges().toggleClass('showw', $('#showW').checked); S.cy.nodes().toggleClass('nolbl', !$('#showLbl').checked);
  const tf = $('#typeFilter').value; S.cy.nodes().forEach(n => n.toggleClass('hidden', !!tf && n.data('type') !== tf));
}
['showW', 'showLbl', 'typeFilter'].forEach(id => $('#' + id).onchange = applyToggles);
$('#zIn').onclick = () => S.cy && S.cy.zoom({ level: S.cy.zoom() * 1.3, renderedPosition: { x: $('#cy').clientWidth / 2, y: $('#cy').clientHeight / 2 } });
$('#zOut').onclick = () => S.cy && S.cy.zoom({ level: S.cy.zoom() / 1.3, renderedPosition: { x: $('#cy').clientWidth / 2, y: $('#cy').clientHeight / 2 } });
$('#zFit').onclick = () => { if (S.cy) S.cy.fit(undefined, 30); if (S.map && S.view === 'map') renderMap(); };
function toggleFs() { $('#stage').classList.toggle('fs'); setTimeout(() => { if (S.cy) { S.cy.resize(); S.cy.fit(undefined, 30); } if (S.map) S.map.invalidateSize(); }, 50); }
$('#fsBtn').onclick = toggleFs;
function setSel(kind, id) { S[kind] = id; applySel(); if (S.origin && S.dest) quickPath(); }
function applySel() {
  if (S.cy) { S.cy.nodes().removeClass('origin dest'); if (S.origin) S.cy.getElementById(S.origin).addClass('origin'); if (S.dest) S.cy.getElementById(S.dest).addClass('dest'); }
  $('#orgLbl').textContent = S.origin ?? '—'; $('#dstLbl').textContent = S.dest ?? '—';
  const ps = $('#p_source'), pt = $('#p_target'); if (ps && S.origin) ps.value = S.origin; if (pt && S.dest) pt.value = S.dest;
}
$('#clearSel').onclick = () => { S.origin = S.dest = null; applySel(); };
const quickPath = guard(async () => { await runAlgo('dijkstra', { source: S.origin, target: S.dest, criterion: $('#critSel').value }, true); });
function fillPick(id) {
  const el = $('#p_' + S.pick); if (el) el.value = id; S.pick = null;
  if (S.cy) S.cy.nodes().removeClass('pickable'); $('#cy').style.cursor = '';
  toast('Nodo seleccionado: ' + id, 'ok');
}

/* ---------- 3 · ANALIZAR: algoritmos ---------- */
async function initAnalisis() {
  S.catalog = await api('/catalog');
  const cats = ['Todos', ...new Set(S.catalog.map(a => a.category))];
  $('#catChips').innerHTML = cats.map(c => `<button data-c="${esc(c)}" class="${c === S.cat ? 'on' : ''}">${esc(c)}</button>`).join('');
  $$('#catChips button').forEach(b => b.onclick = () => { S.cat = b.dataset.c; $$('#catChips button').forEach(x => x.classList.toggle('on', x === b)); renderAlgoList(); });
  $('#algoSearch').oninput = e => { S.q = e.target.value; renderAlgoList(); };
  $('#scAlgo').innerHTML = S.catalog.filter(a => a.category !== 'Escenarios').map(a => `<option value="${esc(a.key)}">${esc(a.name)}</option>`).join('');
  $('#algoBack').onclick = () => { S.algo = null; showBrowser(); };
  renderAlgoList();
}
function renderAlgoList() {
  const q = norm(S.q), l = S.catalog.filter(a => (S.cat === 'Todos' || a.category === S.cat) && (!q || norm(a.name + ' ' + a.goal + ' ' + a.key + ' ' + a.category).includes(q)));
  $('#algoList').innerHTML = l.length ? l.map(a => `<button class="algo ${a.key === S.algo ? 'on' : ''}" data-key="${esc(a.key)}"><b>${esc(a.name)}</b><span>${esc(a.goal)}</span></button>`).join('') : '<p class="muted small">Nada coincide. Pruebe con «ruta», «árbol», «flujo», «reparto» o «TSP».</p>';
  $$('#algoList .algo').forEach(b => b.onclick = () => selectAlgo(b.dataset.key));
}
function showBrowser() { $('#algoBrowser').hidden = false; $('#algoDetail').hidden = true; renderAlgoList(); }
function selectAlgo(key) {
  S.algo = key; const a = S.catalog.find(x => x.key === key);
  $('#algoBrowser').hidden = true; $('#algoDetail').hidden = false;
  $('#adName').textContent = a.name; $('#adGoal').textContent = a.goal; $('#adHow').textContent = a.how || ''; $('#adEq').textContent = a.equation || ''; $('#adEq').hidden = !a.equation;
  const seen = new Set(), mk = p => {
    const id = 'p_' + p.name, def = p.default ?? '', lab = `<span>${esc(p.label)}${p.required ? ' <span class="preq" title="Obligatorio">*</span>' : ''}</span>`, hint = p.hint ? `<span class="hint2">${esc(p.hint)}</span>` : '';
    if (p.type === 'select') return `<label class="pfield">${lab}<select id="${id}">${p.options.map(o => `<option value="${esc(o)}" ${o === (p.name === 'criterion' ? $('#critSel').value : def) ? 'selected' : ''}>${esc((p.name === 'criterion' ? CRIT : MODE)[o] || o)}</option>`).join('')}</select>${hint}</label>`;
    if (p.type === 'bool') return `<label class="chk pfield"><input type="checkbox" id="${id}"> ${esc(p.label)}</label>`;
    if (p.type === 'node') return `<label class="pfield">${lab}<div class="row"><select id="${id}" data-node="1"></select><button type="button" data-pick="${p.name}" title="Elegir un nodo haciendo clic en el grafo">🎯 En el grafo</button></div>${hint}</label>`;
    if (p.type === 'nodes') return `<label class="pfield">${lab}<input id="${id}" placeholder="p. ej. 1,4,7">${hint}</label>`;
    if (p.type === 'json') return `<label class="pfield">${lab}<textarea id="${id}" rows="2" placeholder="JSON"></textarea>${hint}</label>`;
    return `<label class="pfield">${lab}<input id="${id}" value="${esc(def)}" ${p.type === 'int' || p.type === 'float' ? 'inputmode="decimal"' : ''}>${hint}</label>`;
  };
  const ps = a.params.filter(p => !seen.has(p.name) && seen.add(p.name));
  $('#algoParams').innerHTML = ps.filter(p => !p.advanced).map(mk).join('') || '<p class="muted small">Este algoritmo no necesita parámetros.</p>';
  const adv = ps.filter(p => p.advanced); $('#advBox').hidden = !adv.length; $('#advParams').innerHTML = adv.map(mk).join('');
  $$('[data-pick]').forEach(b => b.onclick = () => {
    if (S.view === 'map') setView('graph'); S.pick = b.dataset.pick; S.cy && S.cy.nodes().addClass('pickable'); $('#cy').style.cursor = 'crosshair';
    toast('Haga clic en un nodo del grafo para elegirlo.'); $('#cy').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  fillNodeParams(); renderAlgoList();
  $('#progress').hidden = true;
}
function fillNodeParams() {
  if (!S.project) return;
  const opts = '<option value="">—</option>' + S.project.nodes.map(n => `<option value="${esc(n.id)}">${esc(n.id)}${n.name && n.name !== n.id ? ' · ' + esc(n.name) : ''}</option>`).join('');
  $$('select[data-node]').forEach(s => { const prev = s.value; s.innerHTML = opts; s.value = s.id === 'p_source' ? (S.origin || prev) : s.id === 'p_target' ? (S.dest || prev) : prev; });
  ['gSrc', 'gDst'].forEach(id => { const s = $('#' + id); if (s) { const pv = s.value; s.innerHTML = opts; s.value = pv; } });
}
function collectParams() {
  const a = S.catalog.find(x => x.key === S.algo), out = {};
  for (const p of a.params) {
    const el = $('#p_' + p.name); if (!el) continue; let v = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (v === '' || v === false) { if (p.required) { el.focus(); throw new Error(`Falta «${p.label.replace(/\(.*\)/, '').trim()}». ${p.hint || ''}`); } continue; }
    if (p.type === 'int') v = parseInt(v); else if (p.type === 'float') v = parseFloat(v);
    else if (p.type === 'nodes') v = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (p.type === 'json') { try { v = JSON.parse(v); } catch { throw new Error(`«${p.label}» no es JSON válido.`); } }
    out[p.name] = v;
  }
  return out;
}
$('#runBtn').onclick = guard(async () => { if (!needProject()) return; if (!S.algo) return; await runAlgo(S.algo, collectParams(), false); });
$('#cancelBtn').onclick = () => { if (S.job) api(`/jobs/${S.job}/cancel`, { method: 'POST' }); };
async function runAlgo(key, params, quick) {
  if (!S.project.edges.length) { toast('El proyecto no tiene aristas: genérelas en «Revisar datos».', 'err'); return; }
  setResultLoading(key);
  if (quick) {
    try { const r = await api(`/projects/${S.project.id}/run?wait=true`, { json: { algorithm: key, params } }); await setResult(r.result, r.explanation, r.run_id); return r; }
    catch (e) { renderResult(); throw e; }
  }
  $('#runBtn').disabled = true; $('#cancelBtn').hidden = false; $('#progress').hidden = false; setProg(0, 'En cola…');
  try {
    const { job_id } = await api(`/projects/${S.project.id}/run`, { json: { algorithm: key, params } }); S.job = job_id;
    for (; ;) {
      await new Promise(r => setTimeout(r, 350));
      const j = await api('/jobs/' + job_id); setProg(j.progress || 0, j.message || '');
      if (j.status === 'done') { await setResult(j.result, j.explanation, j.run_id); return j; }
      if (j.status === 'error') throw new Error(j.error);
      if (j.status === 'cancelled') { toast('Cálculo cancelado'); renderResult(); return null; }
    }
  } catch (e) { renderResult(); throw e; }
  finally { $('#runBtn').disabled = false; $('#cancelBtn').hidden = true; $('#progress').hidden = true; S.job = null; }
}
function setProg(f, m) { $('#progress div').style.width = (f * 100) + '%'; $('#progress span').textContent = `${(f * 100).toFixed(0)}% ${m || ''}`; }
function setResultLoading(key) {
  const a = S.catalog.find(x => x.key === key);
  $('#resEmpty').hidden = true; $('#resWrap').hidden = false; $('#resHead').innerHTML = `<div class="rtitle"><span class="spin"></span>Calculando ${esc(a?.name || key)}…</div>`; $('#resBody').innerHTML = '';
}
async function setResult(res, expl, runId) {
  S.result = res; S.expl = expl; S.runId = runId; S.editSum = false;
  S.runs = await api(`/projects/${S.project.id}/runs`); renderRunList(); renderResult(); applyResultHighlights(false); setupAnim(); renderPBar();
}
function renderRunList() {
  const l = $('#runList'); if (!S.project) { l.innerHTML = ''; return; }
  l.innerHTML = S.runs.length ? S.runs.map(r => `<div class="runitem ${r.id === S.runId ? 'on' : ''}" data-id="${esc(r.id)}" tabindex="0"><div><b>${esc(r.title || r.key)}</b><br><span class="muted">${esc((r.message || '').slice(0, 90))}</span></div></div>`).join('') : '<span class="muted small">Aún no hay corridas. Ejecute un algoritmo.</span>';
  $$('.runitem', l).forEach(d => { const go = guard(async () => { const r = await api('/runs/' + d.dataset.id); await setResult(r.result, r.result.explanation, r.id); }); d.onclick = go; d.onkeydown = e => { if (e.key === 'Enter') go(); }; });
}

/* resaltado y animación */
function clearHighlights() {
  if (!S.cy) return;
  S.cy.remove('edge.ghost'); S.cy.elements().removeClass('hl visited acc rej arr ' + PAL.map((_, i) => 'g' + i).join(' '));
  S.cy.nodes().forEach(n => { if (n.data('orig')) n.data('label', n.data('orig')); }); applySel();
}
function edgeFor(u, v) {
  if (!S.cy) return null;
  let e = S.cy.edges().filter(x => (x.data('source') === u && x.data('target') === v) || (!x.data('dir') && x.data('source') === v && x.data('target') === u));
  if (e.length) return e[0];
  const id = 'gh_' + u + '_' + v; const ex = S.cy.getElementById(id); if (ex.length) return ex;
  if (!S.cy.getElementById(u).length || !S.cy.getElementById(v).length) return null;
  return S.cy.add({ group: 'edges', data: { id, source: u, target: v, w: '', arrow: 'triangle', dir: true }, classes: 'ghost' });
}
function applyResultHighlights() {
  if (!S.cy || !S.result) return; clearHighlights();
  S.groups = {}; const r = S.result;
  (r.highlight_edges || []).forEach(([u, v, g]) => { if (!(g in S.groups)) S.groups[g] = Object.keys(S.groups).length; const e = edgeFor(u, v); if (e) { e.addClass('g' + (S.groups[g] % 8)); if (r.paths?.length) e.addClass('arr'); } });
  (r.highlight_nodes || []).forEach(n => S.cy.getElementById(n).addClass('hl'));
  (r.paths || []).forEach((p, pi) => { (p.stops || []).forEach((s, k) => { const n = S.cy.getElementById(s); if (!n.length) return; if (!n.data('orig')) n.data('orig', n.data('label')); if (k > 0 && k < p.stops.length - 1 && (r.paths.length > 1 || p.stops.length > 3)) n.data('label', `${n.data('orig')} [${r.paths.length > 1 ? 'r' + (pi + 1) + '·' : ''}${k}]`); }); });
  $('#legend').innerHTML = Object.entries(S.groups).slice(0, 12).map(([g, i]) => `<span><i style="background:${css(PAL[i % 8])}"></i>${esc(g)}</span>`).join('');
  renderMapIfNeeded();
}
function setupAnim() {
  stopAnim(); S.steps = (S.result?.steps || []); S.stepIdx = S.steps.length;
  $('#aSlider').max = S.steps.length; $('#aSlider').value = S.steps.length; $('#aLbl').textContent = `${S.steps.length}/${S.steps.length}`;
  $('.anim').style.opacity = S.steps.length ? 1 : .45;
  $('#stepNote').textContent = S.steps.length ? 'Pulse ▶ para ver cómo el algoritmo llegó a este resultado, paso a paso.' : '';
}
function showStep(k) {
  if (!S.cy) return; S.stepIdx = Math.max(0, Math.min(S.steps.length, k));
  clearHighlights();
  for (let i = 0; i < S.stepIdx; i++) {
    const s = S.steps[i];
    (s.nodes || []).forEach(n => S.cy.getElementById(n).addClass(s.state === 'rejected' ? '' : 'visited'));
    (s.edges || []).forEach(([u, v]) => { const e = edgeFor(u, v); if (e) { e.removeClass('acc rej'); e.addClass(s.state === 'rejected' ? 'rej' : 'acc'); } });
  }
  if (S.stepIdx === S.steps.length) applyResultHighlights();
  $('#aSlider').value = S.stepIdx; $('#aLbl').textContent = `${S.stepIdx}/${S.steps.length}`;
  $('#stepNote').textContent = S.stepIdx ? `Paso ${S.stepIdx}: ${S.steps[S.stepIdx - 1].text}` : 'Inicio del algoritmo.';
}
function stopAnim() { if (S.timer) { clearInterval(S.timer); S.timer = null; $('#aPlay').textContent = '▶'; } }
$('#aPlay').onclick = () => {
  if (S.timer) return stopAnim(); if (!S.steps.length) return toast('Este resultado no tiene pasos para animar.');
  if (S.stepIdx >= S.steps.length) showStep(0);
  $('#aPlay').textContent = '⏸'; S.timer = setInterval(() => { if (S.stepIdx >= S.steps.length) return stopAnim(); showStep(S.stepIdx + 1); }, +$('#aSpeed').value);
};
$('#aNext').onclick = () => { stopAnim(); showStep(S.stepIdx + 1); }; $('#aPrev').onclick = () => { stopAnim(); showStep(S.stepIdx - 1); };
$('#aSlider').oninput = e => { stopAnim(); showStep(+e.target.value); };
$('#aSpeed').onchange = () => { if (S.timer) { stopAnim(); $('#aPlay').click(); } };

/* mapa */
$('#viewGraph').onclick = () => setView('graph'); $('#viewMap').onclick = () => setView('map');
function setView(v) {
  if (!S.project) return;
  if (v === 'map' && !S.project.nodes.every(n => n.lat != null && n.lon != null)) { toast('El mapa necesita latitud y longitud en todos los nodos; se muestra el grafo.', 'err'); v = 'graph'; }
  S.view = v; $('#viewGraph').classList.toggle('on', v === 'graph'); $('#viewMap').classList.toggle('on', v === 'map');
  $('#cy').hidden = v === 'map'; $('#map').hidden = v === 'graph';
  if (v === 'map') renderMap(); else if (S.cy) { S.cy.resize(); S.cy.fit(undefined, 30); }
}
function renderMapIfNeeded() { if (S.view === 'map') renderMap(); }
function renderMap() {
  const p = S.project; if (!p) return;
  if (S.map) { S.map.remove(); S.map = null; }
  S.map = L.map('map', { preferCanvas: true }); const bounds = [];
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.map);
  const by = Object.fromEntries(p.nodes.map(n => [n.id, n]));
  p.edges.forEach(e => { const a = by[e.source], b = by[e.target]; if (a && b) L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: css('--edge'), weight: 1 }).addTo(S.map); });
  (S.result?.highlight_edges || []).forEach(([u, v, g]) => { const a = by[u], b = by[v]; if (a && b) L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: css(PAL[(S.groups[g] ?? 0) % 8]), weight: 4 }).addTo(S.map); });
  const mx = Math.max(1, ...p.nodes.map(x => x.demand || 0));
  p.nodes.forEach(n => { bounds.push([n.lat, n.lon]); L.circleMarker([n.lat, n.lon], { radius: 5 + 8 * Math.sqrt((n.demand || 0) / mx), color: '#222', weight: 1, fillColor: nodeColor(n), fillOpacity: .9 }).bindTooltip(`${n.id}${n.name && n.name !== n.id ? ' · ' + n.name : ''}`, { permanent: $('#showLbl').checked && p.nodes.length <= 60 }).on('click', () => setSel('origin', n.id)).on('contextmenu', () => setSel('dest', n.id)).addTo(S.map); });
  S.map.fitBounds(bounds, { padding: [20, 20] });
}

/* ---------- Resultados ---------- */
$$('#resTabs button').forEach(b => b.onclick = () => { S.resTab = b.dataset.r; renderResult(); });
function tableHTML(t, limit = 200) {
  return `<h4>${esc(t.title)}</h4><div class="tablewrap"><table><thead><tr>${t.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0, limit).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${t.rows.length > limit ? `<p class="small muted">+${t.rows.length - limit} filas más (están en el Excel)</p>` : ''}`;
}
function heat(m) {
  const N = Math.min(m.labels.length, 60), vals = m.values.flat().filter(v => v != null && v > 0); const mx = Math.max(...vals, 1), mn = Math.min(...vals, 0);
  const col = v => { if (v == null) return 'transparent'; const f = (v - mn) / (mx - mn || 1); return `color-mix(in srgb, ${css('--accent')} ${Math.round(f * 70)}%, transparent)`; };
  return `<h4>${esc(m.title || 'Matriz')}</h4><div class="tablewrap heat"><table><thead><tr><th></th>${m.labels.slice(0, N).map((l, i) => `<th>${esc(m.ids?.[i] ?? l)}</th>`).join('')}</tr></thead><tbody>${m.values.slice(0, N).map((row, i) => `<tr><th>${esc(m.ids?.[i] ?? m.labels[i])}</th>${row.slice(0, N).map(v => `<td style="background:${col(v)}" title="${esc(fmt(v))}">${v == null ? '·' : fmt(v, 1)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${m.labels.length > N ? `<p class="small muted">Mostrando ${N}×${N} de ${m.labels.length}. La matriz completa está en el Excel.</p>` : ''}`;
}
function renderResult() {
  const r = S.result, e = S.expl;
  $('#resEmpty').hidden = !!r; $('#resWrap').hidden = !r;
  if (!r) return;
  $$('#resTabs button').forEach(b => b.classList.toggle('on', b.dataset.r === S.resTab));
  const st = { optimal: ['ok', 'Óptimo probado'], heuristic: ['warn', 'Heurístico (no óptimo probado)'], info: ['', 'Informativo'] }[r.status] || ['', r.status];
  const big = r.value != null ? `<div class="rbig">${fmt(r.value)} <small>${esc(r.unit || CRIT[r.run_params?.criterion] || '')}</small></div>` : '';
  const hasSum = !!r.full_summary;
  $('#resHead').innerHTML = `<div class="rtitle">${esc(r.title)}</div><span class="badge ${st[0]}">${st[1]}</span> <span class="small muted">${r.elapsed_s ?? ''} s · semilla ${esc(r.run_params?.seed)}</span>${big}<p class="rmsg">${esc(e?.answer || r.message)}</p>
   <div class="ract"><button class="primary" id="rhSum">${hasSum ? 'Ver resumen ejecutivo' : 'Generar resumen ejecutivo'}</button><button data-dl="word">Word</button><button data-dl="pdf">PDF</button><button data-dl="excel">Excel</button></div>`;
  $('#rhSum').onclick = () => { S.resTab = 'exec'; renderResult(); };
  $$('#resHead [data-dl]').forEach(b => b.onclick = guard(() => downloadReport(b.dataset.dl)));
  const body = $('#resBody'); let h = '';
  if (S.resTab === 'answer') {
    h += (r.warnings || []).map(w => `<div class="warnbox">${esc(w)}</div>`).join('');
    if (r.matrix) h += heat(r.matrix);
    h += (r.tables || []).slice(0, 2).map(t => tableHTML(t, 40)).join('');
    if (!r.tables?.length && !r.matrix) h += '<p class="muted small">Este resultado no tiene tablas. Vea «Paso a paso» o el «Resumen ejecutivo».</p>';
  } else if (S.resTab === 'steps') {
    h += (e?.steps || []).map(s => `<details open><summary>${esc(s.label)} — ${fmt(s.total)}</summary><p class="small">${esc(s.summary)}</p><ol>${s.lines.map(l => `<li class="small">${esc(l)}</li>`).join('')}</ol></details>`).join('') || '<p class="muted">Este algoritmo no tiene tramos; use la animación ▶ sobre el grafo.</p>';
    if (r.steps?.length) h += `<details><summary>Registro del algoritmo (${r.steps.length} pasos)</summary><ol>${r.steps.slice(0, 300).map(s => `<li class="small ${s.state === 'rejected' ? 'muted' : ''}">${esc(s.text)}</li>`).join('')}</ol></details>`;
  } else if (S.resTab === 'why') {
    const w = e?.reasoning; if (w) h += `<h4>¿Por qué este algoritmo?</h4><p>${esc(w.algorithm_choice)}</p>${w.equation ? `<div class="eq">${esc(w.equation)}</div>` : ''}<p><b>${esc(w.optimality)}</b></p>${w.comparison ? `<h4>Comparación</h4><p>${esc(w.comparison)}</p>` : ''}<h4>Supuestos</h4><ul>${w.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul><h4>Restricciones activas</h4><ul>${w.active_constraints.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
  } else if (S.resTab === 'exec') { renderExec(body); return; }
  else if (S.resTab === 'tech') {
    h += (e?.technical || []).map(s => `<h4>${esc(s.heading)}</h4>${s.paragraphs.map(p => `<p class="small">${esc(p)}</p>`).join('')}${(s.equations || []).map(q => `<div class="eq">${esc(q)}</div>`).join('')}`).join('');
  } else if (S.resTab === 'control') {
    h += `<p class="small muted">Valores para validar contra otras herramientas (p. ej. Grafos v.1.3.5).</p><div class="tablewrap"><table><thead><tr><th>Indicador</th><th>Valor</th></tr></thead><tbody>${(r.control || []).map(c => `<tr><td>${esc(c.name)}</td><td>${esc(JSON.stringify(c.value))}</td></tr>`).join('')}</tbody></table></div><p class="small muted">Parámetros de la corrida: <code>${esc(JSON.stringify(r.run_params))}</code></p>`;
  } else if (S.resTab === 'tables') {
    h += (r.matrix ? heat(r.matrix) : '') + (r.tables || []).map(t => tableHTML(t)).join('') || '<p class="muted">Sin tablas.</p>';
  }
  body.innerHTML = h;
}

/* ---------- Resumen ejecutivo completo ---------- */
function renderExec(body) {
  const r = S.result, sm = r.full_summary;
  if (!sm) {
    const q = S.expl?.executive?.short || [];
    body.innerHTML = `<div class="sbox"><h4 style="margin-top:0">Resumen ejecutivo completo</h4>
      <p class="small">Genera un informe ejecutivo con: resumen en una mirada, datos y supuestos, resultado, <b>desglose del costo</b>, <b>comparación con alternativas</b> en %, <b>sensibilidad</b> (demanda +40 %, costos ±20 %), <b>ruido de la heurística</b>, riesgos, conclusión y recomendación.</p>
      <p class="small muted">Para esto la app vuelve a resolver el problema en varios escenarios (según el algoritmo, de 0 a ~8 corridas).</p>
      <div class="row wrap"><label>Tiempo por escenario<select id="sumTime"><option value="2">2 s (rápido)</option><option value="4" selected>4 s</option><option value="8">8 s (más preciso)</option><option value="15">15 s</option></select></label>
      <label class="chk" style="margin-top:18px"><input type="checkbox" id="sumLight"> Solo cálculos directos (sin volver a resolver)</label></div>
      <div class="row" style="margin-top:8px"><button class="primary big" id="sumGo" ${S.genBusy ? 'disabled' : ''}>${S.genBusy ? '<span class="spin"></span>Generando…' : 'Generar resumen ejecutivo'}</button></div>
      <div class="progress" id="sumProg" ${S.genBusy ? '' : 'hidden'}><div></div><span></span></div></div>
      <details><summary>Resumen rápido (instantáneo)</summary><ul>${q.map(l => `<li>${esc(l)}</li>`).join('')}</ul></details>`;
    $('#sumGo').onclick = guard(() => genSummary());
    return;
  }
  const edit = S.editSum;
  let h = `<div class="row between wrap"><span class="small muted">${sm.edited ? 'Editado por usted · ' : ''}Modo: ${esc(sm.mode || '')} · ${sm.scenarios_run ?? 0} escenario(s) calculado(s)</span><div class="row">${edit ? '<button class="primary" id="sumSave">Guardar cambios</button><button id="sumCancel">Descartar</button>' : '<button id="sumEdit">Editar texto</button><button id="sumRegen">Regenerar</button>'}</div></div>`;
  if (sm.key_figures?.length) h += `<div class="kfs">${sm.key_figures.map(f => `<div class="kf"><b>${esc(f.value)}</b><span>${esc(f.label)}</span></div>`).join('')}</div>`;
  sm.sections.forEach((s, si) => {
    h += `<div class="sumsec"><h4>${esc(s.heading)}</h4>`;
    (s.paragraphs || []).forEach((p, pi) => h += edit ? `<textarea data-s="${si}" data-k="p" data-i="${pi}">${esc(p)}</textarea>` : `<p>${esc(p)}</p>`);
    if (s.bullets?.length) h += edit ? s.bullets.map((p, pi) => `<textarea data-s="${si}" data-k="b" data-i="${pi}">${esc(p)}</textarea>`).join('') : `<ul>${s.bullets.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`;
    (s.tables || []).forEach(t => { if (t.rows?.length) h += tableHTML(t, 60); });
    h += '</div>';
  });
  body.innerHTML = h;
  const g = id => $(id);
  if (g('#sumEdit')) g('#sumEdit').onclick = () => { S.editSum = true; renderResult(); };
  if (g('#sumCancel')) g('#sumCancel').onclick = () => { S.editSum = false; renderResult(); };
  if (g('#sumRegen')) g('#sumRegen').onclick = () => { delete S.result.full_summary; renderResult(); };
  if (g('#sumSave')) g('#sumSave').onclick = guard(async () => {
    const c = JSON.parse(JSON.stringify(sm));
    $$('#resBody textarea').forEach(t => { const s = c.sections[+t.dataset.s]; (t.dataset.k === 'p' ? s.paragraphs : s.bullets)[+t.dataset.i] = t.value; });
    await api(`/runs/${S.runId}/summary`, { method: 'PUT', json: { summary: c } });
    S.result.full_summary = { ...c, edited: true }; S.editSum = false; renderResult(); toast('Resumen guardado: se usará en el Word y el PDF', 'ok');
  });
}
async function genSummary(opts) {
  if (!S.runId) throw new Error('Primero ejecute un algoritmo.');
  S.genBusy = true; renderResult();
  const o = opts || { time: +($('#sumTime')?.value || 4), light: !!$('#sumLight')?.checked };
  try {
    const { job_id } = await api(`/runs/${S.runId}/summary`, { json: o });
    for (; ;) {
      await new Promise(r => setTimeout(r, 400));
      const j = await api('/jobs/' + job_id);
      const pg = $('#sumProg'); if (pg) { pg.hidden = false; $('div', pg).style.width = (j.progress * 100) + '%'; $('span', pg).textContent = `${(j.progress * 100).toFixed(0)}% ${j.message || ''}`; }
      if (j.status === 'done') { S.result.full_summary = j.summary; break; }
      if (j.status === 'error') throw new Error(j.error);
    }
    toast('Resumen ejecutivo generado', 'ok'); renderPBar();
  } finally { S.genBusy = false; if (S.result) renderResult(); }
}
async function downloadReport(kind) {
  if (!S.runId) return toast('Primero ejecute un algoritmo.', 'err');
  if ((kind === 'word' || kind === 'pdf') && !S.result.full_summary) {
    openModal(`<h2>¿Incluir el resumen ejecutivo completo?</h2><p>Esta ejecución todavía no tiene el resumen completo (comparaciones, sensibilidad, recomendación). Generarlo tarda unos segundos.</p><div class="stack"><button class="primary" id="mdGen">Generar resumen completo y descargar</button><button id="mdNow">Descargar ahora con el resumen rápido</button><button onclick="closeModal()">Cancelar</button></div>`);
    $('#mdGen').onclick = guard(async () => { $('#mcontent').innerHTML = '<h2><span class="spin"></span>Generando el resumen ejecutivo…</h2><p class="muted">Se están calculando los escenarios. No cierre esta ventana.</p>'; try { await genSummary({ time: 4 }); closeModal(); await realDownload(kind); } catch (e) { closeModal(); throw e; } });
    $('#mdNow').onclick = guard(async () => { closeModal(); await realDownload(kind); });
    return;
  }
  await realDownload(kind);
}
async function realDownload(kind) {
  const q = new URLSearchParams({ run_id: S.runId });
  const blob = await api(`/projects/${S.project.id}/export/${kind}?${q}`);
  const ext = { word: 'docx', pdf: 'pdf', excel: 'xlsx', png: 'png', svg: 'svg', geojson: 'geojson', graphml: 'graphml', gexf: 'gexf', json: 'json', csv: 'zip', sqlite: 'sqlite', zip: 'zip' }[kind] || kind;
  downloadBlob(blob, `${S.project.name}_${kind}.${ext}`); toast('Descarga lista', 'ok');
}

/* ---------- 4 · ESCENARIOS ---------- */
function renderScenarioLists() {
  $('#cmpList').innerHTML = S.runs.length ? S.runs.map(r => `<label class="runitem chk"><input type="checkbox" value="${esc(r.id)}"><span><b>${esc(r.title)}</b><br><span class="muted">${esc((r.message || '').slice(0, 100))}</span></span></label>`).join('') : '<span class="muted small">Ejecute algoritmos en «Analizar» y vuelva aquí para compararlos.</span>';
}
$('#cmpBtn').onclick = guard(async () => {
  if (!needProject()) return;
  const ids = $$('#cmpList input:checked').map(i => i.value); if (ids.length < 2) return toast('Marque al menos 2 ejecuciones.', 'err');
  const c = await api(`/projects/${S.project.id}/compare`, { json: { run_ids: ids } });
  const vals = c.rows.map(r => r.valor).filter(v => v != null), mx = Math.max(...vals, 1);
  $('#cmpOut').innerHTML = `<div class="tablewrap"><table><thead><tr><th>Escenario</th><th>Valor</th><th>Δ vs. base</th><th>Estado</th></tr></thead><tbody>${c.rows.map(r => `<tr><td>${esc(r.escenario)}</td><td>${fmt(r.valor)}<div class="bar" style="width:${r.valor != null ? Math.max(2, 100 * r.valor / mx) : 0}%"></div></td><td>${r.delta_pct == null ? '—' : (r.delta_pct >= 0 ? '+' : '') + r.delta_pct.toFixed(1) + ' %'}</td><td>${esc(r.estado)}</td></tr>`).join('')}</tbody></table></div>`;
});
async function scenarioRun(key, params) {
  if (!needProject()) return; $('#scOut').innerHTML = '<p class="muted"><span class="spin"></span>Calculando…</p>';
  try { const r = await api(`/projects/${S.project.id}/run?wait=true`, { json: { algorithm: key, params } }); $('#scOut').innerHTML = `<p><b>${esc(r.result.message)}</b></p>` + (r.result.tables || []).map(t => tableHTML(t, 50)).join(''); S.runs = await api(`/projects/${S.project.id}/runs`); renderPBar(); }
  catch (e) { $('#scOut').innerHTML = `<div class="warnbox error">${esc(e.message)}</div>`; }
}
$('#scFail').onclick = () => { const c = $('#scClosed').value.split(',').map(s => s.trim()).filter(Boolean); if (!c.length) return toast('Escriba al menos un id de nodo a cerrar.', 'err'); scenarioRun('failure', { closed_nodes: c }); };
$('#scRes').onclick = () => scenarioRun('resilience', {});
$('#scSens').onclick = () => scenarioRun('sensitivity', { algorithm: $('#scAlgo').value, param: $('#scParam').value, values: [.8, .9, 1, 1.1, 1.2], source: S.origin || S.project?.nodes[0]?.id, target: S.dest || S.project?.nodes[1]?.id });

/* ---------- 5 · PREGUNTAR ---------- */
function renderQEx() {
  const n = S.project?.nodes || [], a = n[0], b = n[Math.min(5, n.length - 1)];
  const ex = ['Árbol mínimo', 'Puntos de articulación', 'Componentes conexas', 'Diámetro de la red', 'VRP con capacidad 200'];
  if (a && b && a !== b) ex.unshift(`¿Cuál es la ruta más barata entre ${a.name || a.id} y ${b.name || b.id}?`, `Flujo máximo de ${a.id} a ${b.id}`);
  $('#qEx').innerHTML = ex.map(e => `<button>${esc(e)}</button>`).join('');
  $$('#qEx button').forEach(bt => bt.onclick = () => { $('#qIn').value = bt.textContent; $('#qBtn').click(); });
}
$('#qBtn').onclick = guard(async () => {
  if (!needProject()) return; const q = $('#qIn').value.trim(); if (!q) return toast('Escriba una pregunta.', 'err');
  $('#qOut').innerHTML = '<p class="muted"><span class="spin"></span>Calculando…</p>';
  const a = await api(`/projects/${S.project.id}/ask`, { json: { question: q } });
  let h = `<div class="sbox" style="margin-top:10px"><p><b>${esc(a.message)}</b></p>`;
  if (a.interpretation?.algorithm) h += `<p class="small muted">Interpreté la pregunta como <code>${esc(a.interpretation.algorithm)}</code> con parámetros <code>${esc(JSON.stringify(a.interpretation.params))}</code>.</p>`;
  if (a.result) h += `<div class="row"><button id="qShow" class="primary">Ver en el grafo y generar el resumen ejecutivo</button></div>`;
  $('#qOut').innerHTML = h + '</div>';
  if (a.result) $('#qShow').onclick = guard(async () => { S.runs = await api(`/projects/${S.project.id}/runs`); await setResult(a.result, a.explanation, a.run_id); showTab('analisis'); });
});
$('#qIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#qBtn').click(); });

/* ---------- 6 · EXPORTAR ---------- */
function renderExportLists() {
  $('#expRun').innerHTML = '<option value="">(ninguna: solo datos del proyecto)</option>' + S.runs.map(r => `<option value="${esc(r.id)}" ${r.id === S.runId ? 'selected' : ''}>${esc(r.title)} — ${esc((r.message || '').slice(0, 50))}</option>`).join('');
  fillNodeParams();
}
$$('[data-x]').forEach(b => b.onclick = guard(async () => {
  if (!needProject()) return; const k = b.dataset.x, rid = $('#expRun').value;
  if (['word', 'pdf'].includes(k) && !rid) return toast('Elija una ejecución para generar el informe.', 'err');
  if (['word', 'pdf'].includes(k)) { if (rid !== S.runId) { const r = await api('/runs/' + rid); await setResult(r.result, r.result.explanation, r.id); } return downloadReport(k); }
  const q = new URLSearchParams(); if (rid) q.set('run_id', rid);
  const blob = await api(`/projects/${S.project.id}/export/${k}?${q}`);
  const ext = { excel: 'xlsx', png: 'png', svg: 'svg', geojson: 'geojson', graphml: 'graphml', gexf: 'gexf', json: 'json', csv: 'zip', sqlite: 'sqlite', zip: 'zip' }[k] || k;
  downloadBlob(blob, `${S.project.name}_${k}.${ext}`); toast('Descarga lista', 'ok');
}));
$('#gBtn').onclick = guard(async () => {
  if (!needProject()) return;
  const q = new URLSearchParams({ scale: $('#gScale').value, criterion: $('#gCrit').value, value_field: $('#gVal').value, min_sep: $('#gSep').checked });
  if ($('#gSrc').value) q.set('source', $('#gSrc').value); if ($('#gDst').value) q.set('target', $('#gDst').value);
  downloadBlob(await api(`/projects/${S.project.id}/export/grafos?${q}`), `Grafos_v1.3.5_${S.project.name}.zip`); toast('Paquete Grafos listo: lea 0_INSTRUCCIONES_Grafos.txt', 'ok');
});

/* ---------- arranque ---------- */
(async function init() {
  try {
    await initInicio(); await initAnalisis(); await refreshProjects();
    const list = await api('/projects');
    if (list.length) { await loadProject(list[0].id); showTab('analisis'); } else renderPBar();
  } catch (e) { toast('No se pudo iniciar la app: ' + e.message, 'err'); }
})();
