"""Adaptador de prueba: resuelve un modelo LP (stdin) con HiGHS de Python y responde JSON."""
import sys, json, tempfile, os
import highspy
lp, tl, gap = sys.stdin.read(), float(sys.argv[1]), float(sys.argv[2])
with tempfile.NamedTemporaryFile("w", suffix=".lp", delete=False) as f:
    f.write(lp); path = f.name
h = highspy.Highs(); h.setOptionValue("output_flag", False)
h.setOptionValue("time_limit", max(tl, 1.0)); h.setOptionValue("mip_rel_gap", gap)
h.readModel(path); os.unlink(path); h.run()
st = h.modelStatusToString(h.getModelStatus())
info = h.getInfo()
sol = h.getSolution()
names = [h.getColName(i)[1] for i in range(h.getNumCol())]
ok = info.primal_solution_status == 2
print(json.dumps({"status": st, "ok": ok, "obj": info.objective_function_value if ok else None,
                  "gap": info.mip_gap if ok else None, "values": dict(zip(names, list(sol.col_value))) if ok else {}}))
