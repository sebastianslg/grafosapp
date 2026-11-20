"""Corre las implementaciones de referencia, guarda resultados.json y genera las figuras de la exposición."""
import sys, os, json, math, statistics
sys.path.insert(0, os.path.dirname(__file__))
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from instancia import *
import algoritmos as A
IMG = os.path.join(os.path.dirname(__file__), '..', 'img'); os.makedirs(IMG, exist_ok=True)
OPT = 425.0512878875082; OPT_RUTAS = [[5, 4, 3], [8, 7, 6], [9, 10, 1, 2]]
plt.rcParams.update({'font.family': 'Inter', 'font.size': 11, 'axes.edgecolor': '#D2D2D7', 'axes.labelcolor': '#1D1D1F', 'xtick.color': '#6E6E73', 'ytick.color': '#6E6E73', 'axes.spines.top': False, 'axes.spines.right': False, 'figure.facecolor': 'white', 'axes.facecolor': 'white', 'grid.color': '#E8E8ED'})
AZ, NA, VE, RO, MO, GR = '#0071E3', '#E8710A', '#248A3D', '#D70015', '#8944AB', '#6E6E73'
RC = [AZ, NA, VE, MO, RO]

def mapa(ax, rutas=None, cargas=None, titulo=None, etiquetas=True):
    ax.set_aspect('equal'); ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.grid(True, lw=0.6)
    ax.set_xticks(range(0, 101, 20)); ax.set_yticks(range(0, 101, 20)); ax.tick_params(labelsize=8)
    for s in ax.spines.values(): s.set_color('#D2D2D7')
    if rutas:
        for k, ru in enumerate(rutas):
            pts = [0] + ru + [0]; col = RC[k % len(RC)]
            for a, b in zip(pts, pts[1:]):
                ax.annotate('', xy=COORD[b], xytext=COORD[a], arrowprops=dict(arrowstyle='-|>', color=col, lw=2.0, shrinkA=7, shrinkB=7, mutation_scale=11))
    for c in range(1, N + 1):
        x, y = COORD[c]; ax.scatter([x], [y], s=330, color='white', edgecolor='#1D1D1F', lw=1.4, zorder=5)
        ax.text(x, y, str(c), ha='center', va='center', fontsize=9.5, fontweight='bold', zorder=6)
        if etiquetas: ax.text(x, y - 6.5, f'd={DEM[c]}', ha='center', va='center', fontsize=7.5, color='#6E6E73', zorder=6)
    ax.scatter([COORD[0][0]], [COORD[0][1]], s=420, marker='s', color='#1D1D1F', zorder=7)
    ax.text(COORD[0][0], COORD[0][1], 'D', ha='center', va='center', color='white', fontsize=10, fontweight='bold', zorder=8)

def fig_mapa(nombre, rutas=None, w=5.2, h=4.4):
    fig, ax = plt.subplots(figsize=(w, h), dpi=200); mapa(ax, rutas)
    if rutas:
        from matplotlib.lines import Line2D
        H = []
        for k, ru in enumerate(rutas):
            carga = sum(DEM[c] for c in ru); pts = [0] + ru + [0]; d = sum(DIST[a][b] for a, b in zip(pts, pts[1:]))
            H.append(Line2D([0], [0], color=RC[k % len(RC)], lw=2.5, label=f'R{k+1}: {" → ".join(map(str, ru))}  ·  q={carga}/{Q}  ·  {d:.1f}'))
        ax.legend(handles=H, loc='upper center', bbox_to_anchor=(0.5, -0.09), frameon=False, fontsize=8, ncol=1, handlelength=1.6)
    fig.tight_layout(); fig.savefig(os.path.join(IMG, nombre + '.png'), bbox_inches='tight'); plt.close(fig)

def linea(nombre, series, xlabel, ylabel, w=5.6, h=3.2, logx=False, hline=True, estilos=None):
    fig, ax = plt.subplots(figsize=(w, h), dpi=200)
    for k, (lab, xs, ys) in enumerate(series):
        e = (estilos or [{}] * len(series))[k]
        ax.plot(xs, ys, label=lab, color=e.get('c', RC[k % len(RC)]), lw=e.get('lw', 2.0), marker=e.get('m'), ms=3.5, drawstyle=e.get('ds', 'default'))
    if hline: ax.axhline(OPT, color=VE, lw=1.2, ls='--'); ax.text(ax.get_xlim()[0], OPT, ' óptimo 425,05', va='bottom', ha='left', fontsize=8, color=VE)
    from matplotlib.ticker import MaxNLocator
    ax.xaxis.set_major_locator(MaxNLocator(integer=True)); ax.set_xlabel(xlabel, fontsize=9); ax.set_ylabel(ylabel, fontsize=9); ax.grid(True, lw=0.6); ax.tick_params(labelsize=8)
    if len(series) > 1: ax.legend(frameon=False, fontsize=8)
    fig.tight_layout(); fig.savefig(os.path.join(IMG, nombre + '.png')); plt.close(fig)

