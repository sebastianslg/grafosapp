"""Genera los algoritmos 13-18 en GAMS_algoritmos/ con los bloques comunes de gams_comun.py."""
import os
from gams_comun import cabecera, DATOS, DECL, EVALUAR, REPORTE, NN, ind, RNG, vnd_decl, vnd_bloque, MOV_RELOC, MOV_SWAP, MOV_2OPT

SAL = os.path.join(os.path.dirname(__file__), '..', '..', 'GAMS_algoritmos')
A = []

REP_PROPIO = '''
* ------------------------------- REPORTE FINAL -------------------------------
Set rs 'rutas' / r1*r6 /;
Parameter RTc(rs,p) 'cliente en cada posición, por ruta', carga(rs) 'carga de la ruta', dr(rs) 'distancia de la ruta';
Scalar costo_final, gap_pct 'brecha frente al óptimo (%)';
%CUERPO%costo_final = sum(rs, dr(rs));
gap_pct = 100*(costo_final - zopt)/zopt;
option decimals = 2;
display tr, RTc, carga, dr, costo_final, gap_pct;
'''
def alg(num, nombre, titulo, descr, cuerpo, extra='', rep=None):
    texto = cabecera(num + '_' + nombre, titulo, descr, extra) + DATOS + DECL + cuerpo + (REPORTE if rep is None else REP_PROPIO.replace('%CUERPO%', rep))
    A.append((num + '_' + nombre + '.gms', texto))

# ---------------------------------------------------------------------------------------------- 13 Or-opt
alg('13', 'or_opt', 'Or-opt: reubicación de tramos de 1 a 3 clientes (mejora local)',
''' Parte del tour del vecino más cercano. En cada pasada prueba sacar un tramo de L = 1, 2 o 3 clientes
 consecutivos y reinsertarlo en otra posición del tour (sin invertirlo); aplica el mejor movimiento y repite
 hasta que ningún tramo mejora (óptimo local Or-opt).''',
NN + '''
* ---- OR-OPT: tramo [a, a+L-1] reinsertado tras la posición b del tour restante ----
Set ln 'longitudes de tramo' / l1*l3 /, hs 'historial de mejoras' / h1*h40 /;
Parameter rest(p) 'tour sin el tramo', histo(hs,*) 'historial: L, a, b y costo';
Scalar L 'longitud del tramo', a 'inicio del tramo', b 'posición de inserción', cur 'costo actual', bd 'mejor variación',
       cbest, bL, ba, bb, mejora / 1 /, nit / 0 /;
trE(p) = tr(p);
''' + EVALUAR + '''cur = cst;
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
''' + ind(EVALUAR, 15) + '''               if (cst - cur < bd - 1e-9, bd = cst - cur; cbest = cst; bL = L; ba = a; bb = b; trB(p) = trE(p); );
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
''')

