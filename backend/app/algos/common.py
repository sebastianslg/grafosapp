"""Utilidades comunes: contexto de ejecución, resultado estándar, rutas con detalle por tramo."""
from __future__ import annotations
import time as _time
import networkx as nx
from ..graphs import build_nx, CRITERIA, GraphError
from ..model import node_label


class AlgoError(ValueError):
    """Error de usuario con mensaje claro en español."""


class Cancelled(Exception):
    pass


class Ctx:
    """Contexto de ejecución: proyecto, parámetros, progreso y cancelación."""

    def __init__(self, project: dict, params: dict | None = None, progress=None, cancel=None):
        self.p = project
        self.params = params or {}
        self._progress = progress
        self._cancel = cancel
        self.ids = [n["id"] for n in project["nodes"]]
        self.idset = set(self.ids)
        self.seed = int(self.params.get("seed", 42))
        self.time_limit = int(self.params.get("time_limit", 10))
        self.criterion = self.params.get("criterion", "cost")

    def progress(self, frac: float, msg: str = ""):
        if self._cancel and self._cancel():
            raise Cancelled()
        if self._progress:
            self._progress(min(1.0, max(0.0, frac)), msg)

    def label(self, nid):
        return node_label(self.p, nid)

    def node(self, key: str, required=True):
        v = self.params.get(key)
        if v in (None, ""):
            if required:
                raise AlgoError(f"Falta el parámetro '{key}' (nodo). Seleccione un nodo (clic izquierdo = origen, derecho = destino).")
            return None
        v = str(v)
        if v not in self.idset:
            alt = [i for i in self.ids if self.p["nodes"][self.ids.index(i)].get("name") == v]
            if alt:
                return alt[0]
            raise AlgoError(f"El nodo '{v}' no existe en el proyecto.")
        return v

    def graph(self, criterion=None, **kw) -> nx.DiGraph:
        try:
            return build_nx(self.p, criterion or self.criterion,
                            closed_nodes=self.params.get("closed_nodes", []),
                            closed_edges=self.params.get("closed_edges", []), **kw)
        except GraphError as e:
            raise AlgoError(str(e))

    def selection(self, key="nodes"):
        s = self.params.get(key)
        if not s:
            return None
        return [str(x) for x in s if str(x) in self.idset]

    @property
    def scale(self):
        return self.p["params"].get("scale", 1) or 1


def fmt(x, nd=2):
    if x is None:
        return "—"
    if isinstance(x, float):
        if abs(x - round(x)) < 1e-9:
            return f"{int(round(x))}"
        return f"{x:.{nd}f}"
    return str(x)


def new_result(key: str, title: str, status: str = "optimal", unit: str = "") -> dict:
    return {"algorithm": key, "title": title, "status": status, "value": None, "unit": unit,
            "paths": [], "steps": [], "tables": [], "matrix": None, "control": [], "meta": {},
            "assumptions": [], "highlight_nodes": [], "highlight_edges": [], "message": ""}


def step(res: dict, text: str, nodes=(), edges=(), state="info", data=None):
    res["steps"].append({"i": len(res["steps"]) + 1, "text": text, "nodes": list(nodes),
                         "edges": [list(e) for e in edges], "state": state, "data": data or {}})


def path_detail(g: nx.DiGraph, ctx: Ctx, path: list[str], target_alt=True) -> list[dict]:
    """Tramos con distancia, tiempo, costo, acumulado y la mejor alternativa descartada desde cada nodo."""
    out, acc = [], 0.0
    tgt = path[-1]
    for u, v in zip(path[:-1], path[1:]):
        a = g[u][v]
        acc += a["w"]
        alt = None
        if target_alt:
            h = g.copy()
            h.remove_edge(u, v)
            try:
                c, pth = nx.single_source_dijkstra(h, u, tgt, weight="w")
                alt = {"path": pth, "cost": c}
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                alt = None
        out.append({"from": u, "to": v, "distance": a.get("distance"), "time": a.get("time"),
                    "cost": a.get("cost"), "w": a["w"], "acc": acc,
                    "alternative": alt, "alt_delta": (alt["cost"] - (sum(g[x][y]["w"] for x, y in zip(path[path.index(u):-1], path[path.index(u) + 1:])))) if alt else None})
    return out


def path_cost(g, path):
    return sum(g[u][v]["w"] for u, v in zip(path[:-1], path[1:]))


def path_totals(g, path):
    t = {"w": 0.0, "distance": 0.0, "time": 0.0, "cost": 0.0, "emissions": 0.0}
    for u, v in zip(path[:-1], path[1:]):
        a = g[u][v]
        t["w"] += a["w"]
        for k in ("distance", "time", "cost", "emissions"):
            t[k] += a.get(k) or 0.0
    return t


def add_path(res: dict, g, ctx: Ctx, path, label="", detail=True, **extra):
    totals = path_totals(g, path)
    entry = {"label": label, "nodes": list(path), "cost": totals["w"], "totals": totals, **extra}
    if detail and len(path) <= 60:
        entry["hops"] = path_detail(g, ctx, path)
    res["paths"].append(entry)
    for u, v in zip(path[:-1], path[1:]):
        res["highlight_edges"].append([u, v, label or "ruta"])
    res["highlight_nodes"].extend(path)
    return entry


def scaled(ctx: Ctx, x):
    return None if x is None else int(round(x * ctx.scale))


def matrix_result(ctx: Ctx, ids, M, title=""):
    return {"labels": [ctx.label(i) for i in ids], "ids": list(ids),
            "values": [[None if (v is None or v == float("inf")) else round(float(v), 6) for v in row] for row in M],
            "title": title}


def undirected_required(ctx, g):
    from ..graphs import undirected_view
    return undirected_view(g)
