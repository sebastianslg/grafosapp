/* Simulación del recorrido: vehículos que avanzan por las calles con su velocidad, reloj del día, paradas con tiempo de
   servicio y espera por ventanas, carga que cambia en cada cliente, rumbo, panel de flota en vivo y diagrama de Gantt.
   La agenda (horas de salida, llegada, espera y servicio) es la misma para la simulación y para el Gantt. */
(function () {
  'use strict';
  const { S, $, esc, fmt, corto, nodo, COL } = window.App;
  const R = 6371000, rad = Math.PI / 180;
  const metros = (a, b) => { const x = (b[1] - a[1]) * rad * Math.cos((a[0] + b[0]) / 2 * rad), y = (b[0] - a[0]) * rad; return Math.hypot(x, y) * R; };
  const rumbo = (a, b) => { const dx = (b[1] - a[1]) * Math.cos(a[0] * rad), dy = b[0] - a[0]; return Math.atan2(dx, dy) / rad; };
  const ICONOS = {
    tracto: '<path d="M1 14V8h4v6M5 14h2V7h9l3 4h4v3h-1M7 14h9" /><rect x="7" y="9" width="10" height="5" rx="1" fill="#fff" fill-opacity=".35"/><circle cx="4" cy="16.5" r="1.6"/><circle cx="12" cy="16.5" r="1.6"/><circle cx="20" cy="16.5" r="1.6"/>',
    camion: '<rect x="2" y="7" width="12" height="8" rx="1.2" fill="#fff" fill-opacity=".35"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="6" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>',
    camioneta: '<path d="M2 15v-4l3-3h6l2 3h7v4"/><path d="M13 11h-6" /><circle cx="7" cy="16.5" r="1.8"/><circle cx="17" cy="16.5" r="1.8"/>',
    cartero: '<circle cx="6" cy="16.5" r="2.2"/><circle cx="18" cy="16.5" r="2.2"/><path d="M6 16.5l3-6h5l4 6M9 10.5L8 8h3M14 10.5l-1-3h3"/><rect x="9.5" y="12" width="4" height="2.5" rx=".6" fill="#fff" fill-opacity=".4"/>',
  };
  const tipoIcono = (t) => { t = String(t || '').toLowerCase(); return /tracto|trailer|tráiler/.test(t) ? 'tracto' : /cartero|moto|bici|mensaj/.test(t) ? 'cartero' : /camioneta|pickup|van|furg/.test(t) ? 'camioneta' : 'camion'; };
  const icono = (tipo, color) => `<div class="veh" style="--c:${color}"><i class="rumbo"></i><svg viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONOS[tipoIcono(tipo)]}</svg></div>`;
  const RUTEO = ['tsp', 'mtsp', 'cvrp', 'flota', 'vrp'];
  const hhmm = (h) => App.hhmm(h);

  /* ---------- agenda de cada ruta: salida, llegada, espera, servicio y carga a bordo ---------- */
  function agenda(r) {
    const x = r.res, ds = S.ds, flota = ds.flota || [], D = ds.D, vt = ds.vt || {};
    const I = r.extra && r.extra.I, fv = I && I.f && I.f.vt && I.f.vt.usar ? I.f.vt : null;
    const usaVt = !!(fv || (r.kind === 'flota' && r.opt && r.opt.vt));
    const t0 = fv ? fv.inicio || 0 : (+vt.inicio >= 0 ? +vt.inicio : 8), serv = fv ? fv.servicio || 0 : Math.max(0, +vt.servicio || 0) / 60;
    const velDe = (k) => { const tipo = x.info && x.info[k] ? x.info[k].tipo : null, f = flota.find((t) => t.tipo === tipo) || flota.find((t) => +t.n > 0) || flota[0]; return Math.max(1, +(f && f.vel) || 30); };
    const ventana = (v) => (fv ? [fv.a[v] ?? 0, fv.b[v] ?? Infinity] : (usaVt && nodo(v).vtOn ? [nodo(v).vtA, nodo(v).vtB] : [0, Infinity]));
    const w = I && I.w ? I.w : null, rr = I && I.r ? I.r : null;
    const ent = (v) => (w ? w[v] || 0 : (r.kind === 'flota' ? +nodo(v).peso || 0 : 0)), rec = (v) => (rr ? rr[v] || 0 : 0);
    return x.rutas.map((ru, k) => {
      const vel = velDe(k), dep = ru[0], cierra = ru.length > 1 && ru[ru.length - 1] === dep, tramos = [];
      const split = x.info && x.info[k] && x.info[k].entregas;
      const entrega = (q) => (split ? split[q] || 0 : ent(ru[q]));
      let carga = 0; for (let q = 1; q < ru.length; q++) if (!(q === ru.length - 1 && cierra)) carga += entrega(q);
      const cap = x.info && x.info[k] && isFinite(x.info[k].cap) ? x.info[k].cap : null;
      let t = t0;
      for (let q = 1; q < ru.length; q++) {
        const a = ru[q - 1], b = ru[q], d = isFinite(D[a][b]) ? D[a][b] : 0, viaje = d / vel, llega = t + viaje, fin = q === ru.length - 1 && cierra;
        const [va, vb] = fin ? [0, Infinity] : ventana(b), inicio = Math.max(llega, va), sv = fin ? 0 : serv;
        const cargaAntes = carga; if (!fin) carga = carga - entrega(q) + rec(b);
        tramos.push({ q, de: a, a: b, sale: t, llega, inicio, fin: inicio + sv, d, espera: inicio - llega, servicio: sv, tarde: inicio > vb + 1e-9, cargaAntes, cargaDespues: carga, regreso: fin });
        t = inicio + sv;
      }
      const cargaIni = tramos.length ? tramos[0].cargaAntes : 0;
      return { k, ru, vel, t0, tFin: t, tramos, tipo: x.info && x.info[k] ? x.info[k].tipo : (flota.find((f) => +f.n > 0) || flota[0] || { tipo: 'vehículo' }).tipo, cap, cargaIni, dist: tramos.reduce((s, z) => s + z.d, 0) };
    });
  }

  const Sim = {
    rutas: [], w: 0, reproduciendo: false, vel: 1, DUR: 40, ultimo: 0, capa: null, visit: new Set(), seguir: -1, panelVis: true, ultPanel: 0,
    preparar() {
      this.limpiar(); const r = S.res; if (!r || !RUTEO.includes(r.kind) || !r.res.rutas || !r.res.rutas.length || r.ds !== S.clave) return this.barra(false);
      const mapa = Mapa.map; if (!mapa.getPane('p_sim')) mapa.createPane('p_sim').style.zIndex = 640;
      this.capa = L.layerGroup().addTo(mapa); this.ag = agenda(r);
      this.rutas = this.ag.map((g) => {
        const pts = [], cum = [0], marca = [0];   // marca[q] = índice de pts donde termina el tramo q
        g.ru.forEach((v, q) => {
          const p = [nodo(v).lat, nodo(v).lon]; if (q === 0) { pts.push(p); return; }
          const geo = Mapa.geom(g.ru[q - 1], v), tramo = geo ? [...geo, p] : [p];
          let prev = pts[pts.length - 1]; tramo.forEach((pt) => { cum.push(cum[cum.length - 1] + metros(prev, pt)); pts.push(pt); prev = pt; }); marca.push(pts.length - 1);
        });
        const color = COL[g.k % COL.length], mk = L.marker(pts[0], { pane: 'p_sim', zIndexOffset: 1000, interactive: false, icon: L.divIcon({ className: '', html: icono(g.tipo, color), iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(this.capa);
        const estela = L.polyline([pts[0]], { pane: 'p_sim', color, weight: 7, opacity: 0.5, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.capa);
        return Object.assign({}, g, { pts, cum, marca, color, mk, estela, idx: 0, ang: 0 });
      });
      this.T0 = Math.min(...this.rutas.map((q) => q.t0)); this.T1 = Math.max(this.T0 + 1e-6, ...this.rutas.map((q) => q.tFin));
      this.visit = new Set(); this.w = 0; this.seguir = -1;
      if (!this.panelUsuario) { const mw = document.querySelector('.mapa-wrap'); this.panelVis = !mw || mw.clientWidth >= 640; }   // en mapas angostos la flota en vivo empieza oculta
      this.nClientes = new Set(this.rutas.flatMap((q) => q.ru.filter((v) => v !== q.ru[0]))).size;
      this.barra(true); this.pintar(0, true); if (!App.reducir()) setTimeout(() => { if (this.rutas.length && !this.reproduciendo && this.w === 0) this.play(); }, 700);
    },
    limpiar() { this.parar(); if (this.capa) { Mapa.map.removeLayer(this.capa); this.capa = null; } this.rutas = []; this.barra(false); },
    barra(on) {
      let b = $('simbar'), f = $('simflota');
      if (!b) { b = document.createElement('div'); b.id = 'simbar'; b.className = 'simbar glass oculto'; document.querySelector('.mapa-wrap').appendChild(b); }
      if (!f) { f = document.createElement('div'); f.id = 'simflota'; f.className = 'simflota glass oculto'; document.querySelector('.mapa-wrap').appendChild(f); }
      if (!on) { b.classList.add('oculto'); f.classList.add('oculto'); return; }
      b.classList.remove('oculto'); f.classList.toggle('oculto', !this.panelVis);
      b.innerHTML = `<button class="btn mini" id="sPlay" aria-label="Reproducir o pausar"></button><button class="btn gris mini" id="sReset" title="Volver al inicio" aria-label="Volver al inicio">↺</button>
        <button class="btn gris mini tabular" id="sVel" title="Velocidad de reproducción" aria-label="Velocidad de reproducción">${this.vel}×</button>
        <div class="reloj tabular" id="sReloj" title="Hora simulada del día">--:--</div>
        <input type="range" id="sPos" min="0" max="1000" value="0" aria-label="Momento del día simulado">
        <button class="btn gris mini" id="sPanel" aria-pressed="${this.panelVis}" title="Mostrar u ocultar la flota en vivo">Flota</button>
        <div class="simtxt tabular" id="sTxt"></div>`;
      $('sPlay').onclick = () => (this.reproduciendo ? this.parar() : this.play());
      $('sReset').onclick = () => { this.reiniciar(); this.play(); };
      $('sVel').onclick = () => { const v = [0.5, 1, 2, 4, 8, 16]; this.vel = v[(v.indexOf(this.vel) + 1) % v.length]; $('sVel').textContent = this.vel + '×'; };
      $('sPos').oninput = (e) => { this.parar(); const w = (+e.target.value || 0) / 1000 * this.DUR; if (w < this.w) this.reiniciar(); this.w = w; this.pintar(this.w, true); };
      $('sPanel').onclick = () => { this.panelVis = !this.panelVis; this.panelUsuario = true; $('sPanel').setAttribute('aria-pressed', this.panelVis); $('simflota').classList.toggle('oculto', !this.panelVis); this.pintar(this.w, true); };
      this.icono();
      if (window.ResizeObserver && !this.ro) { this.ro = new ResizeObserver(() => { const mw = document.querySelector('.mapa-wrap'); if (mw && b.offsetHeight) mw.style.setProperty('--sim-h', b.offsetHeight + 'px'); }); this.ro.observe(b); }
    },
    reiniciar() { this.w = 0; this.visit.clear(); if (this.capa) this.capa.eachLayer((l) => { if (l.options && l.options.clase === 'visita') this.capa.removeLayer(l); }); },
    icono() { const p = $('sPlay'); if (p) p.innerHTML = this.reproduciendo ? '<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>Pausar' : '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>Reproducir'; },
    play() {
      if (!this.rutas.length) return; if (this.w >= this.DUR) this.reiniciar();
      this.reproduciendo = true; this.ultimo = performance.now(); this.icono();
      const paso = (t) => { if (!this.reproduciendo || !this.rutas.length) return; const dt = Math.min(0.25, (t - this.ultimo) / 1000); this.ultimo = t; this.w = Math.min(this.DUR, this.w + dt * this.vel); this.pintar(this.w); if (this.w >= this.DUR) { this.parar(); this.pintar(this.w, true); return; } this.raf = requestAnimationFrame(paso); };
      this.raf = requestAnimationFrame(paso);
    },
    parar() { this.reproduciendo = false; cancelAnimationFrame(this.raf); this.icono(); },
    /* estado de un vehículo a la hora h */
    estado(q, h) {
      const T = q.tramos; if (!T.length || h <= T[0].sale) return { fase: 'espera-salida', tramo: T[0] || null, f: 0, carga: q.cargaIni };
      for (const z of T) {
        if (h < z.llega) return { fase: 'viaje', tramo: z, f: (h - z.sale) / Math.max(1e-9, z.llega - z.sale), carga: z.cargaAntes };
        if (h < z.inicio) return { fase: 'esperando', tramo: z, f: 1, carga: z.cargaAntes };
        if (h < z.fin) return { fase: 'servicio', tramo: z, f: 1, carga: z.cargaAntes + (z.cargaDespues - z.cargaAntes) * (h - z.inicio) / Math.max(1e-9, z.fin - z.inicio) };
      }
      const z = T[T.length - 1]; return { fase: 'fin', tramo: z, f: 1, carga: z.cargaDespues };
    },
    pintar(w, completo) {
      if (!this.rutas.length) return;
      const h = this.T0 + (w / this.DUR) * (this.T1 - this.T0); let atendidos = 0, recorrido = 0, fin = 0;
      this.rutas.forEach((q) => {
        const e = this.estado(q, h), z = e.tramo; let pos = q.pts[0], ang = q.ang;
        if (z) {
          const i0 = q.marca[z.q - 1], i1 = q.marca[z.q], L0 = q.cum[i0], L1 = q.cum[i1], dist = L0 + (L1 - L0) * Math.min(1, Math.max(0, e.fase === 'espera-salida' ? 0 : e.f));
          let lo = i0, hi = i1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (q.cum[m] <= dist) lo = m; else hi = m - 1; }
          const a = q.pts[lo], b = q.pts[Math.min(lo + 1, q.pts.length - 1)], f = q.cum[lo + 1] > q.cum[lo] ? (dist - q.cum[lo]) / (q.cum[lo + 1] - q.cum[lo]) : 0;
          pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
          if (e.fase === 'viaje' && (b[0] !== a[0] || b[1] !== a[1])) ang = rumbo(a, b);
          q.idx = lo; recorrido += z.q > 1 ? q.tramos.slice(0, z.q - 1).reduce((s, t) => s + t.d, 0) : 0; recorrido += e.fase === 'espera-salida' ? 0 : z.d * Math.min(1, e.f);
          q.estela.setLatLngs(q.pts.slice(0, lo + 1).concat([pos]));
        }
        q.mk.setLatLng(pos); q.e = e;
        const ve = el(q.mk);
        if (ve && (ang !== q.ang || completo)) { q.ang = ang; const ri = ve.querySelector('.rumbo'); if (ri) ri.style.transform = `rotate(${ang.toFixed(1)}deg)`; }
        if (ve) ve.classList.toggle('parado', e.fase !== 'viaje');
        q.tramos.forEach((t) => { if (t.regreso) return; if (t.inicio <= h + 1e-9 && e.fase !== 'espera-salida') { atendidos++; const id = q.k + ':' + t.q; if (!this.visit.has(id)) { this.visit.add(id); this.marcarVisita(t.a, q.color); } } });
        if (e.fase === 'fin') fin++;
        if (this.seguir === q.k && this.reproduciendo) Mapa.map.panTo(pos, { animate: false });
      });
      const rl = $('sReloj'); if (rl) rl.textContent = hhmm(h);
      const tx = $('sTxt'); if (tx) tx.textContent = `${atendidos}/${this.nClientes} atendidos · ${fmt(recorrido, 1)} ${S.ds.unidad} · ${fin}/${this.rutas.length} terminaron`;
      const ps = $('sPos'); if (ps && this.reproduciendo) ps.value = Math.round(w / this.DUR * 1000);
      const ahora = performance.now(); if (this.panelVis && (completo || ahora - this.ultPanel > 120)) { this.ultPanel = ahora; this.panel(h); }
    },
    marcarVisita(v, color) {
      const n = nodo(v); if (!n || !this.capa) return;
      const m = L.marker([n.lat, n.lon], { pane: 'p_sim', interactive: false, clase: 'visita', icon: L.divIcon({ className: '', html: `<div class="visita${App.reducir() ? '' : ' pulso'}" style="--c:${color}"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></div>`, iconSize: [24, 24], iconAnchor: [12, 12] }) });
      m.options.clase = 'visita'; m.addTo(this.capa);
    },
    panel(h) {
      const f = $('simflota'); if (!f) return;
      const txt = (q) => { const e = q.e || this.estado(q, h), z = e.tramo, dst = z ? (z.regreso ? 'el depósito' : corto(z.a)) : '';
        return e.fase === 'espera-salida' ? `Sale a las ${hhmm(q.t0)}` : e.fase === 'viaje' ? `Hacia ${esc(dst)} · ${Math.round(e.f * 100)} %` : e.fase === 'esperando' ? `Espera ventana de ${esc(dst)} (abre ${hhmm(z.inicio)})` : e.fase === 'servicio' ? `Atendiendo ${esc(dst)} hasta ${hhmm(z.fin)}` : `Terminó a las ${hhmm(q.tFin)}`; };
      const filas = this.rutas.map((q) => {
        const e = q.e || this.estado(q, h), cg = Math.max(0, e.carga), pc = q.cap ? Math.min(100, cg / q.cap * 100) : null, avance = Math.min(100, Math.max(0, (h - q.t0) / Math.max(1e-9, q.tFin - q.t0) * 100));
        return `<button class="sf-fila${this.seguir === q.k ? ' sigue' : ''}" data-k="${q.k}" title="Seguir este vehículo"><span class="punto" style="background:${q.color}"></span><span class="sf-t"><b>Ruta ${q.k + 1}</b> · ${esc(q.tipo)}<small>${txt(q)}</small>
          <span class="sf-barra" title="Avance de la jornada"><i style="width:${avance.toFixed(1)}%;background:${q.color}"></i></span>${pc != null ? `<small class="tabular">Carga ${fmt(cg, 1)} / ${fmt(q.cap, 0)}</small><span class="sf-barra carga"><i style="width:${pc.toFixed(1)}%"></i></span>` : ''}</span></button>`;
      }).join('');
      f.innerHTML = `<div class="sf-cab"><b>Flota en vivo</b><span class="tabular">${hhmm(h)}</span></div>` + filas;
      f.querySelectorAll('.sf-fila').forEach((b) => (b.onclick = () => { const k = +b.dataset.k; this.seguir = this.seguir === k ? -1 : k; const q = this.rutas[k]; if (this.seguir === k && q) Mapa.map.panTo(q.mk.getLatLng()); this.panel(h); }));
    },
  };
  const el = (mk) => { const e = mk.getElement(); return e && e.firstChild; };
  window.Sim = Sim; Sim.agenda = agenda;

  /* ---------- Diagrama de Gantt: viaje, espera y servicio por vehículo, en horas del día ---------- */
  function pGantt(el) {
    const r = S.res, u = S.ds.unidad;
    if (!r || r.ds !== S.clave || !RUTEO.includes(r.kind) || !r.res.rutas || !r.res.rutas.length) { el.innerHTML = '<div class="aviso info">Resuelva un problema de rutas (TSP, m-TSP o VRP) para ver el diagrama de Gantt de cada vehículo.</div>'; return; }
    const ag = agenda(r), T0 = Math.min(...ag.map((g) => g.t0)), T1 = Math.max(T0 + 1e-6, ...ag.map((g) => g.tFin)), span = T1 - T0, X = (h) => ((h - T0) / span * 100).toFixed(3);
    let h = `<h3 style="margin-bottom:6px">Gantt de la jornada</h3><p class="nota">Cada fila es un vehículo, desde que sale (${hhmm(T0)}) hasta que termina. <span class="g-ley"><i class="g-v"></i>viaje</span> <span class="g-ley"><i class="g-e"></i>espera por ventana</span> <span class="g-ley"><i class="g-s"></i>servicio</span>. Velocidad: la de cada tipo de vehículo; servicio: ${fmt(Math.max(0, +S.ds.vt.servicio || 0), 0)} min por cliente.</p><div class="gantt">`;
    ag.forEach((g) => {
      const c = COL[g.k % COL.length];
      h += `<div class="g-fila"><div class="g-et"><span class="punto" style="background:${c}"></span>Ruta ${g.k + 1}<small>${esc(g.tipo)} · ${fmt(g.vel, 0)} km/h</small></div><div class="g-pista">` + g.tramos.map((z) => {
        let s = `<i class="g-v" style="left:${X(z.sale)}%;width:${(z.llega - z.sale) / span * 100}%;background:${c}" title="${esc(corto(z.de))} → ${esc(z.regreso ? 'depósito' : corto(z.a))} · ${fmt(z.d, 1)} ${u} · ${hhmm(z.sale)}–${hhmm(z.llega)}">${(z.llega - z.sale) / span > 0.05 ? `<b>${esc(z.regreso ? '⌂' : corto(z.a))}</b>` : ''}</i>`;
        if (z.espera > 1e-6) s += `<i class="g-e" style="left:${X(z.llega)}%;width:${z.espera / span * 100}%" title="Espera en ${esc(corto(z.a))}: ${fmt(z.espera * 60, 0)} min (abre ${hhmm(z.inicio)})"></i>`;
        if (z.servicio > 1e-6) s += `<i class="g-s" style="left:${X(z.inicio)}%;width:${z.servicio / span * 100}%;--c:${c}" title="Servicio en ${esc(corto(z.a))}: ${hhmm(z.inicio)}–${hhmm(z.fin)}${z.tarde ? ' · fuera de la ventana' : ''}"></i>`;
        return s;
      }).join('') + `</div><div class="g-fin tabular">${hhmm(g.tFin)}</div></div>`;
    });
    const marcas = [0, 0.25, 0.5, 0.75, 1].map((p) => `<span>${hhmm(T0 + p * span)}</span>`).join('');
    el.innerHTML = h + `</div><div class="g-eje">${marcas}</div>` + `<p class="nota" style="margin-top:10px">Jornada más larga: ${fmt(Math.max(...ag.map((g) => g.tFin - g.t0)), 2)} h · distancia total ${fmt(ag.reduce((s, g) => s + g.dist, 0), 1)} ${u}.</p>`;
  }
  window.App.paneles.push({ id: 'gantt', titulo: 'Gantt', render: pGantt });
})();
