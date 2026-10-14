"""Esquema canónico del proyecto (nodos, aristas, vehículos, parámetros)."""
from __future__ import annotations
import math
from typing import Any

NODE_FIELDS = ["id", "name", "lat", "lon", "x", "y", "demand", "supply", "type",
               "tw_start", "tw_end", "service", "capacity", "frequency"]
EDGE_FIELDS = ["source", "target", "distance", "time", "cost", "capacity",
               "directed", "emissions"]
VEHICLE_FIELDS = ["type", "capacity", "fixed_cost", "cost_per_km", "speed",
                  "range", "count", "emissions_per_km", "depot"]

DEFAULT_PARAMS = {
    "c_km": 1.0,            # costo por km
    "c_hora": 0.0,          # costo por hora
    "speed": 40.0,          # km/h
    "e_km": 0.0,            # emisiones por km
    "road_factor": 1.0,     # factor vial sobre Haversine
    "scale": 1,             # factor de escala para exportar enteros
    "depots": [],           # ids de depósitos
    "directed_default": False,
}
EARTH_R = 6371.0088


def haversine(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(a))


def num(v, default=None):
    """Convierte a float tolerando '#', vacíos, comas decimales y NaN."""
    if v is None:
        return default
    if isinstance(v, bool):
        return float(v)
    if isinstance(v, (int, float)):
        return default if (isinstance(v, float) and math.isnan(v)) else float(v)
    s = str(v).strip()
    if s in ("", "#", "nan", "NaN", "None", "null", "-", "—", "NA", "N/A"):
        return default
    s = s.replace(" ", "")
    if s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    elif s.count(",") >= 1 and s.count(".") >= 1:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return default


def truthy(v, default=None):
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in ("1", "true", "t", "si", "sí", "yes", "y", "dirigido", "directed", "oneway", "one-way"):
        return True
    if s in ("0", "false", "f", "no", "n", "undirected", "no dirigido", "bidireccional", "both"):
        return False
    return default


def new_project(name: str = "Proyecto") -> dict:
    return {"name": name, "nodes": [], "edges": [], "vehicles": [],
            "params": dict(DEFAULT_PARAMS), "meta": {"warnings": [], "source": []}}


def node_index(p: dict) -> dict[str, int]:
    return {n["id"]: i for i, n in enumerate(p["nodes"])}


def node_label(p: dict, nid: str) -> str:
    for n in p["nodes"]:
        if n["id"] == nid:
            nm = n.get("name")
            return f"{nid}" if not nm or nm == nid else f"{nid} ({nm})"
    return str(nid)


def has_coords(p: dict) -> bool:
    ns = p["nodes"]
    return bool(ns) and all(n.get("lat") is not None and n.get("lon") is not None for n in ns)


def has_xy(p: dict) -> bool:
    ns = p["nodes"]
    return bool(ns) and all(n.get("x") is not None and n.get("y") is not None for n in ns)


def validate(p: dict) -> list[dict]:
    """Devuelve advertencias {nivel, codigo, mensaje}. Nunca falla en silencio."""
    w = []
    ids = [n["id"] for n in p["nodes"]]
    seen, dup = set(), set()
    for i in ids:
        (dup if i in seen else seen).add(i)
    if dup:
        w.append({"nivel": "error", "codigo": "nodos_duplicados",
                  "mensaje": f"Nodos duplicados: {sorted(dup)[:10]}"})
    idset = set(ids)
    orphan = [(e["source"], e["target"]) for e in p["edges"]
              if e["source"] not in idset or e["target"] not in idset]
    if orphan:
        w.append({"nivel": "error", "codigo": "aristas_huerfanas",
                  "mensaje": f"{len(orphan)} aristas referencian nodos inexistentes, p. ej. {orphan[:3]}"})
    for n in p["nodes"]:
        la, lo = n.get("lat"), n.get("lon")
        if la is not None and lo is not None and (abs(la) > 90 or abs(lo) > 180):
            w.append({"nivel": "error", "codigo": "coordenadas_fuera_de_rango",
                      "mensaje": f"Nodo {n['id']}: coordenadas fuera de rango ({la}, {lo}). ¿lat/lon invertidos?"})
            break
    neg = [e for e in p["edges"] for k in ("distance", "time", "cost")
           if e.get(k) is not None and e[k] < 0]
    if neg:
        w.append({"nivel": "advertencia", "codigo": "valores_negativos",
                  "mensaje": f"{len(neg)} valores negativos en aristas (Dijkstra no es válido; use Bellman-Ford)."})
    d = [e["distance"] for e in p["edges"] if e.get("distance") is not None]
    if d and max(d) > 5000:
        w.append({"nivel": "advertencia", "codigo": "unidades_dudosas",
                  "mensaje": f"Distancias hasta {max(d):.0f}: ¿están en metros? Se asumen km salvo que declare lo contrario."})
    if p["nodes"] and p["edges"]:
        import networkx as nx
        g = nx.Graph()
        g.add_nodes_from(ids)
        g.add_edges_from((e["source"], e["target"]) for e in p["edges"]
                         if e["source"] in idset and e["target"] in idset)
        c = nx.number_connected_components(g)
        if c > 1:
            w.append({"nivel": "advertencia", "codigo": "grafo_desconectado",
                      "mensaje": f"El grafo tiene {c} componentes conexas."})
    if p["nodes"] and not p["edges"]:
        w.append({"nivel": "advertencia", "codigo": "sin_aristas",
                  "mensaje": "No hay aristas: genere el grafo (k-vecinos, umbral, Delaunay o completo) si hay coordenadas."})
    return w
