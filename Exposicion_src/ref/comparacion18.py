"""Figura comparativa de los 17 métodos heurísticos (brecha y evaluaciones)."""
import os, json
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
B = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(B, 'resultados.json'))); R.update(json.load(open(os.path.join(B, 'resultados_extra.json'))))
plt.rcParams.update({'font.family': 'DejaVu Sans', 'axes.spines.top': False, 'axes.spines.right': False, 'axes.edgecolor': '#D2D2D7', 'xtick.color': '#6E6E73', 'ytick.color': '#1D1D1F', 'grid.color': '#E8E8ED'})
orden = [('nn', 'Vecino más cercano'), ('insercion', 'Inserción más barata'), ('barrido', 'Barrido'), ('dos_opt', '2-opt'), ('oropt', 'Or-opt'), ('aco', 'Colonia de hormigas'),
         ('petalos', 'Pétalos'), ('fj', 'Fisher-Jaikumar'), ('split', 'Split (ruta primero)'), ('vnd', 'VND'), ('tabu', 'Búsqueda tabú'), ('sa', 'Recocido simulado'),
         ('ils', 'ILS'), ('vns', 'VNS'), ('lns', 'LNS'), ('grasp', 'GRASP'), ('ga', 'Algoritmo genético')]
GR, NA, VE, AZ = '#8E8E93', '#E8710A', '#248A3D', '#0071E3'
fig, axs = plt.subplots(1, 2, figsize=(12.0, 4.6), dpi=170, gridspec_kw={'width_ratios': [1.15, 1]}, sharey=True)
ys = list(range(len(orden)))[::-1]; gaps = [max(R[k]['gap'], 0) for k, _ in orden]
axs[0].barh(ys, gaps, color=[GR if g > 5 else (NA if g > 0.05 else VE) for g in gaps], height=0.66)
axs[0].set_yticks(ys); axs[0].set_yticklabels([n for _, n in orden], fontsize=10.5)
for y, g in zip(ys, gaps): axs[0].text(g + 0.2, y, f'{g:.2f} %'.replace('.', ','), va='center', fontsize=9.5)
axs[0].set_xlabel('brecha frente al óptimo (%)', fontsize=10.5); axs[0].set_xlim(0, 16.5); axs[0].grid(True, axis='x', lw=0.6)
nev = [max(R[k]['nev'], 1) for k, _ in orden]
axs[1].barh(ys, nev, color=AZ, height=0.66); axs[1].set_xscale('log'); axs[1].set_xlim(1, 2e5); axs[1].grid(True, axis='x', lw=0.6)
for y, k, v in zip(ys, [k for k, _ in orden], nev): axs[1].text(v * 1.15, y, (f'{R[k]["nev"]:,}'.replace(',', '.') if R[k]['nev'] else '0 (usa MIP)' if k in ('petalos', 'fj', 'split') else '0'), va='center', fontsize=9.5)
axs[1].set_xlabel('evaluaciones de la función de costo (escala log)', fontsize=10.5)
fig.tight_layout(); fig.savefig(os.path.join(B, '..', 'img', 'comparacion18.png')); print('ok')
