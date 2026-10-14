"""API FastAPI + frontend estático."""
from __future__ import annotations
import io
import json
import math
import os
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Body
from fastapi.responses import JSONResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles

from . import store, ingest, export, samples, ask as askmod
from .algos import registry
from .algos.common import AlgoError, Cancelled
from .algos.scenarios import compare_runs
from .explain import explain
from .graphs import generate_edges, auto_layout, separate_xy, GraphError
from .model import validate, DEFAULT_PARAMS, new_project

MAX_NODES = int(os.environ.get("GRAFOS_MAX_NODES", 5000))
MAX_TIME = int(os.environ.get("GRAFOS_MAX_TIME", 120))
app = FastAPI(title="Grafos Lab", version="1.0.0")
store.init()
POOL = ThreadPoolExecutor(max_workers=int(os.environ.get("GRAFOS_WORKERS", 2)))
UPLOADS: dict[str, dict] = {}
JOBS: dict[str, dict] = {}


def clean(o: Any):
    """Convierte numpy/inf/nan/tuplas a JSON válido y recorta metadatos pesados."""
    try:
        import numpy as np
    except ImportError:
        np = None
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items() if k not in ("next", "ids_internal")}
    if isinstance(o, (list, tuple, set)):
        return [clean(v) for v in o]
    if np is not None:
        if isinstance(o, np.integer):
            return int(o)
        if isinstance(o, np.floating):
            o = float(o)
        if isinstance(o, np.ndarray):
            return clean(o.tolist())
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    return o


def J(o, status=200):
    return JSONResponse(clean(o), status_code=status)


@app.exception_handler(AlgoError)
async def _algo_err(request, exc):
    return J({"error": str(exc), "tipo": "calculo"}, 422)


@app.exception_handler(ingest.IngestError)
async def _ing_err(request, exc):
    return J({"error": str(exc), "tipo": "ingesta"}, 422)


@app.exception_handler(GraphError)
async def _g_err(request, exc):
    return J({"error": str(exc), "tipo": "grafo"}, 422)


def need(pid: str) -> dict:
    p = store.get_project(pid)
    if not p:
        raise HTTPException(404, "Proyecto no encontrado")
    return p


@app.get("/api/health")
def health():
    return {"ok": True, "algoritmos": len(registry.ALGOS)}


@app.get("/api/catalog")
def catalog():
    return J(registry.catalog())


# ---------- ejemplos y plantillas ----------

@app.get("/api/samples")
def list_samples():
    return J([{"key": k, "name": f().get("name")} for k, f in samples.SAMPLES.items()])


@app.post("/api/samples/{key}")
def load_sample(key: str):
    if key not in samples.SAMPLES:
        raise HTTPException(404, "Ejemplo desconocido")
    p = samples.SAMPLES[key]()
    pid = store.create_project(p, "ejemplo")
    return J(store.get_project(pid))


