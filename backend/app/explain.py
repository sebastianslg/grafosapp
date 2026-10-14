"""Respuestas en español con razonamiento trazable: directa, paso a paso, elección del algoritmo,
resumen ejecutivo (corto y largo) e informe técnico. Toda cifra proviene del resultado calculado."""
from __future__ import annotations
import math
from .algos.common import fmt, Ctx
from .graphs import build_nx, CRITERIA
from .model import node_label

WHY = {
    "dijkstra": ("Dijkstra fija en cada paso el nodo no visitado de menor etiqueta; es óptimo con pesos no negativos y complejidad O(E log V).",
                 "d(v) = min_{(u,v)∈A} [ d(u) + w_{uv} ]", "Bellman-Ford admite pesos negativos pero es O(VE); aquí no hay pesos negativos."),
    "bellman_ford": ("Bellman-Ford relaja todos los arcos |V|−1 veces; tolera pesos negativos y detecta ciclos negativos.",
                     "d_k(v) = min( d_{k-1}(v), min_{(u,v)} d_{k-1}(u) + w_{uv} )", "Dijkstra es más rápido si no hay pesos negativos."),
    "astar": ("A* guía la búsqueda con una heurística admisible (Haversine × mínimo w/d), por lo que sigue siendo óptimo.",
              "f(n) = g(n) + h(n)", "Dijkstra explora más nodos con el mismo resultado."),
    "floyd_warshall": ("Floyd-Warshall calcula todos los pares en O(V³) usando cada nodo como pivote intermedio.",
                       "d^{(k)}_{ij} = min( d^{(k-1)}_{ij}, d^{(k-1)}_{ik} + d^{(k-1)}_{kj} )", "Repetir Dijkstra desde cada nodo es más barato en grafos dispersos."),
    "k_shortest": ("El algoritmo de Yen enumera los k caminos simples de menor costo.", "", "Dijkstra solo entrega el mejor."),
    "critical_path": ("En un DAG, el camino crítico es el más largo; se calcula en orden topológico.", "ES(v) = max_{(u,v)} [ ES(u) + t_{uv} ]", "Bellman-Ford con pesos negados da el mismo resultado."),
    "kruskal": ("Kruskal ordena las aristas y acepta la siguiente si no cierra un ciclo (propiedad de corte); el resultado es un árbol de valor total mínimo/máximo.",
                "min Σ_{e∈T} w_e   s.a. T árbol generador", "Prim produce un árbol de igual valor total; difiere solo si hay empates."),
    "prim": ("Prim hace crecer un árbol agregando siempre la arista más barata (o cara) que sale de él.", "min Σ_{e∈T} w_e", "Kruskal produce el mismo valor total."),
    "sp_tree": ("El árbol de caminos reúne los caminos óptimos desde un origen a todos los nodos.", "T = {(pred(v), v)}", "Un árbol generador mínimo minimiza el total de aristas, no los caminos individuales."),
    "max_flow": ("Ford-Fulkerson con caminos más cortos (Edmonds-Karp) aumenta flujo hasta que no hay camino aumentante; el flujo máximo iguala la capacidad del corte mínimo.",
                 "max Σ x_{s·}  s.a. 0 ≤ x_{ij} ≤ u_{ij},  conservación de flujo", "Dinic llega al mismo valor con mejor complejidad en redes grandes."),
    "min_cut": ("Por el teorema max-flow min-cut, el corte mínimo se obtiene del grafo residual del flujo máximo.", "min Σ_{(i,j)∈δ⁺(S)} u_{ij}", ""),
    "min_cost_flow": ("El transbordo equilibrado es un problema de flujo de costo mínimo; el símplex de redes lo resuelve en forma exacta.",
                      "min Σ c_{ij} x_{ij}  s.a. Σ_j x_{ij} − Σ_j x_{ji} = b_i,  0 ≤ x_{ij} ≤ u_{ij}", "Resolverlo como PL general da el mismo óptimo, más lento."),
    "transport": ("Problema de transporte: orígenes con oferta y destinos con demanda; costos = caminos mínimos de la red.", "min Σ c_{ij} x_{ij}", ""),
    "assignment": ("El método húngaro resuelve la asignación uno-a-uno exactamente en O(n³).", "min Σ c_{ij} x_{ij},  x ∈ {0,1}", ""),
    "components": ("Componentes por búsqueda en profundidad; fuertemente conexas por Tarjan/Kosaraju.", "", ""),
    "articulation": ("Se detectan con valores low-link (Tarjan): quitar un punto de articulación o puente desconecta el grafo.", "", ""),
    "degrees": ("Grados y medidas de centralidad (intermediación, cercanía, PageRank) para ubicar nodos críticos.", "", ""),
    "diameter": ("Excentricidad de cada nodo por Dijkstra; diámetro = máxima, radio = mínima.", "", ""),
    "cycles": ("Base de ciclos del grafo no dirigido; el número ciclomático es |E|−|V|+c.", "μ = |E| − |V| + c", ""),
    "euler": ("Hierholzer recorre cada arista exactamente una vez; existe si el grafo es conexo y todos los grados son pares.", "grado(v) par ∀v", "Si no existe, el cartero chino duplica aristas mínimas."),
    "coloring": ("Modelo entero (CP-SAT) minimiza el número de colores con la restricción de colores distintos en aristas; se compara con DSATUR.",
                 "min k  s.a. c_u ≠ c_v ∀(u,v)∈E,  c_v < k", "DSATUR es heurístico y puede usar más colores."),
    "p_median": ("Modelo MILP clásico de p-mediana: minimiza la distancia ponderada de cada cliente a su instalación.",
                 "min Σ_i Σ_j w_i d_{ij} x_{ij}  s.a. Σ_j x_{ij}=1,  x_{ij} ≤ y_j,  Σ_j y_j = p", "El p-centro minimiza la peor distancia en lugar de la suma."),
    "p_center": ("MILP minimax: minimiza la distancia máxima de un cliente a su instalación.", "min z  s.a. z ≥ Σ_j d_{ij} x_{ij}", "La p-mediana minimiza el promedio."),
    "max_cover": ("Elige p instalaciones que maximizan la demanda dentro del radio de cobertura.", "max Σ_i w_i z_i  s.a. z_i ≤ Σ_{j∈N_i} y_j,  Σ y_j = p", ""),
    "fixed_charge": ("Localización con costo fijo: equilibra abrir instalaciones y asignar clientes (MILP).", "min Σ_j f_j y_j + Σ_i Σ_j w_i d_{ij} x_{ij}", ""),
    "tsp": ("El TSP busca el ciclo hamiltoniano de costo mínimo. Es exacto (Held-Karp) en tamaños pequeños y heurístico (guided local search) en grandes.",
            "min Σ c_{ij} x_{ij}  s.a. cada nodo visitado una vez, sin subtours", "El vecino más cercano da un tour válido pero típicamente peor."),
    "mtsp": ("m-TSP: m rutas desde el origen que juntas visitan todos los nodos; cada viajante se usa.", "min Σ_k Σ c_{ij} x^k_{ij}", ""),
    "cvrp": ("CVRP: minimiza el costo de rutas desde el depósito respetando la capacidad. Es NP-difícil; se usa guided local search de OR-Tools.",
             "min Σ_k Σ c_{ij} x^k_{ij}  s.a. Σ_i q_i y^k_i ≤ Q_k", "Una ruta por cliente (ida y vuelta) es la línea base ingenua."),
    "vrpspd": ("VRPSPD: cada cliente tiene entrega y recogida; la carga a bordo = entregas pendientes + recogidas acumuladas ≤ Q en todo el recorrido.",
               "carga_i = Σ_{pendientes} d + Σ_{recogidas} p ≤ Q", ""),
    "vrptw": ("VRPTW: además de capacidad, cada cliente solo puede atenderse en su ventana [a_i, b_i]; el vehículo espera si llega antes.",
              "a_i ≤ t_i ≤ b_i,  t_j ≥ t_i + s_i + τ_{ij}", ""),
    "hetero": ("Flota heterogénea: cada tipo de vehículo tiene capacidad, costo fijo, costo por km y velocidad propios.", "", ""),
    "multidepot": ("Multi-depósito: cada vehículo sale y regresa a su depósito.", "", ""),
    "periodic": ("VRP periódico: cada cliente se visita f veces por periodo; se reparten patrones de días y se resuelve un CVRP por día.", "", ""),
    "fstsp": ("FSTSP: camión y drones; los drones salen del camión, entregan un cliente y se recuperan más adelante. Heurística voraz con simulación temporal.",
              "t_total = t_camión + Σ esperas en puntos de recuperación", "El TSP del camión solo es la línea base."),
    "chinese_postman": ("Cartero chino: recorrido cerrado de todas las aristas con repetición mínima; se emparejan los nodos de grado impar por camino mínimo (matching).",
                        "min Σ w_e (1 + r_e)  s.a. grado par", ""),
    "rural_postman": ("Cartero rural: solo algunas aristas son obligatorias; se conectan los componentes y se emparejan impares. Es NP-difícil → heurístico.", "", ""),
    "failure": ("Se recalcula el grafo sin los elementos cerrados y se compara conectividad y costos de caminos mínimos.", "", ""),
    "resilience": ("Se agregan enlaces candidatos que más reducen componentes, articulaciones y puentes.", "", ""),
    "fleet_change": ("Se resuelve el mismo problema de rutas con distintas flotas y se comparan costos y emisiones.", "", ""),
    "sensitivity": ("Se repite el algoritmo variando un parámetro de costo para ver su efecto.", "", ""),
}