# ---------------------------------------------------------------------------------------------- 14 ILS
alg('14', 'ils', 'Búsqueda local iterada (ILS)',
''' Parte del vecino más cercano y aplica búsqueda local 2-opt (óptimo local). En cada iteración perturba la mejor
 solución con un «doble puente» aleatorio (corta el tour en 4 tramos A B C D y lo reordena A C B D), vuelve a
 aplicar 2-opt y acepta el resultado si mejora. 15 iteraciones; generador Park-Miller con semilla fija.''',
NN + RNG.replace('%S%', '17') + vnd_decl() + '''Set it 'iteraciones de ILS' / t0*t15 /;
Parameter histi(it,*) 'historial: costo tras la búsqueda local, mejor costo y si se aceptó', trM(p) 'mejor tour', trP(p) 'tour perturbado';
* búsqueda local de ILS: solo 2-opt (un vecindario), para ver cómo la perturbación escapa de su óptimo local
kmax = 1; nbh('n1') = 3;
Scalar cut1 'primer corte', cut2 'segundo corte', cut3 'tercer corte', cMej 'mejor costo';
''' + vnd_bloque() + '''trM(p) = tr(p); cMej = cur;
histi('t0','vnd') = cur; histi('t0','mejor') = cMej; histi('t0','acepta') = 1;
loop(it$(ord(it) > 1),
* ---- perturbación: doble puente con cortes 1 <= cut1 < cut2 < cut3 < 10 ----
   seed = mod(16807*seed, 2147483647); cut1 = 1 + floor(seed/2147483647*7);
   seed = mod(16807*seed, 2147483647); cut2 = cut1 + 1 + floor(seed/2147483647*(8 - cut1));
   seed = mod(16807*seed, 2147483647); cut3 = cut2 + 1 + floor(seed/2147483647*(9 - cut2));
   trP(p)$(ord(p) <= cut1) = trM(p);
   trP(p)$(ord(p) > cut1 and ord(p) <= cut1 + cut3 - cut2) = sum(pq$(ord(pq) = ord(p) - cut1 + cut2), trM(pq));
   trP(p)$(ord(p) > cut1 + cut3 - cut2 and ord(p) <= cut3) = sum(pq$(ord(pq) = ord(p) - (cut3 - cut2)), trM(pq));
   trP(p)$(ord(p) > cut3) = trM(p);
   tr(p) = trP(p);
''' + ind(vnd_bloque(), 3) + '''   histi(it,'vnd') = cur;
   if (cur < cMej - 1e-9, trM(p) = tr(p); cMej = cur; histi(it,'acepta') = 1; );
   histi(it,'mejor') = cMej;
);
tr(p) = trM(p);
display histi;
''')

# ---------------------------------------------------------------------------------------------- 15 LNS
alg('15', 'lns', 'Búsqueda en vecindarios grandes (LNS): destruir y reparar',
''' Parte del vecino más cercano. En cada iteración DESTRUYE la solución quitando q = 3 clientes al azar del
 tour y la REPARA reinsertando cada uno en la posición más barata (evaluando el costo dividido por capacidad).
 Acepta la nueva solución si no empeora. 40 iteraciones; generador Park-Miller con semilla fija.''',
NN + RNG.replace('%S%', '23') + '''Set it 'iteraciones' / t1*t40 /, rq 'clientes retirados' / q1*q3 /;
Parameter histl(it,*) 'historial: costo nuevo y mejor costo', base(p) 'tour parcial', quit(rq) 'clientes retirados',
          esta(p) 'marca de posición retirada', trM(p) 'mejor tour';
Scalar cMej, nb 'largo del tour parcial', k 'cliente a insertar', posB, cB, a, rpos;
trE(p) = tr(p);
''' + EVALUAR + '''cMej = cst; trM(p) = tr(p);
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
''')

