"""Construcción de grafos NetworkX a partir del proyecto canónico, generación de aristas y layouts."""
from __future__ import annotations
import math
import networkx as nx
import numpy as np
from .model import haversine, node_index, has_coords, has_xy

CRITERIA = {"cost": "Costo", "distance": "Distancia (km)", "time": "Tiempo (min)",
            "emissions": "Emisiones", "hops": "Número de arcos"}


class GraphError(ValueError):
    pass


def edge_values(p: dict, e: dict, nodes_by_id: dict) -> dict:
    """Completa distancia/tiempo/costo/emisiones de una arista con las fórmulas del modelo común."""
    pr = p["params"]
    d, t, c, em = e.get("distance"), e.get("time"), e.get("cost"), e.get("emissions")
    if d is None:
        a, b = nodes_by_id.get(e["source"]), nodes_by_id.get(e["target"])
        if a and b and a.get("lat") is not None and b.get("lat") is not None:
            d = haversine(a["lat"], a["lon"], b["lat"], b["lon"]) * pr.get("road_factor", 1.0)
    speed = pr.get("speed") or 40.0
    if t is None and d is not None:
        t = 60.0 * d / speed
    if c is None:
        if d is not None:
            c = pr.get("c_km", 1.0) * d + pr.get("c_hora", 0.0) * (t or 0.0) / 60.0
    if em is None and d is not None:
        em = pr.get("e_km", 0.0) * d
    return {"distance": d, "time": t, "cost": c, "emissions": em}


def _w(vals: dict, criterion: str):
    if criterion == "hops":
        return 1.0
    v = vals.get(criterion)
    if v is None and criterion != "cost":
        v = vals.get("cost")
    return v


def build_nx(p: dict, criterion: str = "cost", closed_nodes=(), closed_edges=(),
             force_undirected: bool = False, force_directed: bool = False,
             overrides: dict | None = None) -> nx.DiGraph:
    """DiGraph con atributos w (peso del criterio), distance, time, cost, emissions, capacity.

    Una arista no dirigida se materializa como dos arcos (igual que Grafos v.1.3.5).
    closed_edges: lista de pares [u,v]; se cierran ambos sentidos.
    """
    if criterion not in CRITERIA:
        raise GraphError(f"Criterio desconocido: {criterion}")
    closed_nodes = set(map(str, closed_nodes or ()))
    ce = set()
    for u, v in (closed_edges or ()):
        ce.add((str(u), str(v)))
        ce.add((str(v), str(u)))
    by_id = {n["id"]: n for n in p["nodes"]}
    g = nx.DiGraph()
    for n in p["nodes"]:
        if n["id"] not in closed_nodes:
            g.add_node(n["id"], **{k: v for k, v in n.items() if k != "id"})
    pr_default_dir = p["params"].get("directed_default", False)
    for e in p["edges"]:
        u, v = e["source"], e["target"]
        if u in closed_nodes or v in closed_nodes or u not in by_id or v not in by_id:
            continue
        vals = edge_values(p, e, by_id)
        w = _w(vals, criterion)
        if w is None:
            raise GraphError(f"La arista {u}-{v} no tiene valor para el criterio '{criterion}' "
                             "y no se puede derivar (faltan distancia o coordenadas).")
        directed = e.get("directed")
        if directed is None:
            directed = pr_default_dir
        if force_undirected:
            directed = False
        if force_directed:
            directed = True
        arcs = [(u, v)] if directed else [(u, v), (v, u)]
        for a, b in arcs:
            if (a, b) in ce:
                continue
            if a == b:
                continue
            attrs = dict(w=w, distance=vals["distance"], time=vals["time"], cost=vals["cost"],
                         emissions=vals["emissions"], capacity=e.get("capacity"),
                         directed=bool(directed))
            if g.has_edge(a, b) and g[a][b]["w"] <= w:
                continue
            g.add_edge(a, b, **attrs)
    if overrides:
        for (a, b), val in overrides.items():
            if g.has_edge(a, b):
                g[a][b]["w"] = val
    return g


def undirected_view(g: nx.DiGraph) -> nx.Graph:
    """Grafo no dirigido (mínimo de los dos sentidos)."""
    h = nx.Graph()
    h.add_nodes_from(g.nodes(data=True))
    for u, v, d in g.edges(data=True):
        if h.has_edge(u, v):
            if d["w"] < h[u][v]["w"]:
                h[u][v].update(d)
        else:
            h.add_edge(u, v, **d)
    return h


def scaled_int(x: float, scale: float) -> int:
    return int(round(x * scale))