def _graph(project, params):
    try:
        return build_nx(project, "cost", closed_nodes=params.get("closed_nodes", []), closed_edges=params.get("closed_edges", []))
    except Exception:
        return None


def step_narrative(project: dict, result: dict) -> list[dict]:
    """Paso a paso entre nodos: distancia, tiempo, costo acumulado y alternativa descartada."""
    g = _graph(project, result.get("run_params", {}))
    out = []
    lab = lambda n: node_label(project, n)
    for pth in result.get("paths", [])[:12]:
        lines = []
        hops = pth.get("hops")
        if hops:
            for h in hops:
                alt = h.get("alternative")
                line = (f"{lab(h['from'])} → {lab(h['to'])}: distancia {fmt(h['distance'])} km, tiempo {fmt(h['time'])} min, "
                        f"costo {fmt(h['cost'])}; acumulado {fmt(h['acc'])}.")
                if alt:
                    line += (f" Alternativa descartada desde {lab(h['from'])} sin este arco: {' > '.join(alt['path'])} "
                             f"(costo {fmt(alt['cost'])}).")
                lines.append(line)
        elif g is not None:
            acc = 0.0
            nodes = pth["nodes"]
            for u, v in zip(nodes[:-1], nodes[1:]):
                if g.has_edge(u, v):
                    a = g[u][v]
                    acc += a["cost"] if a.get("cost") is not None else a["w"]
                    lines.append(f"{lab(u)} → {lab(v)}: {fmt(a.get('distance'))} km, {fmt(a.get('time'))} min, costo {fmt(a.get('cost'))}; acumulado {fmt(acc)}.")
        out.append({"label": pth.get("label", "ruta"), "summary": f"{' > '.join(pth['nodes'][:80])}", "lines": lines,
                    "total": pth.get("cost")})
    return out