def corre(f, *a, **k):
    NEV[0] = 0; r = f(*a, **k); return r, NEV[0]

R = {}
nn, trz_nn = A.vecino_mas_cercano(); R['nn'] = dict(tour=nn, traza=trz_nn, nev=0)
bt, filas_b, orden_b = A.barrido(); R['barrido'] = dict(tour=bt, rot=filas_b, orden=orden_b, ang=[round(math.degrees(A.angulo(c)), 1) for c in range(1, N + 1)], nev=10)
ru_i, tr_i, trz_i = A.insercion_mas_barata(); R['insercion'] = dict(tour=tr_i, rutas=[r for r in ru_i if r], traza=trz_i, nev=0)
(t2, h2), n2 = corre(A.dos_opt, nn); R['dos_opt'] = dict(tour=t2, hist=h2, nev=n2)
(tv, hv), nv = corre(A.vnd, nn); R['vnd'] = dict(tour=tv, hist=hv, nev=nv)
(tt, ht), ntt = corre(A.busqueda_tabu, nn); R['tabu'] = dict(tour=tt, hist=ht, nev=ntt)
(ts, hs, ac), nsa = corre(A.recocido_simulado, nn); R['sa'] = dict(tour=ts, hist=hs, acept=ac, nev=nsa)
(tg, hg), nga = corre(A.algoritmo_genetico); R['ga'] = dict(tour=tg, hist=hg, nev=nga)
(ta, ha), nac = corre(A.colonia_hormigas); R['aco'] = dict(tour=ta, hist=ha, nev=nac)
(tr_g, hgr), ngr = corre(A.grasp); R['grasp'] = dict(tour=tr_g, hist=hgr, nev=ngr)
(tvn, hvn, ivn), nvn = corre(A.vns, nn); R['vns'] = dict(tour=tvn, hist=hvn, intentos=ivn, nev=nvn)
for k, v in R.items():
    c, ru = evaluar(v['tour'], True); v['costo'] = c; v['rutas_dec'] = ru; v['gap'] = 100 * (c - OPT) / OPT
# robustez: 20 semillas
rob = {}
def semillas(f, n=20): return [evaluar(f(s)) for s in range(1, n + 1)]
rob['sa'] = semillas(lambda s: A.recocido_simulado(nn, seed=s)[0])
rob['ga'] = semillas(lambda s: A.algoritmo_genetico(seed=s)[0])
rob['aco'] = semillas(lambda s: A.colonia_hormigas(seed=s)[0])
rob['grasp'] = semillas(lambda s: A.grasp(seed=s)[0])
rob['vns'] = semillas(lambda s: A.vns(nn, seed=s)[0])
R['robustez'] = {k: dict(valores=[round(x, 4) for x in v], media=statistics.mean(v), mejor=min(v), peor=max(v), optimas=sum(1 for x in v if abs(x - OPT) < 1e-3)) for k, v in rob.items()}
R['optimo'] = dict(costo=OPT, rutas=OPT_RUTAS, relajacion=308.4659788838499, nodos_highs=1369, tiempo_highs=1.7, log=[dict(f, cota=(None if f['cota'] == float('-inf') else f['cota'])) for f in json.load(open(os.path.join(os.path.dirname(__file__), 'bb_log.json')))['filas']])
json.dump(R, open(os.path.join(os.path.dirname(__file__), 'resultados.json'), 'w'), indent=1, default=float)

