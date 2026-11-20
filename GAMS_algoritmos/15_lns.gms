$title Búsqueda en vecindarios grandes (LNS): destruir y reparar
$onText
===============================================================================
 15_lns · Búsqueda en vecindarios grandes (LNS): destruir y reparar
-------------------------------------------------------------------------------
 Parte del vecino más cercano. En cada iteración DESTRUYE la solución quitando q = 3 clientes al azar del
 tour y la REPARA reinsertando cada uno en la posición más barata (evaluando el costo dividido por capacidad).
 Acepta la nueva solución si no empeora. 40 iteraciones; generador Park-Miller con semilla fija.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 15_lns.gms
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
Scalar seed 'semilla' / 23 /;
Set it 'iteraciones' / t1*t40 /, rq 'clientes retirados' / q1*q3 /;
Parameter histl(it,*) 'historial: costo nuevo y mejor costo', base(p) 'tour parcial', quit(rq) 'clientes retirados',
          esta(p) 'marca de posición retirada', trM(p) 'mejor tour';
Scalar cMej, nb 'largo del tour parcial', k 'cliente a insertar', posB, cB, a, rpos;
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
cMej = cst; trM(p) = tr(p);
loop(it,
* ---- DESTRUIR: retirar 3 posiciones distintas al azar ----
   esta(p) = 0;
   loop(rq,
      seed = mod(16807*seed, 2147483647); rpos = 1 + floor(seed/2147483647*card(p));
      while (sum(p$(ord(p) = rpos), esta(p)) = 1, rpos = rpos + 1; if (rpos > card(p), rpos = 1; ); );
      esta(p)$(ord(p) = rpos) = 1; quit(rq) = sum(p$(ord(p) = rpos), trM(p));
   );
   base(p) = 0; nb = 0;
   loop(pa$(esta(pa) = 0), nb = nb + 1; base(p)$(ord(p) = nb) = trM(pa); );
* ---- REPARAR: insertar cada cliente retirado en la posición más barata ----
   loop(rq,
      k = quit(rq); cB = 1e9; posB = 0;
      loop(pb$(ord(pb) <= nb + 1),
         a = ord(pb);
         trE(p) = 0;
         trE(p)$(ord(p) < a) = base(p);
         trE(p)$(ord(p) = a) = k;
         trE(p)$(ord(p) > a and ord(p) <= nb + 1) = sum(pq$(ord(pq) = ord(p) - 1), base(pq));
* se evalúa el tour parcial (posiciones vacías = 0 se saltan)
         cst = 0; ld = 0; pv = 0; rn = 1; nev = nev + 1;
         loop(p$(trE(p) > 0),
            cn = trE(p); dn = sum(i$(ord(i) = cn+1), dem(i));
            if (ld + dn > Q, cst = cst + sum(i$(ord(i) = pv+1), dist(i,'d')); pv = 0; ld = 0; rn = rn + 1; );
            cst = cst + sum((i,j)$(ord(i) = pv+1 and ord(j) = cn+1), dist(i,j)); ld = ld + dn; pv = cn;
         );
         cst = cst + sum(i$(ord(i) = pv+1), dist(i,'d'));
         if (cst < cB - 1e-9, cB = cst; posB = a; );
      );
      trE(p) = 0;
      trE(p)$(ord(p) < posB) = base(p);
      trE(p)$(ord(p) = posB) = k;
      trE(p)$(ord(p) > posB and ord(p) <= nb + 1) = sum(pq$(ord(pq) = ord(p) - 1), base(pq));
      base(p) = trE(p); nb = nb + 1;
   );
   histl(it,'nuevo') = cB;
   if (cB <= cMej + 1e-9, cMej = cB; trM(p) = base(p); histl(it,'acepta') = 1; );
   histl(it,'mejor') = cMej;
);
tr(p) = trM(p);
display histl;

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
