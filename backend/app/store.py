"""Persistencia SQLite: proyectos versionados y ejecuciones (con parámetros y semillas)."""
from __future__ import annotations
import json
import os
import sqlite3
import threading
import time
import uuid

DB_PATH = os.environ.get("GRAFOS_DB", os.path.join(os.path.dirname(__file__), "..", "data", "grafos.db"))
_lock = threading.Lock()


def _con():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=30)
    c.row_factory = sqlite3.Row
    return c


def init():
    with _lock, _con() as c:
        c.executescript("""
        create table if not exists projects(id text primary key, name text, version integer, data text, updated real);
        create table if not exists versions(project_id text, version integer, data text, note text, created real, primary key(project_id, version));
        create table if not exists runs(id text primary key, project_id text, key text, params text, result text, created real);
        """)


def _dump(o):
    return json.dumps(o, ensure_ascii=False, default=_default)


def _default(o):
    try:
        import numpy as np
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
    except ImportError:
        pass
    if isinstance(o, (set, tuple)):
        return list(o)
    return str(o)


def create_project(project: dict, note="creado") -> str:
    pid = uuid.uuid4().hex[:12]
    with _lock, _con() as c:
        c.execute("insert into projects values(?,?,?,?,?)", (pid, project["name"], 1, _dump(project), time.time()))
        c.execute("insert into versions values(?,?,?,?,?)", (pid, 1, _dump(project), note, time.time()))
    return pid


def get_project(pid: str) -> dict | None:
    with _con() as c:
        r = c.execute("select * from projects where id=?", (pid,)).fetchone()
    if not r:
        return None
    p = json.loads(r["data"])
    p["id"], p["version"] = r["id"], r["version"]
    return p


def save_project(pid: str, project: dict, note="editado") -> int:
    with _lock, _con() as c:
        r = c.execute("select version from projects where id=?", (pid,)).fetchone()
        if not r:
            raise KeyError(pid)
        v = r["version"] + 1
        clean = {k: v_ for k, v_ in project.items() if k not in ("id", "version")}
        c.execute("update projects set name=?, version=?, data=?, updated=? where id=?", (clean["name"], v, _dump(clean), time.time(), pid))
        c.execute("insert into versions values(?,?,?,?,?)", (pid, v, _dump(clean), note, time.time()))
    return v


def list_projects():
    with _con() as c:
        rows = c.execute("select id,name,version,updated,data from projects order by updated desc").fetchall()
    out = []
    for r in rows:
        d = json.loads(r["data"])
        out.append({"id": r["id"], "name": r["name"], "version": r["version"], "updated": r["updated"],
                    "nodes": len(d["nodes"]), "edges": len(d["edges"])})
    return out


def delete_project(pid: str):
    with _lock, _con() as c:
        for t in ("projects", "versions", "runs"):
            c.execute(f"delete from {t} where {'id' if t == 'projects' else 'project_id'}=?", (pid,))


def versions(pid: str):
    with _con() as c:
        return [dict(r) for r in c.execute("select version,note,created from versions where project_id=? order by version desc", (pid,))]


def get_version(pid: str, v: int):
    with _con() as c:
        r = c.execute("select data from versions where project_id=? and version=?", (pid, v)).fetchone()
    return json.loads(r["data"]) if r else None


def add_run(pid: str, key: str, params: dict, result: dict) -> str:
    rid = uuid.uuid4().hex[:12]
    with _lock, _con() as c:
        c.execute("insert into runs values(?,?,?,?,?,?)", (rid, pid, key, _dump(params), _dump(result), time.time()))
    return rid


def get_run(rid: str):
    with _con() as c:
        r = c.execute("select * from runs where id=?", (rid,)).fetchone()
    if not r:
        return None
    return {"id": r["id"], "project_id": r["project_id"], "key": r["key"], "params": json.loads(r["params"]),
            "result": json.loads(r["result"]), "created": r["created"]}


def list_runs(pid: str):
    with _con() as c:
        rows = c.execute("select id,key,params,result,created from runs where project_id=? order by created desc limit 200", (pid,)).fetchall()
    out = []
    for r in rows:
        res = json.loads(r["result"])
        out.append({"id": r["id"], "key": r["key"], "title": res.get("title"), "status": res.get("status"), "value": res.get("value"),
                    "message": res.get("message"), "created": r["created"], "params": json.loads(r["params"])})
    return out
