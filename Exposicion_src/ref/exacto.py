"""Modelo CVRP de 2 índices (MTZ de carga) resuelto con HiGHS (scipy.milp): verifica el óptimo y la relajación LP."""
import numpy as np, sys
from scipy.optimize import milp, LinearConstraint, Bounds
sys.path.insert(0, '.')
from instancia import *
def resolver(entero=True, kmax=5, tl=120):
    n = N + 1; idx = {}; c = []
    for i in range(n):
        for j in range(n):
            if i != j: idx[i, j] = len(c); c.append(DIST[i][j])
    nx = len(c); uidx = {i: nx + i - 1 for i in range(1, n)}; nv = nx + N
    c = np.array(c + [0.0] * N); A = []; lo = []; hi = []
    def fila(coefs, l, h):
        r = np.zeros(nv)
        for k, v in coefs: r[k] = v
        A.append(r); lo.append(l); hi.append(h)
    for i in range(1, n):
        fila([(idx[i, j], 1) for j in range(n) if j != i], 1, 1)
        fila([(idx[j, i], 1) for j in range(n) if j != i], 1, 1)
    fila([(idx[0, j], 1) for j in range(1, n)], 1, kmax); fila([(idx[j, 0], 1) for j in range(1, n)], 1, kmax)
    for i in range(1, n):
        for j in range(1, n):
            if i != j: fila([(uidx[i], 1), (uidx[j], -1), (idx[i, j], Q)], -np.inf, Q - DEM[j])
    lb = np.zeros(nv); ub = np.ones(nv)
    for i in range(1, n): lb[uidx[i]] = DEM[i]; ub[uidx[i]] = Q
    integ = np.zeros(nv); 
    if entero: integ[:nx] = 1
    r = milp(c, constraints=LinearConstraint(np.array(A), lo, hi), integrality=integ, bounds=Bounds(lb, ub), options={'time_limit': tl, 'mip_rel_gap': 1e-9})
    xs = {k: r.x[v] for k, v in idx.items()}
    return r.fun, xs, r
def rutas_de(xs):
    sig = {}; ini = []
    for (i, j), v in xs.items():
        if v > 0.5:
            if i == 0: ini.append(j)
            else: sig[i] = j
    rutas = []
    for s in ini:
        r = [s]
        while sig.get(r[-1], 0) != 0: r.append(sig[r[-1]])
        rutas.append(r)
    return rutas
if __name__ == '__main__':
    import time; t = time.time(); z, xs, r = resolver(True); print('MIP', z, rutas_de(xs), round(time.time() - t, 2), getattr(r, 'mip_node_count', None), r.mip_dual_bound)
    z2, _, _ = resolver(False); print('LP', z2)