def baseline_comparison(project: dict, result: dict) -> str | None:
    """Comparación con una alternativa calculable (línea base) para el razonamiento."""
    key = result.get("key") or result.get("algorithm")
    try:
        if key in ("cvrp", "vrpspd", "vrptw", "hetero", "multidepot") and result.get("paths"):
            g = _graph(project, result.get("run_params", {}))
            import networkx as nx
            dep = result["paths"][0]["nodes"][0]
            d = nx.single_source_dijkstra_path_length(g, dep, weight="w")
            custs = {x for p in result["paths"] for x in p.get("stops", [])[1:-1]}
            naive = sum(2 * d[c] for c in custs if c in d)
            return (f"Línea base ingenua (una ruta de ida y vuelta por cliente): {fmt(naive)}. La solución encontrada cuesta "
                    f"{fmt(result['value'])} ({fmt((1 - result['value'] / naive) * 100, 1) if naive else '0'} % menos).")
        if key == "tsp" and result.get("paths"):
            g = _graph(project, result.get("run_params", {}))
            import networkx as nx
            stops = result["paths"][0]["stops"][:-1]
            cur, rest, tot = stops[0], set(stops[1:]), 0.0
            while rest:
                dd = nx.single_source_dijkstra_path_length(g, cur, weight="w")
                nxt = min(rest, key=lambda x: dd.get(x, math.inf))
                tot += dd[nxt]
                cur = nxt
                rest.discard(nxt)
            tot += nx.shortest_path_length(g, cur, stops[0], weight="w")
            return (f"Vecino más cercano: {fmt(tot)}. El tour entregado cuesta {fmt(result['value'])} "
                    f"({fmt((1 - result['value'] / tot) * 100, 1) if tot else '0'} % menos).")
        if key in ("dijkstra", "bellman_ford", "astar", "floyd_warshall") and result.get("meta", {}).get("alternatives"):
            a = result["meta"]["alternatives"][0]
            return (f"Mejor alternativa distinta: {' > '.join(a['nodes'])} con costo {fmt(a['cost'])} "
                    f"(+{fmt(a['cost'] - result['value'])} sobre el óptimo).")
        if key in ("kruskal", "prim"):
            return "Prim y Kruskal garantizan el mismo valor total; la selección de aristas solo cambia si hay empates."
        if key == "coloring":
            return "Comparado con DSATUR (tabla de colores)."
        if key == "fstsp" and result.get("meta", {}).get("base_time"):
            return f"Solo camión: {fmt(result['meta']['base_time'])} min; con drones {fmt(result['value'])} min ({fmt(result['meta']['improvement_pct'], 1)} % de mejora)."
    except Exception:
        return None
    return None


