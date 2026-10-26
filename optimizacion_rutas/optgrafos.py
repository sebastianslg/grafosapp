"""optgrafos: problemas de redes y rutas resueltos SOLO con optimización matemática.

Todos los modelos son programas lineales o lineales enteros mixtos que resuelve HiGHS
(vía scipy.optimize.milp). No se usan algoritmos de grafos (Dijkstra, Prim, Kruskal,
Floyd-Warshall, vecino más cercano, 2-opt, etc.) ni heurísticas para obtener la respuesta.

Problemas disponibles:
  camino_minimo, todos_los_caminos, arbol_minimo, tsp, mtsp, cvrp, vrp,
  flujo_maximo, flujo_costo_minimo, asignacion, transporte, cartero_chino,
  p_mediana, p_centro, cobertura
y la clase Modelo para armar cualquier otro modelo propio.
"""
from __future__ import annotations

import io
import math
import re
import time

import numpy as np
import pandas as pd
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import coo_matrix

INF = np.inf
R_TIERRA_KM = 6371.0088


# ======================================================================================
# Núcleo: constructor de modelos y llamada al solver
# ======================================================================================
class Solucion:
    def __init__(self, x, estado, obj, cota, brecha, segundos):
        self.x, self.estado, self.obj = x, estado, obj
        self.cota, self.brecha, self.segundos = cota, brecha, segundos

    @property
    def ok(self):
        return self.x is not None


class Modelo:
    """Constructor de modelos lineales / enteros mixtos (minimiza c'x)."""

    def __init__(self):
        self.c, self.lb, self.ub, self.integ = [], [], [], []
        self._r, self._k, self._v, self.lo, self.hi = [], [], [], [], []
        self.nr = 0

    @property
    def nv(self):
        return len(self.c)

    def var(self, costo=0.0, lb=0.0, ub=1.0, entera=True):
        self.c.append(float(costo)); self.lb.append(float(lb)); self.ub.append(float(ub))
        self.integ.append(1 if entera else 0)
        return len(self.c) - 1

    def restr(self, idx, coef=1.0, lo=-INF, hi=INF):
        """lo <= sum coef_k * x_idx_k <= hi"""
        idx = list(idx)
        if np.isscalar(coef):
            coef = [coef] * len(idx)
        self._r.extend([self.nr] * len(idx)); self._k.extend(idx); self._v.extend(coef)
        self.lo.append(lo); self.hi.append(hi); self.nr += 1

    def resolver(self, tiempo=300, brecha=1e-6, verbose=False):
        t0 = time.time()
        cons = []
        if self.nr:
            A = coo_matrix((self._v, (self._r, self._k)), shape=(self.nr, self.nv)).tocsr()
            cons = [LinearConstraint(A, self.lo, self.hi)]
        res = milp(np.array(self.c), integrality=np.array(self.integ),
                   bounds=Bounds(self.lb, self.ub), constraints=cons,
                   options={"time_limit": max(float(tiempo), 1.0), "mip_rel_gap": brecha, "disp": verbose})
        seg = round(time.time() - t0, 3)
        if res.x is not None:
            estado = "óptimo" if res.status == 0 else "límite de tiempo (mejor solución encontrada, no probada óptima)"
        else:
            estado = {1: "límite de tiempo sin solución", 2: "infactible", 3: "no acotado"}.get(res.status, res.message)
        gap = getattr(res, "mip_gap", None)
        cota = getattr(res, "mip_dual_bound", None)
        return Solucion(res.x, estado, res.fun if res.x is not None else None, cota,
                        None if gap is None or (isinstance(gap, float) and math.isnan(gap)) else gap, seg)


# ======================================================================================
# Datos: Red y cargadores
# ======================================================================================
class Red:
    """Red con matriz de costos D (inf = no hay arco). Los nodos se nombran por `ids`."""

    def __init__(self, D, ids=None, nombres=None, coords=None, dirigido=None, cap=None, demanda=None, titulo="red"):
        D = np.array(D, float)
        n = D.shape[0]
        if D.shape != (n, n):
            raise ValueError("La matriz de costos debe ser cuadrada.")
        np.fill_diagonal(D, INF)
        self.D = D
        self.n = n
        self.ids = list(ids) if ids is not None else list(range(1, n + 1))
        self.nombres = list(nombres) if nombres is not None else None
        self.coords = None if coords is None else np.array(coords, float)  # columnas: lat, lon
        self.dirigido = (not np.allclose(np.where(np.isinf(D), -1, D), np.where(np.isinf(D.T), -1, D.T))
                         ) if dirigido is None else dirigido
        self.cap = None if cap is None else np.array(cap, float)
        self.demanda = None if demanda is None else np.array(demanda, float)
        self.titulo = titulo
        if len(self.ids) != n:
            raise ValueError("ids no coincide con el tamaño de la matriz.")

    # --- acceso por etiqueta -----------------------------------------------------------
    def idx(self, x):
        if isinstance(x, (int, np.integer)) and x in self.ids:
            return self.ids.index(int(x))
        if x in self.ids:
            return self.ids.index(x)
        if str(x) in [str(i) for i in self.ids]:
            return [str(i) for i in self.ids].index(str(x))
        if self.nombres is not None and x in self.nombres:
            return self.nombres.index(x)
        raise KeyError(f"Nodo '{x}' no existe. Etiquetas válidas: {self.ids[:8]}…")

    def etq(self, i):
        if self.nombres is not None:
            return f"{self.ids[i]} ({self.nombres[i]})"
        return str(self.ids[i])

    def arcos(self):
        return [(i, j, self.D[i, j]) for i in range(self.n) for j in range(self.n)
                if i != j and np.isfinite(self.D[i, j])]

    def df(self):
        M = self.D.copy(); np.fill_diagonal(M, 0)
        return pd.DataFrame(M, index=self.ids, columns=self.ids)

    def subred(self, nodos):
        ix = [self.idx(x) for x in nodos]
        return Red(self.D[np.ix_(ix, ix)], [self.ids[i] for i in ix],
                   None if self.nombres is None else [self.nombres[i] for i in ix],
                   None if self.coords is None else self.coords[ix], self.dirigido,
                   None if self.cap is None else self.cap[np.ix_(ix, ix)],
                   None if self.demanda is None else self.demanda[ix], self.titulo)

    def __repr__(self):
        na = len(self.arcos())
        return f"Red('{self.titulo}': {self.n} nodos, {na} arcos, {'dirigida' if self.dirigido else 'no dirigida'})"

    # --- constructores -------------------------------------------------------------------
    @classmethod
    def desde_aristas(cls, aristas, dirigido=False, cap=None, titulo="red", nombres=None, ids=None):
        """aristas: lista de (origen, destino, costo[, capacidad]) o DataFrame con esas columnas."""
        if isinstance(aristas, pd.DataFrame):
            aristas = [tuple(r) for r in aristas.iloc[:, :4 if aristas.shape[1] >= 4 else 3].itertuples(index=False)]
        etqs = ids if ids is not None else sorted({e[k] for e in aristas for k in (0, 1)}, key=_clave)
        pos = {e: k for k, e in enumerate(etqs)}
        n = len(etqs)
        D = np.full((n, n), INF)
        C = None
        for e in aristas:
            i, j, c = pos[e[0]], pos[e[1]], float(e[2])
            D[i, j] = c
            if not dirigido:
                D[j, i] = c
            if len(e) >= 4 and pd.notna(e[3]):
                if C is None:
                    C = np.zeros((n, n))
                C[i, j] = float(e[3])
                if not dirigido:
                    C[j, i] = float(e[3])
        return cls(D, etqs, nombres, None, dirigido, C if C is not None else cap, None, titulo)

    @classmethod
    def desde_coordenadas(cls, lat, lon, ids=None, nombres=None, metrica="haversine", factor=1.0,
                          demanda=None, titulo="red"):
        """Distancias entre puntos: 'haversine' (km, círculo máximo) o 'euclidiana' (lat=x, lon=y)."""
        lat, lon = np.asarray(lat, float), np.asarray(lon, float)
        if metrica == "haversine":
            p1, p2 = np.radians(lat)[:, None], np.radians(lat)[None, :]
            dl = np.radians(lon)[None, :] - np.radians(lon)[:, None]
            h = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
            D = 2 * R_TIERRA_KM * np.arcsin(np.sqrt(h)) * factor
        else:
            D = np.hypot(lat[:, None] - lat[None, :], lon[:, None] - lon[None, :]) * factor
        return cls(D, ids, nombres, np.c_[lat, lon], False, None, demanda, titulo)


