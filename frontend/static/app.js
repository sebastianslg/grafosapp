/* Grafos Lab — frontend sin dependencias de build (Cytoscape + Leaflet locales). */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (x, d = 2) => (x === null || x === undefined) ? '—' : (typeof x === 'number' ? (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(d)) : String(x));
const PAL = ['--r1', '--r2', '--r3', '--r4', '--r5', '--r6', '--r7', '--r8'];
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const S = { project: null, catalog: [], runs: [], result: null, expl: null, runId: null, origin: null, dest: null, cy: null, map: null, view: 'graph',
  steps: [], stepIdx: 0, timer: null, job: null, dataTab: 'nodes', resTab: 'answer', upload: null, groups: {}, ghost: [] };

function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 9000 : 4000);
}
async function api(path, opt = {}) {
  const o = { ...opt };
  if (o.json !== undefined) { o.method = o.method || 'POST'; o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.json); delete o.json; }
  let r;
  try { r = await fetch('/api' + path, o); } catch (e) { toast('Sin conexión con el servidor: ' + e.message, 'err'); throw e; }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.blob();
  if (!r.ok) { const m = (data && (data.error || data.detail)) || ('Error ' + r.status); const e = new Error(typeof m === 'string' ? m : JSON.stringify(m)); e.data = data; throw e; }
  return data;
}
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, 'err'); } };

