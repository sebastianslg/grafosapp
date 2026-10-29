"""Descarga y guarda en datos/cache_rutas.json el trazado por calles de todos los tramos entre los nodos de
cada conjunto de datos (Cali y China). Solo se necesita una vez; la aplicación usa la caché sin internet."""
import json, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import ejecutar_app as app

app.cargar_cache()
for clave in [a for a in sys.argv[1:] if not a.startswith("--")] or ["cali", "china"]:
    d = json.loads((app.WEB / "datos" / f"{clave}.json").read_text(encoding="utf-8"))
    nodos = d["nodos"]
    tramos = [(a["lat"], a["lon"], b["lat"], b["lon"]) for a in nodos for b in nodos if a is not b]
    if "--rehacer" in sys.argv:
        for t in tramos:
            app._cache.pop(app.clave(*t), None)
    pend = [t for t in tramos if app.clave(*t) not in app._cache]
    print(clave, len(tramos), "tramos;", len(pend), "pendientes", flush=True)
    t0 = time.time(); hechos = 0; fallos = 0
    def uno(t):
        global hechos, fallos
        r = app.osrm_tramo(*t); time.sleep(0.25)
        hechos += 1
        if r is None: fallos += 1
        if hechos % 50 == 0: print(f"  {hechos}/{len(pend)} fallos={fallos} {time.time()-t0:.0f}s", flush=True)
    with ThreadPoolExecutor(3) as ex:
        list(ex.map(uno, pend))
    app.guardar_cache(True)
    print(clave, "listo", len(app._cache), "en caché; fallos:", fallos, flush=True)