# ---------- figuras ----------
fig_mapa('instancia')
for k in ('nn', 'barrido', 'insercion', 'dos_opt', 'vnd', 'tabu', 'sa', 'ga', 'aco', 'grasp', 'vns'): fig_mapa('ruta_' + k, R[k]['rutas_dec'])
fig_mapa('ruta_exacto', OPT_RUTAS)
linea('conv_dos_opt', [('costo', [h[0] for h in h2], [h[2] for h in h2])], 'mejora aplicada', 'costo', estilos=[dict(m='o', ds='steps-post')])
linea('conv_vnd', [('costo', [h[0] for h in hv], [h[3] for h in hv])], 'mejora aplicada', 'costo', estilos=[dict(m='o', ds='steps-post')])
linea('conv_tabu', [('costo actual', [h[0] for h in ht], [h[2] if h[2] else evaluar(nn) for h in ht]), ('mejor costo', [h[0] for h in ht], [h[3] for h in ht])], 'iteración', 'costo', estilos=[dict(c=GR, lw=1.5), dict(c=AZ, lw=2.2)])
linea('conv_sa', [('costo actual', [h[0] for h in hs], [h[1] for h in hs]), ('mejor costo', [h[0] for h in hs], [h[2] for h in hs])], 'iteración', 'costo', estilos=[dict(c=GR, lw=1.5, m='o'), dict(c=AZ, lw=2.2)])
linea('conv_ga', [('promedio de la población', [h[0] for h in hg], [h[2] for h in hg]), ('mejor individuo', [h[0] for h in hg], [h[1] for h in hg])], 'generación', 'costo', estilos=[dict(c=GR, lw=1.5), dict(c=AZ, lw=2.2)])
linea('conv_aco', [('mejor de la iteración', [h[0] for h in ha], [h[1] for h in ha]), ('mejor global', [h[0] for h in ha], [h[2] for h in ha])], 'iteración', 'costo', estilos=[dict(c=GR, lw=1.5, m='o'), dict(c=AZ, lw=2.2)])
linea('conv_grasp', [('construcción', [h[0] for h in hgr], [h[1] for h in hgr]), ('tras búsqueda local', [h[0] for h in hgr], [h[2] for h in hgr]), ('mejor', [h[0] for h in hgr], [h[3] for h in hgr])], 'iteración', 'costo', estilos=[dict(c=NA, lw=1.4, m='o'), dict(c=GR, lw=1.4, m='o'), dict(c=AZ, lw=2.2)])
linea('conv_vns', [('costo de la incumbente', [h[0] for h in hvn], [h[3] for h in hvn])], 'iteración', 'costo', estilos=[dict(c=AZ, m='o', ds='steps-post')])
def fig_mapa_ancho(nombre, rutas, w=6.2, h=3.0, rect=(0.06, 0.1, 0.5, 0.86), anc=0.58, fs=9.5):
    from matplotlib.lines import Line2D
    fig = plt.figure(figsize=(w, h), dpi=200); ax = fig.add_axes(list(rect)); mapa(ax, rutas)
    H = []
    for k, ru in enumerate(rutas):
        carga = sum(DEM[c] for c in ru); pts = [0] + ru + [0]; d = sum(DIST[a][b] for a, b in zip(pts, pts[1:]))
        H.append(Line2D([0], [0], color=RC[k % len(RC)], lw=3, label=f'R{k+1}:  {" → ".join(map(str, ru))}\n        q = {carga}/{Q}  ·  {d:.1f}'))
    fig.legend(handles=H, loc='center left', bbox_to_anchor=(anc, 0.5), frameon=False, fontsize=fs, handlelength=1.6, labelspacing=1.1)
    fig.savefig(os.path.join(IMG, nombre + '.png')); plt.close(fig)
for k in ('nn', 'barrido', 'insercion', 'dos_opt', 'vnd', 'tabu', 'sa', 'ga', 'aco', 'grasp', 'vns'): fig_mapa_ancho('rutaw_' + k, R[k]['rutas_dec']); fig_mapa_ancho('rutav_' + k, R[k]['rutas_dec'], w=4.1, h=3.05, rect=(0.07, 0.1, 0.5, 0.86), anc=0.59, fs=8.2)
fig_mapa_ancho('rutav_exacto', OPT_RUTAS, w=4.1, h=3.05, rect=(0.07, 0.1, 0.5, 0.86), anc=0.59, fs=8.2)
# robustez
fig, ax = plt.subplots(figsize=(5.8, 3.3), dpi=200); nombres = {'sa': 'Recocido', 'ga': 'Genético', 'aco': 'Hormigas', 'grasp': 'GRASP', 'vns': 'VNS'}
for k, (key, nom) in enumerate(nombres.items()):
    vs = rob[key]; xs = [k + (i % 5 - 2) * 0.06 for i in range(len(vs))]
    ax.scatter(xs, vs, s=22, color=RC[k % 5], alpha=0.8, zorder=3); ax.hlines(statistics.mean(vs), k - 0.25, k + 0.25, color='#1D1D1F', lw=1.6, zorder=4)