/* ---------- tema y pestañas ---------- */
$('#themeBtn').onclick = () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur === 'dark' || (cur === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('theme', document.documentElement.dataset.theme); } catch { }
  if (S.cy) styleCy();
};
try { const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch { }
function showTab(name) {
  $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'datos') renderData();
  if (name === 'analisis') { setTimeout(() => { drawGraph(); }, 30); renderRunList(); }
  if (name === 'escenarios') renderScenarioLists();
  if (name === 'exportar') renderExportLists();
}
$$('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

/* ---------- proyecto ---------- */
async function refreshProjects(selectId) {
  const list = await api('/projects');
  const sel = $('#projectSel');
  sel.innerHTML = '<option value="">— sin proyecto —</option>' + list.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${p.nodes}n/${p.edges}a)</option>`).join('');
  if (selectId) sel.value = selectId;
}
async function loadProject(id) {
  if (!id) { S.project = null; return; }
  S.project = await api('/projects/' + id);
  S.origin = S.dest = null; S.result = null; S.expl = null; S.runId = null;
  S.runs = await api(`/projects/${id}/runs`);
  $('#projectSel').value = id;
  renderRunList(); renderResult();
  if ($('#tab-analisis').classList.contains('active')) drawGraph();
  if ($('#tab-datos').classList.contains('active')) renderData();
}
$('#projectSel').onchange = guard(async e => { await loadProject(e.target.value); });
const needProject = () => { if (!S.project) { toast('Primero cargue o cree un proyecto (pestaña Ingesta).', 'err'); return false; } return true; };

/* ---------- INGESTA ---------- */
async function initIngesta() {
  const smp = await api('/samples');
  $('#samples').innerHTML = smp.map(s => `<button data-s="${esc(s.key)}">${esc(s.name)}</button>`).join('');
  $$('#samples button').forEach(b => b.onclick = guard(async () => {
    const p = await api('/samples/' + b.dataset.s, { method: 'POST' });
    await refreshProjects(p.id); await loadProject(p.id); toast('Ejemplo cargado: ' + p.name, 'ok'); showTab('analisis');
  }));
  const tpl = await api('/templates');
  $('#templates').innerHTML = tpl.map(t => `<a href="/api/templates/${esc(t)}"><button type="button">${esc(t)}</button></a>`).join('');
  const drop = $('#drop'), inp = $('#fileInput');
  drop.onclick = () => inp.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') inp.click(); };
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => upload(e.dataTransfer.files));
  inp.onchange = () => upload(inp.files);
}
const upload = guard(async files => {
  if (!files.length) return;
  const fd = new FormData(); [...files].forEach(f => fd.append('files', f));
  $('#uploadErr').innerHTML = '<p class="muted">Leyendo y perfilando…</p>';
  let pv;
  try { pv = await api('/ingest/preview', { method: 'POST', body: fd }); }
  catch (e) { $('#uploadErr').innerHTML = `<div class="warnbox error">${esc(e.message)}${(e.data?.errores || []).map(x => `<br>• ${esc(x.archivo)}: ${esc(x.error)}`).join('')}</div>`; throw e; }
  $('#uploadErr').innerHTML = (pv.errores || []).map(x => `<div class="warnbox">${esc(x.archivo)}: ${esc(x.error)}</div>`).join('');
  S.upload = pv; renderMapping();
});
const ROLES = [['nodes', 'Nodos'], ['edges', 'Aristas'], ['vehicles', 'Vehículos'], ['matrix', 'Matriz NxN'], ['coords', 'Coordenadas XY (Grafos)'], ['values', 'Valores de nodo (Grafos)'], ['params', 'Parámetros'], ['ignore', 'Ignorar']];
const FIELDS = {
  nodes: ['id', 'name', 'lat', 'lon', 'x', 'y', 'demand', 'supply', 'type', 'tw_start', 'tw_end', 'service', 'capacity', 'frequency'],
  edges: ['source', 'target', 'distance', 'time', 'cost', 'capacity', 'directed', 'emissions'],
  vehicles: ['type', 'capacity', 'fixed_cost', 'cost_per_km', 'speed', 'range', 'count', 'emissions_per_km', 'depot'], matrix: [], coords: [], values: [], params: [], ignore: []
};
function renderMapping() {
  const pv = S.upload; $('#mappingCard').hidden = false;
  let h = `<label>Nombre del proyecto<input id="pName" value="${esc((pv.files[0]?.name || 'Proyecto').replace(/\.[^.]+$/, ''))}"></label>`;
  h += pv.files.map(f => `<p class="small muted">📄 ${esc(f.name)} — <b>${esc(f.format)}</b> ${f.notes.map(n => esc(n)).join(' · ')}</p>`).join('');
  pv.tables.forEach((t, i) => {
    const conf = t.confidence ?? 0;
    h += `<details open data-t="${i}"><summary>${esc(t.name)} <span class="badge ${conf > .7 ? 'ok' : conf > .4 ? 'warn' : 'err'}">confianza ${(conf * 100).toFixed(0)}%</span> <span class="muted small">${t.rows} filas</span></summary>
    <p class="small muted">${esc(t.razon || '')}</p>
    <label>Rol <select class="roleSel">${ROLES.map(([k, l]) => `<option value="${k}" ${k === t.role ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="mapFields"></div>
    <div class="tablewrap" style="max-height:170px"><table><thead><tr>${t.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.sample.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  });
  if (pv.extracted_params?.length) {
    h += `<h3>Parámetros extraídos del texto (confirme)</h3><p class="small muted">Lo que no se pudo extraer no se inventa; confirme o descarte cada línea.</p><table><thead><tr><th></th><th>Parámetro</th><th>Valor</th><th>Confianza</th><th>Cita de origen</th></tr></thead><tbody>` +
      pv.extracted_params.map((p, i) => `<tr><td><input type="checkbox" class="exp" data-i="${i}" ${p.confianza >= .8 ? 'checked' : ''}></td><td>${esc(p.descripcion)}</td><td><input class="expv" data-i="${i}" value="${esc(p.valor)}"></td><td>${(p.confianza * 100).toFixed(0)}%</td><td class="small">${esc(p.cita)}</td></tr>`).join('') + '</tbody></table>';
  }
  h += `<h3>Opciones</h3><div class="row wrap">
    <label>Unidad de distancia<select id="unitSel"><option value="1">km</option><option value="1000">metros</option><option value="1.609344">millas</option></select></label>
    <label>Aristas faltantes<select id="genSel"><option value="">no generar (usar las cargadas)</option><option value="knn">k vecinos más cercanos</option><option value="threshold">umbral de distancia</option><option value="delaunay">Delaunay</option><option value="complete">grafo completo</option></select></label>
    <label>k / umbral (km)<input id="genK" value="4" size="5"></label><label class="chk"><input type="checkbox" id="genDir"> dirigido</label></div>
    <div class="row"><button id="commitBtn" class="primary">Confirmar y crear proyecto</button></div>`;
  $('#mappingBody').innerHTML = h;
  $$('#mappingBody details').forEach(d => {
    const i = +d.dataset.t, t = pv.tables[i], sel = $('.roleSel', d);
    const draw = () => {
      const role = sel.value, cols = t.columns, cur = (role === t.role ? t.mapping : {}) || {};
      $('.mapFields', d).innerHTML = FIELDS[role].length ? `<div class="row wrap">` + FIELDS[role].map(f => `<label>${f}<select data-f="${f}"><option value="">—</option>${cols.map(c => `<option ${cur[f] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`).join('') + '</div>'
        : (role === 'matrix' ? `<label>La matriz representa<select class="mAttr"><option value="cost">costo</option><option value="distance">distancia</option><option value="time">tiempo</option><option value="capacity">capacidad/máximo</option></select></label>` : (role === 'values' ? `<label>Los valores son<select class="vField"><option value="demand">demanda</option><option value="supply">oferta</option></select></label>` : ''));
    };
    sel.onchange = draw; draw();
  });
  $('#commitBtn').onclick = guard(commit);
}
async function commit() {
  const pv = S.upload, decisions = {};
  $$('#mappingBody details').forEach(d => {
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
  toast(`Proyecto creado: ${p.nodes.length} nodos, ${p.edges.length} aristas`, 'ok');
  showTab(p.meta.warnings.length ? 'datos' : 'analisis');
}

/* ---------- DATOS ---------- */
function renderWarnings() {
  $('#warnings').innerHTML = (S.project?.meta?.warnings || []).map(w => `<div class="warnbox ${w.nivel === 'error' ? 'error' : ''}"><b>${esc(w.nivel)}</b>: ${esc(w.mensaje)}</div>`).join('');
}
const NCOLS = ['id', 'name', 'lat', 'lon', 'x', 'y', 'demand', 'supply', 'type', 'tw_start', 'tw_end', 'service', 'capacity', 'frequency'];
const ECOLS = ['source', 'target', 'distance', 'time', 'cost', 'capacity', 'directed', 'emissions'];
const VCOLS = ['type', 'capacity', 'fixed_cost', 'cost_per_km', 'speed', 'range', 'count', 'emissions_per_km', 'depot'];
function renderData() {
  renderWarnings();
  const p = S.project, b = $('#dataBody');
  if (!p) { b.innerHTML = '<p class="muted" style="padding:10px">Sin proyecto.</p>'; return; }
  $$('#dataTabs button').forEach(x => x.classList.toggle('on', x.dataset.d === S.dataTab));
  const tab = S.dataTab;
  if (tab === 'params') {
    b.innerHTML = `<table><tbody>${Object.entries(p.params).map(([k, v]) => `<tr><th>${esc(k)}</th><td><input data-k="${esc(k)}" value="${esc(Array.isArray(v) ? v.join(',') : v)}"></td></tr>`).join('')}</tbody></table>`;
    return;
  }
  if (tab === 'versions') { api(`/projects/${p.id}/versions`).then(v => { b.innerHTML = `<table><thead><tr><th>Versión</th><th>Nota</th><th>Fecha</th><th></th></tr></thead><tbody>${v.map(x => `<tr><td>${x.version}</td><td>${esc(x.note)}</td><td>${new Date(x.created * 1000).toLocaleString()}</td><td><button data-v="${x.version}">Restaurar</button></td></tr>`).join('')}</tbody></table>`; $$('button[data-v]', b).forEach(bt => bt.onclick = guard(async () => { await api(`/projects/${p.id}/restore/${bt.dataset.v}`, { method: 'POST' }); await loadProject(p.id); renderData(); toast('Versión restaurada', 'ok'); })); }); return; }
  const cols = { nodes: NCOLS, edges: ECOLS, vehicles: VCOLS }[tab], rows = p[tab];
  const MAXR = 400;
  b.innerHTML = `<table><thead><tr>${cols.map(c => `<th data-c="${c}">${c} ↕</th>`).join('')}<th></th></tr></thead><tbody>${rows.slice(0, MAXR).map((r, i) => `<tr>${cols.map(c => `<td><input data-i="${i}" data-c="${c}" value="${esc(r[c] ?? '')}"></td>`).join('')}<td><button data-del="${i}" class="ghost" aria-label="Eliminar fila">✕</button></td></tr>`).join('')}</tbody></table>` + (rows.length > MAXR ? `<p class="muted small">Mostrando ${MAXR} de ${rows.length} filas (exporte para ver todas).</p>` : '') + `<div class="row" style="margin:8px"><button id="addRow">+ Agregar fila</button></div>`;
  $$('th[data-c]', b).forEach(th => th.onclick = () => { const c = th.dataset.c, d = th.dataset.dir === 'a' ? -1 : 1; th.dataset.dir = d === 1 ? 'a' : 'd'; rows.sort((a, z) => (a[c] ?? '') > (z[c] ?? '') ? d : -d); renderData(); });
  $$('button[data-del]', b).forEach(bt => bt.onclick = () => { rows.splice(+bt.dataset.del, 1); renderData(); });
  $('#addRow').onclick = () => { rows.push(Object.fromEntries(cols.map(c => [c, null]))); renderData(); };
}
$$('#dataTabs button').forEach(b => b.onclick = () => { collectData(); S.dataTab = b.dataset.d; renderData(); });
function collectData() {
  const p = S.project; if (!p) return;
  const b = $('#dataBody');
  if (S.dataTab === 'params') {
    $$('input[data-k]', b).forEach(i => { const k = i.dataset.k, old = p.params[k]; let v = i.value; if (Array.isArray(old)) v = v.split(',').map(s => s.trim()).filter(Boolean); else if (typeof old === 'number' || (old === null) || (!isNaN(parseFloat(v)) && isFinite(v))) { const n = parseFloat(v); v = isNaN(n) ? old : n; } else if (typeof old === 'boolean') v = v === 'true'; p.params[k] = v; });
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
  S.project = { ...p, ...out }; renderData(); toast('Guardado (versión ' + out.version + ')', 'ok'); refreshProjects(p.id);
});
$('#genEdgesBtn').onclick = guard(async () => {
  if (!needProject()) return;
  const method = prompt('Método: knn | threshold | delaunay | complete', 'knn'); if (!method) return;
  let k = 4, thr = null; if (method === 'knn') k = +prompt('k vecinos', '4') || 4; if (method === 'threshold') thr = parseFloat(prompt('Umbral (km)', '5'));
  const dir = confirm('¿Aristas dirigidas? (Aceptar = sí, Cancelar = no dirigidas)');
  const r = await api(`/projects/${S.project.id}/generate-edges`, { json: { method, k, threshold: thr, directed: dir } });
  S.project = r.project; renderData(); toast(`${r.added} aristas generadas`, 'ok');
});
$('#layoutBtn').onclick = guard(async () => { if (!needProject()) return; S.project = await api(`/projects/${S.project.id}/layout`, { json: { reset: true, separate: true } }); toast('Nodos reordenados y separados', 'ok'); });

/* ---------- ANÁLISIS: grafo ---------- */
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
    { selector: 'node', style: { 'background-color': 'data(color)', 'width': 'data(size)', 'height': 'data(size)', 'label': 'data(label)', 'font-size': 9, 'color': ink, 'text-valign': 'bottom', 'text-margin-y': 3, 'text-background-color': css('--bg'), 'text-background-opacity': .75, 'text-background-padding': 1, 'border-width': 1, 'border-color': css('--card') } },
    { selector: 'node[?depot]', style: { 'shape': 'rectangle' } },
    { selector: 'edge', style: { 'width': 1.2, 'line-color': edge, 'target-arrow-color': edge, 'curve-style': 'bezier', 'target-arrow-shape': 'data(arrow)', 'label': 'data(w)', 'font-size': 7, 'color': css('--muted'), 'text-rotation': 'autorotate', 'text-opacity': 0 } },
    { selector: '.showw', style: { 'text-opacity': 1 } },
    { selector: '.nolbl', style: { 'label': '' } },
    { selector: '.hidden', style: { 'display': 'none' } },
    { selector: '.origin', style: { 'background-color': css('--origin'), 'border-width': 3, 'border-color': '#000' } },
    { selector: '.dest', style: { 'background-color': css('--dest'), 'border-width': 3, 'border-color': '#000' } },
    { selector: '.hl', style: { 'background-color': css('--origin') } },
    { selector: '.visited', style: { 'background-color': css('--r2') } },
    { selector: 'edge.acc', style: { 'line-color': css('--r3'), 'target-arrow-color': css('--r3'), 'width': 3 } },
    { selector: 'edge.rej', style: { 'line-color': css('--r1'), 'target-arrow-color': css('--r1'), 'line-style': 'dashed', 'width': 2 } },
    { selector: 'edge.ghost', style: { 'line-style': 'dotted', 'curve-style': 'straight' } },
    ...PAL.map((v, i) => ({ selector: 'edge.g' + i, style: { 'line-color': css(v), 'target-arrow-color': css(v), 'width': 3.5, 'z-index': 9 } })),
    { selector: 'edge.arr', style: { 'target-arrow-shape': 'triangle' } }
  ]).update();
}
function projectedXY(n, i, N) {
  if (n.x != null && n.y != null) return { x: n.x, y: n.y };
  const a = 2 * Math.PI * i / Math.max(N, 1); return { x: 450 + 300 * Math.cos(a), y: 320 + 300 * Math.sin(a) };
}
function drawGraph() {
  const p = S.project;
  if (!p) { $('#cy').innerHTML = '<p class="muted" style="padding:14px">Cargue un proyecto.</p>'; return; }
  const types = [...new Set(p.nodes.map(n => n.type).filter(Boolean))];
  $('#typeFilter').innerHTML = '<option value="">Todos los tipos</option>' + types.map(t => `<option>${esc(t)}</option>`).join('');
  const maxD = Math.max(1, ...p.nodes.map(n => n.demand || 0));
  const els = [];
  p.nodes.forEach((n, i) => { const pos = projectedXY(n, i, p.nodes.length); els.push({ group: 'nodes', data: { id: n.id, label: n.name && n.name !== n.id ? `${n.id} · ${n.name}` : String(n.id), color: nodeColor(n), size: 12 + 14 * Math.sqrt((n.demand || 0) / maxD), type: n.type || '', depot: (p.params.depots || []).includes(n.id) }, position: pos }); });
  const dirDefault = !!p.params.directed_default;
  p.edges.forEach((e, i) => { const dir = e.directed ?? dirDefault; els.push({ group: 'edges', data: { id: 'e' + i, source: e.source, target: e.target, w: fmt(e.distance ?? e.cost), arrow: dir ? 'triangle' : 'none', dir } }); });
  if (S.cy) S.cy.destroy();
  S.cy = cytoscape({ container: $('#cy'), elements: els, layout: { name: 'preset' }, minZoom: .1, maxZoom: 6, boxSelectionEnabled: false });
  styleCy();
  $('#cy').oncontextmenu = e => e.preventDefault();
  S.cy.on('tap', 'node', e => { if (e.originalEvent && e.originalEvent.button === 2) return; setSel('origin', e.target.id()); });
  S.cy.on('cxttap', 'node', e => setSel('dest', e.target.id()));
  S.cy.on('dragfree', 'node', async e => { const n = S.project.nodes.find(x => x.id === e.target.id()); const q = e.target.position(); n.x = +q.x.toFixed(1); n.y = +q.y.toFixed(1); });
  S.cy.fit(undefined, 30);
  applyToggles(); applySel(); if (S.result) applyResultHighlights(true); renderMapIfNeeded();
}
function applyToggles() {
  if (!S.cy) return;
  S.cy.edges().toggleClass('showw', $('#showW').checked);
  S.cy.nodes().toggleClass('nolbl', !$('#showLbl').checked);
  const tf = $('#typeFilter').value; S.cy.nodes().forEach(n => n.toggleClass('hidden', !!tf && n.data('type') !== tf));
}
['showW', 'showLbl', 'typeFilter'].forEach(id => $('#' + id).onchange = applyToggles);
function setSel(kind, id) {
  S[kind] = id; applySel();
  const o = S.project.nodes.find(n => n.id === S.origin), d = S.project.nodes.find(n => n.id === S.dest);
  if (S.origin && S.dest) quickPath();
}
function applySel() {
  if (S.cy) { S.cy.nodes().removeClass('origin dest'); if (S.origin) S.cy.getElementById(S.origin).addClass('origin'); if (S.dest) S.cy.getElementById(S.dest).addClass('dest'); }
  $('#orgLbl').textContent = S.origin ?? '—'; $('#dstLbl').textContent = S.dest ?? '—';
  fillNodeParams();
}
$('#clearSel').onclick = () => { S.origin = S.dest = null; applySel(); };
const quickPath = guard(async () => {
  const r = await runAlgo('dijkstra', { source: S.origin, target: S.dest, criterion: $('#critSel').value }, true);
  if (r) { S.resTab = 'answer'; }
});

