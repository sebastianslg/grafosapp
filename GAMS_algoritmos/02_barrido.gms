$title Barrido o «sweep» (heurística constructiva)
$onText
===============================================================================
 02_barrido · Barrido o «sweep» (heurística constructiva)
-------------------------------------------------------------------------------
 Ordena los clientes por su ángulo respecto al depósito y llena vehículos en ese orden;
 se prueban las 10 rotaciones posibles (cliente inicial) y se conserva la mejor.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 02_barrido.gms
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

* ---- BARRIDO: ordena los clientes por ángulo y prueba cada cliente como inicio ----
Parameter ang(i) 'ángulo respecto al depósito (rad)', rk(i) 'posición por ángulo', orden(p) 'clientes ordenados por ángulo';
ang(i)$(ord(i) > 1) = arctan2(cy(i) - cy('d'), cx(i) - cx('d'));
rk(i)$(ord(i) > 1)  = 1 + sum(j$(ord(j) > 1 and ang(j) < ang(i)), 1);
orden(p) = sum(i$(ord(i) > 1 and rk(i) = ord(p)), ord(i) - 1);
Set sh 'rotaciones (cliente con el que se inicia el barrido)' / s0*s9 /;
Parameter rot(sh,*) 'resultado de cada rotación';
Scalar s0v, bestc 'mejor costo' / 1e9 /, bests 'mejor rotación';
loop(sh,
   s0v = ord(sh) - 1;
   trE(p) = sum(pq$(ord(pq) = mod(ord(p) - 1 + s0v, 10) + 1), orden(pq));
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
   rot(sh,'cliente inicial') = sum(p$(ord(p) = 1), trE(p));
   rot(sh,'costo') = cst; rot(sh,'rutas') = rn;
   if (cst < bestc - 1e-9, bestc = cst; bests = s0v; tr(p) = trE(p); );
);
display ang, orden, rot, bests;

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