@app.get("/api/templates/{kind}")
def template(kind: str):
    try:
        data = export.template_zip(kind)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return Response(data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="plantilla_{kind}.zip"'})


@app.get("/api/templates")
def templates():
    return J(list(export.TEMPLATES))


# ---------- ingesta ----------

@app.post("/api/ingest/preview")
async def ingest_preview(files: list[UploadFile] = File(...)):
    if len(files) > 20:
        raise HTTPException(422, "Máximo 20 archivos por carga.")
    parsed, errors = [], []
    for f in files:
        raw = await f.read(ingest.MAX_BYTES + 1)
        try:
            parsed.append(ingest.parse_file(f.filename or "archivo", raw))
        except ingest.IngestError as e:
            errors.append({"archivo": f.filename, "error": str(e)})
        except Exception as e:   # nunca fallos silenciosos: se reporta
            errors.append({"archivo": f.filename, "error": f"Error inesperado al leer: {type(e).__name__}: {e}"})
    if not parsed:
        return J({"error": "Ningún archivo pudo leerse.", "errores": errors, "tipo": "ingesta"}, 422)
    uid = uuid.uuid4().hex[:12]
    UPLOADS[uid] = {"parsed": parsed, "t": time.time()}
    for k in [k for k, v in UPLOADS.items() if time.time() - v["t"] > 3600]:
        UPLOADS.pop(k, None)
    prev = ingest.preview(parsed)
    return J({"upload_id": uid, "errores": errors, **prev})


@app.post("/api/ingest/commit")
def ingest_commit(body: dict = Body(...)):
    up = UPLOADS.get(body.get("upload_id"))
    if not up:
        raise HTTPException(404, "Carga expirada: vuelva a subir los archivos.")
    extra = {}
    for it in body.get("accepted_params", []):       # parámetros extraídos y confirmados por el usuario
        extra[it["param"]] = it["valor"]
    extra.update(body.get("params", {}))
    p = ingest.build_project(body.get("name") or "Proyecto", up["parsed"], body.get("decisions"), extra, body.get("units"))
    if len(p["nodes"]) > MAX_NODES:
        raise HTTPException(422, f"Demasiados nodos ({len(p['nodes'])}); máximo {MAX_NODES}.")
    gen = body.get("generate")
    if gen and p["nodes"]:
        generate_edges(p, gen.get("method", "knn"), int(gen.get("k", 4)), gen.get("threshold"), bool(gen.get("directed", False)))
    elif not p["edges"] and any(n.get("lat") is not None for n in p["nodes"]):
        p["meta"]["warnings"].append({"nivel": "advertencia", "codigo": "sin_aristas",
                                      "mensaje": "No hay aristas: genere el grafo desde las coordenadas (k-vecinos, umbral, Delaunay o completo)."})
    auto_layout(p)
    p["meta"]["warnings"] = validate(p)
    pid = store.create_project(p, "ingesta")
    return J(store.get_project(pid))


# ---------- proyectos ----------

@app.get("/api/projects")
def projects():
    return J(store.list_projects())


@app.get("/api/projects/{pid}")
def project(pid: str):
    return J(need(pid))


@app.put("/api/projects/{pid}")
def update_project(pid: str, body: dict = Body(...)):
    p = need(pid)
    for k in ("name", "nodes", "edges", "vehicles"):
        if k in body:
            p[k] = body[k]
    if "params" in body:
        p["params"] = {**DEFAULT_PARAMS, **body["params"]}
    if len(p["nodes"]) > MAX_NODES:
        raise HTTPException(422, f"Demasiados nodos; máximo {MAX_NODES}.")
    p["meta"]["warnings"] = validate(p)
    v = store.save_project(pid, p, body.get("note", "editado"))
    return J({**p, "version": v})


@app.delete("/api/projects/{pid}")
def del_project(pid: str):
    need(pid)
    store.delete_project(pid)
    return {"ok": True}


@app.get("/api/projects/{pid}/versions")
def versions(pid: str):
    need(pid)
    return J(store.versions(pid))


@app.post("/api/projects/{pid}/restore/{v}")
def restore(pid: str, v: int):
    need(pid)
    old = store.get_version(pid, v)
    if not old:
        raise HTTPException(404, "Versión inexistente")
    nv = store.save_project(pid, old, f"restaurado v{v}")
    return J({"version": nv})


@app.post("/api/projects/{pid}/generate-edges")
def gen_edges(pid: str, body: dict = Body(...)):
    p = need(pid)
    n = generate_edges(p, body.get("method", "knn"), int(body.get("k", 4)), body.get("threshold"), bool(body.get("directed", False)),
                       bool(body.get("replace", True)))
    p["meta"]["warnings"] = validate(p)
    store.save_project(pid, p, f"aristas {body.get('method', 'knn')}")
    return J({"added": n, "project": store.get_project(pid)})


@app.post("/api/projects/{pid}/layout")
def layout(pid: str, body: dict = Body(default={})):
    p = need(pid)
    if body.get("reset"):
        for n in p["nodes"]:
            n["x"] = n["y"] = None
    auto_layout(p)
    if body.get("separate", True):
        separate_xy(p, float(body.get("min_dist", 10)))
    store.save_project(pid, p, "layout")
    return J(store.get_project(pid))


# ---------- ejecución ----------

def _run_job(job_id: str, pid: str, key: str, params: dict):
    job = JOBS[job_id]
    p = store.get_project(pid)

    def progress(f, msg=""):
        job["progress"], job["message"] = f, msg

    try:
        job["status"] = "running"
        params = dict(params)
        params["time_limit"] = min(int(params.get("time_limit", 10)), MAX_TIME)
        res = registry.run(key, p, params, progress, lambda: job["cancel"])
        if job["cancel"]:
            raise Cancelled()
        res = clean(res)
        exp = explain(p, res)
        rid = store.add_run(pid, key, res.get("run_params", params), {**res, "explanation": clean(exp)})
        job.update(status="done", progress=1.0, run_id=rid, result=res, explanation=clean(exp))
    except Cancelled:
        job.update(status="cancelled", message="Cancelado por el usuario")
    except AlgoError as e:
        job.update(status="error", error=str(e), tipo="calculo")
    except Exception as e:
        job.update(status="error", error=f"Error interno en {key}: {type(e).__name__}: {e}", tipo="interno")


@app.post("/api/projects/{pid}/run")
def run(pid: str, body: dict = Body(...), wait: bool = Query(False)):
    need(pid)
    key = body.get("algorithm")
    if key not in registry.ALGOS:
        raise HTTPException(422, f"Algoritmo desconocido: {key}")
    jid = uuid.uuid4().hex[:10]
    JOBS[jid] = {"id": jid, "status": "queued", "progress": 0.0, "cancel": False, "algorithm": key, "t": time.time()}
    fut = POOL.submit(_run_job, jid, pid, key, body.get("params", {}))
    if wait:
        fut.result()
        j = JOBS[jid]
        if j["status"] == "error":
            return J({"error": j["error"], "tipo": j.get("tipo")}, 422)
        return J({k: j.get(k) for k in ("id", "status", "run_id", "result", "explanation")})
    return J({"job_id": jid})


@app.get("/api/jobs/{jid}")
def job(jid: str):
    j = JOBS.get(jid)
    if not j:
        raise HTTPException(404, "Tarea inexistente")
    return J({k: v for k, v in j.items() if k != "cancel"})


@app.post("/api/jobs/{jid}/cancel")
def cancel(jid: str):
    j = JOBS.get(jid)
    if not j:
        raise HTTPException(404, "Tarea inexistente")
    j["cancel"] = True
    return {"ok": True}


@app.get("/api/projects/{pid}/runs")
def runs(pid: str):
    need(pid)
    return J(store.list_runs(pid))


@app.get("/api/runs/{rid}")
def get_run(rid: str):
    r = store.get_run(rid)
    if not r:
        raise HTTPException(404, "Ejecución inexistente")
    return J(r)


@app.post("/api/projects/{pid}/ask")
def ask(pid: str, body: dict = Body(...)):
    p = need(pid)
    out = askmod.answer(p, body.get("question", ""), body.get("params"))
    if out.get("result"):
        rid = store.add_run(pid, out["result"].get("key", "ask"), out["result"].get("run_params", {}),
                            {**clean(out["result"]), "explanation": clean(out.get("explanation"))})
        out["run_id"] = rid
    return J(out)


@app.post("/api/projects/{pid}/compare")
def compare(pid: str, body: dict = Body(...)):
    need(pid)
    items = []
    for rid in body.get("run_ids", []):
        r = store.get_run(rid)
        if r:
            items.append({"name": body.get("names", {}).get(rid) or f"{r['result']['title']} ({rid[:4]})", "result": r["result"]})
    return J(compare_runs(items))


# ---------- exportaciones ----------

def _ctx_for_export(pid: str, run_id: str | None):
    p = need(pid)
    r = store.get_run(run_id) if run_id else None
    res = r["result"] if r else None
    exp = res.get("explanation") if res else None
    if res and not exp:
        exp = explain(p, res)
    return p, res, exp


@app.get("/api/projects/{pid}/export/{kind}")
def export_(pid: str, kind: str, run_id: str | None = None, scale: int | None = None, source: str | None = None,
            target: str | None = None, criterion: str = "cost", value_field: str = "demand", min_sep: bool = True):
    p, res, exp = _ctx_for_export(pid, run_id)
    nm = re.sub(r"[^A-Za-z0-9_\-]+", "_", p["name"])[:40] or "proyecto"
    try:
        if kind == "excel":
            runs_ = [store.get_run(r["id"])["result"] for r in store.list_runs(pid)[:10]][::-1] if not res else [res]
            return _file(export.to_excel(p, runs_), f"{nm}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        if kind in ("word", "pdf"):
            if not res:
                raise HTTPException(422, "Elija una ejecución (run_id) para generar el informe.")
            img = export.graph_image(p, res)
            if kind == "word":
                return _file(export.to_word(p, res, exp, img), f"informe_{nm}.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            return _file(export.to_pdf(p, res, exp, img), f"informe_{nm}.pdf", "application/pdf")
        if kind in ("png", "svg"):
            return _file(export.graph_image(p, res, kind), f"grafo_{nm}.{kind}", "image/png" if kind == "png" else "image/svg+xml")
        if kind in ("graphml", "gexf"):
            return _file(export.to_graphml(p, kind), f"{nm}.{kind}", "application/xml")
        if kind == "json":
            return _file(json.dumps(clean({k: v for k, v in p.items()}), ensure_ascii=False, indent=1).encode(), f"{nm}.json", "application/json")
        if kind == "csv":
            return _file(export.to_csv_zip(p), f"{nm}_csv.zip", "application/zip")
        if kind == "geojson":
            return _file(export.to_geojson(p, res), f"{nm}.geojson", "application/geo+json")
        if kind == "sqlite":
            return _file(export.to_sqlite(p), f"{nm}.sqlite", "application/vnd.sqlite3")
        if kind == "grafos":
            files = export.grafos_package(p, scale, min_sep, criterion, value_field, source, target)
            b = io.BytesIO()
            import zipfile
            with zipfile.ZipFile(b, "w", zipfile.ZIP_DEFLATED) as z:
                for n, d in files.items():
                    z.writestr(n, d)
            return _file(b.getvalue(), f"Grafos_v1.3.5_{nm}.zip", "application/zip")
        if kind == "zip":
            rs = [store.get_run(r["id"]) for r in store.list_runs(pid)[:6]][::-1]
            results = [r["result"] for r in rs]
            exps = [r["result"].get("explanation") or explain(p, r["result"]) for r in rs]
            return _file(export.full_zip(p, results, exps, scale=scale, source=source, target=target), f"paquete_{nm}.zip", "application/zip")
    except ValueError as e:
        raise HTTPException(422, str(e))
    raise HTTPException(404, f"Formato desconocido: {kind}")


def _file(data: bytes, name: str, mt: str):
    return Response(data, media_type=mt, headers={"Content-Disposition": f'attachment; filename="{name}"'})


FRONT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "static")
if os.path.isdir(FRONT):
    app.mount("/", StaticFiles(directory=FRONT, html=True), name="static")