/* ---------- ANÁLISIS: algoritmos ---------- */
async function initAnalisis() {
  S.catalog = await api('/catalog');
  const groups = {}; S.catalog.forEach(a => (groups[a.category] ??= []).push(a));
  $('#algoSel').innerHTML = Object.entries(groups).map(([g, l]) => `<optgroup label="${esc(g)}">${l.map(a => `<option value="${esc(a.key)}">${esc(a.name)}</option>`).join('')}</optgroup>`).join('');
  $('#scAlgo').innerHTML = S.catalog.filter(a => a.category !== 'Escenarios').map(a => `<option value="${esc(a.key)}">${esc(a.name)}</option>`).join('');
  $('#algoSel').onchange = renderParams; renderParams();
}
function renderParams() {
  const a = S.catalog.find(x => x.key === $('#algoSel').value); if (!a) return;
  const seen = new Set();
  $('#algoParams').innerHTML = a.params.filter(p => !seen.has(p.name) && seen.add(p.name)).map(p => {
    const id = 'p_' + p.name, def = p.default ?? '';
    if (p.type === 'select') return `<label>${esc(p.label)}<select id="${id}">${p.options.map(o => `<option ${o === (p.name === 'criterion' ? $('#critSel').value : def) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    if (p.type === 'bool') return `<label class="chk"><input type="checkbox" id="${id}"> ${esc(p.label)}</label>`;
    if (p.type === 'node') return `<label>${esc(p.label)}<select id="${id}" data-node="1"></select></label>`;
    if (p.type === 'nodes') return `<label>${esc(p.label)} (ids, coma)<input id="${id}" placeholder="p. ej. 1,4,7"></label>`;
    if (p.type === 'json') return `<label>${esc(p.label)}<textarea id="${id}" rows="2" placeholder="JSON"></textarea></label>`;
    return `<label>${esc(p.label)}<input id="${id}" value="${esc(def)}" ${p.type === 'int' || p.type === 'float' ? 'inputmode="decimal"' : ''}></label>`;
  }).join('');
  fillNodeParams();
}
function fillNodeParams() {
  if (!S.project) return;
  const opts = '<option value="">—</option>' + S.project.nodes.map(n => `<option value="${esc(n.id)}">${esc(n.id)}${n.name && n.name !== n.id ? ' · ' + esc(n.name) : ''}</option>`).join('');
  $$('select[data-node]').forEach(s => { const prev = s.value; s.innerHTML = opts; const k = s.id; s.value = k === 'p_source' ? (S.origin || prev) : k === 'p_target' ? (S.dest || prev) : prev; });
  ['gSrc', 'gDst'].forEach(id => { const s = $('#' + id); if (s) { const pv = s.value; s.innerHTML = opts; s.value = pv; } });
}
function collectParams() {
  const a = S.catalog.find(x => x.key === $('#algoSel').value), out = {};
  a.params.forEach(p => {
    const el = $('#p_' + p.name); if (!el) return; let v = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (v === '' || v === false) return;
    if (p.type === 'int') v = parseInt(v); else if (p.type === 'float') v = parseFloat(v);
    else if (p.type === 'nodes') v = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (p.type === 'json') { try { v = JSON.parse(v); } catch { throw new Error(`El campo «${p.label}» no es JSON válido.`); } }
    out[p.name] = v;
  });
  return out;
}
$('#runBtn').onclick = guard(async () => { if (!needProject()) return; await runAlgo($('#algoSel').value, collectParams(), false); });
$('#cancelBtn').onclick = () => { if (S.job) api(`/jobs/${S.job}/cancel`, { method: 'POST' }); };
async function runAlgo(key, params, quick) {
  const wait = quick ? '?wait=true' : '';
  if (quick) {
    const r = await api(`/projects/${S.project.id}/run${wait}`, { json: { algorithm: key, params } });
    await setResult(r.result, r.explanation, r.run_id); return r;
  }
  $('#runBtn').disabled = true; $('#cancelBtn').hidden = false; $('#progress').hidden = false; setProg(0, 'En cola…');
  try {
    const { job_id } = await api(`/projects/${S.project.id}/run`, { json: { algorithm: key, params } }); S.job = job_id;
    for (; ;) {
      await new Promise(r => setTimeout(r, 350));
      const j = await api('/jobs/' + job_id); setProg(j.progress || 0, j.message || j.status);
      if (j.status === 'done') { await setResult(j.result, j.explanation, j.run_id); return j; }
      if (j.status === 'error') throw new Error(j.error);
      if (j.status === 'cancelled') { toast('Cancelado', ''); return null; }
    }
  } finally { $('#runBtn').disabled = false; $('#cancelBtn').hidden = true; $('#progress').hidden = true; S.job = null; }
}
function setProg(f, m) { $('#progress div').style.width = (f * 100) + '%'; $('#progress span').textContent = `${(f * 100).toFixed(0)}% ${m || ''}`; }
async function setResult(res, expl, runId) {
  S.result = res; S.expl = expl; S.runId = runId;
  S.runs = await api(`/projects/${S.project.id}/runs`); renderRunList(); renderResult(); applyResultHighlights(false); setupAnim();
}
function renderRunList() {
  const l = $('#runList'); if (!S.project) { l.innerHTML = ''; return; }
  l.innerHTML = S.runs.length ? S.runs.map(r => `<div class="runitem" data-id="${esc(r.id)}"><div><b>${esc(r.title || r.key)}</b><br><span class="muted">${esc((r.message || '').slice(0, 80))}</span></div></div>`).join('') : '<span class="muted small">Sin corridas.</span>';
  $$('.runitem', l).forEach(d => d.onclick = guard(async () => { const r = await api('/runs/' + d.dataset.id); await setResult(r.result, r.result.explanation, r.id); }));
}

/* resaltado y animación */
function clearHighlights() {
  if (!S.cy) return;
  S.cy.remove('edge.ghost'); S.cy.elements().removeClass('hl visited acc rej arr ' + PAL.map((_, i) => 'g' + i).join(' '));
  S.cy.nodes().forEach(n => n.data('label', n.data('orig') || n.data('label'))); S.cy.edges().forEach(e => e.removeData('x'));
  applySel();
}
function edgeFor(u, v) {
  if (!S.cy) return null;
  let e = S.cy.edges().filter(x => (x.data('source') === u && x.data('target') === v) || (!x.data('dir') && x.data('source') === v && x.data('target') === u));
  if (e.length) return e[0];
  const id = 'gh_' + u + '_' + v; const ex = S.cy.getElementById(id); if (ex.length) return ex;
  if (!S.cy.getElementById(u).length || !S.cy.getElementById(v).length) return null;
  return S.cy.add({ group: 'edges', data: { id, source: u, target: v, w: '', arrow: 'triangle', dir: true }, classes: 'ghost' });
}
function applyResultHighlights(silent) {
  if (!S.cy || !S.result) return; clearHighlights();
  S.groups = {}; const r = S.result;
  (r.highlight_edges || []).forEach(([u, v, g]) => { if (!(g in S.groups)) S.groups[g] = Object.keys(S.groups).length; const e = edgeFor(u, v); if (e) { e.addClass('g' + (S.groups[g] % 8)); if (r.paths?.length) e.addClass('arr'); } });
  (r.highlight_nodes || []).forEach(n => S.cy.getElementById(n).addClass('hl'));
  // numeración de paradas
  (r.paths || []).forEach((p, pi) => { (p.stops || []).forEach((s, k) => { const n = S.cy.getElementById(s); if (!n.length) return; if (!n.data('orig')) n.data('orig', n.data('label')); if (k > 0 && k < p.stops.length - 1 && (r.paths.length > 1 || p.stops.length > 3)) n.data('label', `${n.data('orig')} [${r.paths.length > 1 ? 'r' + (pi + 1) + '·' : ''}${k}]`); }); });
  $('#legend').innerHTML = Object.entries(S.groups).slice(0, 12).map(([g, i]) => `<span><i style="background:${css(PAL[i % 8])}"></i>${esc(g)}</span>`).join('');
  renderMapIfNeeded();
}
function setupAnim() {
  stopAnim(); S.steps = (S.result?.steps || []); S.stepIdx = S.steps.length;
  $('#aSlider').max = S.steps.length; $('#aSlider').value = S.steps.length; $('#aLbl').textContent = `${S.steps.length}/${S.steps.length}`;
  $('#stepNote').textContent = S.steps.length ? 'Use ▶ para animar el algoritmo paso a paso.' : '';
}
function showStep(k) {
  if (!S.cy) return; S.stepIdx = Math.max(0, Math.min(S.steps.length, k));
  clearHighlights();
  for (let i = 0; i < S.stepIdx; i++) {
    const s = S.steps[i];
    (s.nodes || []).forEach(n => S.cy.getElementById(n).addClass(s.state === 'rejected' ? '' : 'visited'));
    (s.edges || []).forEach(([u, v]) => { const e = edgeFor(u, v); if (e) { e.removeClass('acc rej'); e.addClass(s.state === 'rejected' ? 'rej' : 'acc'); } });
  }
  if (S.stepIdx === S.steps.length) applyResultHighlights(true);
  $('#aSlider').value = S.stepIdx; $('#aLbl').textContent = `${S.stepIdx}/${S.steps.length}`;
  $('#stepNote').textContent = S.stepIdx ? `Paso ${S.stepIdx}: ${S.steps[S.stepIdx - 1].text}` : '';
}
function stopAnim() { if (S.timer) { clearInterval(S.timer); S.timer = null; $('#aPlay').textContent = '▶'; } }
$('#aPlay').onclick = () => {
  if (S.timer) return stopAnim(); if (!S.steps.length) return toast('Este resultado no tiene pasos.', '');
  if (S.stepIdx >= S.steps.length) showStep(0);
  $('#aPlay').textContent = '⏸'; S.timer = setInterval(() => { if (S.stepIdx >= S.steps.length) return stopAnim(); showStep(S.stepIdx + 1); }, +$('#aSpeed').value);
};
$('#aNext').onclick = () => { stopAnim(); showStep(S.stepIdx + 1); }; $('#aPrev').onclick = () => { stopAnim(); showStep(S.stepIdx - 1); };
$('#aSlider').oninput = e => { stopAnim(); showStep(+e.target.value); };
$('#aSpeed').onchange = () => { if (S.timer) { stopAnim(); $('#aPlay').click(); } };

/* mapa */
$('#viewGraph').onclick = () => setView('graph'); $('#viewMap').onclick = () => setView('map');
function setView(v) {
  S.view = v; $('#viewGraph').classList.toggle('on', v === 'graph'); $('#viewMap').classList.toggle('on', v === 'map');
  $('#cy').hidden = v === 'map'; $('#map').hidden = v === 'graph';
  if (v === 'map') { if (!S.project?.nodes.every(n => n.lat != null && n.lon != null)) { toast('Mapa requiere lat/lon en todos los nodos; se muestra el grafo abstracto.', 'err'); return setView('graph'); } renderMap(); } else if (S.cy) { S.cy.resize(); S.cy.fit(undefined, 30); }
}
function renderMapIfNeeded() { if (S.view === 'map') renderMap(); }
function renderMap() {
  const p = S.project; if (!p) return;
  if (S.map) { S.map.remove(); S.map = null; }
  S.map = L.map('map', { preferCanvas: true }); const bounds = [];
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.map);
  const by = Object.fromEntries(p.nodes.map(n => [n.id, n]));
  p.edges.forEach(e => { const a = by[e.source], b = by[e.target]; if (a && b) L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: css('--edge'), weight: 1 }).addTo(S.map); });
  Object.entries(S.groups).forEach(([g]) => { });
  (S.result?.highlight_edges || []).forEach(([u, v, g]) => { const a = by[u], b = by[v]; if (a && b) L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: css(PAL[(S.groups[g] ?? 0) % 8]), weight: 4 }).addTo(S.map); });
  p.nodes.forEach(n => { bounds.push([n.lat, n.lon]); L.circleMarker([n.lat, n.lon], { radius: 5 + 8 * Math.sqrt((n.demand || 0) / Math.max(1, ...p.nodes.map(x => x.demand || 0))), color: '#222', weight: 1, fillColor: nodeColor(n), fillOpacity: .9 }).bindTooltip(`${n.id}${n.name && n.name !== n.id ? ' · ' + n.name : ''}`, { permanent: $('#showLbl').checked && p.nodes.length <= 60 }).on('click', () => setSel('origin', n.id)).on('contextmenu', () => setSel('dest', n.id)).addTo(S.map); });
  S.map.fitBounds(bounds, { padding: [20, 20] });
}

