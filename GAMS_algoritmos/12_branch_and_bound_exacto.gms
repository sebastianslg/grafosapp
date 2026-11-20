$title Branch and bound: modelo exacto del CVRP
$onText
===============================================================================
 12_branch_and_bound_exacto · Branch and bound: modelo exacto del CVRP
-------------------------------------------------------------------------------
 Modelo MILP de dos índices con restricciones de carga (MTZ). Primero se resuelve la relajación
 lineal (cota de la raíz) y luego el MIP completo: el solver aplica branch and bound.
 Se informan la cota de la raíz, el óptimo, la brecha de la relajación y los nodos explorados.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 12_branch_and_bound_exacto.gms
 SALIDA:    revisar el archivo .lst (instrucciones «display»).
 NOTA: con licencia de demostración (300 filas/columnas) este modelo cabe: 121 + 10 columnas.
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

* ---- MODELO EXACTO CVRP (2 índices, restricciones de carga MTZ) ----
Scalar K 'máximo de vehículos' / 5 /;
Binary Variable x(i,j) 'el vehículo recorre el arco i-j';
Positive Variable u(i) 'carga acumulada al salir del cliente i';
Variable z 'distancia total';
Equations obj, sale(i), entra(j), salida_d, entrada_d, carga(i,j);
x.fx(i,i) = 0;
u.lo(i)$(ord(i) > 1) = dem(i);
u.up(i)$(ord(i) > 1) = Q;
obj..      z =e= sum((i,j), dist(i,j)*x(i,j));
sale(i)$(ord(i) > 1)..   sum(j$(ord(j) <> ord(i)), x(i,j)) =e= 1;
entra(j)$(ord(j) > 1)..  sum(i$(ord(i) <> ord(j)), x(i,j)) =e= 1;
salida_d..   sum(j$(ord(j) > 1), x('d',j)) =l= K;
entrada_d..  sum(i$(ord(i) > 1), x(i,'d')) =l= K;
carga(i,j)$(ord(i) > 1 and ord(j) > 1 and ord(i) <> ord(j))..  u(j) =g= u(i) + dem(j) - Q*(1 - x(i,j));
Model cvrp / all /;
option optcr = 0, optca = 0, reslim = 300;

* 1) RELAJACIÓN LINEAL: cota inferior en la raíz del árbol de branch and bound
solve cvrp using rmip minimizing z;
Scalar cota_raiz 'valor de la relajación lineal (cota inferior)';
cota_raiz = z.l;

* 2) BRANCH AND BOUND: el solver ramifica sobre las variables binarias fraccionarias y poda
solve cvrp using mip minimizing z;

Scalar gap_raiz 'brecha de la relajación (%)', nodos 'nodos explorados', veh 'vehículos usados';
gap_raiz = 100*(z.l - cota_raiz)/z.l;
nodos = cvrp.nodUsd;
veh = sum(j$(ord(j) > 1), x.l('d',j));
Set inicio(i) 'primer cliente de cada ruta';
inicio(j)$(ord(j) > 1 and x.l('d',j) > 0.5) = yes;
Parameter sucesor(i) 'número del cliente que sigue (0 = regresa al depósito)';
sucesor(i)$(ord(i) > 1) = sum(j$(x.l(i,j) > 0.5), ord(j) - 1);
option decimals = 2;
display cota_raiz, gap_raiz, nodos, veh, inicio, sucesor;
display z.l, cvrp.modelStat, cvrp.solveStat;
