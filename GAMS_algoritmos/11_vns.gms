$title VNS: búsqueda de vecindario variable (metaheurística)
$onText
===============================================================================
 11_vns · VNS: búsqueda de vecindario variable (metaheurística)
-------------------------------------------------------------------------------
 Parte de la solución del vecino más cercano. En cada iteración agita la solución con k+1
 movimientos aleatorios (k = 1..3), la mejora con VND y la acepta si mejora (entonces k = 1);
 si no, aumenta k. Generador Park-Miller con semilla fija.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 11_vns.gms
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
* ---- declaraciones de la búsqueda local VND ----
Set hs 'historial de mejoras' / h1*h60 /;
Parameter histv(hs,*) 'historial: vecindario, posiciones y costo tras cada mejora';
Set kn 'lista de vecindarios' / n1*n3 /;
Parameter nbh(kn) 'tipo de movimiento de cada vecindario' / n1 1, n2 2, n3 3 /;
Scalar mt 'tipo de movimiento', a, b, ba, bb, bd 'mejor variación de costo', cbest, cur 'costo actual', kv 'vecindario actual', kmax 'cantidad de vecindarios' / 3 /, nit 'mejoras aplicadas' / 0 /;
* ---- generador pseudoaleatorio Park-Miller (reproducible): seed = 16807*seed mod (2^31-1) ----
Scalar seed 'semilla' / 3 /;

* ---- VNS: agitación de intensidad creciente (k) + búsqueda local VND ----
Set itv 'iteraciones' / t1*t12 /, sk 'movimientos de agitación' / s1*s4 /;
Parameter trC(p) 'solución incumbente', hist(itv,*) 'historial: k final y costo de la incumbente';
Scalar kmaxv 'intensidad máxima de agitación' / 3 /, kk 'intensidad actual', uu, curC 'costo de la incumbente', ta;
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
trC(p) = tr(p); curC = cst;
loop(itv,
   kk = 1;
   while (kk <= kmaxv,
      tr(p) = trC(p);
      loop(sk$(ord(sk) <= kk + 1),
         seed = mod(16807*seed, 2147483647); a = 1 + floor(seed/2147483647*10);
         seed = mod(16807*seed, 2147483647); b = 1 + floor(seed/2147483647*10);
         if (a <> b,
            seed = mod(16807*seed, 2147483647); uu = seed/2147483647;
            mt = 2;
            if (uu < 0.5, mt = 1; );
            trE(p) = tr(p);
            if (mt = 1,
            if (a < b,
               trE(p)$(ord(p) >= a and ord(p) < b) = sum(pq$(ord(pq) = ord(p)+1), tr(pq));
            else
               trE(p)$(ord(p) > b and ord(p) <= a) = sum(pq$(ord(pq) = ord(p)-1), tr(pq));
            );
            trE(p)$(ord(p) = b) = sum(pq$(ord(pq) = a), tr(pq));
            else
            trE(p)$(ord(p) = a) = sum(pq$(ord(pq) = b), tr(pq));
            trE(p)$(ord(p) = b) = sum(pq$(ord(pq) = a), tr(pq));
            );
            tr(p) = trE(p);
         );
      );
* ---- BÚSQUEDA LOCAL VND: relocate (1), swap (2), 2-opt (3); mejor mejora en cada vecindario ----
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
      cur = cst;
      kv = 1;
      while (kv <= kmax,
         mt = sum(kn$(ord(kn) = kv), nbh(kn)); bd = 0;
         loop(pa,
            loop(pb$(ord(pb) <> ord(pa) and (mt = 1 or ord(pb) > ord(pa))),
               a = ord(pa); b = ord(pb);
               trE(p) = tr(p);
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
               if (cst - cur < bd - 1e-9, bd = cst - cur; cbest = cst; ba = a; bb = b; trB(p) = trE(p); );
            );
         );
         if (bd < -1e-9,
            tr(p) = trB(p); cur = cbest; kv = 1; nit = nit + 1;
            histv(hs,'vecindario')$(ord(hs) = nit) = mt; histv(hs,'a')$(ord(hs) = nit) = ba;
            histv(hs,'b')$(ord(hs) = nit) = bb; histv(hs,'costo')$(ord(hs) = nit) = cur;
         else
            kv = kv + 1;
         );
      );
      if (cur < curC - 1e-9,
         trC(p) = tr(p); curC = cur; kk = 1;
      else
         kk = kk + 1;
      );
   );
   hist(itv,'k final') = kk; hist(itv,'costo incumbente') = curC;
);
tr(p) = trC(p);
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
