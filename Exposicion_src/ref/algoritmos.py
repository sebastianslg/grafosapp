"""Implementaciones de referencia (Python) con la MISMA lógica que los archivos .gms."""
import math
from instancia import *

# ---------- constructivas ----------
def vecino_mas_cercano():
    vis = [0] * (N + 1); cur = 0; ld = 0; tr = []; traza = []
    for _ in range(N):
        cand = [c for c in range(1, N + 1) if not vis[c] and ld + DEM[c] <= Q]
        if not cand:
            ld = 0; cur = 0
            cand = [c for c in range(1, N + 1) if not vis[c]]
            traza.append(('nueva ruta', None))
        dmin = min(DIST[cur][c] for c in cand)
        pick = min(c for c in cand if DIST[cur][c] == dmin)
        traza.append((cur, pick, round(DIST[cur][pick], 2), ld + DEM[pick]))
        tr.append(pick); vis[pick] = 1; ld += DEM[pick]; cur = pick
    return tr, traza

def angulo(c):
    return math.atan2(COORD[c][1] - COORD[0][1], COORD[c][0] - COORD[0][0])

def barrido():
    orden = sorted(range(1, N + 1), key=lambda c: angulo(c))
    mejor = None; filas = []
    for s in range(N):
        tr = [orden[(p + s) % N] for p in range(N)]
        cst, rutas = evaluar(tr, True)
        filas.append((s, orden[s], round(cst, 2), len(rutas)))
        if mejor is None or cst < mejor[0] - 1e-9: mejor = (cst, tr, s)
    return mejor[1], filas, orden

def insercion_mas_barata(R=5):
    rutas = [[] for _ in range(R)]; carga = [0] * R; pend = list(range(1, N + 1)); traza = []
    while pend:
        best = None
        for k in pend:
            for r in range(R):
                if carga[r] + DEM[k] > Q: continue
                s_len = len(rutas[r])
                for s in range(s_len + 1):
                    pre = rutas[r][s - 1] if s > 0 else 0
                    nxt = rutas[r][s] if s < s_len else 0
                    delta = DIST[pre][k] + DIST[k][nxt] - DIST[pre][nxt]
                    if r > 0 and not rutas[r - 1]: continue   # solo se abre una ruta nueva a la vez
                    if best is None or delta < best[0] - 1e-12: best = (delta, k, r, s)
        d, k, r, s = best
        rutas[r].insert(s, k); carga[r] += DEM[k]; pend.remove(k)
        traza.append((k, r + 1, s + 1, round(d, 2)))
    tr = [c for ru in rutas for c in ru]
    return rutas, tr, traza

# ---------- mejora local ----------
def aplicar(tr, mt, a, b):
    t = list(tr)
    if mt == 1:      # relocate: quita la posición a e inserta en b (1-indexado)
        x = t.pop(a - 1); t.insert(b - 1, x)
    elif mt == 2:    # swap
        t[a - 1], t[b - 1] = t[b - 1], t[a - 1]
    else:            # 2-opt: invierte a..b
        t[a - 1:b] = t[a - 1:b][::-1]
    return t

def mejor_movimiento(tr, mt, cur):
    bd = 0.0; best = None
    for a in range(1, N + 1):
        for b in range(1, N + 1):
            if a == b: continue
            if mt > 1 and a > b: continue
            c = evaluar(aplicar(tr, mt, a, b))
            if c - cur < bd - 1e-9: bd = c - cur; best = (a, b, c)
    return best

def dos_opt(tr0):
    tr = list(tr0); cur = evaluar(tr); hist = [(0, None, cur)]; it = 0
    while True:
        m = mejor_movimiento(tr, 3, cur)
        if m is None: break
        it += 1; tr = aplicar(tr, 3, m[0], m[1]); cur = m[2]; hist.append((it, (m[0], m[1]), m[2]))
    return tr, hist

