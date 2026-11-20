"""Ejecuta los algoritmos 13-18 (GAMS, vía gamsx) y guarda resultados y figuras para las diapositivas."""
import os, sys, json, math, glob
sys.path.insert(0, os.path.dirname(__file__))
import gamsx
from instancia import COORD, DEM
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.ticker import MaxNLocator

BASE = os.path.dirname(os.path.abspath(__file__)); IMG = os.path.join(BASE, '..', 'img'); G = os.path.join(BASE, '..', '..', 'GAMS_algoritmos')
OPT = 425.0512878875082
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.edgecolor': '#D2D2D7', 'xtick.color': '#6E6E73', 'ytick.color': '#6E6E73',
                     'axes.spines.top': False, 'axes.spines.right': False, 'grid.color': '#E8E8ED'})
AZ, NA, VE, GR = '#0071E3', '#E8710A', '#248A3D', '#6E6E73'; RC = [AZ, NA, VE, '#8944AB', '#D70015']
D = lambda a, b: math.hypot(COORD[a][0] - COORD[b][0], COORD[a][1] - COORD[b][1])


def mapa(ax, rutas):
    ax.set_aspect('equal'); ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.grid(True, lw=0.6)
    ax.set_xticks(range(0, 101, 20)); ax.set_yticks(range(0, 101, 20)); ax.tick_params(labelsize=7.5)
    for k, ru in enumerate(rutas):
        pts = [0] + ru + [0]
        for a, b in zip(pts, pts[1:]):
            ax.annotate('', xy=COORD[b], xytext=COORD[a], arrowprops=dict(arrowstyle='-|>', color=RC[k % 5], lw=1.9, shrinkA=7, shrinkB=7, mutation_scale=10))
    for c in range(1, 11):
        x, y = COORD[c]; ax.scatter([x], [y], s=260, color='white', edgecolor='#1D1D1F', lw=1.3, zorder=5)
        ax.text(x, y, str(c), ha='center', va='center', fontsize=8.5, fontweight='bold', zorder=6)
    ax.scatter([COORD[0][0]], [COORD[0][1]], s=360, marker='s', color='#1D1D1F', zorder=7)
    ax.text(COORD[0][0], COORD[0][1], 'D', ha='center', va='center', color='white', fontsize=8.5, fontweight='bold', zorder=8)


def fig_mapa(nombre, rutas, w, h, rect, anc, fs):
    fig = plt.figure(figsize=(w, h), dpi=170); ax = fig.add_axes(list(rect)); mapa(ax, rutas); H = []
    for k, ru in enumerate(rutas):
        pts = [0] + ru + [0]; d = sum(D(a, b) for a, b in zip(pts, pts[1:]))
        H.append(Line2D([0], [0], color=RC[k % 5], lw=3, label=f'R{k+1}:  {" → ".join(map(str, ru))}\n        q = {sum(DEM[c] for c in ru)}/15  ·  {d:.1f}'))
    fig.legend(handles=H, loc='center left', bbox_to_anchor=(anc, 0.5), frameon=False, fontsize=fs, handlelength=1.5, labelspacing=1.1)
    fig.savefig(os.path.join(IMG, nombre + '.png')); plt.close(fig)


def linea(nombre, series, xl):
    fig, ax = plt.subplots(figsize=(5.6, 3.2), dpi=170)
    for k, (lab, xs, ys, est) in enumerate(series):
        ax.plot(xs, ys, label=lab, color=est.get('c', RC[k]), lw=est.get('lw', 2), marker=est.get('m'), ms=3.5, drawstyle=est.get('ds', 'default'))
    ax.axhline(OPT, color=VE, lw=1.2, ls='--'); ax.text(ax.get_xlim()[0], OPT, ' óptimo 425,05', va='bottom', ha='left', fontsize=8, color=VE)
    ax.xaxis.set_major_locator(MaxNLocator(integer=True)); ax.set_xlabel(xl, fontsize=9); ax.set_ylabel('costo', fontsize=9); ax.grid(True, lw=0.6); ax.tick_params(labelsize=8)
    if len(series) > 1: ax.legend(frameon=False, fontsize=8)
    fig.tight_layout(); fig.savefig(os.path.join(IMG, nombre + '.png')); plt.close(fig)


def correr(pref):
    f = glob.glob(os.path.join(G, pref + '_*.gms'))[0]; it = gamsx.correr(f)
    P = lambda n: it.par(n)
    rtc = P('rtc'); rutas = {}
    for (rs, p), v in rtc.items(): rutas.setdefault(rs, []).append((int(p[1:]), int(round(v))))
    rutas = [[c for _, c in sorted(v)] for k, v in sorted(rutas.items(), key=lambda kv: int(kv[0][1:]))]
    tr = [int(round(P('tr').get((f'p{k}',), 0))) for k in range(1, 11)]
    return it, {'tour': tr, 'rutas_dec': rutas, 'costo': P('costo_final'), 'gap': max(P('gap_pct'), 0.0), 'nev': int(P('nev'))}


