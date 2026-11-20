$title Algoritmo genético (metaheurística)
$onText
===============================================================================
 08_algoritmo_genetico · Algoritmo genético (metaheurística)
-------------------------------------------------------------------------------
 Población de 30 permutaciones de clientes (cada una se divide por capacidad para formar rutas).
 60 generaciones: selección por torneo binario, cruce OX, mutación por intercambio (p = 0,5)
 y elitismo de los 2 mejores. Generador Park-Miller con semilla fija.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 08_algoritmo_genetico.gms
 SALIDA:    revisar el archivo .lst (instrucciones «display»).
===============================================================================
$offText

* ---------------------------- DATOS DEL PROBLEMA -----------------------------
Set i 'nodos: depósito d y clientes c1..c10' / d, c1*c10 /;
Alias (i,j);
Parameter
   cx(i)  'coordenada x' / d 48, c1 18, c2 38, c3 62, c4 88, c5 92, c6 78, c7 52, c8 28, c9 8, c10 14 /
   cy(i)  'coordenada y' / d 52, c1 82, c2 92, c3 84, c4 72, c5 46, c6 18, c7 8, c8 16, c9 38, c10 64 /
   dem(i) 'demanda'      / d 0, c1 4, c2 3, c3 5, c4 4, c5 3, c6 5, c7 4, c8 3, c9 5, c10 2 /;
Scalar Q 'capacidad del vehículo' / 15 /;
Scalar zopt 'costo óptimo conocido (modelo exacto, archivo 12)' / 425.0513 /;
Parameter dist(i,j) 'distancia euclidiana';
dist(i,j) = sqrt( sqr(cx(i)-cx(j)) + sqr(cy(i)-cy(j)) );

* ------------- REPRESENTACIÓN: tour gigante dividido por capacidad ------------
Set p 'posiciones del tour' / p1*p10 /;
Alias (p,pa,pb,pq);
Parameter tr(p)  'tour: número de cliente en cada posición'
          trE(p) 'tour que se evalúa'
          trB(p) 'mejor tour vecino'
          rr(p)  'ruta a la que pertenece cada posición';
Scalar cst 'costo del tour evaluado', ld 'carga acumulada', pv 'nodo previo (0 = depósito)',
       cn 'cliente actual', dn 'demanda del cliente', rn 'número de ruta', nev 'evaluaciones de costo' / 0 /;
* ---- generador pseudoaleatorio Park-Miller (reproducible): seed = 16807*seed mod (2^31-1) ----
Scalar seed 'semilla' / 7 /;

* ---- ALGORITMO GENÉTICO: permutaciones de clientes, torneo, cruce OX, mutación y elitismo ----
Set g 'individuos' / g1*g30 /, ge 'generaciones (0..60)' / e0*e60 /, fy 'pasos del barajado' / f1*f9 /;
Alias (g,h);
Parameter pop(g,p) 'población', pop2(g,p) 'nueva población', cs(g) 'costo de cada individuo', rk(g) 'posición según el costo',
          padA(p) 'padre A', padB(p) 'padre B', chd(p) 'hijo', used(p) 'gen copiado del padre A', hist(ge,*) 'historial: mejor y promedio';
Scalar npop / 30 /, ngen / 60 /, nelite / 2 /, pm 'probabilidad de mutación' / 0.5 /,
       ii, jj, ti, tj, ia, ib, ca, cb, wa, wb, c1, c2, ta, w, gene, usedg, ut;
