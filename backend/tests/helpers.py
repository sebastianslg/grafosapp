import itertools
from app.model import new_project


def proj(nodes, edges, directed=False, **params):
    p = new_project("t")
    p["params"].update(params)
    for n in nodes:
        d = n if isinstance(n, dict) else {"id": str(n)}
        base = {"id": "", "name": None, "lat": None, "lon": None, "x": None, "y": None, "demand": None, "supply": None, "type": None,
                "tw_start": None, "tw_end": None, "service": None, "capacity": None, "frequency": None}
        base.update(d)
        base["name"] = base["name"] or base["id"]
        p["nodes"].append(base)
    for e in edges:
        a, b, c = e[:3]
        p["edges"].append({"source": str(a), "target": str(b), "distance": None, "time": None, "cost": float(c),
                           "capacity": (float(e[3]) if len(e) > 3 else None), "directed": directed, "emissions": None})
    return p
