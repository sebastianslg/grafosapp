"""Instancia común CVRP-10 (1 depósito, 10 clientes, Q = 15) y utilidades equivalentes a los .gms."""
import math
Q = 15
COORD = [(48, 52), (18, 82), (38, 92), (62, 84), (88, 72), (92, 46), (78, 18), (52, 8), (28, 16), (8, 38), (14, 64)]
DEM = [0, 4, 3, 5, 4, 3, 5, 4, 3, 5, 2]
N = 10
def _d(a, b):
    dx = COORD[a][0] - COORD[b][0]; dy = COORD[a][1] - COORD[b][1]
    return math.sqrt(dx * dx + dy * dy)
DIST = [[_d(a, b) for b in range(N + 1)] for a in range(N + 1)]

NEV = [0]
def evaluar(tr, detalle=False):
    """Decodifica el tour gigante dividiéndolo por capacidad. Devuelve costo (y rutas)."""
    NEV[0] += 1
    cst = 0.0; ld = 0; pv = 0; rutas = [[]]
    for cn in tr:
        d = DEM[cn]
        if ld + d > Q:
            cst = cst + DIST[pv][0]; pv = 0; ld = 0; rutas.append([])
        cst = cst + DIST[pv][cn]; ld = ld + d; pv = cn; rutas[-1].append(cn)
    cst = cst + DIST[pv][0]
    return (cst, rutas) if detalle else cst

class RNG:
    """Park-Miller (16807, 2^31-1): idéntico al generador escrito en GAMS."""
    def __init__(self, seed): self.s = seed
    def u(self):
        self.s = (16807 * self.s) % 2147483647
        return self.s / 2147483647
    def ri(self, n):
        return 1 + int(math.floor(self.u() * n))
