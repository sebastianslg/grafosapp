$title MDVRP: VRP con múltiples depósitos
$onText
===============================================================================================
 19 · MDVRP · VRP con múltiples depósitos
-----------------------------------------------------------------------------------------------
 Hay varios depósitos; cada cliente se asigna a uno (y(c,g)) y cada ruta sale y regresa al mismo
 depósito. Las restricciones «mismo» obligan a que dos clientes consecutivos pertenezcan al mismo
 depósito.
 PROBLEMA DE EJEMPLO:
 Clientes de la instancia CVRP-10 con dos depósitos: d1 (30, 70) y d2 (72, 30); Q = 15; hasta 3
 vehículos por depósito.
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 19_mdvrp.gms
 SALIDA:    archivo .lst -> sección «display» (función objetivo, variables y rutas reconstruidas).
 SOLVER:    cualquier solver MIP (HiGHS, CPLEX, CBC, Gurobi, XPRESS). Para usar HiGHS (gratuito):
            descomentar la línea «option mip = highs;» más abajo.
===============================================================================================
$offText

* ------------------------------------- DATOS -------------------------------------------------
Set i 'nodos: depósito y clientes' / d1, d2, c1*c10 /
    c(i) 'clientes' / c1*c10 /;
Alias (i,j,h,g);
Parameter
   cx(i) 'coordenada x' / d1 30, d2 72, c1 18, c2 38, c3 62, c4 88, c5 92, c6 78, c7 52, c8 28, c9 8, c10 14 /
   cy(i) 'coordenada y' / d1 70, d2 30, c1 82, c2 92, c3 84, c4 72, c5 46, c6 18, c7 8, c8 16, c9 38, c10 64 /
   dem(i) 'demanda' / d1 0, d2 0, c1 4, c2 3, c3 5, c4 4, c5 3, c6 5, c7 4, c8 3, c9 5, c10 2 /;
Scalar Q 'capacidad del vehículo' / 15 /;
Parameter dist(i,j) 'distancia euclidiana (también tiempo de viaje)';
dist(i,j) = sqrt(sqr(cx(i) - cx(j)) + sqr(cy(i) - cy(j)));
Set dp(i) 'depósitos' / d1, d2 /;
Alias (dp,g2);
Scalar Kd 'vehículos por depósito' / 3 /;

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si un vehículo recorre el arco i -> j', y(i,i) 'y(c,g) = 1 si el cliente c se atiende desde el depósito g';
Positive Variable ql(i) 'carga acumulada al salir del cliente i';
Free Variable z 'función objetivo';
x.fx(i,i) = 0; x.fx(dp,g2) = 0;
Equations obj, sale(i), entra(i), asig(i) 'cada cliente a un depósito', balDep(dp) 'salen tantos como regresan a cada depósito',
          salDep(dp,j) 'del depósito solo a sus clientes', regDep(i,dp) 'al depósito solo desde sus clientes',
          mismo1(i,j,dp) 'clientes consecutivos -> mismo depósito', mismo2(i,j,dp), carga(i,j), flotaDep(dp) 'vehículos por depósito';
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
asig(i)$c(i)..  sum(dp, y(i,dp)) =e= 1;
balDep(dp)..    sum(c, x(dp,c)) =e= sum(c, x(c,dp));
salDep(dp,j)$c(j).. x(dp,j) =l= y(j,dp);
regDep(i,dp)$c(i).. x(i,dp) =l= y(i,dp);
mismo1(i,j,dp)$(c(i) and c(j) and not sameas(i,j)).. y(j,dp) - y(i,dp) =l= 1 - x(i,j);
mismo2(i,j,dp)$(c(i) and c(j) and not sameas(i,j)).. y(i,dp) - y(j,dp) =l= 1 - x(i,j);
carga(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + dem(j) - Q*(1 - x(i,j));
flotaDep(dp)..  sum(c, x(dp,c)) =l= Kd;
ql.lo(c) = dem(c); ql.up(c) = Q;
y.fx(i,j)$(not (c(i) and dp(j))) = 0;
obj.. z =e= sum((i,j), dist(i,j)*x(i,j));
Model mdvrp / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve mdvrp using mip minimizing z;

* ------------------------------------- REPORTE: rutas reconstruidas desde x.l ------------------
Set r 'rutas' / r1*r8 /, s 'paradas' / s1*s12 /;
Parameter ruta(r,s) 'cliente visitado en cada parada (número de cliente)', largo(r) 'distancia de la ruta',
          cargaR(r) 'carga entregada en la ruta';
Scalar nr 'número de rutas' / 0 /, act 'nodo actual (ord)', sig 'nodo siguiente (ord)', np 'parada';
loop((g,h)$((dp(g)) and c(h) and x.l(g,h) > 0.5),
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
Parameter depC(i,i) 'depósito asignado a cada cliente'; depC(c,dp) = y.l(c,dp);

option decimals = 2;
display z.l, depC, ruta, largo, cargaR;