* población inicial: permutaciones al azar (barajado de Fisher-Yates)
loop(g,
   tr(p) = ord(p);
   loop(fy,
      ii = 11 - ord(fy);
      seed = mod(16807*seed, 2147483647); jj = 1 + floor(seed/2147483647*ii);
      ti = sum(pq$(ord(pq) = ii), tr(pq)); tj = sum(pq$(ord(pq) = jj), tr(pq));
      tr(p)$(ord(p) = ii) = tj; tr(p)$(ord(p) = jj) = ti;
   );
   pop(g,p) = tr(p);
);
loop(ge,
   loop(g,
      trE(p) = pop(g,p);
* ---- EVALUAR trE: divide por capacidad y suma distancias -> cst ----
      cst = 0; ld = 0; pv = 0; rn = 1; nev = nev + 1;
      loop(p,
         cn = trE(p);
         dn = sum(i$(ord(i) = cn+1), dem(i));
         if (ld + dn > Q,
            cst = cst + sum(i$(ord(i) = pv+1), dist(i,'d'));
            pv = 0; ld = 0; rn = rn + 1;
         );
         cst = cst + sum((i,j)$(ord(i) = pv+1 and ord(j) = cn+1), dist(i,j));
         ld = ld + dn; pv = cn; rr(p) = rn;
      );
      cst = cst + sum(i$(ord(i) = pv+1), dist(i,'d'));
      cs(g) = cst;
   );
   rk(g) = 1 + sum(h$(cs(h) < cs(g) or (cs(h) = cs(g) and ord(h) < ord(g))), 1);
   hist(ge,'mejor') = smin(g, cs(g)); hist(ge,'promedio') = sum(g, cs(g))/npop;
   if (ord(ge) <= ngen,
      pop2(g,p)$(ord(g) <= nelite) = sum(h$(rk(h) = ord(g)), pop(h,p));
      loop(g$(ord(g) > nelite),
         seed = mod(16807*seed, 2147483647); ia = 1 + floor(seed/2147483647*npop);
         seed = mod(16807*seed, 2147483647); ib = 1 + floor(seed/2147483647*npop);
         ca = sum(h$(ord(h) = ia), cs(h)); cb = sum(h$(ord(h) = ib), cs(h));
         if (ca < cb or (ca = cb and ia <= ib), wa = ia; else wa = ib; );
         seed = mod(16807*seed, 2147483647); ia = 1 + floor(seed/2147483647*npop);
         seed = mod(16807*seed, 2147483647); ib = 1 + floor(seed/2147483647*npop);
         ca = sum(h$(ord(h) = ia), cs(h)); cb = sum(h$(ord(h) = ib), cs(h));
         if (ca < cb or (ca = cb and ia <= ib), wb = ia; else wb = ib; );
         padA(p) = sum(h$(ord(h) = wa), pop(h,p)); padB(p) = sum(h$(ord(h) = wb), pop(h,p));
         seed = mod(16807*seed, 2147483647); c1 = 1 + floor(seed/2147483647*10);
         seed = mod(16807*seed, 2147483647); c2 = 1 + floor(seed/2147483647*10);
         if (c1 > c2, ta = c1; c1 = c2; c2 = ta; );
         chd(p) = 0; chd(p)$(ord(p) >= c1 and ord(p) <= c2) = padA(p);
         used(p) = 0; used(p)$(sum(pq$(ord(pq) >= c1 and ord(pq) <= c2 and padA(pq) = ord(p)), 1) > 0) = 1;
         w = 0;
         loop(pq,
            gene = padB(pq);
            usedg = sum(p$(ord(p) = gene), used(p));
            if (usedg = 0,
               w = w + 1;
               while (w >= c1 and w <= c2, w = w + 1; );
               chd(p)$(ord(p) = w) = gene;
            );
         );
         seed = mod(16807*seed, 2147483647); ut = seed/2147483647;
         if (ut < pm,
            seed = mod(16807*seed, 2147483647); ia = 1 + floor(seed/2147483647*10);
            seed = mod(16807*seed, 2147483647); ib = 1 + floor(seed/2147483647*10);
            ti = sum(pq$(ord(pq) = ia), chd(pq)); tj = sum(pq$(ord(pq) = ib), chd(pq));
            chd(p)$(ord(p) = ia) = tj; chd(p)$(ord(p) = ib) = ti;
         );
         pop2(g,p) = chd(p);
      );
      pop(g,p) = pop2(g,p);
   );
);
tr(p) = sum(h$(rk(h) = 1), pop(h,p));
display hist;

* ------------------------------- REPORTE FINAL -------------------------------
Set rs 'rutas' / r1*r6 /;
Parameter RTc(rs,p) 'cliente en cada posición, por ruta', carga(rs) 'carga de la ruta', dr(rs) 'distancia de la ruta';
Scalar costo_final, gap_pct 'brecha frente al óptimo (%)';
ld = 0; pv = 0; rn = 1;
loop(p,
   cn = tr(p); dn = sum(i$(ord(i) = cn+1), dem(i));
   if (ld + dn > Q,
      dr(rs)$(ord(rs) = rn) = dr(rs) + sum(i$(ord(i) = pv+1), dist(i,'d'));
      pv = 0; ld = 0; rn = rn + 1;
   );
   dr(rs)$(ord(rs) = rn) = dr(rs) + sum((i,j)$(ord(i) = pv+1 and ord(j) = cn+1), dist(i,j));
   ld = ld + dn; pv = cn;
   carga(rs)$(ord(rs) = rn) = ld;
   RTc(rs,p)$(ord(rs) = rn) = cn;
);
dr(rs)$(ord(rs) = rn) = dr(rs) + sum(i$(ord(i) = pv+1), dist(i,'d'));
costo_final = sum(rs, dr(rs));
gap_pct = 100*(costo_final - zopt)/zopt;
option decimals = 2;
display tr, RTc, carga, dr, costo_final, gap_pct;
display nev;
