$title VRPPD: VRP con recogida y entrega por pares
$onText
===============================================================================================
 24 · VRPPD · VRP con recogida y entrega por pares
-----------------------------------------------------------------------------------------------
 Cada solicitud tiene un punto de recogida y uno de entrega: ambos deben estar en la misma ruta y
 la recogida antes de la entrega (mensajería, transporte de pacientes). Índice k de vehículo para
 garantizar la misma ruta; u(i) da el orden de visita.
 PROBLEMA DE EJEMPLO:
 5 solicitudes sobre la instancia CVRP-10: c1→c4, c2→c6, c3→c8, c9→c10, c5→c7, con la demanda del
 punto de recogida; Q = 15; 3 vehículos.
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 24_vrppd.gms
 SALIDA:    archivo .lst -> sección «display» (función objetivo, variables y rutas reconstruidas).
 SOLVER:    cualquier solver MIP (HiGHS, CPLEX, CBC, Gurobi, XPRESS). Para usar HiGHS (gratuito):
            descomentar la línea «option mip = highs;» más abajo.
===============================================================================================
$offText

* ------------------------------------- DATOS -------------------------------------------------
Set i 'nodos: depósito y clientes' / d, c1*c10 /
    c(i) 'clientes' / c1*c10 /;
Alias (i,j,h,g);
Parameter
   cx(i) 'coordenada x' / d 48, c1 18, c2 38, c3 62, c4 88, c5 92, c6 78, c7 52, c8 28, c9 8, c10 14 /
   cy(i) 'coordenada y' / d 52, c1 82, c2 92, c3 84, c4 72, c5 46, c6 18, c7 8, c8 16, c9 38, c10 64 /
   dem(i) 'demanda' / d 0, c1 4, c2 3, c3 5, c4 4, c5 3, c6 5, c7 4, c8 3, c9 5, c10 2 /;
Scalar Q 'capacidad del vehículo' / 15 /;
Parameter dist(i,j) 'distancia euclidiana (también tiempo de viaje)';
dist(i,j) = sqrt(sqr(cx(i) - cx(j)) + sqr(cy(i) - cy(j)));
Set k 'vehículos' / k1*k3 /, pr(i,i) 'pares recogida -> entrega' / c1.c4, c2.c6, c3.c8, c9.c10, c5.c7 /;
Parameter w(i) 'cambio de carga: + en la recogida, - en la entrega';
w(c) = sum(j$pr(c,j), dem(c)) - sum(j$pr(j,c), dem(j));
Scalar BigM / 100 /;

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j,k) 'vale 1 si el vehículo k recorre el arco i -> j';
Positive Variable u(i) 'orden de visita', ql(i) 'carga a bordo al salir de i';
Free Variable z 'distancia total';
x.fx(i,i,k) = 0;
Equations obj, visita(j), flujo(i,k), salida(k) 'cada vehículo sale a lo sumo una vez', mismo(i,j,k) 'recogida y entrega en el mismo vehículo',
          orden(i,j) 'orden de visita (MTZ)', prec(i,j) 'recogida antes que entrega', cIni(j), cIni2(j), cSig(i,j), cSig2(i,j);
obj..            z =e= sum((i,j,k), dist(i,j)*x(i,j,k));
visita(j)$c(j).. sum((i,k)$(not sameas(i,j)), x(i,j,k)) =e= 1;
flujo(i,k)..     sum(j$(not sameas(i,j)), x(i,j,k)) =e= sum(j$(not sameas(i,j)), x(j,i,k));
salida(k)..      sum(c, x('d',c,k)) =l= 1;
mismo(i,j,k)$pr(i,j).. sum(h$(not sameas(h,i)), x(h,i,k)) =e= sum(h$(not sameas(h,j)), x(h,j,k));
orden(i,j)$(c(i) and c(j) and not sameas(i,j)).. u(j) =g= u(i) + 1 - card(c)*(1 - sum(k, x(i,j,k)));
prec(i,j)$pr(i,j).. u(j) =g= u(i) + 1;
cIni(j)$c(j)..   ql(j) =g= w(j) - BigM*(1 - sum(k, x('d',j,k)));
cIni2(j)$c(j)..  ql(j) =l= w(j) + BigM*(1 - sum(k, x('d',j,k)));
cSig(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + w(j) - BigM*(1 - sum(k, x(i,j,k)));
cSig2(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =l= ql(i) + w(j) + BigM*(1 - sum(k, x(i,j,k)));
u.lo(c) = 1; u.up(c) = card(c); ql.up(c) = Q;
Model vrppd / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve vrppd using mip minimizing z;

* ------------------------------------- REPORTE: rutas reconstruidas desde x.l ------------------
Set r 'rutas' / r1*r8 /, s 'paradas' / s1*s12 /;
Parameter ruta(r,s) 'cliente visitado en cada parada (número de cliente)', largo(r) 'distancia de la ruta',
          cargaR(r) 'carga entregada en la ruta';
Scalar nr 'número de rutas' / 0 /, act 'nodo actual (ord)', sig 'nodo siguiente (ord)', np 'parada';
loop((g,h)$((sameas(g,'d')) and c(h) and sum(k, x.l(g,h,k)) > 0.5),
   nr = nr + 1; act = ord(h); np = 0;
   largo(r)$(ord(r) = nr) = dist(g,h);
   while(sum(i$(ord(i) = act), 1$c(i)) > 0,
      np = np + 1;
      ruta(r,s)$(ord(r) = nr and ord(s) = np) = sum(i$(ord(i) = act), ord(i)) - card(i) + card(c);
      cargaR(r)$(ord(r) = nr) = cargaR(r) + sum(i$(ord(i) = act), dem(i));
      sig = sum((i,j)$(ord(i) = act and sum(k, x.l(i,j,k)) > 0.5), ord(j));
      largo(r)$(ord(r) = nr) = largo(r) + sum((i,j)$(ord(i) = act and ord(j) = sig), dist(i,j));
      act = sig;
   );
);

option decimals = 2;
display z.l, u.l, ql.l, ruta, largo;
