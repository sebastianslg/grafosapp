"""Corre el modelo exacto con el registro de HiGHS y extrae cota/incumbente por tiempo (para la gráfica de B&B)."""
import subprocess, sys, re, json, os
code = r'''
import sys; sys.path.insert(0, %r)
from exacto import *
z, xs, r = resolver(True)
print("RESULT", z, rutas_de(xs), r.mip_node_count, r.mip_dual_bound)
''' % os.path.dirname(os.path.abspath(__file__))
code = code.replace("resolver(True)", "resolver(True)")
# habilitar el registro: se vuelve a escribir la llamada con disp
code2 = code.replace("from exacto import *", "from exacto import *\nimport exacto, numpy as np\n")
p = subprocess.run([sys.executable, '-c', code2.replace("z, xs, r = resolver(True)", "import scipy.optimize as so\norig = so.milp\ndef m2(*a, **k):\n    k['options']['disp'] = True\n    return orig(*a, **k)\nexacto.milp = m2\nz, xs, r = exacto.resolver(True)")], capture_output=True, text=True)
out = p.stdout + p.stderr
filas = []
for l in out.split('\n'):
    m = re.match(r'^\s*([A-Za-z]?)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)%\s+(\S+)\s+(\S+)\s+(\S+)\s+\d+\s+\d+\s+\d+\s+\d+\s+([\d.]+)s', l)
    if m:
        try: filas.append({'nodos': int(m.group(2)), 'cota': float(m.group(6)), 'inc': None if m.group(7) == 'inf' else float(m.group(7)), 't': float(m.group(9))})
        except ValueError: pass
res = [l for l in out.split('\n') if l.startswith('RESULT')]
json.dump({'filas': filas, 'resultado': res}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bb_log.json'), 'w'), indent=1)
print(len(filas), res[:1], out[-300:] if not res else '')