# ---------------------------------------------------------------------------------------------- 16 Split
alg('16', 'split_ruta_primero', 'Ruta primero, agrupa después: TSP gigante + Split (Beasley)',
''' Fase 1 (ruta primero): resuelve el TSP de todos los clientes con un modelo MIP (MTZ) y obtiene un tour
 gigante. Fase 2 (agrupa después): el procedimiento Split corta el tour en rutas factibles de forma ÓPTIMA para
 ese orden, como un camino más corto (programación dinámica de Bellman) en un grafo auxiliar acíclico.''',
'''
* ---- FASE 1: TSP gigante (MIP) ----
Binary Variable x(i,j) 'arco del tour gigante';
Positive Variable u(i) 'posición en el tour (MTZ)';
Free Variable zt 'longitud del tour gigante';
x.fx(i,i) = 0;
Equations objT, saleT(i), entraT(i), mtzT(i,j);
objT..     zt =e= sum((i,j), dist(i,j)*x(i,j));
saleT(i).. sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entraT(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
mtzT(i,j)$(ord(i) > 1 and ord(j) > 1 and not sameas(i,j)).. u(i) - u(j) + (card(i)-1)*x(i,j) =l= card(i) - 2;
u.lo(i)$(ord(i) > 1) = 1; u.up(i)$(ord(i) > 1) = card(i) - 1;
Model tspG / objT, saleT, entraT, mtzT /;
option optcr = 0;
solve tspG using mip minimizing zt;
* tour gigante: se sigue x desde el depósito
Scalar act / 1 /;
loop(p,
   act = sum((i,j)$(ord(i) = act and x.l(i,j) > 0.5), ord(j));
   tr(p) = act - 1;
);
* ---- FASE 2: SPLIT (Bellman sobre el grafo auxiliar 0..10) ----
Set v 'nodos del grafo auxiliar' / v0*v10 /;
Alias (v,va,vb);
Parameter Vc(v) 'costo mínimo para atender los primeros clientes del tour', pred(v) 'corte anterior',
          arcoA(v,v) 'costo de la ruta que atiende tr(a+1..b)';
Scalar carg, cr, nodoA;
Vc(v) = 1e9; Vc('v0') = 0;
loop(va,
   carg = 0; cr = 0; nodoA = 0;
   loop(vb$(ord(vb) > ord(va)),
      cn = sum(p$(ord(p) = ord(vb) - 1), tr(p));
      carg = carg + sum(i$(ord(i) = cn+1), dem(i));
      if (carg <= Q,
         cr = cr + sum((i,j)$(ord(i) = nodoA+1 and ord(j) = cn+1), dist(i,j));
         nodoA = cn;
         arcoA(va,vb) = cr + sum(i$(ord(i) = cn+1), dist(i,'d'));
         if (Vc(va) + arcoA(va,vb) < Vc(vb) - 1e-9, Vc(vb) = Vc(va) + arcoA(va,vb); pred(vb) = ord(va) - 1; );
      );
   );
);
Scalar costoSplit 'costo de la partición óptima'; costoSplit = Vc('v10');
display zt.l, tr, Vc, pred, costoSplit;
''', rep='''* rutas a partir de los cortes óptimos (pred), de atrás hacia adelante
Scalar fin, ini, nr / 0 /, kr;
fin = 10;
while (fin > 0, nr = nr + 1; fin = sum(v$(ord(v) = fin + 1), pred(v)); );
fin = 10; kr = nr;
while (fin > 0,
   ini = sum(v$(ord(v) = fin + 1), pred(v));
   RTc(rs,p)$(ord(rs) = kr and ord(p) > ini and ord(p) <= fin) = tr(p);
   carga(rs)$(ord(rs) = kr) = sum((p,i)$(ord(p) > ini and ord(p) <= fin and ord(i) = tr(p) + 1), dem(i));
   dr(rs)$(ord(rs) = kr) = sum((va,vb)$(ord(va) = ini + 1 and ord(vb) = fin + 1), arcoA(va,vb));
   fin = ini; kr = kr - 1;
);
''')

