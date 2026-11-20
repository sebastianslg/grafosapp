$title VRPTW: VRP con ventanas de tiempo
$onText
===============================================================================================
 14 · VRPTW · VRP con ventanas de tiempo
-----------------------------------------------------------------------------------------------
 Cada cliente debe empezar a atenderse dentro de su ventana [ea, la]; si el vehículo llega antes,
 espera. Tiempo de viaje = distancia (velocidad 1) y servicio de 10 minutos. El vehículo regresa
 antes del cierre del depósito.
 PROBLEMA DE EJEMPLO:
 Instancia CVRP-10 con ventanas de 70-80 minutos por cliente, Q = 15, K = 5, depósito abierto de
 0 a 480.
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 14_vrptw.gms
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
   dem(i) 'demanda' / d 0, c1 4, c2 3, c3 5, c4 4, c5 3, c6 5, c7 4, c8 3, c9 5, c10 2 /,
   ea(i) 'inicio de la ventana de tiempo' / d 0, c1 60, c2 20, c3 150, c4 40, c5 170, c6 90, c7 190, c8 30, c9 120, c10 80 /,
   la(i) 'fin de la ventana de tiempo' / d 480, c1 140, c2 90, c3 230, c4 110, c5 250, c6 160, c7 270, c8 100, c9 200, c10 150 /,
   sv(i) 'tiempo de servicio' / d 0, c1 10, c2 10, c3 10, c4 10, c5 10, c6 10, c7 10, c8 10, c9 10, c10 10 /;
Scalar Q 'capacidad del vehículo' / 15 /;
Parameter dist(i,j) 'distancia euclidiana (también tiempo de viaje)';
dist(i,j) = sqrt(sqr(cx(i) - cx(j)) + sqr(cy(i) - cy(j)));
Scalar K 'vehículos disponibles' / 5 /, BigM / 1000 /;

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si un vehículo recorre el arco i -> j';
Positive Variable ql(i) 'carga acumulada al salir del cliente i';
Free Variable z 'función objetivo';
x.fx(i,i) = 0;
Equations obj 'distancia total', sale(i) 'un sucesor por cliente', entra(i) 'un predecesor por cliente',
          flota 'a lo sumo K vehículos', balDep 'salen tantos como regresan', carga(i,j) 'carga acumulada (MTZ)';
obj..           z =e= sum((i,j), dist(i,j)*x(i,j));
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
flota..         sum(c, x('d',c)) =l= K;
balDep..        sum(c, x('d',c)) =e= sum(c, x(c,'d'));
carga(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + dem(j) - Q*(1 - x(i,j));
ql.lo(c) = dem(c); ql.up(c) = Q;
Positive Variable tL(i) 'hora de llegada (inicio del servicio) al cliente i';
Equations tIni(j) 'primer cliente', tSig(i,j) 'secuencia de tiempos', tVen(i) 'ventana: no antes de ea';
tIni(j)$c(j).. tL(j) =g= dist('d',j) - BigM*(1 - x('d',j));
tSig(i,j)$(c(i) and c(j) and not sameas(i,j)).. tL(j) =g= tL(i) + sv(i) + dist(i,j) - BigM*(1 - x(i,j));
tVen(i)$c(i).. tL(i) =g= ea(i);
tL.up(c) = la(c);
Equation tFin(i) 'regreso antes del cierre del depósito';
tFin(i)$c(i).. tL(i) + sv(i) + dist(i,'d') =l= la('d') + BigM*(1 - x(i,'d'));
Model vrptw / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve vrptw using mip minimizing z;

* ------------------------------------- REPORTE: rutas reconstruidas desde x.l ------------------
Set r 'rutas' / r1*r8 /, s 'paradas' / s1*s12 /;
Parameter ruta(r,s) 'cliente visitado en cada parada (número de cliente)', largo(r) 'distancia de la ruta',
          cargaR(r) 'carga entregada en la ruta';
Scalar nr 'número de rutas' / 0 /, act 'nodo actual (ord)', sig 'nodo siguiente (ord)', np 'parada';
loop((g,h)$((sameas(g,'d')) and c(h) and x.l(g,h) > 0.5),
   nr = nr + 1; act = ord(h); np = 0;
   largo(r)$(ord(r) = nr) = dist(g,h);
   while(sum(i$(ord(i) = act), 1$c(i)) > 0,
      np = np + 1;
      ruta(r,s)$(ord(r) = nr and ord(s) = np) = sum(i$(ord(i) = act), ord(i)) - card(i) + card(c);
      cargaR(r)$(ord(r) = nr) = cargaR(r) + sum(i$(ord(i) = act), dem(i));
      sig = sum((i,j)$(ord(i) = act and x.l(i,j) > 0.5), ord(j));
      largo(r)$(ord(r) = nr) = largo(r) + sum((i,j)$(ord(i) = act and ord(j) = sig), dist(i,j));
      act = sig;
   );
);

option decimals = 2;
display z.l, tL.l, ruta, largo, cargaR;