def _clave(x):
    try:
        return (0, float(x))
    except (TypeError, ValueError):
        return (1, str(x))


_ALIAS = {
    "lat": ("lat", "latitud", "latitude", "y"), "lon": ("lon", "lng", "long", "longitud", "longitude", "x"),
    "id": ("id", "nodo", "node", "n", "#", "top", "numero", "número"),
    "nombre": ("nombre", "name", "ciudad", "tienda", "city", "etiqueta", "label"),
    "demanda": ("demanda", "demand", "carga", "pedido"),
    "origen": ("origen", "desde", "from", "source", "inicio", "i", "o"),
    "destino": ("destino", "hasta", "to", "target", "fin", "j", "d"),
    "costo": ("costo", "coste", "cost", "peso", "weight", "distancia", "distance", "km", "valor", "longitud_arco"),
    "cap": ("capacidad", "cap", "capacity", "u"),
}


def _col(df, clave):
    for c in df.columns:
        if str(c).strip().lower() in _ALIAS[clave]:
            return c
    return None


def _a_float(v):
    if isinstance(v, str):
        v = v.strip().replace(",", ".") if v.count(",") == 1 and v.count(".") == 0 else v.strip()
        if v in ("#", "", "inf", "∞", "-", "nan", "NaN"):
            return INF
    try:
        f = float(v)
    except (TypeError, ValueError):
        return INF
    return INF if math.isnan(f) else f


def leer_tabla(origen, hoja=None):
    """Lee CSV/TSV/Excel/DataFrame o texto pegado. Devuelve un DataFrame (todo como texto)."""
    if isinstance(origen, pd.DataFrame):
        return origen.copy()
    s = str(origen)
    if "\n" in s or "\t" in s:
        txt = s
    else:
        low = s.lower()
        if low.endswith((".xlsx", ".xls", ".xlsm")):
            return pd.read_excel(s, sheet_name=hoja if hoja is not None else 0, dtype=str, header=0)
        with open(s, "r", encoding="utf-8-sig", errors="replace") as f:
            txt = f.read()
    txt = txt.replace("\r\n", "\n").replace("\r", "\n").strip("\n")
    primera = txt.split("\n", 1)[0]
    sep = "\t" if "\t" in primera else (";" if primera.count(";") > primera.count(",") else ",")
    return pd.read_csv(io.StringIO(txt), sep=sep, dtype=str, keep_default_na=False)


def cargar(origen, hoja=None, tipo="auto", dirigido=None, metrica="haversine", factor=1.0, titulo=None):
    """Carga datos en formatos distintos y devuelve una Red.

    tipo='matriz'      matriz cuadrada de costos (primera fila/columna con etiquetas; '#' o vacío = sin arco)
    tipo='aristas'     columnas origen, destino, costo [, capacidad]
    tipo='coordenadas' columnas lat, lon [, id, nombre, demanda] (distancia haversine * factor)
    tipo='auto'        detecta por los nombres de columnas.
    Acepta ruta de archivo (.csv/.tsv/.txt/.xlsx), DataFrame o texto pegado.
    """
    df = leer_tabla(origen, hoja)
    df.columns = [str(c).strip() for c in df.columns]
    nombre = titulo or (str(origen) if isinstance(origen, str) and "\n" not in str(origen) else "red")
    if tipo == "auto":
        if _col(df, "origen") is not None and _col(df, "destino") is not None and _col(df, "costo") is not None:
            tipo = "aristas"
        elif _col(df, "lat") is not None and _col(df, "lon") is not None and df.shape[1] <= 12:
            tipo = "coordenadas"
        else:
            tipo = "matriz"
    if tipo == "aristas":
        o, d, c, u = _col(df, "origen"), _col(df, "destino"), _col(df, "costo"), _col(df, "cap")
        filas = []
        for _, r in df.iterrows():
            def dato(v):
                try:
                    return float(v) if str(v).strip() != "" else v
                except ValueError:
                    return v
            e = [dato(r[o]), dato(r[d]), _a_float(r[c])]
            if u is not None:
                e.append(_a_float(r[u]))
            filas.append(tuple(int(x) if isinstance(x, float) and x == int(x) else x for x in e[:2]) + tuple(e[2:]))
        return Red.desde_aristas(filas, dirigido=bool(dirigido), titulo=nombre)
    if tipo == "coordenadas":
        la, lo = _col(df, "lat"), _col(df, "lon")
        ci, cn, cd = _col(df, "id"), _col(df, "nombre"), _col(df, "demanda")
        ids = None
        if ci is not None:
            ids = [int(float(v)) if re.fullmatch(r"-?\d+(\.0+)?", str(v).strip()) else str(v) for v in df[ci]]
        dem = None if cd is None else [_a_float(v) if _a_float(v) != INF else 0.0 for v in df[cd]]
        return Red.desde_coordenadas([float(str(v).replace(",", ".")) for v in df[la]],
                                     [float(str(v).replace(",", ".")) for v in df[lo]],
                                     ids, None if cn is None else list(df[cn]), metrica, factor, dem, nombre)
    # matriz cuadrada
    cols = list(df.columns)
    if df.shape[0] == df.shape[1] - 1 or (df.shape[0] == df.shape[1] and not _numerica(df.iloc[:, 0])):
        etq_f = list(df.iloc[:, 0])
        body = df.iloc[:, 1:]
        etq_c = cols[1:]
    else:
        body, etq_f, etq_c = df, list(range(1, df.shape[0] + 1)), cols
    D = np.array([[_a_float(v) for v in fila] for fila in body.itertuples(index=False)], float)
    n = D.shape[0]
    ids = [int(float(e)) if re.fullmatch(r"-?\d+(\.0+)?", str(e).strip()) else str(e) for e in etq_c[:n]]
    if len(set(ids)) != n:
        ids = list(range(1, n + 1))
    nombres = None
    if not all(re.fullmatch(r"-?\d+", str(i)) for i in ids):
        nombres, ids = list(ids), list(range(1, n + 1))
    return Red(D, ids, nombres, None, dirigido, None, None, nombre)


def _numerica(serie):
    try:
        [float(str(v).replace(",", ".")) for v in serie]
        return True
    except ValueError:
        return False


def matriz_osrm(lat, lon, servidor="https://router.project-osrm.org", perfil="driving", lote=60):
    """Distancias por carretera (km) con el servicio público OSRM. Requiere internet."""
    import requests
    lat, lon = list(lat), list(lon)
    n = len(lat)
    if n > lote:
        raise ValueError(f"El servidor público admite ~{lote} puntos por consulta; use un OSRM propio.")
    coords = ";".join(f"{lon[i]},{lat[i]}" for i in range(n))
    r = requests.get(f"{servidor}/table/v1/{perfil}/{coords}", params={"annotations": "distance"}, timeout=60)
    r.raise_for_status()
    return np.array(r.json()["distances"], float) / 1000.0


# ======================================================================================
# Resultado
# ======================================================================================
class Resultado:
    def __init__(self, problema, estado, objetivo=None, red=None, rutas=None, arcos=None, tablas=None,
                 brecha=None, segundos=None, mensaje=None, **extra):
        self.problema, self.estado, self.objetivo = problema, estado, objetivo
        self.red, self.rutas, self.arcos = red, rutas, arcos
        self.tablas = tablas or {}
        self.brecha, self.segundos, self.mensaje = brecha, segundos, mensaje
        self.extra = extra

    @property
    def ok(self):
        return self.objetivo is not None or bool(self.rutas)

    def resumen(self, decimales=3):
        L = [f"Problema : {self.problema}", f"Estado   : {self.estado}"]
        if self.objetivo is not None:
            L.append(f"Objetivo : {round(self.objetivo, decimales)}")
        if self.brecha is not None:
            L.append(f"Brecha   : {self.brecha:.2e}")
        if self.segundos is not None:
            L.append(f"Tiempo   : {self.segundos} s")
        if self.mensaje:
            L.append(self.mensaje)
        return "\n".join(L)

    def __repr__(self):
        return self.resumen()

    def a_excel(self, ruta):
        with pd.ExcelWriter(ruta) as w:
            pd.DataFrame({"campo": ["problema", "estado", "objetivo", "brecha", "segundos"],
                          "valor": [self.problema, self.estado, self.objetivo, self.brecha, self.segundos]}
                         ).to_excel(w, sheet_name="resumen", index=False)
            for k, t in self.tablas.items():
                t.to_excel(w, sheet_name=str(k)[:31], index=not isinstance(t.index, pd.RangeIndex))
        return ruta