# ---------------------------------------------------------------------------------------------- 17 Fisher-Jaikumar
alg('17', 'fisher_jaikumar', 'Fisher-Jaikumar: asignación generalizada (GAP) + TSP por grupo',
''' Agrupa primero, rutea después con programación matemática. (1) Elige K = 3 clientes semilla (el más lejano
 del depósito y, luego, los más alejados de las semillas ya elegidas). (2) Resuelve un problema de asignación
 generalizada (GAP, MIP): cada cliente a una semilla, sin exceder Q, minimizando el costo de inserción.
 (3) Resuelve un TSP (MIP) para cada grupo dentro de un loop de GAMS.''',
'''
* ---- (1) SEMILLAS ----
Set k 'grupos (vehículos)' / k1*k3 /;
Parameter sem(k) 'número del cliente semilla', ya(i) 'ya es semilla', dmS(i) 'distancia a la semilla más cercana';
Scalar mejorV, mejorI;
loop(k,
   dmS(i)$(ord(i) > 1) = smin(j$(ya(j) = 1 or ord(j) = 1), dist(i,j));
   mejorV = smax(i$(ord(i) > 1 and ya(i) = 0), dmS(i));
   mejorI = smin(i$(ord(i) > 1 and ya(i) = 0 and dmS(i) = mejorV), ord(i));
   sem(k) = mejorI - 1; ya(i)$(ord(i) = mejorI) = 1;
);
* ---- (2) GAP: costo de insertar el cliente i en la ruta d -> semilla -> d ----
Parameter cIns(i,k) 'costo de inserción del cliente en el grupo';
cIns(i,k)$(ord(i) > 1) = sum(j$(ord(j) = sem(k) + 1), dist('d',i) + dist(i,j) - dist('d',j));
Binary Variable y(i,k) 'el cliente i va al grupo k';
Free Variable zg 'costo total de inserción';
Equations objG, unaVez(i), capG(k);
objG..                 zg =e= sum((i,k)$(ord(i) > 1), cIns(i,k)*y(i,k));
unaVez(i)$(ord(i) > 1).. sum(k, y(i,k)) =e= 1;
capG(k)..              sum(i$(ord(i) > 1), dem(i)*y(i,k)) =l= Q;
y.fx(i,k)$(ord(i) = 1) = 0;
Model gap / objG, unaVez, capG /;
option optcr = 0;
solve gap using mip minimizing zg;
* ---- (3) TSP de cada grupo (se resuelve dentro de un loop) ----
Set act(i) 'nodos del grupo que se está ruteando';
Binary Variable xt(i,j) 'arco del TSP del grupo';
Positive Variable ut(i) 'posición (MTZ)';
Free Variable zt 'longitud del TSP del grupo';
Equations objT, saleT(i), entraT(i), mtzT(i,j);
objT..               zt =e= sum((i,j)$(act(i) and act(j)), dist(i,j)*xt(i,j));
saleT(i)$act(i)..    sum(j$(act(j) and not sameas(i,j)), xt(i,j)) =e= 1;
entraT(j)$act(j)..   sum(i$(act(i) and not sameas(i,j)), xt(i,j)) =e= 1;
mtzT(i,j)$(act(i) and act(j) and ord(i) > 1 and ord(j) > 1 and not sameas(i,j)).. ut(i) - ut(j) + card(i)*xt(i,j) =l= card(i) - 1;
xt.fx(i,i) = 0;
Model tspK / objT, saleT, entraT, mtzT /;
Parameter largoK(k) 'distancia del TSP de cada grupo', cargaK(k) 'carga del grupo', ordenK(k,p) 'clientes del grupo en orden';
Scalar actual, npos, ncl, cfin, posT / 0 /;
loop(k,
   act(i) = no; act('d') = yes; act(i)$(ord(i) > 1 and y.l(i,k) > 0.5) = yes;
   xt.lo(i,j) = 0; xt.up(i,j) = 1; xt.fx(i,i) = 0;
   xt.fx(i,j)$(not (act(i) and act(j))) = 0;
   ut.lo(i) = 1; ut.up(i) = card(i);
   solve tspK using mip minimizing zt;
   largoK(k) = zt.l; cargaK(k) = sum(i$act(i), dem(i));
   actual = 1; npos = 0; ncl = sum(i$act(i), 1) - 1;
   loop(p$(ord(p) <= ncl),
      actual = sum((i,j)$(ord(i) = actual and xt.l(i,j) > 0.5), ord(j));
      npos = npos + 1; ordenK(k,p) = actual - 1;
      posT = posT + 1; tr(pa)$(ord(pa) = posT) = actual - 1;
   );
);
cfin = sum(k, largoK(k));
display sem, y.l, largoK, cargaK, ordenK, cfin;
''', rep='''loop((rs,k)$(ord(rs) = ord(k)), RTc(rs,p) = ordenK(k,p); carga(rs) = cargaK(k); dr(rs) = largoK(k); );
''')

