/* Estimación del tiempo ANTES de resolver.
   Base: mediciones propias con HiGHS (CVRP, formulación de dos índices, holgura de capacidad ~30 %):
     10 clientes 0,8 s · 15 → 1,8 s · 20 → 2,5 s · 25 → 9,5 s · 30 → 4,7 s (óptimo probado);
     40–60 → sin óptimo probado en 150 s; 100 → brecha ~3 % a los 80 s (MTZ: ~11 %).
   Ventanas de tiempo, latencia, jornada, flota mínima, varios depósitos o flota mixta hacen el modelo más difícil: se sube un nivel.
   Si ya hubo corridas parecidas (mismo problema, variante y método, tamaño ±2), se muestra lo que tardaron de verdad. */
(function () {
  'use strict';
  const { S, $, esc, fmt } = window.App;
  const CLAVE = 'parcial-grafos:tiempos';
  const NIVELES = [
    { min: 0, max: 5, txt: 'menos de 5 s' },
    { min: 5, max: 30, txt: 'entre 5 y 30 s' },
    { min: 10, max: 120, txt: 'entre 10 s y 2 min' },
    { min: 60, max: 900, txt: 'entre 1 y 15 min (puede no probarse)' },
    { min: 3600, max: Infinity, txt: 'horas: en la práctica no se llega a probar' },
  ];
  const seg = (s) => (s < 60 ? fmt(s, s < 10 ? 1 : 0) + ' s' : s < 3600 ? fmt(s / 60, s < 600 ? 1 : 0) + ' min' : fmt(s / 3600, 1) + ' h');
  const leer = () => { try { const h = JSON.parse(localStorage.getItem(CLAVE) || '[]'); return Array.isArray(h) ? h : []; } catch (e) { return []; } };

  /* cuántos clientes (o nodos a visitar) tiene el problema actual */
  function tamano() {
    const ns = S.ds ? S.ds.nodos : []; const p = $('problema') ? $('problema').value : '';
    if (p === 'vrp' || p === 'mtsp') return Math.max(0, ns.filter((x) => x.tipo !== 'dc').length - (ns.some((x) => x.tipo === 'dc') ? 0 : 1));
    return ns.length;
  }
  function contexto() {
    const p = $('problema') ? $('problema').value : ''; const vrp = p === 'vrp' && $('vrpVar') && window.Variantes ? window.Variantes.porId[$('vrpVar').value] : null;
    const met = vrp && $('vrpMetodo') ? $('vrpMetodo').value : 'exacto', n = tamano();
    const metodo = vrp && !(S.ds && S.ds.metodoElegido) && n >= 40 ? 'arco' : ($('metodo') ? $('metodo').value : 'mtz');   // igual que la app: con 40+ clientes usa dos índices
    const lim = $('sinLimite') && $('sinLimite').checked ? Infinity : +($('tiempo') ? $('tiempo').value : 120) || 120;
    return { p, vrp, met, metodo, lim, n, variante: vrp ? vrp.id : p };
  }
  /* nivel de dificultad del modelo exacto */
  function nivel(c) {
    const n = c.n; let k;
    if (['camino', 'desde', 'arbol', 'flujomax', 'flujocosto', 'cartero'].includes(c.p)) return { k: 0, extra: [] };
    if (['pmediana', 'pcentro', 'cobertura'].includes(c.p)) k = n <= 60 ? 0 : n <= 150 ? 1 : 2;
    else if (c.p === 'libre') return null;
    else if (c.p === 'tsp') k = n <= 25 ? 0 : n <= 45 ? 1 : n <= 70 ? 2 : 3;
    else k = n <= 12 ? 0 : n <= 22 ? 1 : n <= 32 ? 2 : n <= 50 ? 3 : 4;
    const extra = [], v = c.vrp, f = (v && v.f) || {};
    if (v) {
      if (v.vt) extra.push('ventanas de tiempo'); if (f.obj === 'latencia') extra.push('suma de llegadas'); if (v.jornada) extra.push('jornada máxima');
      if (f.minVeh) extra.push('flota mínima (dos fases)'); if (v.multi) extra.push('varios depósitos'); if (v.mixta) extra.push('flota mixta');
      if (f.objetivo === 'maximo') extra.push('min-max'); if (f.mode === 'pd' || f.mode === 'split') extra.push(f.mode === 'pd' ? 'recoger y entregar' : 'entrega dividida');
      if (c.metodo !== 'arco' && n >= 30) extra.push('formulación ' + c.metodo.toUpperCase() + ' (la de dos índices es más rápida)');
    }
    if (extra.length && k < 4 && n > 8) k++;
    return { k: Math.min(4, k), extra };
  }
  /* corridas anteriores parecidas, de cualquier proyecto */
  function parecidas(c) {
    return leer().filter((h) => h.variante === c.variante && h.metodo === (c.vrp ? c.metodo : h.metodo) && h.met === c.met && Math.abs(h.nc - c.n) <= 2).slice(-5);
  }

  App.estimarPrevio = () => {
    const el = $('estPrevio'); if (!el || !$('problema')) return; const c = contexto(), nv = nivel(c);
    if (!nv) { el.innerHTML = ''; el.classList.add('oculto'); return; }
    el.classList.remove('oculto');
    const N = NIVELES[nv.k], lineas = [];
    if (c.met === 'comparar') {   // tiempo casi exacto: lo fija la app
      const tc = +($('vrpTc') ? $('vrpTc').value : 8) || 8, tm = Math.max(1, Math.min(10, (isFinite(c.lim) ? c.lim : 120) / 12));
      lineas.push(`<b>Duración ≈ ${seg(tc + 8 * tm + 3)}</b> · modelo ${seg(tc)} + 18 algoritmos de la exposición (8 metaheurísticas de ${seg(tm)} cada una).`);
    } else {
      lineas.push(`<b>Óptimo probado: ${N.txt}</b> · ${c.n} ${c.p === 'vrp' || c.p === 'mtsp' ? 'clientes' : 'nodos'}${nv.extra.length ? ' · más difícil por ' + esc(nv.extra.join(', ')) : ''}.`);
      if (c.p === 'vrp' && c.n >= 20) lineas.push(`Primera solución (heurística) en ~${c.n >= 60 ? '10' : c.n >= 40 ? '5' : '2'} s; desde ahí verá la brecha bajar y el tiempo restante.`);
      if (nv.k >= 3 && c.n >= 40) lineas.push(`Brecha típica: ${c.metodo === 'arco' || c.p !== 'vrp' ? '3–6 %' : '8–12 %'} a los 1–2 min. Puede parar cuando la solución le sirva.`);
      if (isFinite(c.lim) && c.lim < N.min) lineas.push(`Con su límite de ${seg(c.lim)} probablemente no se pruebe el óptimo: verá la mejor solución hallada y su brecha.`);
      else if (isFinite(c.lim) && c.lim < N.max && nv.k >= 2) lineas.push(`Su límite de ${seg(c.lim)} puede quedarse corto; si no alcanza, verá la mejor solución y su brecha.`);
    }
    const prev = parecidas(c);
    if (prev.length) {
      const opt = prev.filter((h) => h.optimo), ult = prev[prev.length - 1];
      lineas.push(opt.length ? `Sus corridas parecidas: óptimo en ${opt.map((h) => seg(h.seg)).join(', ')}.` : `Última corrida parecida: brecha ${ult.gap == null ? 'n/d' : fmt(ult.gap * 100, 1) + ' %'} a los ${seg(ult.seg)}.`);
    }
    el.innerHTML = `<span class="est-ico" aria-hidden="true">⏱</span><div>${lineas.map((l) => `<p>${l}</p>`).join('')}</div>`;
  };

  /* guarda lo que tardó cada corrida (para afinar la estimación de las siguientes) */
  App.registrarTiempo = (r) => {
    try {
      if (!r || !r.res || r.res.seg == null) return; const c = contexto(), x = r.res;
      const nc = r.extra && r.extra.I ? r.extra.I.cust.length : c.n;
      const h = leer(); h.push({ variante: r.extra && r.extra.variante || r.kind, met: (r.opt && r.opt.metodoSol) || 'exacto', metodo: (r.opt && r.opt.metodo) || c.metodo, nc, seg: +x.seg, optimo: String(x.estado || '').startsWith('óptimo'), gap: x.gap == null || !isFinite(x.gap) ? null : x.gap });
      localStorage.setItem(CLAVE, JSON.stringify(h.slice(-200)));
    } catch (e) { /* sin almacenamiento */ }
    App.estimarPrevio();
  };

  document.addEventListener('change', (e) => { if (e.target.closest && e.target.closest('#cProblema, #flotaTabla')) App.estimarPrevio(); });
  document.addEventListener('input', (e) => { if (e.target.id === 'tiempo') App.estimarPrevio(); });
})();
