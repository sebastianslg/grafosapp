$title Búsqueda tabú (metaheurística)
$onText
===============================================================================
 06_busqueda_tabu · Búsqueda tabú (metaheurística)
-------------------------------------------------------------------------------
 Desde el tour del vecino más cercano, en cada iteración aplica el mejor intercambio de dos
 posiciones que no esté prohibido (lista tabú de 7 iteraciones), aunque empeore el costo.
 Criterio de aspiración: se permite un movimiento tabú si mejora el mejor costo conocido.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 06_busqueda_tabu.gms
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

* ---- BÚSQUEDA TABÚ: mejor intercambio (swap) no prohibido, aunque empeore ----
Set itt 'iteraciones' / t1*t60 /;
Parameter tb(p,pq) 'iteración hasta la que el intercambio (a,b) es tabú', trMejor(p) 'mejor tour hallado',
          hist(itt,*) 'historial: intercambio, costo actual y mejor costo';
Scalar a, b, ba, bb, cur 'costo actual', best 'mejor costo', cbest 'mejor vecino admisible', found, tabuf, skip, tenure 'permanencia tabú' / 7 /;
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
cur = cst; best = cst; trMejor(p) = tr(p);
loop(itt,
   found = 0;
   loop(pa,
      loop(pb$(ord(pb) > ord(pa)),
         a = ord(pa); b = ord(pb);
         trE(p) = tr(p);
         trE(p)$(ord(p) = a) = sum(pq$(ord(pq) = b), tr(pq));
         trE(p)$(ord(p) = b) = sum(pq$(ord(pq) = a), tr(pq));
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
         tabuf = 1$(tb(pa,pb) > ord(itt));
         skip  = 1$(tabuf = 1 and cst >= best - 1e-9);
         if (skip = 0 and (found = 0 or cst < cbest - 1e-12),
            cbest = cst; ba = a; bb = b; trB(p) = trE(p); found = 1;
         );
      );
   );
   if (found = 1,
      tr(p) = trB(p); cur = cbest;
      tb(pa,pb)$(ord(pa) = ba and ord(pb) = bb) = ord(itt) + tenure;
      if (cur < best - 1e-12, best = cur; trMejor(p) = tr(p); );
      hist(itt,'a') = ba; hist(itt,'b') = bb; hist(itt,'costo actual') = cur; hist(itt,'mejor costo') = best;
   );
);
tr(p) = trMejor(p);
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