def reasoning(project: dict, result: dict) -> dict:
    key = result.get("key") or result.get("algorithm")
    why, eq, alt = WHY.get(key, ("", "", ""))
    rp = result.get("run_params", {})
    active = []
    if rp.get("closed_nodes"):
        active.append(f"Nodos cerrados: {', '.join(map(str, rp['closed_nodes']))}")
    if rp.get("closed_edges"):
        active.append(f"Aristas cerradas: {rp['closed_edges']}")
    if rp.get("capacity"):
        active.append(f"Capacidad por vehículo: {rp['capacity']}")
    if key in ("vrptw",):
        active.append("Ventanas horarias activas")
    crit = rp.get("criterion", "cost")
    active.append(f"Criterio de peso: {CRITERIA.get(crit, crit)}")
    st = result.get("status")
    optimality = {"optimal": "Resultado ÓPTIMO PROBADO (método exacto).",
                  "heuristic": "Resultado HEURÍSTICO: no hay garantía de optimalidad; es una buena solución reproducible (misma semilla y parámetros).",
                  "info": "Análisis descriptivo (no es un problema de optimización)."}.get(st, "")
    return {"algorithm_choice": why, "equation": eq, "assumptions": result.get("assumptions", []), "active_constraints": active,
            "optimality": optimality, "comparison": baseline_comparison(project, result) or alt}


def executive(project: dict, result: dict) -> dict:
    r = reasoning(project, result)
    meta = result.get("meta", {})
    unit = result.get("unit") or ""
    short = [f"Problema: {result['title']} sobre {len(project['nodes'])} nodos y {len(project['edges'])} aristas.",
             f"Hallazgo: {result.get('message', '')}",
             f"Cifra clave: {fmt(result.get('value'))} {unit}".rstrip() if result.get("value") is not None else "Cifra clave: ver tablas.",
             r["optimality"],
             "Recomendación: " + _recommendation(result)]
    risks = []
    if result.get("status") == "heuristic":
        risks.append("La solución es heurística: puede existir una mejor; valide con más tiempo de cómputo o un solver exacto.")
    if meta.get("unserved"):
        risks.append(f"Clientes sin servir: {meta['unserved']}")
    if project["meta"].get("warnings"):
        risks.append("Advertencias de datos: " + "; ".join(w["mensaje"] for w in project["meta"]["warnings"][:3]))
    if not risks:
        risks.append("Sin riesgos de método identificados; la calidad depende de la exactitud de los datos de entrada.")
    nxt = ["Validar los valores de control contra otra herramienta (p. ej. Grafos v.1.3.5).",
           "Probar escenarios: cierres de nodos/aristas, cambio de flota, sensibilidad a costos."]
    long = short + ["", "Riesgos:"] + [f"• {x}" for x in risks] + ["", "Siguientes pasos:"] + [f"• {x}" for x in nxt] + \
        ["", "Supuestos:"] + [f"• {x}" for x in r["assumptions"]] + ["", "Restricciones activas:"] + [f"• {x}" for x in r["active_constraints"]]
    return {"short": short, "long": long, "risks": risks, "next_steps": nxt}