def vnd(tr0, vecindarios=(1, 2, 3)):
    tr = list(tr0); cur = evaluar(tr); hist = [(0, None, None, cur)]; it = 0; k = 0
    while k < len(vecindarios):
        mt = vecindarios[k]; m = mejor_movimiento(tr, mt, cur)
        if m is None: k += 1
        else:
            it += 1; tr = aplicar(tr, mt, m[0], m[1]); cur = m[2]; hist.append((it, mt, (m[0], m[1]), m[2])); k = 0
    return tr, hist

# ---------- metaheurísticas ----------
def vecino_aleatorio(tr, rng):
    t = rng.u(); a = rng.ri(N); b = rng.ri(N)
    if a == b: return list(tr)
    mt = 1 if t < 1 / 3 else (2 if t < 2 / 3 else 3)
    if mt > 1 and a > b: a, b = b, a
    return aplicar(tr, mt, a, b)

def recocido_simulado(tr0, seed=2024, iters=4000, T0=20.0, Tf=0.05):
    rng = RNG(seed); tr = list(tr0); cur = evaluar(tr); best = cur; btr = list(tr)
    alpha = (Tf / T0) ** (1.0 / iters); T = T0; hist = [(0, cur, best)]; acept = 0
    for it in range(1, iters + 1):
        nb = vecino_aleatorio(tr, rng); c = evaluar(nb); delta = c - cur
        u = rng.u()
        if delta < 0 or u < math.exp(-min(delta / T, 50)):
            tr = nb; cur = c; acept += 1
            if cur < best - 1e-12: best = cur; btr = list(tr)
        T = T * alpha
        if it % 200 == 0: hist.append((it, cur, best))
    return btr, hist, acept

def busqueda_tabu(tr0, iters=60, tenure=7):
    tr = list(tr0); cur = evaluar(tr); best = cur; btr = list(tr); tb = {}; hist = [(0, None, cur, best)]
    for it in range(1, iters + 1):
        cand = None
        for a in range(1, N):
            for b in range(a + 1, N + 1):
                c = evaluar(aplicar(tr, 2, a, b))
                tabu = tb.get((a, b), 0) > it
                if tabu and not (c < best - 1e-9): continue
                if cand is None or c < cand[2] - 1e-12: cand = (a, b, c)
        if cand is None: continue
        a, b, c = cand; tr = aplicar(tr, 2, a, b); cur = c; tb[(a, b)] = it + tenure
        if cur < best - 1e-12: best = cur; btr = list(tr)
        hist.append((it, (a, b), cur, best))
    return btr, hist

def algoritmo_genetico(seed=7, P=30, G=60, pm=0.5, E=2):
    rng = RNG(seed)
    def perm():
        t = list(range(1, N + 1))
        for i in range(N - 1, 0, -1):
            j = rng.ri(i + 1) - 1; t[i], t[j] = t[j], t[i]
        return t
    pop = [perm() for _ in range(P)]; hist = []
    def ox(A, B, c1, c2):
        ch = [0] * N
        for p in range(c1 - 1, c2): ch[p] = A[p]
        seg = set(A[c1 - 1:c2]); w = 0
        for g in B:
            if g in seg: continue
            w += 1
            while c1 <= w <= c2: w += 1
            ch[w - 1] = g
        return ch
    for gen in range(0, G + 1):
        cost = [evaluar(t) for t in pop]
        rank = sorted(range(P), key=lambda g: (cost[g], g))
        hist.append((gen, cost[rank[0]], sum(cost) / P))
        if gen == G: break
        new = [list(pop[rank[e]]) for e in range(E)]
        def torneo():
            a = rng.ri(P) - 1; b = rng.ri(P) - 1
            return a if (cost[a], a) <= (cost[b], b) else b
        while len(new) < P:
            A = pop[torneo()]; B = pop[torneo()]
            c1 = rng.ri(N); c2 = rng.ri(N)
            if c1 > c2: c1, c2 = c2, c1
            ch = ox(A, B, c1, c2)
            if rng.u() < pm:
                a = rng.ri(N) - 1; b = rng.ri(N) - 1; ch[a], ch[b] = ch[b], ch[a]
            new.append(ch)
        pop = new
    g = min(range(P), key=lambda x: (cost[x], x))
    return pop[g], hist

