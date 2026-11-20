$title Or-opt: reubicación de tramos de 1 a 3 clientes (mejora local)
$onText
===============================================================================
 13_or_opt · Or-opt: reubicación de tramos de 1 a 3 clientes (mejora local)
-------------------------------------------------------------------------------
 Parte del tour del vecino más cercano. En cada pasada prueba sacar un tramo de L = 1, 2 o 3 clientes
 consecutivos y reinsertarlo en otra posición del tour (sin invertirlo); aplica el mejor movimiento y repite
 hasta que ningún tramo mejora (óptimo local Or-opt).
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 13_or_opt.gms
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

* ---- OR-OPT: tramo [a, a+L-1] reinsertado tras la posición b del tour restante ----
Set ln 'longitudes de tramo' / l1*l3 /, hs 'historial de mejoras' / h1*h40 /;
Parameter rest(p) 'tour sin el tramo', histo(hs,*) 'historial: L, a, b y costo';
Scalar L 'longitud del tramo', a 'inicio del tramo', b 'posición de inserción', cur 'costo actual', bd 'mejor variación',
       cbest, bL, ba, bb, mejora / 1 /, nit / 0 /;
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
while (mejora = 1,
   mejora = 0; bd = 0;
   loop(ln,
      L = ord(ln);
      loop(pa$(ord(pa) + L - 1 <= card(p)),
         a = ord(pa);
         rest(p) = 0;
         rest(p)$(ord(p) < a) = tr(p);
         rest(p)$(ord(p) >= a and ord(p) <= card(p) - L) = sum(pq$(ord(pq) = ord(p) + L), tr(pq));
         loop(pb$(ord(pb) <= card(p) - L + 1),
            b = ord(pb) - 1;
            if (b <> a - 1,
               trE(p)$(ord(p) <= b) = rest(p);
               trE(p)$(ord(p) > b and ord(p) <= b + L) = sum(pq$(ord(pq) = a + ord(p) - b - 1), tr(pq));
               trE(p)$(ord(p) > b + L) = sum(pq$(ord(pq) = ord(p) - L), rest(pq));
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
               if (cst - cur < bd - 1e-9, bd = cst - cur; cbest = cst; bL = L; ba = a; bb = b; trB(p) = trE(p); );
            );
         );
      );
   );
   if (bd < -1e-9,
      tr(p) = trB(p); cur = cbest; mejora = 1; nit = nit + 1;
      histo(hs,'L')$(ord(hs) = nit) = bL; histo(hs,'a')$(ord(hs) = nit) = ba;
      histo(hs,'b')$(ord(hs) = nit) = bb; histo(hs,'costo')$(ord(hs) = nit) = cur;
   );
);
display histo;

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
