/* Gráficas: distancia y carga por ruta, composición de la jornada, convergencia del solver (mejor solución y cota),
   comparación de métodos, historial de corridas (escenarios) y análisis de sensibilidad.
   Barras en HTML y líneas/dispersión en SVG, sin bibliotecas externas (funciona sin internet). Cada gráfica tiene
   tooltip al pasar el cursor o al enfocar con el teclado, y sus datos se pueden descargar en CSV. */
(function () {
  'use strict';
  const { S, $, esc, fmt, COL } = window.App;
  const CLAVE_H = (c) => 'parcial-grafos:historial:' + c;
  const RUTEO = ['tsp', 'mtsp', 'cvrp', 'flota', 'vrp'];
  const SERIE = ['var(--viz-s1)', 'var(--viz-s2)', 'var(--viz-s3)', 'var(--viz-s4)', 'var(--viz-s5)', 'var(--viz-s6)', 'var(--viz-s7)', 'var(--viz-s8)'];

  /* ---------- utilidades ---------- */
  function ticks(a, b, n = 5) {
    if (!(b > a)) { b = a + 1; }
    const paso0 = (b - a) / n, e = Math.pow(10, Math.floor(Math.log10(paso0))), f = paso0 / e, paso = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e;
    const out = []; for (let v = Math.ceil(a / paso) * paso; v <= b + paso * 1e-9; v += paso) out.push(+v.toFixed(10)); return out;
  }
  const corto = (v) => { const a = Math.abs(v); return a >= 1e6 ? fmt(v / 1e6, 1) + ' M' : a >= 1e4 ? fmt(v / 1e3, 1) + ' K' : fmt(v, a >= 100 ? 0 : a >= 10 ? 1 : 2); };
  const csv = (filas) => filas.map((f) => f.map((v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\n');
  const tarjeta = (id, titulo, sub, cuerpo, datos) => { if (datos) DATOS[id] = datos; return `<section class="graf" id="g_${id}"><div class="graf-cab"><div><h3>${titulo}</h3>${sub ? `<p class="nota">${sub}</p>` : ''}</div>${datos ? `<button class="btn gris mini" data-csv="${id}" title="Descargar los datos de esta gráfica">CSV</button>` : ''}</div>${cuerpo}</section>`; };
  const DATOS = {}; let ANCHO = 380;   // ancho real del panel: el SVG se dibuja a escala 1 (texto legible)

  /* barras horizontales (HTML): filas [{etq, sub, v, color, tip, txt}] — base en cero, admite negativos */
  function barras(filas, o = {}) {
    if (!filas.length) return '<p class="nota">Sin datos.</p>';
    const vals = filas.map((f) => f.v).filter(Number.isFinite), mn = Math.min(0, ...vals), mx = Math.max(0, ...vals, o.max ?? -Infinity), span = mx - mn || 1, z = (0 - mn) / span * 100;
    return `<div class="hb" role="list">` + filas.map((f, i) => {
      const ok = Number.isFinite(f.v), w = ok ? Math.abs(f.v) / span * 100 : 0, izq = ok && f.v < 0 ? z - w : z, neg = ok && f.v < 0;
      return `<div class="hb-f" role="listitem" tabindex="0" data-tip="${esc(f.tip || (f.etq + ': ' + (ok ? fmt(f.v, 2) : 'sin valor')))}" style="--i:${i}"><div class="hb-e"><span class="sw" style="background:${f.color || SERIE[0]}"></span><span>${esc(f.etq)}${f.sub ? `<small>${esc(f.sub)}</small>` : ''}</span></div>
        <div class="hb-p">${o.pista ? '<i class="hb-t"></i>' : ''}${mn < 0 ? `<i class="hb-z" style="left:${z}%"></i>` : ''}<i class="hb-b${neg ? ' neg' : ''}" style="left:${izq}%;width:${w}%;background:${f.color || SERIE[0]}"></i></div><div class="hb-v tabular">${esc(f.txt ?? (ok ? fmt(f.v, 2) : '—'))}</div></div>`;
    }).join('') + `</div>`;
  }

  /* barra apilada por fila (HTML): filas [{etq, sub, partes:[{v, color, nombre}], txt}] con leyenda */
  function apiladas(filas, leyenda) {
    const mx = Math.max(1e-9, ...filas.map((f) => f.partes.reduce((s, p) => s + Math.max(0, p.v), 0)));
    return `<div class="leyenda-g">${leyenda.map(([n, c, cls]) => `<span><i class="${cls || ''}" style="background:${c}"></i>${esc(n)}</span>`).join('')}</div><div class="hb">` + filas.map((f, i) => {
      let x = 0; const seg = f.partes.map((p) => { const w = Math.max(0, p.v) / mx * 100, s = `<i class="hb-b seg ${p.cls || ''}" style="left:${x}%;width:${w}%;background:${p.color}" data-tip="${esc(f.etq + ' · ' + p.nombre + ': ' + p.txt)}" tabindex="0"></i>`; x += w; return s; }).join('');
      return `<div class="hb-f" style="--i:${i}"><div class="hb-e"><span class="sw" style="background:${f.color}"></span><span>${esc(f.etq)}${f.sub ? `<small>${esc(f.sub)}</small>` : ''}</span></div><div class="hb-p">${seg}</div><div class="hb-v tabular">${esc(f.txt)}</div></div>`;
    }).join('') + '</div>';
  }

  /* líneas (SVG) con cruz que sigue al cursor: series [{nombre, color, pts:[[x,y]], escalon, punteada}] */
  function lineas(id, series, o = {}) {
    const todos = series.flatMap((s) => s.pts).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (todos.length < 1) return '<p class="nota">Sin datos suficientes para graficar.</p>';
    const W = ANCHO, H = o.alto || 200, m = { l: 48, r: 12, t: 14, b: 32 };
    let x0 = Math.min(...todos.map((p) => p[0])), x1 = Math.max(...todos.map((p) => p[0])); if (x1 <= x0) { x1 = x0 + 1; }
    let y0 = Math.min(...todos.map((p) => p[1])), y1 = Math.max(...todos.map((p) => p[1])); if (o.yTope != null && isFinite(o.yTope) && o.yTope > y0) y1 = Math.min(y1, o.yTope); const pad = (y1 - y0) * 0.08 || Math.abs(y1) * 0.05 || 1; y0 -= pad; y1 += pad; if (o.cero && y0 > 0) y0 = 0;
    const ty = ticks(y0, y1, 4), tx = o.xs || ticks(x0, x1, 5); y0 = Math.min(y0, ty[0]); y1 = Math.max(y1, ty[ty.length - 1]);
    const X = (v) => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r), Y = (v) => m.t + (1 - (Math.min(v, y1) - y0) / (y1 - y0)) * (H - m.t - m.b);
    let g = `<svg class="ln" id="sv_${id}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.titulo || 'gráfica')}" preserveAspectRatio="xMidYMid meet">`;
    g += ty.map((v) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="tk" x="${m.l - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${corto(v)}</text>`).join('');
    g += tx.filter((v) => v >= x0 - 1e-9 && v <= x1 + 1e-9).map((v) => `<text class="tk" x="${X(v).toFixed(1)}" y="${H - m.b + 16}" text-anchor="middle">${esc(o.fx ? o.fx(v) : corto(v))}</text>`).join('');
    g += `<line class="eje" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>`;
    if (o.xEtq) g += `<text class="tk" x="${W - m.r}" y="${H - 4}" text-anchor="end">${esc(o.xEtq)}</text>`;
    if (o.banda) { const [a, b] = o.banda; const pa = a.pts, pb = b.pts; if (pa.length > 1 && pb.length > 1) { const d = pa.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ') + ' ' + pb.slice().reverse().map((p) => 'L' + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ') + ' Z'; g += `<path class="banda" d="${d}"/>`; } }
    series.forEach((s) => {
      const pts = s.pts.filter((p) => Number.isFinite(p[1])); if (!pts.length) return;
      let d = ''; pts.forEach((p, i) => { d += i ? (s.escalon ? ` H${X(p[0]).toFixed(1)} V${Y(p[1]).toFixed(1)}` : ` L${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`) : `M${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`; });
      g += `<path class="serie${s.punteada ? ' punteada' : ''}" d="${d}" style="stroke:${s.color}"/>`;
      if (s.marcas !== false && pts.length <= 40) g += pts.map((p) => `<circle class="pto" cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="4" style="fill:${s.color}"/>`).join('');
      const u = pts[pts.length - 1]; if (o.etqFin !== false) g += `<text class="fin" x="${Math.min(W - m.r - 2, X(u[0]) + 0).toFixed(1)}" y="${(Y(u[1]) - 8).toFixed(1)}" text-anchor="end">${esc(s.nombre)} ${corto(u[1])}</text>`;
    });
    g += `<line class="cruz" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" style="display:none"/><rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" tabindex="0"/></svg>`;
    LN[id] = { series, X, x0, x1, W, m, fx: o.fx || ((v) => fmt(v, 2)), fy: o.fy || ((v) => fmt(v, 2)) };
    const ley = series.length > 1 ? `<div class="leyenda-g">${series.map((s) => `<span><i class="linea${s.punteada ? ' punteada' : ''}" style="background:${s.color}"></i>${esc(s.nombre)}</span>`).join('')}</div>` : '';
    return ley + `<div class="ln-w">${g}</div>`;
  }
  const LN = {};
  function enlazarLineas(raiz) {
    raiz.querySelectorAll('svg.ln').forEach((sv) => {
      const id = sv.id.slice(3), L = LN[id]; if (!L) return; const cruz = sv.querySelector('.cruz'), hit = sv.querySelector('.hit');
      const xs = [...new Set(L.series.flatMap((s) => s.pts.map((p) => p[0])))].sort((a, b) => a - b);
      const mostrar = (xv, ev) => {
        let best = xs[0]; xs.forEach((x) => { if (Math.abs(x - xv) < Math.abs(best - xv)) best = x; });
        cruz.style.display = ''; cruz.setAttribute('x1', L.X(best)); cruz.setAttribute('x2', L.X(best));
        const filas = L.series.map((s) => { let p = null; s.pts.forEach((q) => { if (q[0] <= best + 1e-12 && Number.isFinite(q[1])) p = q; }); if (!s.escalon) p = s.pts.find((q) => q[0] === best) || null; return p ? [s, p[1]] : null; }).filter(Boolean);
        tip(ev, [L.fx(best)].concat(filas.map(([s, v]) => ({ c: s.color, t: s.nombre, v: L.fy(v) }))));
      };
      hit.addEventListener('pointermove', (e) => { const r = sv.getBoundingClientRect(), xpx = (e.clientX - r.left) / r.width * L.W; mostrar(L.x0 + (xpx - L.m.l) / (L.W - L.m.l - L.m.r) * (L.x1 - L.x0), e); });
      hit.addEventListener('pointerleave', () => { cruz.style.display = 'none'; ocultarTip(); });
      let k = xs.length - 1; hit.addEventListener('focus', (e) => { k = xs.length - 1; mostrar(xs[k], e); }); hit.addEventListener('blur', () => { cruz.style.display = 'none'; ocultarTip(); });
      hit.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); k = Math.max(0, Math.min(xs.length - 1, k + (e.key === 'ArrowLeft' ? -1 : 1))); mostrar(xs[k], { target: hit }); } });
    });
  }

  /* dispersión (SVG): pts [{x, y, etq, color, destacar}] con áreas de toque de 24 px */
  function dispersion(id, pts, o = {}) {
    const ok = pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)); if (!ok.length) return '<p class="nota">Sin datos.</p>';
    const W = ANCHO, H = 200, m = { l: 48, r: 14, t: 16, b: 32 };
    let x0 = 0, x1 = Math.max(...ok.map((p) => p.x)) * 1.08 || 1, y0 = 0, y1 = Math.max(...ok.map((p) => p.y)) * 1.12 || 1;
    const tx = ticks(x0, x1, 5), ty = ticks(y0, y1, 4); x1 = Math.max(x1, tx[tx.length - 1]); y1 = Math.max(y1, ty[ty.length - 1]);
    const X = (v) => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r), Y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
    let g = `<svg class="ln" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.titulo || 'dispersión')}">`;
    g += ty.map((v) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="tk" x="${m.l - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${esc(o.fy ? o.fy(v) : corto(v))}</text>`).join('');
    g += tx.map((v) => `<text class="tk" x="${X(v).toFixed(1)}" y="${H - m.b + 16}" text-anchor="middle">${esc(o.fx ? o.fx(v) : corto(v))}</text>`).join('') + `<line class="eje" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>`;
    if (o.xEtq) g += `<text class="tk" x="${W - m.r}" y="${H - 4}" text-anchor="end">${esc(o.xEtq)}</text>`;
    if (o.yEtq) g += `<text class="tk" x="${m.l}" y="${m.t - 3}" text-anchor="start">${esc(o.yEtq)}</text>`;
    ok.forEach((p) => { g += `<g class="pt" tabindex="0" data-tip="${esc(p.tip || p.etq)}"><circle class="hit-pt" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="12"/><circle class="pto" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${p.destacar ? 6 : 4.5}" style="fill:${p.color}"/></g>`;
      if (p.destacar) g += `<text class="fin" x="${(X(p.x) + 9).toFixed(1)}" y="${(Y(p.y) - 8).toFixed(1)}">${esc(p.etq)}</text>`; });
    return `<div class="ln-w">${g}</svg></div>`;
  }

  /* ---------- tooltip único ---------- */
  let tipEl = null;
  function tip(ev, contenido) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tipg glass'; tipEl.setAttribute('role', 'status'); document.body.appendChild(tipEl); }
    tipEl.textContent = '';
    if (typeof contenido === 'string') tipEl.textContent = contenido;
    else contenido.forEach((f, i) => { const d = document.createElement('div'); if (typeof f === 'string') { d.className = 'tt-x'; d.textContent = f; } else { const k = document.createElement('i'); k.style.background = f.c; const v = document.createElement('b'); v.textContent = f.v; const t = document.createElement('span'); t.textContent = f.t; d.append(k, v, t); } tipEl.appendChild(d); void i; });
    tipEl.classList.add('vis');
    const r = ev && ev.clientX != null ? { x: ev.clientX, y: ev.clientY } : (() => { const b = ev.target.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top }; })();
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight; tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.x + 14)) + 'px'; tipEl.style.top = Math.max(8, Math.min(innerHeight - h - 8, r.y - h - 12)) + 'px';
  }
  const ocultarTip = () => { if (tipEl) tipEl.classList.remove('vis'); };
  function enlazarTips(raiz) {
    raiz.querySelectorAll('[data-tip]').forEach((e) => {
      e.addEventListener('pointermove', (ev) => tip(ev, e.dataset.tip)); e.addEventListener('pointerleave', ocultarTip);
      e.addEventListener('focus', (ev) => tip(ev, e.dataset.tip)); e.addEventListener('blur', ocultarTip);
    });
  }

  /* ---------- historial de corridas (escenarios) ---------- */
  const leerH = () => { try { const h = JSON.parse(localStorage.getItem(CLAVE_H(S.clave)) || '[]'); return Array.isArray(h) ? h : []; } catch (e) { return []; } };
  const guardarH = (h) => { try { localStorage.setItem(CLAVE_H(S.clave), JSON.stringify(h.slice(-40))); } catch (e) { /* almacenamiento lleno o bloqueado */ } };
  App.registrarCorrida = (r) => {
    if (!r || !r.res || !RUTEO.includes(r.kind) || !r.res.rutas || !r.res.rutas.length) return;
    const x = r.res, h = leerH(), n = (h.length ? h[h.length - 1].n : 0) + 1;
    h.push({ n, fecha: new Date().toISOString(), titulo: r.titulo, kind: r.kind, variante: r.extra && r.extra.variante || r.kind, objetivo: +x.objetivo, total: +(x.total ?? x.objetivo), costo: +(x.totalCosto ?? x.objetivo), gap: x.gap == null || !isFinite(x.gap) ? null : (String(x.estado).startsWith('óptimo') ? 0 : x.gap), seg: +(x.seg || 0), rutas: x.rutas.length, estado: String(x.estado || '') });
    guardarH(h);
  };

  /* ---------- panel ---------- */
  function pGraficas(el) {
    const r = S.res && S.res.ds === S.clave ? S.res : null, u = S.ds.unidad; let h = '';
    ANCHO = Math.max(260, Math.round((el.clientWidth || 380) - 26));
    Object.keys(DATOS).forEach((k) => delete DATOS[k]); Object.keys(LN).forEach((k) => delete LN[k]);
    if (r && RUTEO.includes(r.kind) && r.res.rutas && r.res.rutas.length) {
      const x = r.res, nR = x.rutas.length, nombre = (k) => 'Ruta ' + (k + 1), tipo = (k) => (x.info && x.info[k] ? x.info[k].tipo : '');
      const dists = x.rutas.map((ru, k) => (x.dists ? x.dists[k] : ru.slice(1).reduce((s, v, q) => s + S.ds.D[ru[q]][v], 0)));
      const prom = dists.reduce((a, b) => a + b, 0) / nR;
      h += tarjeta('dist', 'Distancia por ruta', `${nR} ruta(s) · promedio ${fmt(prom, 1)} ${u} · la más larga es ${fmt(Math.max(...dists) / Math.max(1e-9, prom), 2)} × el promedio`,
        barras(x.rutas.map((ru, k) => ({ etq: nombre(k), sub: tipo(k), v: dists[k], color: COL[k % COL.length], txt: fmt(dists[k], 1) + ' ' + u, tip: `${nombre(k)}: ${fmt(dists[k], 2)} ${u} · ${ru.length - 2 + (ru[ru.length - 1] === ru[0] ? 0 : 1)} parada(s)` }))),
        [['Ruta', 'Vehículo', 'Distancia (' + u + ')']].concat(x.rutas.map((_, k) => [k + 1, tipo(k), +dists[k].toFixed(4)])));
      if (x.info && x.info.some((q) => isFinite(q.cap) && q.cap > 0)) {
        const filas = x.info.map((q, k) => ({ q, k })).filter(({ q }) => isFinite(q.cap) && q.cap > 0);
        const uso = filas.map(({ q }) => q.carga / q.cap * 100), med = uso.reduce((a, b) => a + b, 0) / uso.length;
        h += tarjeta('carga', 'Uso de la capacidad', `Utilización media de la flota usada: ${fmt(med, 1)} %`,
          barras(filas.map(({ q, k }, i) => ({ etq: nombre(k), sub: q.tipo, v: uso[i], color: COL[k % COL.length], txt: `${fmt(q.carga, 0)}/${fmt(q.cap, 0)} · ${fmt(uso[i], 0)} %`, tip: `${nombre(k)}: carga ${fmt(q.carga, 1)} de ${fmt(q.cap, 1)} (${fmt(uso[i], 1)} %)` })), { max: 100, pista: true }),
          [['Ruta', 'Vehículo', 'Carga', 'Capacidad', 'Uso (%)']].concat(filas.map(({ q, k }, i) => [k + 1, q.tipo, q.carga, q.cap, +uso[i].toFixed(2)])));
      }
      if (window.Sim && Sim.agenda) {
        const ag = Sim.agenda(r), tot = (g, c) => g.tramos.reduce((s, z) => s + z[c], 0);
        const filas = ag.map((g) => { const v = g.tramos.reduce((s, z) => s + (z.llega - z.sale), 0), e = tot(g, 'espera'), sv = tot(g, 'servicio'); return { g, v, e, sv }; });
        h += tarjeta('jornada', 'Composición de la jornada', 'Horas de viaje, de espera por ventanas y de servicio de cada vehículo (misma agenda del Gantt y de la simulación).',
          apiladas(filas.map(({ g, v, e, sv }) => { const c = COL[g.k % COL.length]; return { etq: nombre(g.k), sub: g.tipo, color: c, txt: fmt(v + e + sv, 2) + ' h', partes: [{ v, color: c, nombre: 'viaje', txt: fmt(v, 2) + ' h' }, { v: e, color: 'var(--viz-tex)', cls: 'tex', nombre: 'espera', txt: fmt(e * 60, 0) + ' min' }, { v: sv, color: `color-mix(in srgb, ${c} 55%, #000)`, nombre: 'servicio', txt: fmt(sv * 60, 0) + ' min' }] }; }),
            [['Viaje (color de la ruta)', 'var(--viz-muted)'], ['Espera por ventana', 'var(--viz-tex)', 'tex'], ['Servicio (tono oscuro)', 'color-mix(in srgb, var(--viz-muted) 45%, #000)']]),
          [['Ruta', 'Viaje (h)', 'Espera (h)', 'Servicio (h)', 'Total (h)']].concat(filas.map(({ g, v, e, sv }) => [g.k + 1, +v.toFixed(4), +e.toFixed(4), +sv.toFixed(4), +(v + e + sv).toFixed(4)])));
      }
      const hist = (r.hist || []).filter((p) => p.mejor != null || p.cota != null);
      if (hist.length >= 2) {
        const sm = { nombre: 'Mejor solución', color: 'var(--viz-s1)', pts: hist.filter((p) => p.mejor != null).map((p) => [p.t, p.mejor]), escalon: true };
        const sc = { nombre: 'Mejor cota', color: 'var(--viz-s2)', pts: hist.filter((p) => p.cota != null).map((p) => [p.t, p.cota]), escalon: true, punteada: true };
        h += tarjeta('conv', 'Convergencia del modelo matemático', 'La brecha es el espacio entre la mejor solución hallada y la cota (el óptimo está entre ambas). Cuando se juntan, la solución es óptima probada.',
          lineas('conv', [sm, sc], { titulo: 'Convergencia', xEtq: 'segundos', fx: (v) => fmt(v, 1) + ' s', fy: (v) => fmt(v, 2), banda: [sm, sc], etqFin: true, yTope: (() => { const fm = sm.pts.length ? sm.pts[sm.pts.length - 1][1] : null, c0 = Math.min(...sc.pts.map((p) => p[1]), fm ?? Infinity); return fm == null ? null : fm + 1.5 * (fm - c0) + 1e-9; })() }),
          [['Tiempo (s)', 'Mejor solución', 'Mejor cota']].concat(hist.map((p) => [+(+p.t).toFixed(3), p.mejor ?? '', p.cota ?? ''])));
      } else if (x.historial && x.historial.length >= 2) {
        h += tarjeta('conv', 'Convergencia', 'Mejor costo encontrado en el tiempo.', lineas('conv', [{ nombre: 'Mejor costo', color: 'var(--viz-s1)', pts: x.historial.map((p) => [p[0], p[1]]), escalon: true }], { xEtq: 'segundos', fx: (v) => fmt(v, 1) + ' s' }),
          [['Tiempo (s)', 'Mejor costo']].concat(x.historial.map((p) => [p[0], p[1]])));
      }
      if (x.comparacion && x.comparacion.length) {
        const cs = x.comparacion.filter((c) => c.factible).sort((a, b) => a.obj - b.obj), mejor = cs.length ? cs[0].obj : null;
        h += tarjeta('comp', 'Comparación de métodos · función objetivo', 'Ordenados de mejor a peor. El modelo matemático es la referencia; la etiqueta indica la brecha de cada método frente a la cota.',
          barras(cs.map((c) => ({ etq: c.metodo, sub: c.tipo === 'exacto' ? 'exacto' : c.tipo === 'meta' ? 'metaheurística' : 'heurística', v: c.obj, color: c.tipo === 'exacto' ? 'var(--viz-s1)' : c.tipo === 'meta' ? 'var(--viz-s7)' : 'var(--viz-s3)', txt: fmt(c.obj, 1) + (c.gap != null ? ' · ' + fmt(c.gap * 100, 1) + ' %' : ''), tip: `${c.metodo}: ${fmt(c.obj, 2)} · brecha ${c.gap == null ? 'n/d' : fmt(c.gap * 100, 2) + ' %'} · ${fmt(c.seg, 2)} s${c.obj === mejor ? ' · la mejor' : ''}` }))),
          [['Método', 'Tipo', 'Objetivo', 'Brecha (%)', 'Tiempo (s)']].concat(x.comparacion.map((c) => [c.metodo, c.tipo, c.factible ? c.obj : '', c.gap == null ? '' : +(c.gap * 100).toFixed(4), +(+c.seg).toFixed(3)])));
        h += `<div class="leyenda-g"><span><i style="background:var(--viz-s1)"></i>Exacto</span><span><i style="background:var(--viz-s3)"></i>Heurística</span><span><i style="background:var(--viz-s7)"></i>Metaheurística</span></div>`;
        const pts = x.comparacion.filter((c) => c.factible && c.gap != null).map((c) => ({ x: c.seg, y: c.gap * 100, etq: c.metodo, color: c.tipo === 'exacto' ? 'var(--viz-s1)' : c.tipo === 'meta' ? 'var(--viz-s7)' : 'var(--viz-s3)', tip: `${c.metodo}: ${fmt(c.seg, 2)} s · brecha ${(c.gap * 100).toFixed(2)} %`, destacar: c.tipo === 'exacto' }));
        const mejorH = pts.filter((p) => !p.destacar).sort((a, b) => a.y - b.y)[0]; if (mejorH) mejorH.destacar = true;
        h += tarjeta('disp', 'Calidad frente a tiempo', 'Cada punto es un método: más abajo = más cerca del óptimo; más a la izquierda = más rápido.', dispersion('disp', pts, { xEtq: 'segundos', yEtq: 'brecha %', fx: (v) => fmt(v, 1), fy: (v) => fmt(v, 1) + ' %' }));
      }
    } else h += `<div class="aviso info">Resuelva un problema de rutas (TSP, m-TSP o una variante del VRP) para ver las gráficas de su solución. El historial y la sensibilidad están abajo.</div>`;

    // historial
    const H = leerH();
    if (H.length) {
      const ult = H.slice(-12);
      h += tarjeta('hist', 'Historial de corridas', `Últimas ${ult.length} de ${H.length} corridas de este proyecto. Sirve para comparar escenarios: cambie la flota, la capacidad o la variante y vuelva a resolver.`,
        barras(ult.map((c) => ({ etq: '#' + c.n + ' · ' + String(c.titulo).split(' · ')[0].replace(/\s*\(.*\)$/, '').slice(0, 26), sub: `${c.rutas} ruta(s) · ${c.gap == null ? 'brecha n/d' : 'brecha ' + fmt(c.gap * 100, 2) + ' %'} · ${fmt(c.seg, 1)} s`, v: c.objetivo, color: 'var(--viz-s1)', txt: fmt(c.objetivo, 1), tip: `#${c.n} ${c.titulo}: objetivo ${fmt(c.objetivo, 2)} · distancia ${fmt(c.total, 2)} ${u} · ${c.estado}` })))
        + `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn gris mini" id="gBorrarH">Borrar historial</button></div>`,
        [['#', 'Fecha', 'Corrida', 'Objetivo', 'Distancia', 'Costo', 'Brecha (%)', 'Tiempo (s)', 'Rutas', 'Estado']].concat(H.map((c) => [c.n, c.fecha, c.titulo, c.objetivo, c.total, c.costo, c.gap == null ? '' : +(c.gap * 100).toFixed(4), c.seg, c.rutas, c.estado])));
    }
    h += sensHtml();
    el.innerHTML = `<div class="graficas">${h}</div>`;
    enlazarTips(el); enlazarLineas(el); enlazarSens(el);
    el.querySelectorAll('[data-csv]').forEach((b) => (b.onclick = () => { const d = DATOS[b.dataset.csv]; if (d) Datos.descargar(`${S.ds.clave}_${b.dataset.csv}.csv`, '﻿' + csv(d), 'text/csv'); }));
    const bh = el.querySelector('#gBorrarH'); if (bh) bh.onclick = () => App.hoja('<h3>¿Borrar el historial de corridas?</h3><p class="nota">Solo se borra la lista de corridas de este proyecto; los datos no cambian.</p><div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn peligro" data-x="ok">Borrar</button></div>', (x) => { App.cerrarHoja(); if (x === 'ok') { guardarH([]); App.renderPanel(); } });
  }

  /* ---------- análisis de sensibilidad (VRP) ---------- */
  function opcionesSens() {
    const info = App.vrpInfo && App.vrpInfo(); if (!info) return null; const v = info.v, o = [];
    if (!v.mixta && !v.m) o.push(['m', 'Número de vehículos']);
    if (v.cap || v.mixta) o.push(['cap', v.mixta ? 'Capacidad (multiplicador de toda la flota)' : 'Capacidad del vehículo']);
    if (v.lmaxDist) o.push(['L', 'Distancia máxima por ruta']);
    if (v.vt || v.f && v.f.tmax) o.push(['serv', 'Tiempo de servicio por cliente (min)']);
    o.push(['vel', 'Velocidad (multiplicador)']);
    return { v, o };
  }
  function valoresDefecto(par) {
    const f = S.ds.flota, t0 = f.find((t) => +t.n > 0) || f[0] || { n: 2, cap: 15 }, info = App.vrpInfo && App.vrpInfo(), mix = info && info.v.mixta;
    if (par === 'm') { const m0 = Math.max(1, Math.round(App.num($('vrpM') && $('vrpM').value, 0, 0, 30)) || f.reduce((a, t) => a + (+t.n || 0), 0) || 2); return [m0 - 1, m0, m0 + 1, m0 + 2].filter((x) => x >= 1).join(', '); }
    if (par === 'cap') return mix ? '0.8, 1, 1.25, 1.5' : [0.6, 0.8, 1, 1.25, 1.5].map((k) => Math.max(1, Math.round((+t0.cap || 15) * k))).join(', ');
    if (par === 'L') { const L = App.num($('vrpL') && $('vrpL').value, 0, 0); return L ? [0.8, 1, 1.2, 1.5].map((k) => +(L * k).toFixed(1)).join(', ') : '20, 30, 40, 60'; }
    if (par === 'serv') return '0, 5, 10, 20, 30';
    return '0.5, 0.75, 1, 1.5';
  }
  function sensHtml() {
    const op = opcionesSens(), sv = S.sens && S.sens.clave === S.clave ? S.sens : null;
    let h = '';
    if (!op) h = `<p class="nota">Elija <b>VRP · variantes</b> en «Tipo de problema» para analizar cómo cambia el óptimo al variar la flota, la capacidad, la distancia máxima, el servicio o la velocidad.</p>`;
    else {
      const par = (S.sensPar && op.o.some((x) => x[0] === S.sensPar)) ? S.sensPar : op.o[0][0];
      h = `<div class="fila"><label class="campo">Parámetro<select id="sPar">${op.o.map(([k, t]) => `<option value="${k}" ${k === par ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label><label class="campo">Valores (separados por coma)<input id="sVals" value="${esc(S.sensVals && S.sensPar === par ? S.sensVals : valoresDefecto(par))}"></label></div>
        <div class="fila"><label class="campo">Tiempo por corrida (s)<input id="sT" type="number" min="3" max="600" value="${S.sensT || 15}"></label><div style="display:flex;align-items:flex-end;gap:8px"><button class="btn" id="sCorrer" data-run>Correr el análisis</button></div></div>
        <p class="nota">Variante: <b>${esc(op.v.nombre)}</b>. Se resuelve el modelo matemático una vez por valor, con el resto de los datos igual. Puede detenerlo con «Parar y ver lo mejor».</p>`;
    }
    if (sv && sv.puntos.length) {
      const pts = sv.puntos.filter((p) => p.objetivo != null && isFinite(p.objetivo));
      h += lineas('sens', [{ nombre: 'Óptimo', color: 'var(--viz-s1)', pts: pts.map((p) => [p.valor, p.objetivo]) }], { titulo: 'Sensibilidad', xEtq: sv.etq, xs: sv.puntos.map((p) => p.valor), fx: (v) => fmt(v, 2), fy: (v) => fmt(v, 2), etqFin: false });
      h += `<table><tr><th>${esc(sv.etq)}</th><th>Objetivo</th><th>Rutas</th><th>Brecha</th><th>Estado</th></tr>` + sv.puntos.map((p) => `<tr><td class="tabular">${fmt(p.valor, 2)}</td><td class="tabular">${p.objetivo == null ? '—' : fmt(p.objetivo, 2)}</td><td>${p.rutas ?? '—'}</td><td class="tabular">${p.gap == null ? '—' : fmt(p.gap * 100, 2) + ' %'}</td><td>${esc(p.estado || '')}</td></tr>`).join('') + '</table>';
      DATOS.sens = [[sv.etq, 'Objetivo', 'Rutas', 'Brecha (%)', 'Estado']].concat(sv.puntos.map((p) => [p.valor, p.objetivo ?? '', p.rutas ?? '', p.gap == null ? '' : +(p.gap * 100).toFixed(4), p.estado]));
    }
    return `<section class="graf" id="g_sens"><div class="graf-cab"><div><h3>Análisis de sensibilidad</h3><p class="nota">¿Cuánto cambia el óptimo si cambia un dato?</p></div>${sv && sv.puntos.length ? '<button class="btn gris mini" data-csv="sens">CSV</button>' : ''}</div>${h}</section>`;
  }
  function enlazarSens(el) {
    const b = el.querySelector('#sCorrer'); if (!b) return;
    el.querySelector('#sPar').onchange = (e) => { S.sensPar = e.target.value; S.sensVals = null; el.querySelector('#sVals').value = valoresDefecto(S.sensPar); };
    el.querySelector('#sVals').onchange = (e) => { S.sensVals = e.target.value; S.sensPar = el.querySelector('#sPar').value; };
    b.disabled = !!S.corriendo;
    b.onclick = () => {
      const par = el.querySelector('#sPar').value, op = opcionesSens(); if (!op) return;
      const vals = [...new Set(String(el.querySelector('#sVals').value).split(/[;,\s]+/).map((t) => App.num(t, NaN, 0, 1e9)).filter((v) => Number.isFinite(v) && (par === 'serv' || v > 0)))].sort((a, b) => a - b).slice(0, 12);
      if (!vals.length) return App.chip('Escriba al menos un valor válido (números positivos separados por coma)');
      const T = App.num(el.querySelector('#sT').value, 15, 3, 600); S.sensT = T; S.sensPar = par; S.sensVals = vals.join(', ');
      const base = window.VrpUi.base(); if (!base) return;
      const etq = op.o.find((x) => x[0] === par)[1];
      S.sens = { clave: S.clave, par, etq, puntos: [], titulo: base.v.nombre };
      App.lanzar('sens', { par, valores: vals, tiempo: T, metodo: S.ds.metodo }, 'Sensibilidad · ' + base.v.nombre, { sens: true }, { base: base.S, variante: base.v.id, p: base.p });
      App.renderPanel();
    };
  }
  App.sensPunto = (pt) => { if (!S.sens) return; S.sens.puntos.push(pt); if (S.panel === 'graficas') App.renderPanel(); };
  App.sensFin = (res) => { if (S.sens && res && Array.isArray(res.puntos)) S.sens.puntos = res.puntos; App.setPanel('graficas'); App.chip(res && res.detenido ? 'Análisis de sensibilidad detenido: se muestran los valores calculados' : 'Análisis de sensibilidad terminado'); };

  window.App.paneles.push({ id: 'graficas', titulo: 'Gráficas', render: pGraficas });
  window.Graficas = { barras, lineas, ticks, tip, ocultarTip };
})();
