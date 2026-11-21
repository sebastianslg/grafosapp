/* Generador de código GAMS para las variantes de VRP (modelo de flujo por vehículo con MTZ), con los datos de la instancia I.
   Es el mismo modelo que resuelve la app (vrp.js); pruebas/validar_export_gams.js ejecuta el .gms de cada variante y
   comprueba que da el mismo óptimo. Resolver en GAMS Studio con F9 (por ejemplo con  option mip = highs;). */
(function (root) {
  'use strict';
  const nm = (i) => 'n' + i, num = (x) => (Number.isInteger(+x) ? String(+x) : String(+(+x).toFixed(6)));
  const lista = (xs) => (xs.length ? xs.join(', ') : '');
  function tabla(D, idx, nombre, tit) {
    const L = ['Table ' + nombre + "(i,j) '" + tit + "'", '        ' + idx.map((j) => nm(j).padStart(10)).join('')];
    idx.forEach((i) => L.push(nm(i).padEnd(8) + idx.map((j) => (i === j || !isFinite(D[i][j]) ? '0' : num(D[i][j])).padStart(10)).join('')));
    return L.join('\n') + ';';
  }
  /* parámetro indexado por una lista: nombre(dom) 'texto' / a v, b v / */
  const par = (nombre, dom, texto, pares) => `  ${nombre}(${dom}) '${texto}' / ${lista(pares)} /`;

  function generar(I, id, o) {
    o = o || {}; const f = I.f || {}, mode = f.mode || 'entrega', D = I.D, n = D.length, all = Array.from({ length: n }, (_, i) => i), veh = I.veh, m = veh.length, cl = I.cust, nc = cl.length;
    const obj = f.obj || 'costo', w = I.w || D.map(() => 0), r = I.r || D.map(() => 0), prize = I.prize || D.map(() => 0);
    const cap = veh.some((v) => isFinite(v.cap)), vt = f.vt && f.vt.usar ? f.vt : null, fijos = veh.some((v) => v.fijo), limD = veh.some((v) => isFinite(v.Lmax));
    const maxo = f.objetivo === 'maximo', abierto = !!f.open, pairs = I.pairs || [], loc = !!f.locDepot, opc = obj === 'profit' || obj === 'top';
    const blandas = !!(vt && f.blandas), lat = obj === 'latencia', tmax = isFinite(f.tmax) && f.tmax > 0 ? f.tmax : null, tiempo = !!(vt || tmax);
    let lmin = 0, lmax = nc; if (f.balanced) { lmin = Math.max(1, Math.floor(nc / m)); lmax = Math.ceil(nc / m); } else { lmin = f.lmin || 0; lmax = f.lmax || nc; }
    const stops = veh.some((v) => v.lstops) || lmax < nc;
    const sinArco = []; all.forEach((i) => all.forEach((j) => { if (i !== j && !isFinite(D[i][j])) sinArco.push(nm(i) + '.' + nm(j)); }));
    const L = [];
    L.push('$title ' + String(id || 'VRP').replace(/[$]/g, '') + ' - modelo de flujo por vehiculo (MILP)', '$onText',
      'Generado por la app Parcial de Grafos con los datos del proyecto. Es el mismo modelo que la app resuelve con HiGHS.',
      'Ejecutar en GAMS Studio (F9) o con:  gams archivo.gms', '$offText', '');
    L.push('Sets', "  i      'nodos'      / " + lista(all.map(nm)) + ' /', "  c(i)   'clientes'   / " + lista(cl.map(nm)) + ' /', "  dep(i) 'depositos'  / " + lista(I.depots.map(nm)) + ' /',
      "  k      'vehiculos'  / " + lista(veh.map((_, q) => 'v' + (q + 1))) + ' /', "  kd(k,i) 'deposito de cada vehiculo' / " + lista(veh.map((v, q) => 'v' + (q + 1) + '.' + nm(v.depot))) + ' /;', 'Alias (i,j);', '');
    L.push(tabla(D, all, 'dist', 'distancia entre nodos'), '');
    L.push('Parameters', par('cu', 'k', 'costo por unidad de distancia', veh.map((v, q) => 'v' + (q + 1) + ' ' + num(v.costoKm))));
    if (cap) L.push(par('Q', 'k', 'capacidad', veh.map((v, q) => 'v' + (q + 1) + ' ' + (isFinite(v.cap) ? num(v.cap) : '999999'))));
    if (fijos) L.push(par('fx', 'k', 'costo fijo por vehiculo usado', veh.map((v, q) => 'v' + (q + 1) + ' ' + num(v.fijo || 0))));
    if (limD) L.push(par('Lmax', 'k', 'distancia maxima por ruta', veh.map((v, q) => 'v' + (q + 1) + ' ' + (isFinite(v.Lmax) ? num(v.Lmax) : '999999'))));
    L.push(par('vel', 'k', 'velocidad (distancia por hora)', veh.map((v, q) => 'v' + (q + 1) + ' ' + num(v.vel))));
    L.push(par('w', 'i', 'demanda a entregar', cl.map((i) => nm(i) + ' ' + num(w[i]))));
    if (mode === 'backhaul' || mode === 'spd' || mode === 'pd') L.push(par('r', 'i', 'cantidad a recoger', cl.map((i) => nm(i) + ' ' + num(r[i]))));
    if (opc) L.push(par('prem', 'i', 'premio por visitar', cl.map((i) => nm(i) + ' ' + num(prize[i]))));
    if (loc) L.push(par('fa', 'i', 'costo de abrir el deposito', I.depots.map((d) => nm(d) + ' ' + num((f.openCost || {})[d] || 0))));
    if (loc && f.capD && I.depots.some((d) => f.capD[d] > 0)) L.push(par('capD', 'i', 'capacidad del deposito (0 = sin limite)', I.depots.map((d) => nm(d) + ' ' + num(f.capD[d] || 0))));
    if (vt) L.push(par('ae', 'i', 'inicio de la ventana (h)', cl.map((i) => nm(i) + ' ' + num(vt.a[i] ?? 0))), par('be', 'i', 'fin de la ventana (h)', cl.map((i) => nm(i) + ' ' + num(vt.b[i] ?? 48))));
    L.push('  ;');
    const TT = vt ? (root.Variantes || require('./variantes.js')).tiempos(I) : null;
    if (tiempo) {
      const s = vt ? vt.servicio || 0 : (f.servicio || 0);
      L.push("Scalars t0 'hora de salida del deposito' / " + num(vt ? vt.inicio || 0 : 0) + " /, srv 'tiempo de servicio por cliente (h)' / " + num(s) + ' /'
        + (vt && vt.cierre > 0 && !abierto ? ", cierre 'hora de cierre del deposito' / " + num(vt.cierre) + ' /' : '') + (blandas ? ", pen 'penalizacion por hora de retraso' / " + num(f.penRetraso || 0) + ' /' : '') + (tmax ? ", Tmax 'duracion maxima de la jornada (h)' / " + num(tmax) + ' /' : '') + ';');
      if (vt) L.push(par('tlo', 'i', 'hora mas temprana posible: salida + camino mas corto desde el deposito', cl.map((i) => nm(i) + ' ' + num(TT.lo[i]))) .replace(/^ {2}/, 'Parameters ') + ',', par('tup', 'i', 'hora mas tardia (fin de ventana, u horizonte si es suave)', cl.map((i) => nm(i) + ' ' + num(TT.up[i]))) + ';');
    }
    if (pairs.length) L.push("Set pd(i,j) 'pares recoger-entregar' / " + lista(pairs.map(([p, d]) => nm(p) + '.' + nm(d))) + ' /;');
    if (mode === 'backhaul') L.push("Set bh(i) 'clientes backhaul (solo recogen)' / " + lista(cl.filter((i) => r[i] > 0 && !(w[i] > 0)).map(nm)) + ' /;', "Set lh(i) 'clientes linehaul (entregan)';", 'lh(c) = yes;', 'lh(bh) = no;');
    if (sinArco.length) L.push("Set sinArco(i,j) 'pares sin conexion en el grafo' / " + lista(sinArco) + ' /;');
    L.push('');
    // arcos y costos
    L.push("Set arco(i,j,k) 'arcos permitidos';", 'arco(i,j,k)$(ord(i) <> ord(j) and (c(i) or kd(k,i)) and (c(j) or kd(k,j))) = yes;');
    if (sinArco.length) L.push('arco(i,j,k)$sinArco(i,j) = no;');
    if (mode === 'backhaul') L.push('arco(i,j,k)$(bh(i) and lh(j)) = no;', 'arco(i,j,k)$(kd(k,i) and bh(j)) = no;');
    L.push("Parameter dr(i,j,k) 'distancia del arco', cr(i,j,k) 'costo del arco';", 'dr(i,j,k)$arco(i,j,k) = dist(i,j);');
    if (abierto) L.push('* ruta abierta: el regreso al deposito no cuenta', 'dr(i,j,k)$(arco(i,j,k) and kd(k,j)) = 0;');
    L.push('cr(i,j,k) = cu(k)*dr(i,j,k);', '');
    // variables
    L.push("Binary Variables x(i,j,k) 'el vehiculo k recorre el arco i-j', y(i,k) 'el vehiculo k visita al cliente i', v(k) 'el vehiculo k se usa';");
    L.push('y.fx(dep,k) = 0;', 'x.fx(i,j,k)$(not arco(i,j,k)) = 0;');
    if (loc) L.push("Binary Variable op(i) 'se abre el deposito i';");
    if (mode === 'split') L.push("Positive Variables qe(i,k) 'entrega del vehiculo k al cliente i', u(i,k) 'orden de visita (MTZ por vehiculo)';"); else L.push("Positive Variable u(i) 'orden de visita (MTZ)';");
    if (mode === 'spd' || mode === 'pd') L.push("Positive Variable lq(i) 'carga del vehiculo al salir del cliente';");
    if (vt) L.push("Positive Variable t(i) 'hora de llegada al cliente';");
    if (blandas) L.push("Positive Variable e(i) 'retraso respecto al fin de la ventana (h)';");
    L.push("Free Variable z 'funcion objetivo';" + (maxo ? "\nPositive Variable zmax 'costo de la ruta mas costosa';" : ''), '');
    // ecuaciones
    const E = [];
    /* declara la ecuación con el mismo dominio con que se define (GAMS exige que coincidan) */
    const eq = (txt, def) => { const cab = /^(\w+)(\([^)]*\))?/.exec(def); E.push(cab[1]); L.push('Equation ' + cab[1] + (cab[2] || '') + " '" + /'(.*)'/.exec(txt)[1] + "';", def); };
    const arcos = 'sum((i,j,k)$arco(i,j,k), cr(i,j,k)*x(i,j,k))';
    let ob = maxo ? 'zmax + 0.001*' + arcos : arcos;
    if (fijos) ob += ' + sum(k, fx(k)*v(k))'; if (loc) ob += ' + sum(dep, fa(dep)*op(dep))';
    if (obj === 'profit') ob += ' - sum((c,k), prem(c)*y(c,k))';
    if (obj === 'top') ob = '0.0001*(' + ob + ') - sum((c,k), prem(c)*y(c,k))';
    if (lat) ob = 'sum(c, t(c) - t0) + 0.001*' + arcos + (fijos ? ' + sum(k, fx(k)*v(k))' : '');
    if (blandas) ob += ' + pen*sum(c, e(c))';
    eq("fo 'funcion objetivo'", 'fo.. z =e= ' + ob + ';');
    eq("visita(i) 'cada cliente se atiende'", mode === 'split' ? 'visita(c).. sum(k, y(c,k)) =g= 1;' : (opc ? 'visita(c).. sum(k, y(c,k)) =l= 1;' : 'visita(c).. sum(k, y(c,k)) =e= 1;'));
    eq("entra(i,k) 'llega un arco al cliente visitado'", 'entra(c,k).. sum(j$arco(j,c,k), x(j,c,k)) =e= y(c,k);');
    eq("sale(i,k) 'sale un arco del cliente visitado'", 'sale(c,k).. sum(j$arco(c,j,k), x(c,j,k)) =e= y(c,k);');
    eq("parte(k) 'el vehiculo usado sale de su deposito'", 'parte(k).. sum((i,j)$(kd(k,i) and arco(i,j,k)), x(i,j,k)) =e= v(k);');
    eq("vuelve(k) 'y regresa a su deposito'", 'vuelve(k).. sum((i,j)$(kd(k,j) and arco(i,j,k)), x(i,j,k)) =e= v(k);');
    eq("usa(i,k) 'solo visita si se usa'", 'usa(c,k).. y(c,k) =l= v(k);');
    eq("dos(i,j,k) 'sin ciclos de dos clientes'", 'dos(i,j,k)$(c(i) and c(j) and ord(i) < ord(j) and arco(i,j,k) and arco(j,i,k)).. x(i,j,k) + x(j,i,k) =l= y(i,k);');
    if (mode === 'split') { eq("mtz(i,j,k) 'eliminacion de subtours MTZ'", 'mtz(i,j,k)$(c(i) and c(j) and arco(i,j,k)).. u(i,k) - u(j,k) + card(c)*x(i,j,k) =l= card(c) - 1;'); L.push('u.lo(c,k) = 1; u.up(c,k) = card(c);'); }
    else { eq("mtz(i,j) 'eliminacion de subtours MTZ'", 'mtz(i,j)$(c(i) and c(j) and ord(i) <> ord(j)).. u(i) - u(j) + card(c)*sum(k$arco(i,j,k), x(i,j,k)) =l= card(c) - 1;'); L.push('u.lo(c) = 1; u.up(c) = card(c);'); }
    if (f.balanced || lmin >= 1) L.push('v.lo(k) = 1;');
    if (lmin >= 1) eq("minr(k) 'minimo de clientes por ruta'", 'minr(k).. sum(c, y(c,k)) =g= ' + lmin + '*v(k);');
    if (stops) { const ls = veh.map((v) => v.lstops || lmax); L.push(par('maxc', 'k', 'maximo de clientes por ruta', veh.map((_, q) => 'v' + (q + 1) + ' ' + ls[q])).replace(/^ {2}/, 'Parameter ') + ';'); eq("maxp(k) 'maximo de clientes por ruta'", 'maxp(k).. sum(c, y(c,k)) =l= maxc(k)*v(k);'); }
    if (maxo) eq("mm(k) 'zmax acota el costo de cada ruta'", 'mm(k).. sum((i,j)$arco(i,j,k), cr(i,j,k)*x(i,j,k)) =l= zmax;');
    if (limD) eq("lim(k) 'distancia maxima por ruta'", 'lim(k).. sum((i,j)$arco(i,j,k), dr(i,j,k)*x(i,j,k)) =l= Lmax(k)*v(k);');
    if (loc) eq("abre(k) 'solo sale de un deposito abierto'", 'abre(k).. v(k) =l= sum(i$kd(k,i), op(i));');
    if (loc && f.capD && I.depots.some((d) => f.capD[d] > 0)) eq("capdep(i) 'capacidad del deposito abierto'", 'capdep(dep)$(capD(dep) > 0).. sum((c,k)$kd(k,dep), w(c)*y(c,k)) =l= capD(dep)*op(dep);');
    if (cap && (mode === 'entrega' || mode === 'backhaul' || mode === 'spd')) eq("capv(k) 'capacidad del vehiculo'", 'capv(k).. sum(c, w(c)*y(c,k)) =l= Q(k)*v(k);');
    if (mode === 'backhaul') eq("capb(k) 'capacidad para lo recogido'", 'capb(k).. sum(c, r(c)*y(c,k)) =l= Q(k)*v(k);');
    if (mode === 'split') {
      eq("ent(i,k) 'solo entrega quien visita'", 'ent(c,k).. qe(c,k) =l= w(c)*y(c,k);');
      eq("tot(i) 'se entrega toda la demanda'", 'tot(c).. sum(k, qe(c,k)) =e= w(c);');
      eq("capq(k) 'capacidad del vehiculo'", 'capq(k).. sum(c, qe(c,k)) =l= Q(k)*v(k);');
    }
    if (mode === 'spd' || mode === 'pd') {
      const sW = cl.reduce((a, i) => a + w[i], 0), sR = cl.reduce((a, i) => a + r[i], 0), Qm = Math.max(...veh.map((v) => (isFinite(v.cap) ? v.cap : 0)));
      L.push("Scalar Ml 'M grande de carga' / " + num(Math.max(1, sW + sR, Qm)) + ' /;');
      eq("carga(i,j) 'carga a lo largo de la ruta'", 'carga(i,j)$(c(i) and c(j) and ord(i) <> ord(j) and sum(k$arco(i,j,k), 1)).. lq(j) =g= lq(i) + r(j) - w(j) - Ml*(1 - sum(k$arco(i,j,k), x(i,j,k)));');
      eq("carga0(i,j,k) 'carga al salir del deposito'", mode === 'spd' ? 'carga0(i,j,k)$(kd(k,i) and c(j) and arco(i,j,k)).. lq(j) =g= sum(c, w(c)*y(c,k)) + r(j) - w(j) - Ml*(1 - x(i,j,k));' : 'carga0(i,j,k)$(kd(k,i) and c(j) and arco(i,j,k)).. lq(j) =g= r(j) - w(j) - Ml*(1 - x(i,j,k));');
      eq("lcap(i) 'la carga no supera la capacidad'", 'lcap(c).. lq(c) =l= sum(k, Q(k)*y(c,k));');
      if (cap) L.push('lq.up(c) = smax(k, Q(k));');
    }
    // desigualdades válidas (las mismas de la app): no cambian el óptimo, aceleran la búsqueda
    const ident = veh.map((v, q) => q > 0 && mode !== 'split' && !pairs.length && ['depot', 'cap', 'costoKm', 'vel', 'fijo', 'Lmax'].every((c) => veh[q - 1][c] === v[c]));
    if (ident.some(Boolean)) { L.push("Set idk(k) 'vehiculo identico al anterior (ruptura de simetria)' / " + lista(veh.map((_, q) => (ident[q] ? 'v' + (q + 1) : null)).filter(Boolean)) + ' /;'); eq("sim(i,k) 'ruptura de simetria entre vehiculos identicos'", 'sim(i,k)$(c(i) and idk(k)).. y(i,k) =l= sum(j$(c(j) and ord(j) < ord(i)), y(j,k-1));'); }
    if (cap && (mode === 'entrega' || mode === 'backhaul' || mode === 'spd') && !opc && veh.every((v) => isFinite(v.cap)) && cl.some((i) => w[i] > 0)) {
      eq("capt 'la flota usada cubre la demanda total'", 'capt.. sum(k, Q(k)*v(k)) =g= sum(c, w(c));');
      if (mode === 'backhaul' && cl.some((i) => r[i] > 0)) eq("captr 'y lo que se recoge'", 'captr.. sum(k, Q(k)*v(k)) =g= sum(c, r(c));');
    }
    if (pairs.length) { eq("mismo(i,j,k) 'el par va en el mismo vehiculo'", 'mismo(i,j,k)$pd(i,j).. y(i,k) =e= y(j,k);'); eq("prec(i,j) 'se recoge antes de entregar'", 'prec(i,j)$pd(i,j).. u(j) =g= u(i) + 1;'); }
    if (vt) {
      L.push('t.lo(c) = tlo(c); t.up(c) = tup(c);', "Parameter Mij(i,j,k) 'M grande ajustada por arco';",
        'Mij(i,j,k)$(arco(i,j,k) and kd(k,i) and c(j)) = max(0, t0 + dist(i,j)/vel(k) - tlo(j));',
        'Mij(i,j,k)$(arco(i,j,k) and c(i) and c(j)) = max(0, tup(i) + srv + dist(i,j)/vel(k) - tlo(j));');
      if (vt.cierre > 0 && !abierto) L.push('Mij(i,j,k)$(arco(i,j,k) and c(i) and kd(k,j)) = max(0, tup(i) + srv + dist(i,j)/vel(k) - cierre);');
      eq("tw0(i,j,k) 'hora de llegada al primer cliente'", 'tw0(i,j,k)$(kd(k,i) and c(j) and arco(i,j,k)).. t(j) =g= t0 + dist(i,j)/vel(k) - Mij(i,j,k)*(1 - x(i,j,k));');
      eq("tw(i,j,k) 'hora de llegada al siguiente cliente'", 'tw(i,j,k)$(c(i) and c(j) and arco(i,j,k)).. t(j) =g= t(i) + srv + dist(i,j)/vel(k) - Mij(i,j,k)*(1 - x(i,j,k));');
      if (vt.cierre > 0 && !abierto) eq("tfin(i,j,k) 'regreso antes del cierre del deposito'", 'tfin(i,j,k)$(c(i) and kd(k,j) and arco(i,j,k)).. t(i) + srv + dist(i,j)/vel(k) =l= cierre + Mij(i,j,k)*(1 - x(i,j,k));');
      if (blandas) eq("retraso(i) 'retraso respecto al fin de la ventana'", 'retraso(c).. e(c) =g= t(c) - be(c);');
    }
    if (tmax) eq("jornada(k) 'duracion maxima de la jornada'", 'jornada(k).. sum((i,j)$arco(i,j,k), (dr(i,j,k)/vel(k))*x(i,j,k)) + srv*sum(c, y(c,k)) =l= Tmax*v(k);');
    L.push('');
    L.push('Model vrp / ' + E.join(', ') + ' /;', 'option optcr = 0, optca = 0, reslim = 600;', '* option mip = highs;');
    if (f.minVeh) {
      L.push('', '* Fase 1: minima cantidad de vehiculos;  fase 2: con esa flota, minimo costo', "Free Variable nv 'vehiculos usados';", "Scalar vehMin 'vehiculos de la fase 1' / " + m + ' /;',
        "Equations defNv 'cuenta los vehiculos', fijaNv 'fase 2: flota fija';", 'defNv..  nv =e= sum(k, v(k));', 'fijaNv.. sum(k, v(k)) =e= vehMin;',
        'Model fase1 / ' + E.filter((x) => x !== 'fo').concat(['defNv']).join(', ') + ' /;', 'Model fase2 / ' + E.concat(['fijaNv']).join(', ') + ' /;',
        'solve fase1 using mip minimizing nv;', 'vehMin = round(nv.l);', 'solve fase2 using mip minimizing z;');
    } else L.push('solve vrp using mip minimizing z;');
    L.push('', "Parameter distRuta(k) 'distancia recorrida por cada vehiculo';", 'distRuta(k) = sum((i,j)$arco(i,j,k), dr(i,j,k)*x.l(i,j,k));', 'Display z.l, v.l, distRuta;');
    return L.join('\n') + '\n';
  }
  root.Gams = { generar };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Gams;
})(typeof globalThis !== 'undefined' ? globalThis : this);
