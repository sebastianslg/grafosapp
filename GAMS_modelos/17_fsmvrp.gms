$title FSMVRP: VRP de tamaño y mezcla de flota
$onText
===============================================================================================
 17 · FSMVRP · VRP de tamaño y mezcla de flota
-----------------------------------------------------------------------------------------------
 Decisión táctica: qué vehículos comprar o alquilar. Cada tipo tiene capacidad y costo fijo
 propios (el costo por km es igual). Se minimiza costo fijo + distancia. Formulación de 2
 índices: w(j,t) elige el tipo de la ruta que empieza en j y kap(i) propaga esa capacidad a lo
 largo de la ruta.
 PROBLEMA DE EJEMPLO:
 Instancia CVRP-10; tipos grande (Q 20, fijo 80), mediano (Q 15, fijo 60) y pequeño (Q 10, fijo
 45); 1 $/km; hasta 2 de cada tipo.
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 17_fsmvrp.gms
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
Set t 'tipos de vehículo' / grande, mediano, pequeno /;
Parameter
   capT(t) 'capacidad del tipo' / grande 20, mediano 15, pequeno 10 /
   cpk(t)  'costo por unidad de distancia' / grande 1, mediano 1, pequeno 1 /
   fijo(t) 'costo fijo por vehículo usado' / grande 80, mediano 60, pequeno 45 /
   nveh(t) 'vehículos disponibles del tipo' / grande 2, mediano 2, pequeno 2 /;
Scalar Qmax 'mayor capacidad'; Qmax = smax(t, capT(t));

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si un vehículo recorre el arco i -> j', w(i,t) 'la ruta que empieza en el cliente i usa el tipo t';
Positive Variable ql(i) 'carga acumulada al salir de i', kap(i) 'capacidad del vehículo que visita i';
Free Variable z 'costo total';
x.fx(i,i) = 0;
Equations obj 'costo fijo + distancia', sale(i), entra(i), balDep, tipoIni(i) 'cada ruta elige un tipo', disp(t) 'vehículos por tipo',
          kapIni(i) 'capacidad del primer cliente', kapIni2(i), kapSig1(i,j) 'la capacidad se propaga', kapSig2(i,j), carga(i,j), cap(i) 'carga <= capacidad del tipo';
obj..            z =e= sum((c,t), fijo(t)*w(c,t)) + sum((i,j), dist(i,j)*x(i,j));
sale(i)$c(i)..   sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)$c(j)..  sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
balDep..         sum(c, x('d',c)) =e= sum(c, x(c,'d'));
tipoIni(j)$c(j).. sum(t, w(j,t)) =e= x('d',j);
disp(t)..        sum(c, w(c,t)) =l= nveh(t);
kapIni(j)$c(j).. kap(j) =g= sum(t, capT(t)*w(j,t));
kapIni2(j)$c(j).. kap(j) =l= sum(t, capT(t)*w(j,t)) + Qmax*(1 - x('d',j));
kapSig1(i,j)$(c(i) and c(j) and not sameas(i,j)).. kap(j) =g= kap(i) - Qmax*(1 - x(i,j));
kapSig2(i,j)$(c(i) and c(j) and not sameas(i,j)).. kap(j) =l= kap(i) + Qmax*(1 - x(i,j));
carga(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + dem(j) - Qmax*(1 - x(i,j));
cap(i)$c(i)..    ql(i) =l= kap(i);
ql.lo(c) = dem(c); ql.up(c) = Qmax; kap.up(c) = Qmax;
w.fx(i,t)$(not c(i)) = 0;
Model fsmvrp / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve fsmvrp using mip minimizing z;
Parameter mezcla(t) 'vehículos usados de cada tipo', costoFijo, costoDist;
mezcla(t) = sum(c, w.l(c,t)); costoFijo = sum((c,t), fijo(t)*w.l(c,t)); costoDist = sum((i,j), dist(i,j)*x.l(i,j));

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
display z.l, mezcla, costoFijo, costoDist, ruta, largo, cargaR;