def main():
    R = {}
    # 13 Or-opt
    it, r = correr('13'); h = it.par('histo'); n = len({k[0] for k in h})
    r['hist'] = [[k, int(h[(f'h{k}', 'l')]), int(h[(f'h{k}', 'a')]), int(h.get((f'h{k}', 'b'), 0)), h[(f'h{k}', 'costo')]] for k in range(1, n + 1)]
    r['inicial'] = 481.1575328249588; R['oropt'] = r
    linea('conv_oropt', [('costo', [0] + [x[0] for x in r['hist']], [r['inicial']] + [x[4] for x in r['hist']], dict(m='o', ds='steps-post'))], 'mejora aplicada')
    # 14 ILS
    it, r = correr('14'); h = it.par('histi')
    r['hist'] = [[k, h.get((f't{k}', 'vnd'), 0), h.get((f't{k}', 'mejor'), 0), int(h.get((f't{k}', 'acepta'), 0))] for k in range(0, 16)]
    R['ils'] = r
    linea('conv_ils', [('costo tras perturbar + VND', [x[0] for x in r['hist']], [x[1] for x in r['hist']], dict(c=GR, m='o', lw=1.4)), ('mejor', [x[0] for x in r['hist']], [x[2] for x in r['hist']], dict(c=AZ, lw=2.2))], 'iteración')
    # 15 LNS
    it, r = correr('15'); h = it.par('histl')
    r['hist'] = [[k, h.get((f't{k}', 'nuevo'), 0), h.get((f't{k}', 'mejor'), 0), int(h.get((f't{k}', 'acepta'), 0))] for k in range(1, 41)]
    R['lns'] = r
    linea('conv_lns', [('costo tras destruir y reparar', [x[0] for x in r['hist']], [x[1] for x in r['hist']], dict(c=GR, m='o', lw=1.2)), ('mejor', [x[0] for x in r['hist']], [x[2] for x in r['hist']], dict(c=AZ, lw=2.2))], 'iteración')
    # 16 Split
    it, r = correr('16'); r['tsp'] = it.nivel('zt'); r['vc'] = [it.par('vc').get((f'v{k}',), 0) for k in range(0, 11)]
    r['pred'] = [int(it.par('pred').get((f'v{k}',), 0)) for k in range(0, 11)]
    arco = it.par('arcoa'); r['arcos'] = [[int(a[1:]), int(b[1:]), v] for (a, b), v in arco.items()]
    R['split'] = r
    # 17 Fisher-Jaikumar
    it, r = correr('17'); r['semillas'] = [int(it.par('sem')[(f'k{k}',)]) for k in range(1, 4)]
    y = it.nivel('y'); r['asig'] = {c: [int(k[1:]) for (i, k), v in y.items() if i == f'c{c}' and v > 0.5][0] for c in range(1, 11)}
    cins = it.par('cins'); r['cins'] = {f'{i}.{k}': v for (i, k), v in cins.items()}
    r['gap_z'] = it.nivel('zg'); r['largos'] = [it.par('largok').get((f'k{k}',), 0) for k in range(1, 4)]; r['cargas'] = [it.par('cargak').get((f'k{k}',), 0) for k in range(1, 4)]
    R['fj'] = r
    # 18 Pétalos
    it, r = correr('18'); nrt = int(it.par('nrt')); ordA = [int(it.par('orda')[(f'p{k}',)]) for k in range(1, 11)]
    pet = []
    for k in range(1, nrt + 1):
        rt = f'rt{k}'; ini = int(it.par('inir')[(rt,)]); L = int(it.par('largor')[(rt,)])
        cl = [ordA[(ini + j - 1) % 10] for j in range(L)]
        pet.append({'k': k, 'cli': cl, 'carga': it.par('cargar')[(rt,)], 'costo': it.par('costor')[(rt,)], 'usa': it.nivel('zr').get((rt,), 0) > 0.5})
    r['orden'] = ordA; r['petalos'] = pet; R['petalos'] = r
    for k, v in R.items():
        fig_mapa('rutaw_' + k, v['rutas_dec'], 6.2, 3.0, (0.06, 0.1, 0.5, 0.86), 0.58, 9.5)
        fig_mapa('rutav_' + k, v['rutas_dec'], 4.1, 3.05, (0.06, 0.1, 0.48, 0.86), 0.56, 7.4)
        print(k, round(v['costo'], 2), v['nev'], v['rutas_dec'])
    json.dump(R, open(os.path.join(BASE, 'resultados_extra.json'), 'w'), ensure_ascii=False)


if __name__ == '__main__':
    main()
