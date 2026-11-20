$title Recocido simulado (metaheurística)
$onText
===============================================================================
 07_recocido_simulado · Recocido simulado (metaheurística)
-------------------------------------------------------------------------------
 Desde el tour del vecino más cercano genera un vecino aleatorio (relocate, swap o 2-opt) y lo
 acepta si mejora o, si empeora en delta, con probabilidad exp(-delta/T). T baja de 20 a 0,05.
 Generador pseudoaleatorio Park-Miller con semilla fija: la corrida es reproducible.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 07_recocido_simulado.gms
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
* ---- solución inicial: vecino más cercano ----
Parameter vis(i) 'cliente visitado', traza(p,*) 'traza: desde, hacia, distancia y carga';
Scalar nodo 'nodo actual (0 = depósito)' / 0 /, cnt 'candidatos factibles', dmin, pick;
nodo = 0; ld = 0;
loop(p,
   cnt = sum(i$(ord(i) > 1 and vis(i) = 0 and ld + dem(i) <= Q), 1);
   if (cnt = 0, ld = 0; nodo = 0; );
   dmin = smin(i$(ord(i) > 1 and vis(i) = 0 and ld + dem(i) <= Q), sum(j$(ord(j) = nodo+1), dist(j,i)));
   pick = smin(i$(ord(i) > 1 and vis(i) = 0 and ld + dem(i) <= Q and sum(j$(ord(j) = nodo+1), dist(j,i)) = dmin), ord(i)) - 1;
   tr(p) = pick;
   vis(i)$(ord(i) = pick+1) = 1;
   ld = ld + sum(i$(ord(i) = pick+1), dem(i));
   traza(p,'desde') = nodo; traza(p,'hacia') = pick; traza(p,'carga') = ld;
   traza(p,'distancia') = sum((i,j)$(ord(i) = nodo+1 and ord(j) = pick+1), dist(i,j));
   traza(p,'nueva ruta') = 1$(cnt = 0);
   nodo = pick;
);
* ---- generador pseudoaleatorio Park-Miller (reproducible): seed = 16807*seed mod (2^31-1) ----
Scalar seed 'semilla' / 2024 /;

* ---- RECOCIDO SIMULADO: vecino aleatorio, aceptación de Metropolis, enfriamiento geométrico ----
Set itr 'iteraciones' / t1*t4000 /, hp 'puntos del historial (cada 200 iteraciones)' / h0*h20 /;
Parameter trBest(p) 'mejor tour', hist(hp,*) 'historial: temperatura, costo actual y mejor costo';
Scalar T0 'temperatura inicial' / 20 /, Tf 'temperatura final' / 0.05 /, niter / 4000 /, Temp 'temperatura', alpha 'factor de enfriamiento',
       ut, uu, a, b, ta, mt, cur 'costo actual', best 'mejor costo', delta, acc, acept 'movimientos aceptados' / 0 /;
alpha = (Tf/T0)**(1/niter); Temp = T0;
trE(p) = tr(p);
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
cur = cst; best = cst; trBest(p) = tr(p);
hist('h0','temperatura') = Temp; hist('h0','costo actual') = cur; hist('h0','mejor costo') = best;
loop(itr,
   seed = mod(16807*seed, 2147483647); ut = seed/2147483647;
   seed = mod(16807*seed, 2147483647); a = 1 + floor(seed/2147483647*10);
   seed = mod(16807*seed, 2147483647); b = 1 + floor(seed/2147483647*10);
   seed = mod(16807*seed, 2147483647); uu = seed/2147483647;
   trE(p) = tr(p);
   if (a <> b,
      mt = 3;
      if (ut < 1/3, mt = 1; elseif ut < 2/3, mt = 2; );
      if (mt > 1 and a > b, ta = a; a = b; b = ta; );
      if (mt = 1,
         if (a < b,
            trE(p)$(ord(p) >= a and ord(p) < b) = sum(pq$(ord(pq) = ord(p)+1), tr(pq));
         else
            trE(p)$(ord(p) > b and ord(p) <= a) = sum(pq$(ord(pq) = ord(p)-1), tr(pq));
         );
         trE(p)$(ord(p) = b) = sum(pq$(ord(pq) = a), tr(pq));
      elseif mt = 2,
         trE(p)$(ord(p) = a) = sum(pq$(ord(pq) = b), tr(pq));
         trE(p)$(ord(p) = b) = sum(pq$(ord(pq) = a), tr(pq));
      else
         trE(p)$(ord(p) >= a and ord(p) <= b) = sum(pq$(ord(pq) = a+b-ord(p)), tr(pq));
      );
   );
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
   delta = cst - cur;
   acc = 0;
   if (delta < 0, acc = 1; else acc = 1$(uu < exp(-min(delta/Temp, 50))); );
   if (acc = 1,
      tr(p) = trE(p); cur = cst; acept = acept + 1;
      if (cur < best - 1e-12, best = cur; trBest(p) = tr(p); );
   );
   Temp = Temp*alpha;
   if (mod(ord(itr),200) = 0,
      hist(hp,'temperatura')$(ord(hp) = ord(itr)/200 + 1) = Temp;
      hist(hp,'costo actual')$(ord(hp) = ord(itr)/200 + 1) = cur;
      hist(hp,'mejor costo')$(ord(hp) = ord(itr)/200 + 1) = best;
   );
);
tr(p) = trBest(p);
display hist, acept;

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
