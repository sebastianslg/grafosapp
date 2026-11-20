"""Adaptador de pruebas: resuelve un modelo LP (stdin) con HiGHS de Python y escribe UNA línea JSON en stdout.
El banner de HiGHS se escribe en el descriptor 1 (C++), así que se redirige a /dev/null durante la resolución."""
import sys, json, tempfile, os
import highspy

lp, tl, gap = sys.stdin.read(), float(sys.argv[1]), float(sys.argv[2])
with tempfile.NamedTemporaryFile("w", suffix=".lp", delete=False) as f:
    f.write(lp); path = f.name
salida = os.dup(1); nulo = os.open(os.devnull, os.O_WRONLY); os.dup2(nulo, 1)     # silencia el banner de HiGHS
try:
    h = highspy.Highs(); h.setOptionValue("output_flag", False)
    h.setOptionValue("time_limit", max(tl, 1.0)); h.setOptionValue("mip_rel_gap", gap)
    h.readModel(path); os.unlink(path); h.run()
    st = h.modelStatusToString(h.getModelStatus()); info = h.getInfo(); sol = h.getSolution()
    names = [h.getColName(i)[1] for i in range(h.getNumCol())]
    ok = info.primal_solution_status == 2
    res = {"status": st, "ok": ok, "obj": info.objective_function_value if ok else None,
           "gap": (info.mip_gap if ok and info.mip_gap == info.mip_gap and abs(info.mip_gap) != float("inf") else None),
           "nodos": int(getattr(info, "mip_node_count", 0) or 0), "dual": (info.mip_dual_bound if info.mip_dual_bound == info.mip_dual_bound and abs(info.mip_dual_bound) != float("inf") else None),
           "values": dict(zip(names, list(sol.col_value))) if ok else {}}
finally:
    os.dup2(salida, 1); os.close(salida); os.close(nulo)
print(json.dumps(res))
