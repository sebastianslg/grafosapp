"""Genera los 12 programas GAMS (uno por algoritmo) en ../../GAMS_algoritmos/"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from gams_comun import *
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'GAMS_algoritmos')
os.makedirs(OUT, exist_ok=True)
M = '2147483647'
def rnd_u(var):   # siguiente número uniforme -> var
    return f"seed = mod(16807*seed, {M}); {var} = seed/{M};"
def rnd_i(var, n):  # entero en 1..n
    return f"seed = mod(16807*seed, {M}); {var} = 1 + floor(seed/{M}*{n});"

def guardar(nombre, texto):
    with open(os.path.join(OUT, nombre + '.gms'), 'w', encoding='utf-8') as f: f.write(texto)

FIN = "display nev;\n"

# ---------------------------------------------------------------- 01 vecino más cercano
guardar('01_vecino_mas_cercano', cabecera('01_vecino_mas_cercano', 'Vecino más cercano (heurística constructiva)',
 ' Construye rutas yendo siempre al cliente no visitado más cercano al que todavía le cabe\n la carga; si ninguno cabe, regresa al depósito y abre otra ruta.') + DATOS + DECL + NN + REPORTE + "display traza;\n" + FIN)

# ---------------------------------------------------------------- 02 barrido
barrido = '''
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
%EVAL%   rot(sh,'cliente inicial') = sum(p$(ord(p) = 1), trE(p));
   rot(sh,'costo') = cst; rot(sh,'rutas') = rn;
   if (cst < bestc - 1e-9, bestc = cst; bests = s0v; tr(p) = trE(p); );
);
display ang, orden, rot, bests;
'''.replace('%EVAL%', ind(EVALUAR, 3))
guardar('02_barrido', cabecera('02_barrido', 'Barrido o «sweep» (heurística constructiva)',
 ' Ordena los clientes por su ángulo respecto al depósito y llena vehículos en ese orden;\n se prueban las 10 rotaciones posibles (cliente inicial) y se conserva la mejor.') + DATOS + DECL + barrido + REPORTE + FIN)

# ---------------------------------------------------------------- 03 inserción más barata
ins = '''
* ---- INSERCIÓN MÁS BARATA: inserta, en cada paso, el cliente/posición de menor incremento ----
Set kc 'clientes' / k1*k10 /, ro 'rutas' / ro1*ro5 /, sp 'posición dentro de la ruta' / sp1*sp10 /, st 'pasos' / st1*st10 /;
Parameter demk(kc) 'demanda', pend(kc) 'cliente pendiente de insertar',
          rtn(ro,sp) 'cliente en cada posición de la ruta (0 = vacía)', rtT(ro,sp) 'copia temporal',
          lnr(ro) 'clientes por ruta', lcr(ro) 'carga por ruta',
          okk(kc,ro,sp) 'inserción factible', dl(kc,ro,sp) 'incremento de costo',
          traza(st,*) 'traza: cliente, ruta, posición e incremento';
Scalar rnew 'primera ruta vacía', dm 'menor incremento', key, kk 'cliente elegido', rsel 'ruta elegida', ssel 'posición elegida', wp;
demk(kc) = sum(i$(ord(i) = ord(kc) + 1), dem(i));
pend(kc) = 1;
loop(st,
   rnew = 1 + sum(ro$(lnr(ro) > 0), 1);
   okk(kc,ro,sp) = 0;
   okk(kc,ro,sp)$(pend(kc) = 1 and ord(ro) <= rnew and ord(sp) <= lnr(ro) + 1 and lcr(ro) + demk(kc) <= Q) = 1;
   dl(kc,ro,sp) = 0;
   dl(kc,ro,sp)$okk(kc,ro,sp) =   sum((i,j)$(ord(i) = rtn(ro,sp-1) + 1 and ord(j) = ord(kc) + 1), dist(i,j))
                                + sum((i,j)$(ord(i) = ord(kc) + 1 and ord(j) = rtn(ro,sp) + 1), dist(i,j))
                                - sum((i,j)$(ord(i) = rtn(ro,sp-1) + 1 and ord(j) = rtn(ro,sp) + 1), dist(i,j));
   dm  = smin((kc,ro,sp)$okk(kc,ro,sp), dl(kc,ro,sp));
   key = smin((kc,ro,sp)$(okk(kc,ro,sp) and dl(kc,ro,sp) = dm), 10000*ord(kc) + 100*ord(ro) + ord(sp));
   kk = floor(key/10000); rsel = floor(mod(key,10000)/100); ssel = mod(key,100);
   rtT(ro,sp) = rtn(ro,sp);
   rtn(ro,sp)$(ord(ro) = rsel and ord(sp) > ssel and ord(sp) <= lnr(ro) + 1) = rtT(ro,sp-1);
   rtn(ro,sp)$(ord(ro) = rsel and ord(sp) = ssel) = kk;
   lcr(ro)$(ord(ro) = rsel) = lcr(ro) + sum(kc$(ord(kc) = kk), demk(kc));
   lnr(ro)$(ord(ro) = rsel) = lnr(ro) + 1;
   pend(kc)$(ord(kc) = kk) = 0;
   traza(st,'cliente') = kk; traza(st,'ruta') = rsel; traza(st,'posición') = ssel; traza(st,'incremento') = dm;
);
* se concatenan las rutas para obtener el tour que usa el reporte
wp = 0;
loop(ro,
   loop(sp$(ord(sp) <= lnr(ro)),
      wp = wp + 1;
      tr(p)$(ord(p) = wp) = rtn(ro,sp);
   );
);
display rtn, lcr, traza;
'''
guardar('03_insercion_mas_barata', cabecera('03_insercion_mas_barata', 'Inserción más barata (heurística constructiva)',
 ' En cada paso inserta el cliente y la posición cuyo incremento de costo\n c(i,k) + c(k,j) - c(i,j) es menor, respetando la capacidad; abre una ruta nueva si hace falta.') + DATOS + DECL + ins + REPORTE + FIN)

# ---------------------------------------------------------------- 04 2-opt
guardar('04_dos_opt', cabecera('04_dos_opt', '2-opt (mejora local)',
 ' Parte del tour del vecino más cercano y repite: invierte el tramo [a,b] del tour que\n más reduce el costo (mejor mejora), hasta que ningún intercambio mejore (óptimo local).') + DATOS + DECL + NN + vnd_decl()
 + "* 2-opt = un solo vecindario (tipo 3)\nkmax = 1; nbh('n1') = 3;\n" + vnd_bloque() + REPORTE + "display histv;\n" + FIN)

# ---------------------------------------------------------------- 05 VND
guardar('05_vnd_relocate_swap_2opt', cabecera('05_vnd_relocate_swap_2opt', 'VND: relocate, swap y 2-opt (mejora local)',
 ' Descenso por vecindarios variables: aplica la mejor mejora del vecindario 1 (relocate);\n si no hay, del 2 (swap); si no hay, del 3 (2-opt). Al mejorar vuelve al vecindario 1.') + DATOS + DECL + NN + vnd_decl() + vnd_bloque() + REPORTE + "display histv;\n" + FIN)

# ---------------------------------------------------------------- 06 tabú
tabu = '''
* ---- BÚSQUEDA TABÚ: mejor intercambio (swap) no prohibido, aunque empeore ----
Set itt 'iteraciones' / t1*t60 /;
Parameter tb(p,pq) 'iteración hasta la que el intercambio (a,b) es tabú', trMejor(p) 'mejor tour hallado',
          hist(itt,*) 'historial: intercambio, costo actual y mejor costo';
Scalar a, b, ba, bb, cur 'costo actual', best 'mejor costo', cbest 'mejor vecino admisible', found, tabuf, skip, tenure 'permanencia tabú' / 7 /;
trE(p) = tr(p);
%EVAL%cur = cst; best = cst; trMejor(p) = tr(p);
loop(itt,
   found = 0;
   loop(pa,
      loop(pb$(ord(pb) > ord(pa)),
         a = ord(pa); b = ord(pb);
         trE(p) = tr(p);
%SWAP%%EVAL2%         tabuf = 1$(tb(pa,pb) > ord(itt));
         skip  = 1$(tabuf = 1 and cst >= best - 1e-9);
         if (skip = 0 and (found = 0 or cst < cbest - 1e-12),
            cbest = cst; ba = a; bb = b; trB(p) = trE(p); found = 1;
         );
      );
   );
   if (found = 1,
      tr(p) = trB(p); cur = cbest;
      tb(pa,pb)$(ord(pa) = ba and ord(pb) = bb) = ord(itt) + tenure;
      if (cur < best - 1e-12, best = cur; trMejor(p) = tr(p); );
      hist(itt,'a') = ba; hist(itt,'b') = bb; hist(itt,'costo actual') = cur; hist(itt,'mejor costo') = best;
   );
);
tr(p) = trMejor(p);
display hist;
'''.replace('%EVAL%', EVALUAR).replace('%SWAP%', ind(MOV_SWAP, 9)).replace('%EVAL2%', ind(EVALUAR, 9))
guardar('06_busqueda_tabu', cabecera('06_busqueda_tabu', 'Búsqueda tabú (metaheurística)',
 ' Desde el tour del vecino más cercano, en cada iteración aplica el mejor intercambio de dos\n posiciones que no esté prohibido (lista tabú de 7 iteraciones), aunque empeore el costo.\n Criterio de aspiración: se permite un movimiento tabú si mejora el mejor costo conocido.') + DATOS + DECL + NN + tabu + REPORTE + FIN)

# ---------------------------------------------------------------- 07 recocido simulado
sa = '''
* ---- RECOCIDO SIMULADO: vecino aleatorio, aceptación de Metropolis, enfriamiento geométrico ----
Set itr 'iteraciones' / t1*t4000 /, hp 'puntos del historial (cada 200 iteraciones)' / h0*h20 /;
Parameter trBest(p) 'mejor tour', hist(hp,*) 'historial: temperatura, costo actual y mejor costo';
Scalar T0 'temperatura inicial' / 20 /, Tf 'temperatura final' / 0.05 /, niter / 4000 /, Temp 'temperatura', alpha 'factor de enfriamiento',
       ut, uu, a, b, ta, mt, cur 'costo actual', best 'mejor costo', delta, acc, acept 'movimientos aceptados' / 0 /;
alpha = (Tf/T0)**(1/niter); Temp = T0;
trE(p) = tr(p);
%EVAL%cur = cst; best = cst; trBest(p) = tr(p);
hist('h0','temperatura') = Temp; hist('h0','costo actual') = cur; hist('h0','mejor costo') = best;
loop(itr,
   %U1%
   %I1%
   %I2%
   %U2%
   trE(p) = tr(p);
   if (a <> b,
      mt = 3;
      if (ut < 1/3, mt = 1; elseif ut < 2/3, mt = 2; );
      if (mt > 1 and a > b, ta = a; a = b; b = ta; );
      if (mt = 1,
%RELOC%      elseif mt = 2,
%SWAP%      else
%OPT2%      );
   );
%EVAL2%   delta = cst - cur;
   acc = 0;
   if (delta < 0, acc = 1; else acc = 1$(uu < exp(-min(delta/Temp, 50))); );
   if (acc = 1,
      tr(p) = trE(p); cur = cst; acept = acept + 1;
      if (cur < best - 1e-12, best = cur; trBest(p) = tr(p); );
   );
   Temp = Temp*alpha;
   if (mod(ord(itr),200) = 0,
      hist(hp,'temperatura')$(ord(hp) = ord(itr)/200 + 1) = Temp;
      hist(hp,'costo actual')$(ord(hp) = ord(itr)/200 + 1) = cur;
      hist(hp,'mejor costo')$(ord(hp) = ord(itr)/200 + 1) = best;
   );
);
tr(p) = trBest(p);
display hist, acept;
'''.replace('%EVAL%', EVALUAR).replace('%EVAL2%', ind(EVALUAR, 3)).replace('%RELOC%', ind(MOV_RELOC, 9)).replace('%SWAP%', ind(MOV_SWAP, 9)).replace('%OPT2%', ind(MOV_2OPT, 9)) \
  .replace('%U1%', rnd_u('ut')).replace('%I1%', rnd_i('a', 10)).replace('%I2%', rnd_i('b', 10)).replace('%U2%', rnd_u('uu'))
guardar('07_recocido_simulado', cabecera('07_recocido_simulado', 'Recocido simulado (metaheurística)',
 ' Desde el tour del vecino más cercano genera un vecino aleatorio (relocate, swap o 2-opt) y lo\n acepta si mejora o, si empeora en delta, con probabilidad exp(-delta/T). T baja de 20 a 0,05.\n Generador pseudoaleatorio Park-Miller con semilla fija: la corrida es reproducible.') + DATOS + DECL + NN + (RNG.replace('%S%', '2024')) + sa + REPORTE + FIN)

# ---------------------------------------------------------------- 08 genético
ga = '''
* ---- ALGORITMO GENÉTICO: permutaciones de clientes, torneo, cruce OX, mutación y elitismo ----
Set g 'individuos' / g1*g30 /, gen 'generaciones (0..60)' / e0*e60 /, fy 'pasos del barajado' / f1*f9 /;
Alias (g,h);
Parameter pop(g,p) 'población', pop2(g,p) 'nueva población', cs(g) 'costo de cada individuo', rk(g) 'posición según el costo',
          padA(p) 'padre A', padB(p) 'padre B', chd(p) 'hijo', used(p) 'gen copiado del padre A', hist(gen,*) 'historial: mejor y promedio';
Scalar npop / 30 /, ngen / 60 /, nelite / 2 /, pm 'probabilidad de mutación' / 0.5 /,
       ii, jj, ti, tj, ia, ib, ca, cb, wa, wb, c1, c2, ta, w, gene, usedg, ut;
* población inicial: permutaciones al azar (barajado de Fisher-Yates)
loop(g,
   tr(p) = ord(p);
   loop(fy,
      ii = 11 - ord(fy);
      %I1%
      ti = sum(pq$(ord(pq) = ii), tr(pq)); tj = sum(pq$(ord(pq) = jj), tr(pq));
      tr(p)$(ord(p) = ii) = tj; tr(p)$(ord(p) = jj) = ti;
   );
   pop(g,p) = tr(p);
);
loop(gen,
   loop(g,
      trE(p) = pop(g,p);
%EVAL%      cs(g) = cst;
   );
   rk(g) = 1 + sum(h$(cs(h) < cs(g) or (cs(h) = cs(g) and ord(h) < ord(g))), 1);
   hist(gen,'mejor') = smin(g, cs(g)); hist(gen,'promedio') = sum(g, cs(g))/npop;
   if (ord(gen) <= ngen,
      pop2(g,p)$(ord(g) <= nelite) = sum(h$(rk(h) = ord(g)), pop(h,p));
      loop(g$(ord(g) > nelite),
         %T1A%
         %T1B%
         ca = sum(h$(ord(h) = ia), cs(h)); cb = sum(h$(ord(h) = ib), cs(h));
         if (ca < cb or (ca = cb and ia <= ib), wa = ia; else wa = ib; );
         %T2A%
         %T2B%
         ca = sum(h$(ord(h) = ia), cs(h)); cb = sum(h$(ord(h) = ib), cs(h));
         if (ca < cb or (ca = cb and ia <= ib), wb = ia; else wb = ib; );
         padA(p) = sum(h$(ord(h) = wa), pop(h,p)); padB(p) = sum(h$(ord(h) = wb), pop(h,p));
         %C1%
         %C2%
         if (c1 > c2, ta = c1; c1 = c2; c2 = ta; );
         chd(p) = 0; chd(p)$(ord(p) >= c1 and ord(p) <= c2) = padA(p);
         used(p) = 0; used(p)$(sum(pq$(ord(pq) >= c1 and ord(pq) <= c2 and padA(pq) = ord(p)), 1) > 0) = 1;
         w = 0;
         loop(pq,
            gene = padB(pq);
            usedg = sum(p$(ord(p) = gene), used(p));
            if (usedg = 0,
               w = w + 1;
               while (w >= c1 and w <= c2, w = w + 1; );
               chd(p)$(ord(p) = w) = gene;
            );
         );
         %UM%
         if (ut < pm,
            %M1%
            %M2%
            ti = sum(pq$(ord(pq) = ia), chd(pq)); tj = sum(pq$(ord(pq) = ib), chd(pq));
            chd(p)$(ord(p) = ia) = tj; chd(p)$(ord(p) = ib) = ti;
         );
         pop2(g,p) = chd(p);
      );
      pop(g,p) = pop2(g,p);
   );
);
tr(p) = sum(h$(rk(h) = 1), pop(h,p));
display hist;
'''.replace('%EVAL%', ind(EVALUAR, 6)).replace('%I1%', rnd_i('jj', 'ii'))
for tag, var, n in [('T1A','ia','npop'),('T1B','ib','npop'),('T2A','ia','npop'),('T2B','ib','npop'),('C1','c1',10),('C2','c2',10),('M1','ia',10),('M2','ib',10)]:
    ga = ga.replace('%'+tag+'%', rnd_i(var, n))
ga = ga.replace('%UM%', rnd_u('ut'))
guardar('08_algoritmo_genetico', cabecera('08_algoritmo_genetico', 'Algoritmo genético (metaheurística)',
 ' Población de 30 permutaciones de clientes (cada una se divide por capacidad para formar rutas).\n 60 generaciones: selección por torneo binario, cruce OX, mutación por intercambio (p = 0,5)\n y elitismo de los 2 mejores. Generador Park-Miller con semilla fija.') + DATOS + DECL + RNG.replace('%S%', '7') + ga + REPORTE + FIN)

# ---------------------------------------------------------------- 09 colonia de hormigas
aco = '''
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
%EVAL%* la hormiga deposita Qd/costo en los arcos de sus rutas (en ambos sentidos)
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
'''.replace('%EVAL%', ind(EVALUAR, 6))
guardar('09_colonia_de_hormigas', cabecera('09_colonia_de_hormigas', 'Colonia de hormigas (metaheurística)',
 ' 10 hormigas construyen rutas eligiendo el siguiente cliente con probabilidad proporcional a\n tau(i,j)*(1/d(i,j))^3 (feromona y cercanía). Tras cada iteración la feromona se evapora (rho = 0,3)\n y cada hormiga deposita 100/costo en los arcos de su solución. 30 iteraciones.') + DATOS + DECL + RNG.replace('%S%', '11') + aco + REPORTE + FIN)

# ---------------------------------------------------------------- 10 GRASP
grasp = '''
* ---- GRASP: construcción voraz aleatorizada (lista restringida de candidatos) + búsqueda local VND ----
Set itg 'iteraciones' / t1*t20 /;
Parameter vis(i) 'visitado', cand(i) 'candidato factible', rcl(i) 'candidato en la lista restringida', trMejor(p) 'mejor tour',
          hist(itg,*) 'historial: costo constructivo, costo tras la búsqueda local y mejor costo';
Scalar alfa 'amplitud de la lista restringida' / 0.3 /, nodo, cnt, dmin, dmax, lim, nr, kth, cum, sel, c0, best 'mejor costo' / 1e9 /;
loop(itg,
   vis(i) = 0; nodo = 0; ld = 0;
   loop(p,
      cnt = sum(i$(ord(i) > 1 and vis(i) = 0 and ld + dem(i) <= Q), 1);
      if (cnt = 0, ld = 0; nodo = 0; );
      cand(i) = 0;
      cand(i)$(ord(i) > 1 and vis(i) = 0 and ld + dem(i) <= Q) = 1;
      dmin = smin(i$(cand(i) = 1), sum(j$(ord(j) = nodo+1), dist(j,i)));
      dmax = smax(i$(cand(i) = 1), sum(j$(ord(j) = nodo+1), dist(j,i)));
      lim  = dmin + alfa*(dmax - dmin);
      rcl(i) = 0;
      rcl(i)$(cand(i) = 1 and sum(j$(ord(j) = nodo+1), dist(j,i)) <= lim) = 1;
      nr = sum(i$(rcl(i) = 1), 1);
      %I1%
      cum = 0; sel = 0;
      loop(i$(ord(i) > 1),
         if (rcl(i) = 1,
            cum = cum + 1;
            if (cum = kth, sel = ord(i) - 1; );
         );
      );
      tr(p) = sel; vis(i)$(ord(i) = sel+1) = 1;
      ld = ld + sum(i$(ord(i) = sel+1), dem(i)); nodo = sel;
   );
   trE(p) = tr(p);
%EVAL%   c0 = cst;
%VND%   hist(itg,'construcción') = c0; hist(itg,'tras búsqueda local') = cur;
   if (cur < best - 1e-12, best = cur; trMejor(p) = tr(p); );
   hist(itg,'mejor costo') = best;
);
tr(p) = trMejor(p);
display hist;
'''.replace('%EVAL%', ind(EVALUAR, 3)).replace('%I1%', rnd_i('kth', 'nr')).replace('%VND%', ind(vnd_bloque(), 3))
guardar('10_grasp', cabecera('10_grasp', 'GRASP (metaheurística)',
 ' 20 iteraciones; cada una construye una solución voraz aleatorizada (el siguiente cliente se sortea\n entre los de la lista restringida: distancia <= dmin + 0,3*(dmax-dmin)) y la mejora con VND.\n Se conserva la mejor solución. Generador Park-Miller con semilla fija.') + DATOS + DECL + vnd_decl() + RNG.replace('%S%', '5') + grasp + REPORTE + FIN)

# ---------------------------------------------------------------- 11 VNS
vns = '''
* ---- VNS: agitación de intensidad creciente (k) + búsqueda local VND ----
Set itv 'iteraciones' / t1*t12 /, sk 'movimientos de agitación' / s1*s4 /, att 'intentos (agitación + VND)' / a1*a80 /;
Parameter trC(p) 'solución incumbente', hist(itv,*) 'historial: k final y costo de la incumbente',
          histk(att,*) 'historial de intentos: iteración, k, costo tras VND y si fue aceptado';
Scalar kmaxv 'intensidad máxima de agitación' / 3 /, kk 'intensidad actual', uu, curC 'costo de la incumbente', ta, nint 'intentos realizados' / 0 /;
%VND%trC(p) = tr(p); curC = cur;
loop(itv,
   kk = 1;
   while (kk <= kmaxv,
      tr(p) = trC(p);
      loop(sk$(ord(sk) <= kk + 1),
         %I1%
         %I2%
         if (a <> b,
            %U1%
            mt = 2;
            if (uu < 0.5, mt = 1; );
            trE(p) = tr(p);
            if (mt = 1,
%RELOC%            else
%SWAP%            );
            tr(p) = trE(p);
         );
      );
%VND%      nint = nint + 1;
      histk(att,'iteración')$(ord(att) = nint) = ord(itv); histk(att,'k')$(ord(att) = nint) = kk;
      histk(att,'costo tras VND')$(ord(att) = nint) = cur; histk(att,'aceptado')$(ord(att) = nint) = 1$(cur < curC - 1e-9);
      if (cur < curC - 1e-9,
         trC(p) = tr(p); curC = cur; kk = 1;
      else
         kk = kk + 1;
      );
   );
   hist(itv,'k final') = kk; hist(itv,'costo incumbente') = curC;
);
tr(p) = trC(p);
display hist, histk;
'''.replace('%I1%', rnd_i('a', 10)).replace('%I2%', rnd_i('b', 10)).replace('%U1%', rnd_u('uu')).replace('%RELOC%', ind(MOV_RELOC, 12)).replace('%SWAP%', ind(MOV_SWAP, 12))
# el VND inicial parte del vecino más cercano: se inserta antes del bucle
vns = vns.replace('%VND%trC(p) = tr(p); curC = cur;', 'trE(p) = tr(p);\n' + EVALUAR + 'trC(p) = tr(p); curC = cst;').replace('%VND%', ind(vnd_bloque(), 6))
guardar('11_vns', cabecera('11_vns', 'VNS: búsqueda de vecindario variable (metaheurística)',
 ' Parte de la solución del vecino más cercano. En cada iteración agita la solución con k+1\n movimientos aleatorios (k = 1..3), la mejora con VND y la acepta si mejora (entonces k = 1);\n si no, aumenta k. Generador Park-Miller con semilla fija.') + DATOS + DECL + NN + vnd_decl() + RNG.replace('%S%', '3') + vns + REPORTE + FIN)

# ---------------------------------------------------------------- 12 branch and bound (modelo exacto)
bb = '''
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
'''
guardar('12_branch_and_bound_exacto', cabecera('12_branch_and_bound_exacto', 'Branch and bound: modelo exacto del CVRP',
 ' Modelo MILP de dos índices con restricciones de carga (MTZ). Primero se resuelve la relajación\n lineal (cota de la raíz) y luego el MIP completo: el solver aplica branch and bound.\n Se informan la cota de la raíz, el óptimo, la brecha de la relajación y los nodos explorados.',
 ' NOTA: con licencia de demostración (300 filas/columnas) este modelo cabe: 121 + 10 columnas.\n') + DATOS + bb)
print('ok')