def colonia_hormigas(seed=11, M=10, IT=30, alpha=1.0, beta=3.0, rho=0.3, Qd=100.0):
    rng = RNG(seed); tau = [[1.0] * (N + 1) for _ in range(N + 1)]; best = None; hist = []
    for it in range(1, IT + 1):
        delta = [[0.0] * (N + 1) for _ in range(N + 1)]; mejor_it = None
        for h in range(M):
            vis = [0] * (N + 1); cur = 0; ld = 0; tr = []
            for _ in range(N):
                cand = [c for c in range(1, N + 1) if not vis[c] and ld + DEM[c] <= Q]
                if not cand:
                    ld = 0; cur = 0; cand = [c for c in range(1, N + 1) if not vis[c]]
                w = {c: tau[cur][c] * (1.0 / DIST[cur][c]) * (1.0 / DIST[cur][c]) * (1.0 / DIST[cur][c]) for c in cand}
                tot = 0.0
                for c in cand: tot = tot + w[c]
                r = rng.u() * tot; cum = 0.0; sel = 0
                for c in cand:
                    cum = cum + w[c]
                    if cum >= r and sel == 0: sel = c
                if sel == 0: sel = cand[-1]
                tr.append(sel); vis[sel] = 1; ld += DEM[sel]; cur = sel
            cst, rutas = evaluar(tr, True)
            pv = 0
            for ru in rutas:
                pv = 0
                for c in ru:
                    delta[pv][c] += Qd / cst; delta[c][pv] += Qd / cst; pv = c
                delta[pv][0] += Qd / cst; delta[0][pv] += Qd / cst
            if mejor_it is None or cst < mejor_it[0]: mejor_it = (cst, tr)
            if best is None or cst < best[0] - 1e-12: best = (cst, list(tr))
        for a in range(N + 1):
            for b in range(N + 1): tau[a][b] = (1 - rho) * tau[a][b] + delta[a][b]
        hist.append((it, mejor_it[0], best[0]))
    return best[1], hist

def grasp(seed=5, iters=20, alfa=0.3):
    rng = RNG(seed); best = None; hist = []
    for it in range(1, iters + 1):
        vis = [0] * (N + 1); cur = 0; ld = 0; tr = []
        for _ in range(N):
            cand = [c for c in range(1, N + 1) if not vis[c] and ld + DEM[c] <= Q]
            if not cand:
                ld = 0; cur = 0; cand = [c for c in range(1, N + 1) if not vis[c]]
            dmin = min(DIST[cur][c] for c in cand); dmax = max(DIST[cur][c] for c in cand)
            lim = dmin + alfa * (dmax - dmin)
            rcl = [c for c in cand if DIST[cur][c] <= lim]
            sel = rcl[rng.ri(len(rcl)) - 1]
            tr.append(sel); vis[sel] = 1; ld += DEM[sel]; cur = sel
        c0 = evaluar(tr); tr2, hv = vnd(tr); c1 = hv[-1][3]
        if best is None or c1 < best[0] - 1e-12: best = (c1, tr2)
        hist.append((it, c0, c1, best[0]))
    return best[1], hist

def vns(tr0, seed=3, iters=12, kmax=3):
    rng = RNG(seed); tr = list(tr0); cur = evaluar(tr); hist = [(0, 0, cur, cur)]; intentos = []
    for it in range(1, iters + 1):
        k = 1
        while k <= kmax:
            t = list(tr)
            for _ in range(k + 1):
                a = rng.ri(N); b = rng.ri(N)
                if a != b: t = aplicar(t, 1 if rng.u() < 0.5 else 2, a, b)
            t2, hv = vnd(t); c = hv[-1][3]
            acept = c < cur - 1e-9
            intentos.append((len(intentos) + 1, it, k, c, 1 if acept else 0))
            if acept: tr = t2; cur = c; k = 1
            else: k += 1
        hist.append((it, k, cur, cur))
    return tr, hist, intentos
