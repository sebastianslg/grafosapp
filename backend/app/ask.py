"""Pregunta libre en español → ejecuta el cálculo correcto y responde con cifras trazables (nunca inventadas)."""
from __future__ import annotations
import re
import unicodedata
from .algos import registry
from .algos.common import AlgoError, fmt
from .explain import explain


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\-_\. ]+", " ", s)).strip()


def find_nodes(project: dict, text: str) -> list[tuple[int, str]]:
    """Menciones de nodos en el texto, en orden de aparición. Prioriza nombres completos e ids explícitos."""
    t = " " + _norm(text) + " "
    hits: dict[str, int] = {}
    for n in project["nodes"]:
        for cand in {_norm(str(n["id"])), _norm(str(n.get("name") or ""))}:
            if not cand:
                continue
            is_id = cand == _norm(str(n["id"]))
            if len(cand) < 3 and is_id:
                m = re.search(rf"(?:nodo|vertice|punto|estacion|de|a|desde|hasta|entre|y|e|origen|destino|cierro|cierra|deposito)\s+{re.escape(cand)}(?![a-z0-9])", t)
                pos = (m.end() - len(cand)) if m else -1
            else:
                m = re.search(rf"(?<![a-z0-9]){re.escape(cand)}(?![a-z0-9])", t)
                pos = m.start() if m else -1
            if pos >= 0 and (n["id"] not in hits or pos < hits[n["id"]]):
                hits[n["id"]] = pos
    return sorted((p, i) for i, p in hits.items())


def interpret(project: dict, q: str) -> dict:
    t = _norm(q)
    nodes = find_nodes(project, q)
    m_close = re.search(r"\b(si cierro|si cierra|cerrando|si se cierra|si falla|si fallan|sin pasar por|evitando|si elimino|si quito)\b", t)
    closed, main = [], []
    if m_close:
        cut = len(_norm(q[:0])) or t.index(m_close.group(0))
        before = [i for p, i in nodes if (" " + t + " ").find(" ") >= 0 and _pos(t, project, i) < cut]
        closed = [i for p, i in nodes if _pos(t, project, i) >= cut]
        main = [i for i in [i for _, i in nodes] if i not in closed]
    else:
        main = [i for _, i in nodes]
    crit = "cost"
    if re.search(r"\b(rapida|rapido|tiempo|demora|minutos|duracion)\b", t):
        crit = "time"
    elif re.search(r"\b(corta|corto|distancia|kilometros|km)\b", t) and "barat" not in t:
        crit = "distance"
    elif re.search(r"emision|co2|contamin", t):
        crit = "emissions"
    p = {"criterion": crit}
    if closed:
        p["closed_nodes"] = closed
    cap = re.search(r"capacidad(?: de| por vehiculo| =|:)?\s*(\d+(?:\.\d+)?)", t)
    if cap:
        p["capacity"] = float(cap.group(1))
    num = re.search(r"\bp\s*=?\s*(\d+)|\b(\d+)\s+(?:instalaciones|medianas|centros|depositos|bodegas)", t)
    if num:
        p["p"] = int(num.group(1) or num.group(2))
    rules = [
        (r"flujo maximo|capacidad maxima de flujo", "max_flow"), (r"corte minimo", "min_cut"),
        (r"arbol (?:de expansion |de valor total |generador )?maximo", "kruskal:max"), (r"arbol (?:de expansion |de valor total |generador )?minimo|\bmst\b|expansion minima", "kruskal"),
        (r"cartero rural", "rural_postman"), (r"cartero|inspeccion de todas las (?:calles|aristas)", "chinese_postman"),
        (r"euler", "euler"), (r"viajante|\btsp\b|agente viajero", "tsp"), (r"ventanas? (?:horari|de tiempo)", "vrptw"),
        (r"dron|fstsp", "fstsp"), (r"recogida|pickup", "vrpspd"), (r"\bvrp\b|\bcvrp\b|enrutamiento|rutas? de (?:vehiculos|reparto|distribucion)|flota", "cvrp"),
        (r"p-?mediana|medianas", "p_median"), (r"p-?centro|centros", "p_center"), (r"cobertura", "max_cover"), (r"localizacion|ubicar|donde instalar", "fixed_charge"),
        (r"articulacion|puentes|puntos criticos|nodos criticos|vulnerab", "articulation"), (r"componentes|conexo|conectado", "components"),
        (r"coloreo|colorear|cromatico", "coloring"), (r"centralidad|grado|nodo mas importante|mas central", "degrees"), (r"diametro|radio del grafo", "diameter"),
        (r"resiliencia|agregar enlaces|redundancia", "resilience"), (r"todos los caminos|todos los pares|matriz de costos minimos|floyd", "floyd_warshall"),
        (r"camino critico|ruta critica", "critical_path"), (r"bellman", "bellman_ford"),
        (r"ruta mas (?:barata|corta|rapida)|camino (?:minimo|mas corto|mas barato)|mas barato|menor costo|mas corto|mas rapido|dijkstra|ruta entre|cuanto cuesta ir|como llego", "dijkstra"),
    ]
    algo = None
    for pat, a in rules:
        if re.search(pat, t):
            algo = a
            break
    if algo and ":" in algo:
        algo, mode = algo.split(":")
        p["mode"] = mode
    if algo in ("dijkstra", "bellman_ford", "max_flow", "min_cut", "floyd_warshall", "critical_path"):
        if len(main) >= 1:
            p["source"] = main[0]
        if len(main) >= 2:
            p["target"] = main[1]
    elif algo in ("tsp", "cvrp", "vrptw", "vrpspd", "fstsp") and main:
        p["depot"] = main[0]
    return {"algorithm": algo, "params": p, "mentioned": [i for _, i in nodes], "closed": closed}


def _pos(t: str, project: dict, nid: str) -> int:
    n = next(x for x in project["nodes"] if x["id"] == nid)
    best = 10 ** 9
    for cand in {_norm(str(n["id"])), _norm(str(n.get("name") or ""))}:
        if cand:
            m = re.search(rf"(?<![a-z0-9]){re.escape(cand)}(?![a-z0-9])", t)
            if m:
                best = min(best, m.start())
    return best


def answer(project: dict, question: str, base_params: dict | None = None) -> dict:
    it = interpret(project, question)
    if not it["algorithm"]:
        return {"understood": False, "message": "No pude asociar la pregunta con un cálculo. Ejemplos: «¿cuál es la ruta más barata entre A y B si cierro C?», "
                "«árbol mínimo», «flujo máximo de A a B», «puntos de articulación», «TSP», «VRP con capacidad 500», «p-mediana con p=3».",
                "interpretation": it}
    params = {**(base_params or {}), **it["params"]}
    out = {"understood": True, "interpretation": it}
    try:
        if it["closed"]:
            base_p = {k: v for k, v in params.items() if k != "closed_nodes"}
            base = registry.run(it["algorithm"], project, base_p)
            res = registry.run(it["algorithm"], project, params)
            out["baseline"] = base
            delta = (res["value"] - base["value"]) if (res.get("value") is not None and base.get("value") is not None) else None
            out["message"] = (f"Sin cierre: {base['message']} Con cierre de {', '.join(it['closed'])}: {res['message']}" +
                              (f" Variación: {delta:+.2f}." if delta is not None else ""))
        else:
            res = registry.run(it["algorithm"], project, params)
            out["message"] = res["message"]
        out["result"] = res
        out["explanation"] = explain(project, res)
    except AlgoError as e:
        out["message"] = f"No se pudo calcular: {e}"
        out["error"] = str(e)
    return out