def _recommendation(result):
    st = result.get("status")
    k = result.get("key")
    if k in ("cvrp", "vrpspd", "vrptw", "hetero", "multidepot", "periodic", "mtsp"):
        return "Implementar las rutas propuestas y medir costos reales; reoptimizar si cambia la demanda."
    if k in ("failure", "resilience"):
        return "Priorizar la protección o redundancia de los elementos críticos identificados."
    if k in ("kruskal", "prim"):
        return "Usar el árbol como esqueleto de menor costo de la red y reforzar con enlaces redundantes si se requiere resiliencia."
    if k in ("p_median", "p_center", "max_cover", "fixed_charge"):
        return "Ubicar las instalaciones propuestas y verificar capacidades antes de decidir."
    return "Adoptar el resultado, documentando que " + ("es óptimo." if st == "optimal" else "es una solución heurística.")


def technical(project: dict, result: dict) -> list[dict]:
    r = reasoning(project, result)
    pr = project["params"]
    secs = [
        {"heading": "1. Modelo", "paragraphs": [r["algorithm_choice"] or result["title"]], "equations": [r["equation"]] if r["equation"] else []},
        {"heading": "2. Notación y costo de arista", "paragraphs": [
            "Costo de arista: c = c_km·d + c_hora·t/60; tiempo t = 60·d/v; emisiones = e·d; distancia Haversine (R = 6371.0088 km) × factor vial.",
            f"Parámetros: c_km={pr.get('c_km')}, c_hora={pr.get('c_hora')}, v={pr.get('speed')} km/h, factor vial={pr.get('road_factor')}, e={pr.get('e_km')}, escala={pr.get('scale')}."],
         "equations": ["c_{ij} = c_{km}·d_{ij} + c_{h}·t_{ij}/60", "t_{ij} = 60·d_{ij}/v"]},
        {"heading": "3. Datos", "paragraphs": [f"{len(project['nodes'])} nodos, {len(project['edges'])} aristas, {len(project['vehicles'])} tipo(s) de vehículo.",
                                              *(["Orígenes de los datos: " + "; ".join(f"{s.get('archivo')} ({s.get('formato')})" for s in project["meta"].get("source", []))] if project["meta"].get("source") else ["Orígenes de los datos: ejemplo integrado."])], "equations": []},
        {"heading": "4. Método", "paragraphs": [r["optimality"]] + r["assumptions"] + r["active_constraints"], "equations": []},
        {"heading": "5. Resultados", "paragraphs": [result.get("message", "")], "equations": [], "tables": result.get("tables", [])[:6]},
        {"heading": "6. Sensibilidad y comparación", "paragraphs": [r["comparison"] or "Use el módulo de escenarios (cierres, flota, sensibilidad) para cuantificarla."], "equations": []},
        {"heading": "7. Limitaciones", "paragraphs": ["Los costos se calculan sobre caminos mínimos de la red; la calidad de los resultados depende de los datos de entrada.",
                                                       "Los resultados heurísticos no son óptimos probados." if result.get("status") == "heuristic" else "Resultado exacto sobre el modelo dado."], "equations": []},
        {"heading": "8. Conclusiones", "paragraphs": [_recommendation(result)], "equations": []},
    ]
    return secs


def explain(project: dict, result: dict) -> dict:
    """Bloque completo editable que acompaña a una ejecución."""
    answer = result.get("message", "")
    return {"answer": answer, "steps": step_narrative(project, result), "reasoning": reasoning(project, result),
            "executive": executive(project, result), "technical": technical(project, result),
            "control": result.get("control", [])}