ax.axhline(OPT, color=VE, ls='--', lw=1.2); ax.set_xticks(range(5)); ax.set_xticklabels(list(nombres.values()), fontsize=9); ax.set_ylabel('costo final (20 semillas)', fontsize=9); ax.grid(True, axis='y', lw=0.6); ax.tick_params(labelsize=8)
ax.text(4.45, OPT, 'óptimo', color=VE, fontsize=8, va='bottom', ha='right'); fig.tight_layout(); fig.savefig(os.path.join(IMG, 'robustez.png')); plt.close(fig)
# comparación general
orden = [('nn', 'Vecino más cercano'), ('insercion', 'Inserción más barata'), ('barrido', 'Barrido'), ('dos_opt', '2-opt'), ('aco', 'Colonia de hormigas'), ('vnd', 'VND'), ('tabu', 'Búsqueda tabú'), ('sa', 'Recocido simulado'), ('ga', 'Algoritmo genético'), ('grasp', 'GRASP'), ('vns', 'VNS')]
fig, axs = plt.subplots(1, 2, figsize=(12.0, 4.2), dpi=200, gridspec_kw={'width_ratios': [1.2, 1]}, sharey=True)
ys = list(range(len(orden)))[::-1]; col = [GR if R[k]['gap'] > 5 else (NA if R[k]['gap'] > 0.05 else VE) for k, _ in orden]
axs[0].barh(ys, [R[k]['gap'] for k, _ in orden], color=col, height=0.66); axs[0].set_yticks(ys); axs[0].set_yticklabels([n for _, n in orden], fontsize=11)
for y, (k, _) in zip(ys, orden): axs[0].text(R[k]['gap'] + 0.2, y, f"{R[k]['gap']:.2f} %", va='center', fontsize=10, color='#1D1D1F')
axs[0].set_xlabel('brecha frente al óptimo (%)', fontsize=11); axs[0].set_xlim(0, 16.5); axs[0].tick_params(labelsize=10)
axs[1].barh(ys, [max(R[k]['nev'], 1) for k, _ in orden], color=AZ, height=0.66); axs[1].set_xscale('log'); axs[1].set_xlabel('evaluaciones del costo (escala logarítmica)', fontsize=11); axs[1].tick_params(labelsize=10)
for y, (k, _) in zip(ys, orden): axs[1].text(max(R[k]['nev'], 1) * 1.15, y, f"{R[k]['nev']:,}".replace(',', '.'), va='center', fontsize=10)
axs[1].set_xlim(1, 2e5); fig.tight_layout(); fig.savefig(os.path.join(IMG, 'comparacion.png')); plt.close(fig)
# B&B
lg = R['optimo']['log']; ts = [f['t'] for f in lg]; inc = [f['inc'] for f in lg]; cota = [f['cota'] for f in lg]
fig, ax = plt.subplots(figsize=(5.6, 3.2), dpi=200)
ax.plot(ts, inc, color=NA, lw=2.2, marker='o', ms=4, label='mejor solución entera (cota superior)'); ax.plot([t for t, c in zip(ts, cota) if c], [c for c in cota if c], color=AZ, lw=2.2, marker='o', ms=4, label='mejor cota (cota inferior)')
ax.axhline(R['optimo']['relajacion'], color=GR, ls=':', lw=1.2); ax.text(ts[-1], R['optimo']['relajacion'], ' relajación lineal 308,47', va='top', ha='right', fontsize=8, color=GR)
ax.set_xlabel('tiempo (s)', fontsize=9); ax.set_ylabel('costo', fontsize=9); ax.grid(True, lw=0.6); ax.tick_params(labelsize=8); ax.legend(frameon=False, fontsize=8, loc='center right'); fig.tight_layout(); fig.savefig(os.path.join(IMG, 'conv_bb.png')); plt.close(fig)
for k in ['nn', 'barrido', 'insercion', 'dos_opt', 'vnd', 'tabu', 'sa', 'ga', 'aco', 'grasp', 'vns']: print(k, round(R[k]['costo'], 4), round(R[k]['gap'], 3), R[k]['nev'], len(R[k]['rutas_dec']))
print({k: (round(v['media'], 2), round(v['mejor'], 2), round(v['peor'], 2), v['optimas']) for k, v in R['robustez'].items()})