/* ---------- Resultados ---------- */
$$('#resTabs button').forEach(b => b.onclick = () => { S.resTab = b.dataset.r; renderResult(); });
function tableHTML(t, limit = 200) {
  return `<h4 style="margin:10px 0 4px">${esc(t.title)}</h4><div class="tablewrap" style="max-height:260px"><table><thead><tr>${t.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0, limit).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${t.rows.length > limit ? `<p class="small muted">+${t.rows.length - limit} filas (en el Excel)</p>` : ''}`;
}
function heat(m) {
  const N = Math.min(m.labels.length, 60), vals = m.values.flat().filter(v => v != null && v > 0); const mx = Math.max(...vals, 1), mn = Math.min(...vals, 0);
  const col = v => { if (v == null) return 'transparent'; const f = (v - mn) / (mx - mn || 1); return `color-mix(in srgb, ${css('--accent')} ${Math.round(f * 70)}%, transparent)`; };
  return `<h4>${esc(m.title || 'Matriz')}</h4><div class="tablewrap heat"><table><thead><tr><th></th>${m.labels.slice(0, N).map((l, i) => `<th>${esc(m.ids?.[i] ?? l)}</th>`).join('')}</tr></thead><tbody>${m.values.slice(0, N).map((row, i) => `<tr><th>${esc(m.ids?.[i] ?? m.labels[i])}</th>${row.slice(0, N).map(v => `<td style="background:${col(v)}" title="${esc(fmt(v))}">${v == null ? '·' : fmt(v, 1)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${m.labels.length > N ? `<p class="small muted">Mostrando ${N}×${N} de ${m.labels.length}.</p>` : ''}`;
}
function renderResult() {
  $$('#resTabs button').forEach(b => b.classList.toggle('on', b.dataset.r === S.resTab));
  const r = S.result, e = S.expl, b = $('#resBody');
  if (!r) { b.innerHTML = '<p class="muted">Ejecute un algoritmo o haga clic en dos nodos.</p>'; return; }
  const st = { optimal: ['ok', 'Óptimo probado'], heuristic: ['warn', 'Heurístico'], info: ['', 'Informativo'] }[r.status] || ['', r.status];
  const head = `<h3 style="text-transform:none;font-size:15px;color:var(--ink)">${esc(r.title)}</h3><span class="badge ${st[0]}">${st[1]}</span> <span class="small muted">${r.elapsed_s ?? ''} s · semilla ${esc(r.run_params?.seed)}</span>`;
  let h = head;
  if (S.resTab === 'answer') {
    h += (r.warnings || []).map(w => `<div class="warnbox">${esc(w)}</div>`).join('') + `<p><b>${esc(e?.answer || r.message)}</b></p>`;
    if (r.value != null) h += `<p>Valor: <b>${fmt(r.value)}</b> ${esc(r.unit || '')}</p>`;
    if (r.matrix) h += heat(r.matrix);
    h += (r.tables || []).slice(0, 2).map(t => tableHTML(t, 30)).join('');
  } else if (S.resTab === 'steps') {
    h += (e?.steps || []).map(s => `<details open><summary>${esc(s.label)} — ${fmt(s.total)}</summary><p class="small">${esc(s.summary)}</p><ol>${s.lines.map(l => `<li class="small">${esc(l)}</li>`).join('')}</ol></details>`).join('') || '<p class="muted">Sin tramos para este algoritmo; use la animación del lienzo.</p>';
    if (r.steps?.length) h += `<details><summary>Registro del algoritmo (${r.steps.length} pasos)</summary><ol>${r.steps.slice(0, 300).map(s => `<li class="small ${s.state === 'rejected' ? 'muted' : ''}">${esc(s.text)}</li>`).join('')}</ol></details>`;
  } else if (S.resTab === 'why') {
    const w = e?.reasoning; if (w) h += `<p>${esc(w.algorithm_choice)}</p>${w.equation ? `<div class="eq">${esc(w.equation)}</div>` : ''}<p><b>${esc(w.optimality)}</b></p>${w.comparison ? `<p><b>Comparación:</b> ${esc(w.comparison)}</p>` : ''}<h4>Supuestos</h4><ul>${w.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul><h4>Restricciones activas</h4><ul>${w.active_constraints.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
  } else if (S.resTab === 'exec') {
    const x = e?.executive; if (x) h += `<h4>Versión corta</h4><ul>${x.short.map(l => `<li>${esc(l)}</li>`).join('')}</ul><details><summary>Versión larga</summary><pre style="white-space:pre-wrap;font:inherit">${esc(x.long.join('\n'))}</pre></details><p class="small muted">Edite el texto en el Word exportado.</p>`;
  } else if (S.resTab === 'tech') {
    h += (e?.technical || []).map(s => `<h4>${esc(s.heading)}</h4>${s.paragraphs.map(p => `<p class="small">${esc(p)}</p>`).join('')}${(s.equations || []).map(q => `<div class="eq">${esc(q)}</div>`).join('')}`).join('');
  } else if (S.resTab === 'control') {
    h += `<p class="small muted">Valores para validar contra otras herramientas (p. ej. Grafos v.1.3.5).</p><table><thead><tr><th>Indicador</th><th>Valor</th></tr></thead><tbody>${(r.control || []).map(c => `<tr><td>${esc(c.name)}</td><td>${esc(JSON.stringify(c.value))}</td></tr>`).join('')}</tbody></table><p class="small muted">Parámetros: <code>${esc(JSON.stringify(r.run_params))}</code></p>`;
  } else if (S.resTab === 'tables') {
    h += (r.matrix ? heat(r.matrix) : '') + (r.tables || []).map(t => tableHTML(t)).join('');
  }
  b.innerHTML = h;
}

/* ---------- ESCENARIOS ---------- */
function renderScenarioLists() {
  $('#cmpList').innerHTML = S.runs.length ? S.runs.map(r => `<label class="runitem chk"><input type="checkbox" value="${esc(r.id)}"><span><b>${esc(r.title)}</b><br><span class="muted">${esc((r.message || '').slice(0, 90))}</span></span></label>`).join('') : '<span class="muted small">Ejecute algoritmos primero.</span>';
}
$('#cmpBtn').onclick = guard(async () => {
  const ids = $$('#cmpList input:checked').map(i => i.value); if (ids.length < 2) return toast('Marque al menos 2 ejecuciones.', 'err');
  const c = await api(`/projects/${S.project.id}/compare`, { json: { run_ids: ids } });
  const vals = c.rows.map(r => r.valor).filter(v => v != null), mx = Math.max(...vals, 1);
  $('#cmpOut').innerHTML = `<table><thead><tr><th>Escenario</th><th>Valor</th><th>Δ %</th><th>Estado</th></tr></thead><tbody>${c.rows.map(r => `<tr><td>${esc(r.escenario)}</td><td>${fmt(r.valor)}<div class="bar" style="width:${r.valor != null ? Math.max(2, 100 * r.valor / mx) : 0}%"></div></td><td>${r.delta_pct == null ? '—' : (r.delta_pct >= 0 ? '+' : '') + r.delta_pct.toFixed(1) + ' %'}</td><td>${esc(r.estado)}</td></tr>`).join('')}</tbody></table>`;
});
async function scenarioRun(key, params) { if (!needProject()) return; const r = await runAlgo(key, params, true); if (r) { $('#scOut').innerHTML = `<p><b>${esc(r.result.message)}</b></p>` + (r.result.tables || []).map(t => tableHTML(t, 50)).join(''); } }
$('#scFail').onclick = guard(() => scenarioRun('failure', { closed_nodes: $('#scClosed').value.split(',').map(s => s.trim()).filter(Boolean) }));
$('#scRes').onclick = guard(() => scenarioRun('resilience', {}));
$('#scSens').onclick = guard(() => scenarioRun('sensitivity', { algorithm: $('#scAlgo').value, param: $('#scParam').value, values: [.8, .9, 1, 1.1, 1.2], source: S.origin, target: S.dest, ...(S.origin ? {} : {}) }));

/* ---------- PREGUNTAS ---------- */
$('#qBtn').onclick = guard(async () => {
  if (!needProject()) return; const q = $('#qIn').value.trim(); if (!q) return;
  $('#qOut').innerHTML = '<p class="muted">Calculando…</p>';
  const a = await api(`/projects/${S.project.id}/ask`, { json: { question: q } });
  let h = `<p><b>${esc(a.message)}</b></p>`;
  if (a.interpretation?.algorithm) h += `<p class="small muted">Interpretación: algoritmo <code>${esc(a.interpretation.algorithm)}</code>, parámetros <code>${esc(JSON.stringify(a.interpretation.params))}</code></p>`;
  if (a.result) { h += `<div class="row"><button id="qShow">Ver en el grafo</button></div>`; }
  $('#qOut').innerHTML = h;
  if (a.result) $('#qShow').onclick = guard(async () => { await setResult(a.result, a.explanation, a.run_id); showTab('analisis'); });
});
$('#qIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#qBtn').click(); });

/* ---------- EXPORTAR ---------- */
function renderExportLists() {
  $('#expRun').innerHTML = '<option value="">(ninguna; datos del proyecto)</option>' + S.runs.map(r => `<option value="${esc(r.id)}" ${r.id === S.runId ? 'selected' : ''}>${esc(r.title)}</option>`).join('');
  fillNodeParams();
}
$$('[data-x]').forEach(b => b.onclick = guard(async () => {
  if (!needProject()) return; const k = b.dataset.x, rid = $('#expRun').value;
  const q = new URLSearchParams(); if (rid) q.set('run_id', rid);
  const blob = await api(`/projects/${S.project.id}/export/${k}?${q}`);
  download(blob, `${S.project.name}_${k}`, k);
}));
$('#gBtn').onclick = guard(async () => {
  if (!needProject()) return;
  const q = new URLSearchParams({ scale: $('#gScale').value, criterion: $('#gCrit').value, value_field: $('#gVal').value, min_sep: $('#gSep').checked });
  if ($('#gSrc').value) q.set('source', $('#gSrc').value); if ($('#gDst').value) q.set('target', $('#gDst').value);
  download(await api(`/projects/${S.project.id}/export/grafos?${q}`), `Grafos_v1.3.5_${S.project.name}`, 'zip');
});
function download(blob, name, k) {
  const ext = { word: 'docx', pdf: 'pdf', excel: 'xlsx', png: 'png', svg: 'svg', geojson: 'geojson', graphml: 'graphml', gexf: 'gexf', json: 'json', csv: 'zip', sqlite: 'sqlite', zip: 'zip' }[k] || k;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.${ext}`.replace(/[^\w.\-áéíóúñ]+/gi, '_'); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('Descarga lista', 'ok');
}

/* ---------- arranque ---------- */
(async function init() {
  try {
    await initIngesta(); await initAnalisis(); await refreshProjects();
    const list = await api('/projects');
    if (list.length) { await loadProject(list[0].id); showTab('analisis'); }
  } catch (e) { toast('No se pudo iniciar: ' + e.message, 'err'); }
})();