def _fallo(problema, sol, red=None):
    return Resultado(problema, sol.estado, None, red, segundos=sol.segundos, brecha=sol.brecha)


def _resolver(M, tiempo, brecha, verbose=False):
    return M.resolver(tiempo, brecha, verbose)


# ======================================================================================
# Caminos mínimos (programa lineal de flujo)
# ======================================================================================
def _flujo_caminos(red, s, destinos, excluidos, tiempo=60):
    """Una unidad de flujo de s a cada destino, costo mínimo. Devuelve (dist, pred, sol)."""
    n = red.n
    arcs = [(i, j, c) for i, j, c in red.arcos() if i not in excluidos and j not in excluidos]
    suma = sum(abs(c) for _, _, c in arcs) + 1.0
    BIG = 10.0 * suma * max(1, n)
    M = Modelo()
    v = [M.var(c, 0, len(destinos), entera=True) for _, _, c in arcs]
    art = {}
    if len(destinos) > 1:  # arcos artificiales para tolerar destinos inalcanzables
        for t in destinos:
            art[t] = M.var(BIG, 0, 1, entera=True)
    sal = [[] for _ in range(n)]; ent = [[] for _ in range(n)]
    for a, (i, j, _) in enumerate(arcs):
        sal[i].append(v[a]); ent[j].append(v[a])
    for t, va in art.items():
        sal[s].append(va); ent[t].append(va)
    for u in range(n):
        if u in excluidos:
            continue
        b = len(destinos) if u == s else 0
        if u in destinos:
            b -= 1
        M.restr(sal[u] + ent[u], [1.0] * len(sal[u]) + [-1.0] * len(ent[u]), b, b)
    sol = _resolver(M, tiempo, 1e-9)
    if not sol.ok:
        return None, None, sol
    flujo = np.round(sol.x).astype(int)
    pred = [-1] * n
    mejor = [0] * n
    for a, (i, j, _) in enumerate(arcs):
        if flujo[v[a]] > mejor[j]:
            mejor[j], pred[j] = flujo[v[a]], i
    dist = np.full(n, INF); dist[s] = 0.0
    for t in destinos:
        if t in art and flujo[art[t]] > 0:
            continue
        cam, u, tot = [t], t, 0.0
        while u != s and len(cam) <= n:
            p = pred[u]
            if p < 0:
                tot = INF; break
            tot += red.D[p, u]; u = p; cam.append(u)
        dist[t] = tot if u == s else INF
    return dist, pred, sol


def _traza(pred, s, t):
    cam, u = [t], t
    while u != s:
        u = pred[u]
        if u < 0 or len(cam) > len(pred):
            return None
        cam.append(u)
    return cam[::-1]


def camino_minimo(red, origen, destino=None, evitar=(), tiempo=60):
    """Camino de costo mínimo origen→destino (o hacia todos los nodos si destino=None) como LP de flujo."""
    s = red.idx(origen)
    ex = {red.idx(e) for e in evitar}
    dests = [t for t in range(red.n) if t != s and t not in ex] if destino is None else [red.idx(destino)]
    dist, pred, sol = _flujo_caminos(red, s, dests, ex, tiempo)
    if dist is None:
        return Resultado("Camino mínimo", "no existe camino" if sol.estado == "infactible" else sol.estado,
                         None, red, segundos=sol.segundos)
    filas = []
    rutas = []
    for t in dests:
        cam = _traza(pred, s, t) if np.isfinite(dist[t]) else None
        filas.append({"origen": red.ids[s], "destino": red.ids[t],
                      "distancia": None if cam is None else round(float(dist[t]), 6),
                      "ruta": "sin camino" if cam is None else " → ".join(str(red.ids[u]) for u in cam)})
        if cam is not None:
            rutas.append([red.ids[u] for u in cam])
    tabla = pd.DataFrame(filas)
    obj = float(dist[dests[0]]) if destino is not None else None
    arcos = None
    if destino is not None and rutas:
        c = _traza(pred, s, dests[0])
        arcos = [(red.ids[a], red.ids[b], float(red.D[a, b])) for a, b in zip(c[:-1], c[1:])]
    return Resultado("Camino mínimo (LP de flujo)", sol.estado, obj, red, rutas=rutas, arcos=arcos,
                     tablas={"caminos": tabla}, segundos=sol.segundos, dist=dist, pred=pred)


def todos_los_caminos(red, tiempo=60):
    """Matriz de distancias mínimas entre todos los pares (un LP de flujo por origen)."""
    n = red.n
    Dm = np.full((n, n), INF); P = -np.ones((n, n), int)
    t0 = time.time()
    for s in range(n):
        dist, pred, sol = _flujo_caminos(red, s, [t for t in range(n) if t != s], set(), tiempo)
        if dist is None:
            return Resultado("Todos los caminos mínimos", sol.estado, None, red)
        Dm[s] = dist; P[s] = pred
    ids = red.ids
    res = Resultado("Todos los caminos mínimos (n LP de flujo)", "óptimo", None, red,
                    tablas={"distancias": pd.DataFrame(np.where(np.isinf(Dm), np.nan, Dm), index=ids, columns=ids)},
                    segundos=round(time.time() - t0, 3), dist=Dm, pred=P)
    res.ruta = lambda a, b: None if (c := _traza(P[red.idx(a)], red.idx(a), red.idx(b))) is None \
        else [red.ids[u] for u in c]
    return res


# ======================================================================================
# Árbol de expansión mínima (flujo de una mercancía desde la raíz)
# ======================================================================================
def arbol_minimo(red, raiz=None, tiempo=300, brecha=1e-9, verbose=False):
    """Árbol (o arborescencia si la red es dirigida) de costo total mínimo que une todos los nodos."""
    n = red.n
    r = 0 if raiz is None else red.idx(raiz)
    arcs = red.arcos()
    M = Modelo()
    y = [M.var(c, 0, 1, True) for _, _, c in arcs]
    f = [M.var(0, 0, n - 1, False) for _ in arcs]
    ent = [[] for _ in range(n)]; sal = [[] for _ in range(n)]
    for a, (i, j, _) in enumerate(arcs):
        M.restr([f[a], y[a]], [1.0, -(n - 1.0)], hi=0)
        ent[j].append(a); sal[i].append(a)
    for u in range(n):
        if u == r:
            M.restr([y[a] for a in ent[u]], 1.0, 0, 0)
            M.restr([f[a] for a in sal[u]] + [f[a] for a in ent[u]],
                    [1.0] * len(sal[u]) + [-1.0] * len(ent[u]), n - 1, n - 1)
        else:
            M.restr([y[a] for a in ent[u]], 1.0, 1, 1)
            M.restr([f[a] for a in ent[u]] + [f[a] for a in sal[u]],
                    [1.0] * len(ent[u]) + [-1.0] * len(sal[u]), 1, 1)
    sol = _resolver(M, tiempo, brecha, verbose)
    if not sol.ok:
        return _fallo("Árbol de valor mínimo", sol, red)
    sel = [(i, j, c) for a, (i, j, c) in enumerate(arcs) if sol.x[y[a]] > 0.5]
    if red.dirigido:
        lista = [(red.ids[i], red.ids[j], c) for i, j, c in sel]
    else:
        lista = [(red.ids[min(i, j)], red.ids[max(i, j)], c) for i, j, c in sel]
    tabla = pd.DataFrame(lista, columns=["desde", "hasta", "costo"])
    return Resultado("Árbol de valor mínimo (MILP de flujo)", sol.estado, float(sum(c for *_, c in sel)), red,
                     arcos=lista, tablas={"arcos_del_arbol": tabla}, brecha=sol.brecha, segundos=sol.segundos,
                     raiz=red.ids[r])


# ======================================================================================
# TSP exacto
# ======================================================================================
def _ciclos(succ):
    vis, ciclos = set(), []
    for a in range(len(succ)):
        if a in vis:
            continue
        c, u = [], a
        while u not in vis:
            vis.add(u); c.append(u); u = succ[u]
        ciclos.append(c)
    return ciclos


