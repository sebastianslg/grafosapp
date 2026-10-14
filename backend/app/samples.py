"""Datos de ejemplo cargables con un clic (deterministas)."""
from __future__ import annotations
import random
from .model import new_project, validate
from .graphs import generate_edges, auto_layout


def sample_small() -> dict:
    """Grafo pequeño (14 nodos) con coordenadas; oferta/demanda, capacidades y frecuencias."""
    rnd = random.Random(11)
    p = new_project("Ejemplo pequeño (14 nodos)")
    p["params"].update(c_km=1.2, c_hora=6.0, speed=40.0, road_factor=1.25, e_km=0.18, scale=100)
    base_lat, base_lon = 10.40, -75.50
    for i in range(14):
        p["nodes"].append({"id": str(i), "name": f"Punto {i:02d}", "lat": round(base_lat + rnd.uniform(0, 0.12), 5),
                           "lon": round(base_lon + rnd.uniform(0, 0.12), 5), "x": None, "y": None,
                           "demand": float(rnd.choice([0, 0, 40, 60, 80, 100])) if i else 0.0, "supply": None,
                           "type": "depósito" if i == 0 else "cliente", "tw_start": None, "tw_end": None,
                           "service": 5.0 if i else 0.0, "capacity": None, "frequency": rnd.choice([1, 1, 2, 3])})
    # nodos 1 y 2 sin demanda para que el ejemplo no sea trivial
    for n in p["nodes"][1:]:
        if not n["demand"]:
            n["demand"] = 30.0
    p["params"]["depots"] = ["0"]
    generate_edges(p, "knn", k=4, directed=False)
    for e in p["edges"]:
        e["capacity"] = float(rnd.choice([20, 30, 40, 50]))
    p["vehicles"] = [{"type": "Furgón diésel", "capacity": 250.0, "fixed_cost": 25.0, "cost_per_km": 1.2, "speed": 40.0,
                      "range": None, "count": 3, "emissions_per_km": 0.22, "depot": "0"}]
    auto_layout(p)
    p["meta"]["warnings"] = validate(p)
    return p


def sample_fleet() -> dict:
    """Grafo de ~25 nodos con flota, capacidades, ventanas horarias y oferta/demanda."""
    rnd = random.Random(23)
    p = new_project("Ejemplo con flota (25 nodos)")
    p["params"].update(c_km=0.9, c_hora=8.0, speed=35.0, road_factor=1.22, e_km=0.2, scale=100)
    base_lat, base_lon = 4.55, -74.15
    for i in range(25):
        dep = i == 0
        p["nodes"].append({"id": f"N{i:02d}", "name": "Centro de distribución" if dep else f"Cliente {i:02d}",
                           "lat": round(base_lat + rnd.uniform(0, 0.18), 5), "lon": round(base_lon + rnd.uniform(0, 0.18), 5),
                           "x": None, "y": None, "demand": 0.0 if dep else float(rnd.choice([30, 45, 60, 90, 120])),
                           "supply": None if dep else float(rnd.choice([0, 0, 15, 30])),
                           "type": "depósito" if dep else "cliente",
                           "tw_start": None if dep else float(rnd.choice([0, 60, 120, 180])),
                           "tw_end": None if dep else float(rnd.choice([360, 420, 480])),
                           "service": 0.0 if dep else 8.0, "capacity": None, "frequency": rnd.choice([1, 2])})
    p["params"]["depots"] = ["N00"]
    generate_edges(p, "knn", k=5, directed=False)
    for e in p["edges"]:
        e["capacity"] = float(rnd.choice([50, 80, 100]))
    p["vehicles"] = [
        {"type": "Camión diésel", "capacity": 600.0, "fixed_cost": 40.0, "cost_per_km": 1.1, "speed": 35.0, "range": None, "count": 2, "emissions_per_km": 0.30, "depot": "N00"},
        {"type": "Furgoneta eléctrica", "capacity": 350.0, "fixed_cost": 25.0, "cost_per_km": 0.55, "speed": 35.0, "range": 140.0, "count": 2, "emissions_per_km": 0.0, "depot": "N00"},
    ]
    auto_layout(p)
    p["meta"]["warnings"] = validate(p)
    return p


def sample_transshipment() -> dict:
    """Pequeña red de transbordo balanceada: 2 orígenes, 2 transbordos, 3 destinos (sin coordenadas)."""
    p = new_project("Ejemplo de transbordo (7 nodos)")
    p["params"].update(scale=1)
    spec = [("S1", 70, None), ("S2", 50, None), ("T1", None, None), ("T2", None, None), ("D1", None, 40), ("D2", None, 45), ("D3", None, 35)]
    for nid, sup, dem in spec:
        p["nodes"].append({"id": nid, "name": nid, "lat": None, "lon": None, "x": None, "y": None, "demand": dem, "supply": sup,
                           "type": None, "tw_start": None, "tw_end": None, "service": None, "capacity": None, "frequency": None})
    arcs = [("S1", "T1", 4, 60), ("S1", "T2", 6, 40), ("S2", "T1", 5, 40), ("S2", "T2", 3, 50), ("T1", "D1", 2, 40), ("T1", "D2", 6, 50),
            ("T2", "D2", 3, 50), ("T2", "D3", 4, 50), ("T1", "D3", 7, 30), ("S1", "D1", 9, 20)]
    for a, b, c, cap in arcs:
        p["edges"].append({"source": a, "target": b, "distance": None, "time": None, "cost": float(c), "capacity": float(cap),
                           "directed": True, "emissions": None})
    auto_layout(p)
    p["meta"]["warnings"] = validate(p)
    return p


SAMPLES = {"pequeno": sample_small, "flota": sample_fleet, "transbordo": sample_transshipment}
