$title Colonia de hormigas (metaheurística)
$onText
===============================================================================
 09_colonia_de_hormigas · Colonia de hormigas (metaheurística)
-------------------------------------------------------------------------------
 10 hormigas construyen rutas eligiendo el siguiente cliente con probabilidad proporcional a
 tau(i,j)*(1/d(i,j))^3 (feromona y cercanía). Tras cada iteración la feromona se evapora (rho = 0,3)
 y cada hormiga deposita 100/costo en los arcos de su solución. 30 iteraciones.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 09_colonia_de_hormigas.gms
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
Scalar seed 'semilla' / 11 /;

* ---- COLONIA DE HORMIGAS: construcción probabilística guiada por feromona (tau) y cercanía (1/d) ----
Set ant 'hormigas' / m1*m10 /, itc 'iteraciones' / t1*t30 /;
Parameter tau(i,j) 'feromona', delt(i,j) 'feromona depositada en la iteración', vis(i) 'visitado', cand(i) 'candidato factible',
          w(i) 'peso de cada candidato', trMejor(p) 'mejor tour', hist(itc,*) 'historial: mejor de la iteración y mejor global';
Scalar rho 'evaporación' / 0.3 /, Qd 'constante de depósito' / 100 /, nodo, cnt, tot, rr0, cum, sel, mit 'mejor de la iteración', best 'mejor global' / 1e9 /;
tau(i,j) = 1;
loop(itc,
   delt(i,j) = 0; mit = 1e9;
   loop(ant,
      vis(i) = 0; nodo = 0; ld = 0;
      loop(p,
         cnt = sum(i$(ord(i) > 1 and vis(i) = 0 and ld + dem(i) <= Q), 1);
         if (cnt = 0, ld = 0; nodo = 0; );
         cand(i) = 0;
         cand(i)$(ord(i) > 1 and vis(i) = 0 and ld + dem(i) <= Q) = 1;
         w(i) = 0;
         w(i)$(cand(i) = 1) = sum(j$(ord(j) = nodo+1), tau(j,i)*(1/dist(j,i))*(1/dist(j,i))*(1/dist(j,i)));
         tot = sum(i$(cand(i) = 1), w(i));
         seed = mod(16807*seed, 2147483647); rr0 = seed/2147483647*tot;
         cum = 0; sel = 0;
         loop(i$(ord(i) > 1),
            if (cand(i) = 1,
               cum = cum + w(i);
               if (cum >= rr0 and sel = 0, sel = ord(i) - 1; );
            );
         );
         if (sel = 0, sel = smax(i$(cand(i) = 1), ord(i)) - 1; );
         tr(p) = sel; vis(i)$(ord(i) = sel+1) = 1;
         ld = ld + sum(i$(ord(i) = sel+1), dem(i)); nodo = sel;
      );
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
* la hormiga deposita Qd/costo en los arcos de sus rutas (en ambos sentidos)
      pv = 0; ld = 0;
      loop(p,
         cn = tr(p); dn = sum(i$(ord(i) = cn+1), dem(i));
         if (ld + dn > Q,
            delt(i,j)$(ord(i) = pv+1 and ord(j) = 1) = delt(i,j) + Qd/cst;
            delt(i,j)$(ord(i) = 1 and ord(j) = pv+1) = delt(i,j) + Qd/cst;
            pv = 0; ld = 0;
         );
         delt(i,j)$(ord(i) = pv+1 and ord(j) = cn+1) = delt(i,j) + Qd/cst;
         delt(i,j)$(ord(i) = cn+1 and ord(j) = pv+1) = delt(i,j) + Qd/cst;
         ld = ld + dn; pv = cn;
      );
      delt(i,j)$(ord(i) = pv+1 and ord(j) = 1) = delt(i,j) + Qd/cst;
      delt(i,j)$(ord(i) = 1 and ord(j) = pv+1) = delt(i,j) + Qd/cst;
      if (cst < mit, mit = cst; );
      if (cst < best - 1e-12, best = cst; trMejor(p) = tr(p); );
   );
   tau(i,j) = (1 - rho)*tau(i,j) + delt(i,j);
   hist(itc,'mejor de la iteración') = mit; hist(itc,'mejor global') = best;
);
tr(p) = trMejor(p);
display hist, tau;

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