def _tsp_nucleo(E, metodo, tiempo, brecha, verbose):
    """Ciclo hamiltoniano de costo mínimo sobre E (inf = arco prohibido). Devuelve (succ, obj, sol, cortes)."""
    N = E.shape[0]
    arcs = [(i, j) for i in range(N) for j in range(N) if i != j and np.isfinite(E[i, j])]
    pos = {a: k for k, a in enumerate(arcs)}
    M = Modelo()
    x = [M.var(E[i, j], 0, 1, True) for i, j in arcs]
    for i in range(N):
        M.restr([x[pos[(i, j)]] for j in range(N) if (i, j) in pos], 1.0, 1, 1)
        M.restr([x[pos[(j, i)]] for j in range(N) if (j, i) in pos], 1.0, 1, 1)
    if metodo == "mtz":
        u = [None] + [M.var(0, 1, N - 1, False) for _ in range(1, N)]
        for (i, j), k in pos.items():
            if i and j:
                M.restr([u[i], u[j], x[k]], [1.0, -1.0, N - 1.0], hi=N - 2)
        sol = _resolver(M, tiempo, brecha, verbose)
        if not sol.ok:
            return None, None, sol, 0
        succ = [None] * N
        for (i, j), k in pos.items():
            if sol.x[x[k]] > 0.5:
                succ[i] = j
        return succ, sol.obj, sol, 0
    t0 = time.time(); cortes = 0
    while True:
        sol = _resolver(M, tiempo - (time.time() - t0), brecha, verbose)
        if not sol.ok:
            return None, None, sol, cortes
        succ = [None] * N
        for (i, j), k in pos.items():
            if sol.x[x[k]] > 0.5:
                succ[i] = j
        ciclos = _ciclos(succ)
        if len(ciclos) == 1:
            sol.segundos = round(time.time() - t0, 3)
            return succ, sol.obj, sol, cortes
        if time.time() - t0 > tiempo:
            sol.estado = "límite de tiempo (la solución actual tiene subtours)"
            return None, None, sol, cortes
        for S in ciclos:
            Sset = set(S)
            interior = [x[pos[(i, j)]] for i in S for j in S if (i, j) in pos]
            frontera = [x[pos[(i, j)]] for i in S for j in range(N) if j not in Sset and (i, j) in pos]
            if len(interior) <= len(frontera):
                M.restr(interior, 1.0, hi=len(S) - 1)
            else:
                M.restr(frontera, 1.0, lo=1)
            cortes += 1


def tsp(red, origen=None, modo="ciclo", fin=None, metodo="dfj", tiempo=300, brecha=1e-6, verbose=False):
    """Viajante de comercio exacto (MILP).

    modo='ciclo'   sale de `origen`, visita todos una vez y regresa.
    modo='abierto' sale de `origen`, visita todos una vez y termina donde convenga (sin regresar).
    modo='fijo'    camino hamiltoniano de `origen` a `fin` (sin regresar).
    modo='libre'   camino hamiltoniano que empieza y termina en cualquier nodo.
    metodo='dfj'   restricciones de asignación + eliminación iterativa de subtours (rápido).
    metodo='mtz'   un solo MILP compacto con variables de orden (más lento, sin iteraciones).
    """
    n = red.n
    if n < 3:
        raise ValueError("El TSP necesita al menos 3 nodos.")
    s = 0 if origen is None else red.idx(origen)
    C = red.D
    if modo == "ciclo":
        E = C.copy()
    else:
        E = np.full((n + 1, n + 1), INF); E[:n, :n] = C
        d = n
        if modo == "abierto":
            E[:n, d] = 0; E[s, d] = INF; E[d, s] = 0
        elif modo == "fijo":
            if fin is None:
                raise ValueError("modo='fijo' requiere el parámetro fin.")
            t = red.idx(fin)
            E[t, d] = 0; E[d, s] = 0
        elif modo == "libre":
            E[:n, d] = 0; E[d, :n] = 0
        else:
            raise ValueError("modo debe ser ciclo, abierto, fijo o libre")
    succ, obj, sol, cortes = _tsp_nucleo(E, metodo, tiempo, brecha, verbose)
    if succ is None:
        return Resultado("TSP", sol.estado, None, red, segundos=sol.segundos, brecha=sol.brecha)
    if modo == "ciclo":
        ruta = [s]; u = succ[s]
        while u != s:
            ruta.append(u); u = succ[u]
        ruta.append(s)
    else:
        d = n
        u = succ[d] if modo == "libre" else s
        ruta = []
        while u != d:
            ruta.append(u); u = succ[u]
    etiquetas = [red.ids[u] for u in ruta]
    arcos = [(etiquetas[k], etiquetas[k + 1], float(red.D[ruta[k], ruta[k + 1]])) for k in range(len(ruta) - 1)]
    tabla = pd.DataFrame({"orden": range(len(etiquetas)), "nodo": etiquetas,
                          "nombre": [red.nombres[u] if red.nombres else "" for u in ruta],
                          "tramo_km": [0.0] + [a[2] for a in arcos]})
    tabla["acumulado"] = tabla["tramo_km"].cumsum()
    nombre = {"ciclo": "TSP (circuito)", "abierto": "TSP (camino abierto)",
              "fijo": f"TSP (camino de {origen} a {fin})", "libre": "TSP (camino libre)"}[modo]
    return Resultado(f"{nombre} - MILP {metodo.upper()}", sol.estado, float(sum(a[2] for a in arcos)), red,
                     rutas=[etiquetas], arcos=arcos, tablas={"ruta": tabla}, brecha=sol.brecha,
                     segundos=sol.segundos, cortes=cortes)