# ---------------------------------------------------------------------------------------------- 18 Pétalos
alg('18', 'petalos', 'Algoritmo de pétalos: generación de rutas + partición de conjuntos (MIP)',
''' Ordena los clientes por ángulo alrededor del depósito y genera todos los «pétalos»: tramos consecutivos
 (circulares) de clientes con carga <= Q, recorridos en orden angular. Después un modelo de partición de
 conjuntos (MIP) elige los pétalos que cubren a cada cliente exactamente una vez con costo mínimo.''',
'''
* ---- ángulos y orden angular ----
Parameter ang(i) 'ángulo respecto al depósito', ordA(p) 'cliente en cada posición angular';
ang(i)$(ord(i) > 1) = arctan2(cy(i) - cy('d'), cx(i) - cx('d'));
Scalar cntA;
loop(i$(ord(i) > 1),
   cntA = 1 + sum(j$(ord(j) > 1 and (ang(j) < ang(i) or (ang(j) = ang(i) and ord(j) < ord(i)))), 1);
   ordA(p)$(ord(p) = cntA) = ord(i) - 1;
);
* ---- generación de pétalos ----
Set rt 'pétalos candidatos' / rt1*rt60 /, lg 'largo del pétalo' / g1*g10 /;
Parameter cubre(rt,i) 'el pétalo visita al cliente', costoR(rt) 'distancia del pétalo', iniR(rt), largoR(rt), cargaR(rt);
Scalar nrt / 0 /, carg, cr, prev, cl, ini;
loop(pa,
   ini = ord(pa); carg = 0; cr = 0; prev = 0;
   loop(lg,
      cl = sum(p$(ord(p) = mod(ini + ord(lg) - 2, card(p)) + 1), ordA(p));
      carg = carg + sum(i$(ord(i) = cl + 1), dem(i));
      if (carg <= Q and ord(lg) <= card(p),
         cr = cr + sum((i,j)$(ord(i) = prev + 1 and ord(j) = cl + 1), dist(i,j)); prev = cl;
         nrt = nrt + 1;
         loop(rt$(ord(rt) = nrt),
            iniR(rt) = ini; largoR(rt) = ord(lg); cargaR(rt) = carg;
            costoR(rt) = cr + sum(i$(ord(i) = cl + 1), dist(i,'d'));
            loop(pb$(ord(pb) <= ord(lg)),
               cubre(rt,i)$(ord(i) = sum(p$(ord(p) = mod(ini + ord(pb) - 2, card(p)) + 1), ordA(p)) + 1) = 1;
            );
         );
      );
   );
);
* ---- partición de conjuntos ----
Binary Variable zr(rt) 'se usa el pétalo';
Free Variable zp 'costo total';
Equations objP, cubrir(i);
objP..                  zp =e= sum(rt$(ord(rt) <= nrt), costoR(rt)*zr(rt));
cubrir(i)$(ord(i) > 1).. sum(rt$(ord(rt) <= nrt), cubre(rt,i)*zr(rt)) =e= 1;
zr.fx(rt)$(ord(rt) > nrt) = 0;
Model particion / objP, cubrir /;
option optcr = 0;
solve particion using mip minimizing zp;
* tour gigante con los pétalos elegidos (para el reporte común)
Scalar posT / 0 /;
loop(rt$(zr.l(rt) > 0.5),
   loop(pb$(ord(pb) <= largoR(rt)),
      posT = posT + 1;
      tr(p)$(ord(p) = posT) = sum(pa$(ord(pa) = mod(iniR(rt) + ord(pb) - 2, card(p)) + 1), ordA(pa));
   );
);
display ordA, nrt, costoR, cargaR, zr.l, zp.l;
''', rep='''Scalar nr / 0 /;
loop(rt$(zr.l(rt) > 0.5),
   nr = nr + 1;
   loop(rs$(ord(rs) = nr),
      loop(pb$(ord(pb) <= largoR(rt)), RTc(rs,pb) = sum(pa$(ord(pa) = mod(iniR(rt) + ord(pb) - 2, card(p)) + 1), ordA(pa)); );
      carga(rs) = cargaR(rt); dr(rs) = costoR(rt);
   );
);
''')


def generar():
    out = []
    for nombre, texto in A:
        f = os.path.join(SAL, nombre); open(f, 'w', encoding='utf-8').write(texto); out.append(f)
    return out

if __name__ == '__main__':
    for f in generar(): print(f)