def generate_edges(p: dict, method: str = "knn", k: int = 4, threshold: float | None = None,
                   directed: bool = False, replace: bool = True) -> int:
    """Genera aristas desde coordenadas. method: knn | threshold | delaunay | complete."""
    if not has_coords(p):
        raise GraphError("Para generar aristas se requieren lat/lon en todos los nodos.")
    ns = p["nodes"]
    n = len(ns)
    if n < 2:
        raise GraphError("Se necesitan al menos 2 nodos.")
    rf = p["params"].get("road_factor", 1.0)
    D = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            D[i, j] = D[j, i] = haversine(ns[i]["lat"], ns[i]["lon"], ns[j]["lat"], ns[j]["lon"]) * rf
    pairs: set[tuple[int, int]] = set()
    if method == "knn":
        kk = min(k, n - 1)
        for i in range(n):
            order = [j for j in np.argsort(D[i]) if j != i][:kk]
            for j in order:
                pairs.add((i, int(j)) if directed else (min(i, j), max(i, int(j))))
    elif method == "threshold":
        if threshold is None:
            raise GraphError("Indique el umbral de distancia (km).")
        for i in range(n):
            for j in range(i + 1, n):
                if D[i, j] <= threshold:
                    pairs.add((i, j))
    elif method == "delaunay":
        from scipy.spatial import Delaunay
        if n < 3:
            raise GraphError("Delaunay requiere al menos 3 nodos.")
        pts = np.array([[x["lon"], x["lat"]] for x in ns])
        for s in Delaunay(pts).simplices:
            for a, b in ((0, 1), (1, 2), (0, 2)):
                i, j = int(s[a]), int(s[b])
                pairs.add((min(i, j), max(i, j)))
    elif method == "complete":
        pairs = {(i, j) for i in range(n) for j in range(i + 1, n)}
    else:
        raise GraphError(f"Método desconocido: {method}")
    edges = [] if replace else list(p["edges"])
    existing = {(e["source"], e["target"]) for e in edges}
    for i, j in sorted(pairs):
        a, b = ns[i]["id"], ns[j]["id"]
        if (a, b) in existing or (not directed and (b, a) in existing):
            continue
        edges.append({"source": a, "target": b, "distance": round(float(D[i, j]), 6), "time": None,
                      "cost": None, "capacity": None, "directed": directed, "emissions": None})
    p["edges"] = edges
    p["meta"].setdefault("generated", []).append({"method": method, "k": k, "threshold": threshold,
                                                  "directed": directed, "road_factor": rf})
    return len(pairs)


def auto_layout(p: dict, seed: int = 7) -> None:
    """Asigna x,y (px) a los nodos que no los tengan: proyección de coordenadas o MDS/fuerza."""
    ns = p["nodes"]
    if not ns:
        return
    if has_xy(p):
        return
    if has_coords(p):
        lat0 = np.mean([n["lat"] for n in ns])
        xs = [n["lon"] * math.cos(math.radians(lat0)) for n in ns]
        ys = [-n["lat"] for n in ns]
        mnx, mxx, mny, mxy = min(xs), max(xs), min(ys), max(ys)
        sx = 900 / (mxx - mnx or 1)
        sy = 600 / (mxy - mny or 1)
        s = min(sx, sy)
        for n, x, y in zip(ns, xs, ys):
            n["x"], n["y"] = round((x - mnx) * s + 40, 1), round((y - mny) * s + 40, 1)
        return
    g = nx.Graph()
    g.add_nodes_from(n["id"] for n in ns)
    for e in p["edges"]:
        if e["source"] in g and e["target"] in g:
            g.add_edge(e["source"], e["target"], w=e.get("distance") or e.get("cost") or 1.0)
    if len(ns) > 2 and nx.is_connected(g):
        try:
            sp = dict(nx.all_pairs_dijkstra_path_length(g, weight="w"))
            ids = [n["id"] for n in ns]
            D = np.array([[sp[a][b] for b in ids] for a in ids])
            import warnings
            warnings.filterwarnings("ignore")
            from sklearn.manifold import MDS  # type: ignore
            pos = MDS(n_components=2, dissimilarity="precomputed", random_state=seed).fit_transform(D)
            pos = {a: pos[i] for i, a in enumerate(ids)}
        except Exception:
            pos = nx.spring_layout(g, seed=seed, weight=None)
    else:
        pos = nx.spring_layout(g, seed=seed)
    arr = np.array(list(pos.values()))
    mn, mx = arr.min(0), arr.max(0)
    span = np.where(mx - mn == 0, 1, mx - mn)
    for n in ns:
        q = (np.array(pos[n["id"]]) - mn) / span
        n["x"], n["y"] = round(float(q[0]) * 880 + 40, 1), round(float(q[1]) * 580 + 40, 1)


def separate_xy(p: dict, min_dist: float = 10.0, iters: int = 200) -> None:
    """Separa nodos amontonados para que no queden a menos de min_dist px (Grafos exige ≥10 px)."""
    ns = p["nodes"]
    pts = np.array([[n["x"], n["y"]] for n in ns], float)
    for _ in range(iters):
        moved = False
        for i in range(len(pts)):
            for j in range(i + 1, len(pts)):
                d = pts[i] - pts[j]
                dist = float(np.hypot(*d))
                if dist < min_dist:
                    moved = True
                    if dist == 0:
                        d, dist = np.array([1.0, 0.3]), 1.0
                    push = (min_dist - dist) / 2 + 0.5
                    pts[i] += d / dist * push
                    pts[j] -= d / dist * push
        if not moved:
            break
    for n, q in zip(ns, pts):
        n["x"], n["y"] = round(float(q[0]), 1), round(float(q[1]), 1)