# ======================================================================================
# m-TSP / VRP / CVRP exactos (formulación con índice de vehículo)
# ======================================================================================
def vrp(red, vehiculos, deposito=None, clientes=None, demanda=None, capacidad=None, lmin=0, lmax=None,
        dist_max=None, objetivo="suma", abierto=False, usar_todos=True, costo_fijo=0.0, simetria=True,
        metodo=None, tiempo=600, brecha=1e-6, verbose=False, desempate=1e-3, problema="VRP", traza=False, formulacion=None):
    """Ruteo de varios vehículos exacto (MILP con índice de vehículo y cortes de subtours).

    deposito   etiqueta única o lista (un depósito por vehículo).
    demanda    por nodo (vector o dict {nodo: valor}); capacidad = Q por vehículo.
    lmin/lmax  mínimo/máximo de clientes por ruta (balance).
    dist_max   distancia máxima por ruta.
    objetivo   'suma' (distancia total) o 'maximo' (minimiza la ruta más larga).
    abierto    las rutas no regresan al depósito.
    usar_todos False permite dejar vehículos sin usar (con costo_fijo por vehículo usado).
    formulacion '2indices' (por defecto si objetivo='suma', un depósito y sin dist_max; más rápida) o 'vehiculos'
               (índice de vehículo; necesaria para objetivo='maximo', varios depósitos o dist_max).
    metodo     (solo 'vehiculos') 'cortes' (solo cortes de subtours), 'mtz' o 'ambos' (agrega variables de carga acumulada tipo
               Miller-Tucker-Zemlin). Por defecto 'ambos' si hay capacidad y 'cortes' en caso contrario.
    """
    n, m = red.n, int(vehiculos)
    if deposito is None:
        deposito = red.ids[0]
    deps = [red.idx(d) for d in (deposito if isinstance(deposito, (list, tuple)) else [deposito] * m)]
    deps = [deps[k % len(deps)] for k in range(m)]
    cl = [red.idx(c) for c in clientes] if clientes is not None else [i for i in range(n) if i not in set(deps)]
    nc = len(cl)
    lmax = nc if lmax is None else int(lmax)
    dem = np.zeros(n)
    if demanda is not None:
        if isinstance(demanda, dict):
            for k, v in demanda.items():
                dem[red.idx(k)] = v
        else:
            dem = np.array(demanda, float)
    elif red.demanda is not None and capacidad is not None:
        dem = red.demanda.copy()
    if capacidad is not None and np.any(dem[cl] > capacidad + 1e-9):
        return Resultado(problema, "infactible (un cliente excede la capacidad del vehículo)", None, red)
    if formulacion is None:
        formulacion = "2indices" if (objetivo == "suma" and len(set(deps)) == 1 and dist_max is None
                                     and capacidad is None) else "vehiculos"
    if formulacion == "2indices":
        if objetivo != "suma" or len(set(deps)) != 1 or dist_max is not None:
            raise ValueError("La formulación de 2 índices requiere objetivo='suma', un solo depósito y sin dist_max.")
        return _vrp_2indices(red, m, deps[0], cl, dem, capacidad, int(lmin), lmax, abierto, usar_todos, costo_fijo,
                             tiempo, brecha, verbose, problema, traza)
    M = Modelo()
    maxi = objetivo == "maximo"
    w = desempate if maxi else 1.0
    z = M.var(1.0, 0, INF, False) if maxi else None
    X, Y, V = [], [], []
    for k in range(m):
        h = deps[k]
        nodos = cl + [h]
        Ck = red.D.copy()
        if abierto:
            Ck[:, h] = np.where(np.isfinite(Ck[:, h]), 0.0, INF)
        xk = {}
        for i in nodos:
            for j in nodos:
                if i != j and np.isfinite(Ck[i, j]):
                    xk[(i, j)] = M.var(w * Ck[i, j], 0, 1, True)
        yk = {i: M.var(0, 0, 1, True) for i in cl}
        vk = M.var(costo_fijo if not usar_todos else 0.0, 1 if usar_todos else 0, 1, True)
        X.append((xk, Ck)); Y.append(yk); V.append(vk)
        M.restr([xk[(h, j)] for j in cl if (h, j) in xk] + [vk], [1.0] * sum((h, j) in xk for j in cl) + [-1.0], 0, 0)
        M.restr([xk[(i, h)] for i in cl if (i, h) in xk] + [vk], [1.0] * sum((i, h) in xk for i in cl) + [-1.0], 0, 0)
        for i in cl:
            a = [xk[(j, i)] for j in nodos if (j, i) in xk]
            b = [xk[(i, j)] for j in nodos if (i, j) in xk]
            M.restr(a + [yk[i]], [1.0] * len(a) + [-1.0], 0, 0)
            M.restr(b + [yk[i]], [1.0] * len(b) + [-1.0], 0, 0)
            M.restr([yk[i], vk], [1.0, -1.0], hi=0)
        for a_, i in enumerate(cl):                   # cortes de 2 nodos (subtours i↔j) desde el inicio
            for j in cl[a_ + 1:]:
                if (i, j) in xk and (j, i) in xk:
                    M.restr([xk[(i, j)], xk[(j, i)], yk[i]], [1.0, 1.0, -1.0], hi=0)
        M.restr([yk[i] for i in cl] + [vk], [1.0] * nc + [-float(lmin)], lo=0)
        M.restr([yk[i] for i in cl] + [vk], [1.0] * nc + [-float(lmax)], hi=0)
        if capacidad is not None:
            M.restr([yk[i] for i in cl], [dem[i] for i in cl], hi=capacidad)
        costos_k = [Ck[i, j] for (i, j) in xk]
        if dist_max is not None:
            M.restr(list(xk.values()), costos_k, hi=dist_max)
        if maxi:
            M.restr(list(xk.values()) + [z], costos_k + [-1.0], hi=0)
    for i in cl:
        M.restr([Y[k][i] for k in range(m)], 1.0, 1, 1)
    metodo = metodo or ("ambos" if capacidad is not None else "cortes")
    if metodo in ("mtz", "ambos"):
        Qm = float(capacidad) if capacidad is not None else float(lmax)
        q = dem if capacidad is not None else np.ones(n)
        u = {i: M.var(0, q[i], Qm, False) for i in cl}
        for i in cl:
            for j in cl:
                if i != j:
                    aij = [X[k][0][(i, j)] for k in range(m) if (i, j) in X[k][0]]
                    if aij:
                        M.restr([u[i], u[j]] + aij, [1.0, -1.0] + [Qm] * len(aij), hi=Qm - q[j])
    if simetria and len(set(deps)) == 1 and m > 1:
        orden = list(cl)
        for k in range(1, m):
            for pos_j, j in enumerate(orden):
                prev = [Y[k - 1][orden[l]] for l in range(pos_j)]
                M.restr([Y[k][j]] + prev, [1.0] + [-1.0] * len(prev), hi=0)
    t0 = time.time(); cortes = 0; gap_it = max(brecha, 0.05); valida = None   # primero iteraciones rápidas
    while True:
        sol = _resolver(M, tiempo - (time.time() - t0), gap_it, verbose)
        if traza:
            print(f"  it: gap={gap_it:g} estado={sol.estado[:8]} obj={sol.obj} t={time.time()-t0:.1f}s cortes={cortes}", flush=True)
        if not sol.ok:
            if valida is None:
                return Resultado(problema, sol.estado, None, red, segundos=round(time.time() - t0, 3))
            sol = valida
            sol.estado = "límite de tiempo (mejor solución encontrada, no probada óptima)"
            break
        subtours = []
        for k in range(m):
            xk, _ = X[k]
            succ = {i: j for (i, j), v in xk.items() if sol.x[v] > 0.5 and i != deps[k]}
            inicio = {j for (i, j), v in xk.items() if sol.x[v] > 0.5 and i == deps[k]}
            visto = set()
            for u in inicio:
                while u in succ and u not in visto:
                    visto.add(u); u = succ[u]
            for i in cl:
                if sol.x[Y[k][i]] > 0.5 and i not in visto and i in succ:
                    c, u = [], i
                    while u not in visto and u in succ:
                        visto.add(u); c.append(u); u = succ[u]
                    if c:
                        subtours.append(c)
        if not subtours:
            valida = sol
            if gap_it > brecha * 1.0001 and sol.estado == "óptimo" and tiempo - (time.time() - t0) > 2:
                gap_it = brecha          # ya sin subtours: resolver de nuevo con la brecha pedida
                continue
            break
        if time.time() - t0 > tiempo:
            return Resultado(problema, "límite de tiempo (solución con subtours)", None, red)
        for S in subtours:
            Sset = set(S)
            for k in range(m):
                xk, _ = X[k]
                inter = [xk[(i, j)] for i in S for j in S if (i, j) in xk]
                for h in {S[0], S[len(S) // 2]}:
                    M.restr(inter + [Y[k][i] for i in S if i != h], [1.0] * len(inter) + [-1.0] * (len(S) - 1), hi=0)
            cortes += 1
    rutas, filas = [], []
    for k in range(m):
        xk, Ck = X[k]; h = deps[k]
        succ = {i: j for (i, j), v in xk.items() if sol.x[v] > 0.5}
        if sol.x[V[k]] < 0.5:
            continue
        sec, u = [h], None
        for (i, j), v in xk.items():
            if i == h and sol.x[v] > 0.5:
                u = j
        while u is not None and u != h:
            sec.append(u); u = succ.get(u)
        if not abierto:
            sec.append(h)
        dist = float(sum(red.D[a, b] for a, b in zip(sec[:-1], sec[1:])))
        cl_k = [u for u in sec[1:] if u != h]
        rutas.append([red.ids[u] for u in sec])
        filas.append({"vehículo": k + 1, "ruta": " → ".join(str(red.ids[u]) for u in sec), "clientes": len(cl_k),
                      "carga": float(sum(dem[u] for u in cl_k)), "distancia": round(dist, 6)})
    tabla = pd.DataFrame(filas)
    total = float(tabla["distancia"].sum()) if len(tabla) else 0.0
    if maxi:
        obj = float(tabla["distancia"].max())
    else:
        obj = total + (costo_fijo * len(tabla) if not usar_todos else 0.0)
    msg = f"Distancia total = {total:.3f}" + (f"; ruta más larga = {tabla['distancia'].max():.3f}" if len(tabla) else "")
    return Resultado(problema, sol.estado, obj, red, rutas=rutas, tablas={"rutas": tabla}, brecha=sol.brecha,
                     segundos=round(time.time() - t0, 3), mensaje=msg, cortes=cortes, total=total)


def _vrp_2indices(red, m, h, cl, dem, capacidad, lmin, lmax, abierto, usar_todos, costo_fijo, tiempo, brecha,
                  verbose, problema, traza):
    """VRP de suma mínima con un solo depósito: formulación de dos índices x_ij (sin índice de vehículo),
    contadores de posición para el balance y la capacidad, y cortes de subtours (DFJ) por iteración."""
    n, nc = red.n, len(cl)
    nodos = cl + [h]
    C = red.D.copy()
    if abierto:
        C[:, h] = np.where(np.isfinite(C[:, h]), 0.0, INF)
    M = Modelo()
    x = {(i, j): M.var(C[i, j], 0, 1, True) for i in nodos for j in nodos if i != j and np.isfinite(C[i, j])}
    ent = {i: [] for i in nodos}; sal = {i: [] for i in nodos}
    for (i, j), v in x.items():
        sal[i].append(v); ent[j].append(v)
    for i in cl:
        M.restr(ent[i], 1.0, 1, 1); M.restr(sal[i], 1.0, 1, 1)
    vmin = m if usar_todos else 1
    M.restr(sal[h], 1.0, vmin, m); M.restr(ent[h], 1.0, vmin, m)
    if not usar_todos and costo_fijo:
        for v in sal[h]:
            M.c[v] += costo_fijo
    # contador exacto de clientes acumulados a lo largo de cada ruta (para lmin / lmax)
    sin_limites = lmin <= 1 and lmax >= nc
    cnt = {} if sin_limites else {i: M.var(0, 1, lmax, False) for i in cl}
    for i in ([] if sin_limites else cl):
        if (h, i) in x:
            M.restr([cnt[i], x[(h, i)]], [1.0, lmax - 1.0], hi=lmax)                  # sale del depósito: cnt_i = 1
        if lmin > 1 and (i, h) in x:
            M.restr([cnt[i], x[(i, h)]], [1.0, -float(lmin)], lo=0)                    # ruta que termina en i: cnt_i >= lmin
    for i in ([] if sin_limites else cl):
        for j in cl:
            if i != j and (i, j) in x:
                M.restr([cnt[j], cnt[i], x[(i, j)]], [1.0, -1.0, -float(lmax)], lo=1 - lmax)   # cnt_j >= cnt_i + 1
                if lmin > 1:
                    M.restr([cnt[j], cnt[i], x[(i, j)]], [1.0, -1.0, lmax - 2.0], hi=lmax - 1.0)  # cnt_j <= cnt_i + 1
    if capacidad is not None:  # (la capacidad se maneja con la formulación por vehículo; se deja por completitud)
        Q = float(capacidad)
        carga = {i: M.var(0, dem[i], Q, False) for i in cl}
        for i in cl:
            for j in cl:
                if i != j and (i, j) in x:
                    M.restr([carga[i], carga[j], x[(i, j)]], [1.0, -1.0, Q], hi=Q - dem[j])
    t0 = time.time(); cortes = 0; gap_it = max(brecha, 0.02); valida = None
    while True:
        sol = _resolver(M, tiempo - (time.time() - t0), gap_it, verbose)
        if traza:
            print(f"  it: gap={gap_it:g} estado={sol.estado[:8]} obj={sol.obj} t={time.time()-t0:.1f}s cortes={cortes}", flush=True)
        if not sol.ok:
            if valida is None:
                return Resultado(problema, sol.estado, None, red, segundos=round(time.time() - t0, 3))
            sol = valida
            sol.estado = "límite de tiempo (mejor solución encontrada, no probada óptima)"
            break
        succ = {}
        for (i, j), v in x.items():
            if sol.x[v] > 0.5 and i != h:
                succ[i] = j
        visto, inicios = set(), [j for (i, j), v in x.items() if i == h and sol.x[v] > 0.5]
        for u in inicios:
            while u != h and u not in visto:
                visto.add(u); u = succ.get(u, h)
        ciclos = []
        for i in cl:
            if i not in visto:
                c, u = [], i
                while u not in visto and u != h:
                    visto.add(u); c.append(u); u = succ[u]
                ciclos.append(c)
        if not ciclos:
            valida = sol
            if gap_it > brecha * 1.0001 and sol.estado == "óptimo" and tiempo - (time.time() - t0) > 2:
                gap_it = brecha
                continue
            break
        if time.time() - t0 > tiempo:
            return Resultado(problema, "límite de tiempo (solución con subtours)", None, red)
        for S in ciclos:
            M.restr([x[(i, j)] for i in S for j in S if (i, j) in x], 1.0, hi=len(S) - 1)
            cortes += 1
    rutas, filas = [], []
    for (i, j), v in x.items():
        if i == h and sol.x[v] > 0.5:
            sec, u = [h, j], j
            while True:
                nxt = next(b for (a, b), w in x.items() if a == u and sol.x[w] > 0.5)
                if nxt == h:
                    break
                sec.append(nxt); u = nxt
            if not abierto:
                sec.append(h)
            cl_k = [u for u in sec[1:] if u != h]
            dist = float(sum(red.D[a, b] for a, b in zip(sec[:-1], sec[1:])))
            rutas.append([red.ids[u] for u in sec])
            filas.append({"ruta": " → ".join(str(red.ids[u]) for u in sec), "clientes": len(cl_k),
                          "carga": float(sum(dem[u] for u in cl_k)), "distancia": round(dist, 6)})
    orden = sorted(range(len(filas)), key=lambda k: -filas[k]["clientes"])
    rutas = [rutas[k] for k in orden]; filas = [filas[k] for k in orden]
    for k, f in enumerate(filas):
        f["vehículo"] = k + 1
    tabla = pd.DataFrame(filas)[["vehículo", "ruta", "clientes", "carga", "distancia"]]
    total = float(tabla["distancia"].sum())
    obj = total + (costo_fijo * len(tabla) if not usar_todos else 0.0)
    msg = f"Distancia total = {total:.3f}; ruta más larga = {tabla['distancia'].max():.3f}"
    return Resultado(problema, sol.estado, obj, red, rutas=rutas, tablas={"rutas": tabla}, brecha=sol.brecha,
                     segundos=round(time.time() - t0, 3), mensaje=msg, cortes=cortes, total=total)


def mtsp(red, m, deposito=None, lmin=1, lmax=None, objetivo="suma", abierto=False, **kw):
    """m-TSP exacto: m viajantes salen del depósito, cada cliente se visita una vez."""
    return vrp(red, m, deposito, lmin=lmin, lmax=lmax, objetivo=objetivo, abierto=abierto,
               problema=f"m-TSP con m={m} (MILP)", **kw)


def cvrp(red, vehiculos, capacidad, demanda=None, deposito=None, **kw):
    """VRP con capacidad (CVRP) exacto."""
    return vrp(red, vehiculos, deposito, demanda=demanda, capacidad=capacidad, lmin=kw.pop("lmin", 0),
               problema="CVRP (MILP)", **kw)


# ======================================================================================
# Flujos, asignación, transporte
# ======================================================================================
def flujo_maximo(red, origen, destino, usar_costo_como_capacidad=False, tiempo=60):
    """Flujo máximo origen→destino (LP). Usa red.cap; si no existe y se indica, usa la matriz de costos."""
    cap = red.cap if red.cap is not None else (red.D if usar_costo_como_capacidad else None)
    if cap is None:
        raise ValueError("La red no tiene capacidades. Cargue una columna 'capacidad' o use usar_costo_como_capacidad=True.")
    s, t = red.idx(origen), red.idx(destino)
    arcs = [(i, j) for i in range(red.n) for j in range(red.n)
            if i != j and np.isfinite(red.D[i, j]) and np.isfinite(cap[i, j]) and cap[i, j] > 0]
    M = Modelo()
    f = [M.var(0, 0, cap[i, j], False) for i, j in arcs]
    val = M.var(-1.0, 0, INF, False)
    for u in range(red.n):
        sal = [f[a] for a, (i, j) in enumerate(arcs) if i == u]
        ent = [f[a] for a, (i, j) in enumerate(arcs) if j == u]
        idx = sal + ent; co = [1.0] * len(sal) + [-1.0] * len(ent)
        if u == s:
            M.restr(idx + [val], co + [-1.0], 0, 0)
        elif u == t:
            M.restr(idx + [val], co + [1.0], 0, 0)
        elif idx:
            M.restr(idx, co, 0, 0)
    sol = _resolver(M, tiempo, 1e-9)
    if not sol.ok:
        return _fallo("Flujo máximo", sol, red)
    lista = [(red.ids[i], red.ids[j], round(float(sol.x[f[a]]), 6), float(cap[i, j]))
             for a, (i, j) in enumerate(arcs) if sol.x[f[a]] > 1e-9]
    return Resultado("Flujo máximo (LP)", sol.estado, float(sol.x[val]), red, arcos=lista,
                     tablas={"flujo_por_arco": pd.DataFrame(lista, columns=["desde", "hasta", "flujo", "capacidad"])},
                     segundos=sol.segundos)


def flujo_costo_minimo(red, oferta, tiempo=60):
    """Flujo de costo mínimo. oferta: {nodo: +b (origen) / -b (destino)}; capacidades en red.cap (opcional)."""
    b = np.zeros(red.n)
    for k, v in oferta.items():
        b[red.idx(k)] = v
    if abs(b.sum()) > 1e-9:
        return Resultado("Flujo de costo mínimo", "infactible (la oferta total debe igualar la demanda total)", None, red)
    arcs = red.arcos()
    M = Modelo()
    f = [M.var(c, 0, (red.cap[i, j] if red.cap is not None and np.isfinite(red.cap[i, j]) else INF), False)
         for i, j, c in arcs]
    for u in range(red.n):
        sal = [f[a] for a, (i, j, _) in enumerate(arcs) if i == u]
        ent = [f[a] for a, (i, j, _) in enumerate(arcs) if j == u]
        M.restr(sal + ent, [1.0] * len(sal) + [-1.0] * len(ent), b[u], b[u])
    sol = _resolver(M, tiempo, 1e-9)
    if not sol.ok:
        return _fallo("Flujo de costo mínimo", sol, red)
    lista = [(red.ids[i], red.ids[j], round(float(sol.x[f[a]]), 6), c)
             for a, (i, j, c) in enumerate(arcs) if sol.x[f[a]] > 1e-9]
    return Resultado("Flujo de costo mínimo (LP)", sol.estado, float(sol.obj), red, arcos=lista,
                     tablas={"flujo_por_arco": pd.DataFrame(lista, columns=["desde", "hasta", "flujo", "costo_unitario"])},
                     segundos=sol.segundos)


def asignacion(C, maximizar=False, filas=None, columnas=None, tiempo=60):
    """Problema de asignación (MILP binario). C: matriz o DataFrame (filas = agentes, columnas = tareas)."""
    C = pd.DataFrame(C) if not isinstance(C, pd.DataFrame) else C
    A = C.to_numpy(float)
    m, n = A.shape
    M = Modelo()
    x = [[M.var(-A[i, j] if maximizar else A[i, j], 0, 1, True) for j in range(n)] for i in range(m)]
    for i in range(m):
        M.restr(x[i], 1.0, 1 if m <= n else 0, 1)
    for j in range(n):
        M.restr([x[i][j] for i in range(m)], 1.0, 1 if n <= m else 0, 1)
    sol = _resolver(M, tiempo, 1e-9)
    if not sol.ok:
        return _fallo("Asignación", sol)
    par = [(C.index[i], C.columns[j], float(A[i, j])) for i in range(m) for j in range(n) if sol.x[x[i][j]] > 0.5]
    total = sum(p[2] for p in par)
    return Resultado("Asignación (MILP)", sol.estado, total, None, arcos=par,
                     tablas={"asignacion": pd.DataFrame(par, columns=["agente", "tarea", "costo"])}, segundos=sol.segundos)


def transporte(C, oferta, demanda, tiempo=60):
    """Problema de transporte (LP). C: DataFrame/matriz orígenes×destinos; oferta y demanda: vectores."""
    C = pd.DataFrame(C) if not isinstance(C, pd.DataFrame) else C
    A = C.to_numpy(float); m, n = A.shape
    oferta, demanda = np.array(oferta, float), np.array(demanda, float)
    M = Modelo()
    x = [[M.var(A[i, j], 0, INF, False) if np.isfinite(A[i, j]) else None for j in range(n)] for i in range(m)]
    exceso = oferta.sum() >= demanda.sum()
    for i in range(m):
        v = [x[i][j] for j in range(n) if x[i][j] is not None]
        M.restr(v, 1.0, 0 if exceso else oferta[i], oferta[i])
    for j in range(n):
        v = [x[i][j] for i in range(m) if x[i][j] is not None]
        M.restr(v, 1.0, demanda[j] if exceso else 0, demanda[j])
    sol = _resolver(M, tiempo, 1e-9)
    if not sol.ok:
        return _fallo("Transporte", sol)
    env = [(C.index[i], C.columns[j], round(float(sol.x[x[i][j]]), 6), float(A[i, j]))
           for i in range(m) for j in range(n) if x[i][j] is not None and sol.x[x[i][j]] > 1e-9]
    return Resultado("Transporte (LP)", sol.estado, float(sol.obj), None, arcos=env,
                     tablas={"envios": pd.DataFrame(env, columns=["origen", "destino", "cantidad", "costo_unitario"])},
                     segundos=sol.segundos)


def cartero_chino(red, tiempo=120):
    """Problema del cartero chino: recorrido cerrado de costo mínimo que cubre todas las aristas/arcos
    (MILP de multiplicidades; la red debe ser conexa). Devuelve cuántas veces se recorre cada arista."""
    n = red.n
    M = Modelo()
    if red.dirigido:
        arcs = red.arcos()
        x = [M.var(c, 1, INF, True) for _, _, c in arcs]
        for u in range(n):
            sal = [x[a] for a, (i, j, _) in enumerate(arcs) if i == u]
            ent = [x[a] for a, (i, j, _) in enumerate(arcs) if j == u]
            M.restr(sal + ent, [1.0] * len(sal) + [-1.0] * len(ent), 0, 0)
    else:
        arcs = [(i, j, red.D[i, j]) for i in range(n) for j in range(i + 1, n) if np.isfinite(red.D[i, j])]
        x = [M.var(c, 1, INF, True) for _, _, c in arcs]
        z = [M.var(0, 0, INF, True) for _ in range(n)]
        for u in range(n):
            inc = [x[a] for a, (i, j, _) in enumerate(arcs) if u in (i, j)]
            M.restr(inc + [z[u]], [1.0] * len(inc) + [-2.0], 0, 0)
    sol = _resolver(M, tiempo, 1e-9)
    if not sol.ok:
        return _fallo("Cartero chino", sol, red)
    filas = [(red.ids[i], red.ids[j], c, int(round(sol.x[x[a]]))) for a, (i, j, c) in enumerate(arcs)]
    tab = pd.DataFrame(filas, columns=["desde", "hasta", "costo", "veces"])
    base = float(sum(c for _, _, c, _ in filas))
    return Resultado("Cartero chino (MILP)", sol.estado, float(sol.obj), red, arcos=filas, tablas={"aristas": tab},
                     segundos=sol.segundos, mensaje=f"Costo de las aristas = {base:.3f}; recorrido repetido = {sol.obj - base:.3f}")


# ======================================================================================
# Localización
# ======================================================================================
def _distancias(red, usar_caminos):
    """Distancias entre todos los pares: por caminos mínimos (LP) o la matriz tal cual."""
    if usar_caminos:
        return todos_los_caminos(red).extra["dist"]
    Dm = red.D.copy(); np.fill_diagonal(Dm, 0)
    return Dm


def p_mediana(red, p, pesos=None, usar_caminos=True, candidatos=None, tiempo=120):
    """p-mediana: abrir p instalaciones minimizando la distancia ponderada total (MILP)."""
    Dm = _distancias(red, usar_caminos)
    n = red.n
    w = np.ones(n) if pesos is None else np.array(pesos, float)
    cand = list(range(n)) if candidatos is None else [red.idx(c) for c in candidatos]
    M = Modelo()
    y = {j: M.var(0, 0, 1, True) for j in cand}
    x = {(i, j): M.var(w[i] * Dm[i, j], 0, 1, False) for i in range(n) for j in cand if np.isfinite(Dm[i, j])}
    for i in range(n):
        M.restr([x[(i, j)] for j in cand if (i, j) in x], 1.0, 1, 1)
    for (i, j), v in x.items():
        M.restr([v, y[j]], [1.0, -1.0], hi=0)
    M.restr(list(y.values()), 1.0, p, p)
    sol = _resolver(M, tiempo, 1e-9)
    if not sol.ok:
        return _fallo("p-mediana", sol, red)
    abiertas = [red.ids[j] for j in cand if sol.x[y[j]] > 0.5]
    asig = pd.DataFrame([{"cliente": red.ids[i], "instalación": red.ids[j], "distancia": float(Dm[i, j])}
                         for (i, j), v in x.items() if sol.x[v] > 0.5])
    return Resultado("p-mediana (MILP)", sol.estado, float(sol.obj), red, tablas={"asignacion": asig},
                     segundos=sol.segundos, mensaje=f"Instalaciones abiertas: {abiertas}", abiertas=abiertas)


def p_centro(red, p, usar_caminos=True, candidatos=None, tiempo=120):
    """p-centro: abrir p instalaciones minimizando la mayor distancia cliente-instalación (MILP)."""
    Dm = _distancias(red, usar_caminos)
    n = red.n
    cand = list(range(n)) if candidatos is None else [red.idx(c) for c in candidatos]
    M = Modelo()
    y = {j: M.var(0, 0, 1, True) for j in cand}
    z = M.var(1.0, 0, INF, False)
    x = {(i, j): M.var(0, 0, 1, False) for i in range(n) for j in cand if np.isfinite(Dm[i, j])}
    for i in range(n):
        M.restr([x[(i, j)] for j in cand if (i, j) in x], 1.0, 1, 1)
        M.restr([x[(i, j)] for j in cand if (i, j) in x] + [z],
                [Dm[i, j] for j in cand if (i, j) in x] + [-1.0], hi=0)
    for (i, j), v in x.items():
        M.restr([v, y[j]], [1.0, -1.0], hi=0)
    M.restr(list(y.values()), 1.0, p, p)
    sol = _resolver(M, tiempo, 1e-9)
    if not sol.ok:
        return _fallo("p-centro", sol, red)
    abiertas = [red.ids[j] for j in cand if sol.x[y[j]] > 0.5]
    asig = pd.DataFrame([{"cliente": red.ids[i], "instalación": red.ids[j], "distancia": float(Dm[i, j])}
                         for (i, j), v in x.items() if sol.x[v] > 0.5])
    return Resultado("p-centro (MILP)", sol.estado, float(sol.x[z]), red, tablas={"asignacion": asig},
                     segundos=sol.segundos, mensaje=f"Instalaciones abiertas: {abiertas}", abiertas=abiertas)


def cobertura(red, radio, usar_caminos=True, tiempo=120):
    """Cobertura de conjuntos: mínimo de instalaciones para que todo nodo esté a distancia <= radio."""
    Dm = _distancias(red, usar_caminos)
    n = red.n
    M = Modelo()
    y = [M.var(1.0, 0, 1, True) for _ in range(n)]
    for i in range(n):
        M.restr([y[j] for j in range(n) if Dm[i, j] <= radio + 1e-12], 1.0, lo=1)
    sol = _resolver(M, tiempo, 1e-9)
    if not sol.ok:
        return _fallo("Cobertura", sol, red)
    abiertas = [red.ids[j] for j in range(n) if sol.x[y[j]] > 0.5]
    return Resultado("Cobertura de conjuntos (MILP)", sol.estado, float(len(abiertas)), red, segundos=sol.segundos,
                     mensaje=f"Instalaciones: {abiertas}", abiertas=abiertas)


# ======================================================================================
# Gráficos
# ======================================================================================
def dibujar(red, res=None, ax=None, titulo=None, etiquetas=True, tam=60):
    """Dibuja la red (con coordenadas o en círculo) y las rutas/arcos del resultado."""
    import matplotlib.pyplot as plt
    if ax is None:
        _, ax = plt.subplots(figsize=(8, 7))
    n = red.n
    if red.coords is not None:
        P = np.c_[red.coords[:, 1], red.coords[:, 0]]
        ax.set_xlabel("longitud"); ax.set_ylabel("latitud")
    else:
        ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
        P = np.c_[np.cos(ang), np.sin(ang)]
        ax.set_aspect("equal"); ax.axis("off")
    pos = {red.ids[i]: P[i] for i in range(n)}
    ax.scatter(P[:, 0], P[:, 1], s=tam, c="#444", zorder=3)
    if etiquetas:
        for i in range(n):
            ax.annotate(str(red.ids[i]), P[i], textcoords="offset points", xytext=(4, 4), fontsize=8)
    colores = ["#d62728", "#1f77b4", "#2ca02c", "#9467bd", "#ff7f0e", "#8c564b", "#e377c2", "#17becf"]
    if res is not None and res.rutas:
        for k, ruta in enumerate(res.rutas):
            col = colores[k % len(colores)]
            for a, b in zip(ruta[:-1], ruta[1:]):
                ax.annotate("", pos[b], pos[a], arrowprops=dict(arrowstyle="->", color=col, lw=1.6), zorder=2)
    elif res is not None and res.arcos:
        for e in res.arcos:
            a, b = e[0], e[1]
            if a in pos and b in pos:
                ax.annotate("", pos[b], pos[a], arrowprops=dict(arrowstyle="->" if red.dirigido else "-",
                                                                color="#d62728", lw=1.6), zorder=2)
    ax.set_title(titulo or (res.problema if res is not None else red.titulo), fontsize=10)
    return ax


# ======================================================================================
# Despachador (lo usa el panel del cuaderno)
# ======================================================================================
PROBLEMAS = {
    "Camino mínimo (origen→destino)": lambda red, p: camino_minimo(red, p["origen"], p["destino"], p.get("evitar", ())),
    "Caminos mínimos desde un origen (a todos)": lambda red, p: camino_minimo(red, p["origen"], None, p.get("evitar", ())),
    "Todos los caminos mínimos (todos los pares)": lambda red, p: todos_los_caminos(red),
    "Árbol de valor mínimo": lambda red, p: arbol_minimo(red, p.get("raiz"), p["tiempo"]),
    "TSP (circuito)": lambda red, p: tsp(red, p.get("origen"), "ciclo", None, p["metodo"], p["tiempo"]),
    "TSP (camino abierto desde origen)": lambda red, p: tsp(red, p.get("origen"), "abierto", None, p["metodo"], p["tiempo"]),
    "TSP (camino de origen a destino)": lambda red, p: tsp(red, p.get("origen"), "fijo", p["destino"], p["metodo"], p["tiempo"]),
    "TSP (camino abierto libre)": lambda red, p: tsp(red, None, "libre", None, p["metodo"], p["tiempo"]),
    "m-TSP": lambda red, p: mtsp(red, p["m"], p.get("origen"), p["lmin"], p["lmax"], p["objetivo"], p["abierto"],
                                 tiempo=p["tiempo"]),
    "CVRP (con capacidad)": lambda red, p: cvrp(red, p["m"], p["capacidad"], None, p.get("origen"), tiempo=p["tiempo"]),
    "Flujo máximo": lambda red, p: flujo_maximo(red, p["origen"], p["destino"], True),
    "Cartero chino": lambda red, p: cartero_chino(red, p["tiempo"]),
    "p-mediana": lambda red, p: p_mediana(red, p["p"], tiempo=p["tiempo"]),
    "p-centro": lambda red, p: p_centro(red, p["p"], tiempo=p["tiempo"]),
}


def resolver(problema, red, **params):
    params.setdefault("tiempo", 300); params.setdefault("metodo", "dfj")
    params.setdefault("lmin", 1); params.setdefault("lmax", None); params.setdefault("objetivo", "suma")
    params.setdefault("abierto", False); params.setdefault("m", 2)
    if problema not in PROBLEMAS:
        raise KeyError(f"Problema desconocido. Opciones: {list(PROBLEMAS)}")
    return PROBLEMAS[problema](red, params)


# ======================================================================================
# Ejemplos incluidos
# ======================================================================================
def ejemplo(nombre):
    """Redes de ejemplo con coordenadas: 'cali' (CD + 25 tiendas ARA, km por carretera) y
    'china' (Top 25 ciudades, km por carretera)."""
    import os
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datos")
    nombre = nombre.lower()
    if nombre == "cali":
        red = cargar(os.path.join(base, "distancias_cali_km.csv"), titulo="Cali ARA (km por carretera)")
        t = pd.read_csv(os.path.join(base, "tiendas_cali.csv"))
        red.coords = t[["latitud", "longitud"]].to_numpy(float)
        red.nombres = list(t["nombre"])
        return red
    if nombre == "china":
        red = cargar(os.path.join(base, "ciudades_china_km.csv"), titulo="China Top 25 (km por carretera)")
        t = pd.read_csv(os.path.join(base, "ciudades_china.csv"))
        red.coords = t[["lat", "lon"]].to_numpy(float)
        red.nombres = list(t["nombre"])
        red.ids = list(t["id"])
        return red
    raise KeyError("Ejemplos disponibles: 'cali', 'china'")
