"""Ejecuta los 27 modelos GAMS (gamsx + HiGHS), extrae rutas y datos para las diapositivas y dibuja la figura de cada
solución. Guarda ref/modelos.json e img/mod_<id>.png. Usa caché por contenido del archivo (ref/cache_modelos/)."""
import os, sys, json, hashlib, math, time, pickle
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(__file__))
import gamsx
import modelos_gams as MG

BASE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(BASE, 'cache_modelos'); os.makedirs(CACHE, exist_ok=True)
IMG = os.path.join(BASE, '..', 'img'); os.makedirs(IMG, exist_ok=True)


def simbolos_utiles(it):
    """extrae a un dict serializable: parámetros, niveles de variables, escalares, conjuntos y resoluciones"""
    out = {'par': {}, 'var': {}, 'set': {}, 'mod': {}}
    for n, s in it.sim.items():
        if s.tipo == 'par': out['par'][n] = {'.'.join(k): v for k, v in s.datos.items()}
        elif s.tipo == 'var': out['var'][n] = {'.'.join(k): v for k, v in s.l.items() if abs(v) > 1e-7}
        elif s.tipo == 'set': out['set'][n] = ['.'.join(k) for k in s.datos.keys()]
        elif s.tipo == 'modelo': out['mod'][n] = {k: v for k, v in s.attr.items() if k != 'ecs'}
    out['res'] = it.resoluciones
    return out


def correr(m):
    ruta = os.path.join(MG.SAL, MG.nombre_archivo(m))
    texto = open(ruta, encoding='utf-8').read()
    h = hashlib.sha1(texto.encode()).hexdigest()[:16]
    cf = os.path.join(CACHE, f"{m['id']}_{h}.json")
    if os.path.exists(cf): return json.load(open(cf))
    t0 = time.time(); it = gamsx.Interprete(texto, ruta); it.ejecutar()
    d = simbolos_utiles(it); d['tiempo_total'] = time.time() - t0
    json.dump(d, open(cf, 'w')); return d


# ---------------------------------------------------------------------------------------- rutas
def rutas_de(d, m):
    """lista de rutas [(origen, [clientes], destino)] a partir de x.l (2 o 3 índices)"""
    x = d['var'].get('x', {}); arcos = {}
    por_k = {}
    for k, v in x.items():
        if v < 0.5: continue
        p = k.split('.')
        if len(p) == 2: por_k.setdefault('_', []).append((p[0], p[1]))
        else:
            clave = p[2] if m['id'] in ('vrppd', 'sdvrp') else '_'
            por_k.setdefault(clave, []).append((p[0], p[1]))
    rutas = []
    for clave, arcs in sorted(por_k.items()):
        succ = {}
        for a, b in arcs: succ.setdefault(a, []).append(b)
        deps = sorted({a for a, b in arcs if not a.startswith('c')})
        for dep in deps:
            for primero in sorted(succ.get(dep, []), key=lambda s: int(s[1:]) if s[1:].isdigit() else 0):
                seq = [primero]; act = primero; vis = {primero}
                while True:
                    nx = [b for b in succ.get(act, [])]
                    if not nx: fin = None; break
                    b = nx[0]
                    if not b.startswith('c'): fin = b; break
                    if b in vis: fin = None; break
                    seq.append(b); vis.add(b); act = b
                rutas.append({'veh': clave, 'ini': dep, 'cli': seq, 'fin': fin})
    return rutas


def dist(c, a, b): return math.hypot(c[a][0] - c[b][0], c[a][1] - c[b][1])


def completar(m, d):
    par = d['par']; cx, cy = par['cx'], par['cy']
    nodos = sorted(set(cx) | set(cy) | {k for k in par.get('dem', {})} | {'d'} if 'd' in cx else set(cx) | set(cy))
    coord = {n: (cx.get(n, 0.0), cy.get(n, 0.0)) for n in set(cx) | set(cy) | set(d['set'].get('i', []))}
    rutas = rutas_de(d, m)
    dem = par.get('dem', {})
    e = d['var'].get('e', {})
    for r in rutas:
        seq = [r['ini']] + r['cli'] + ([r['fin']] if r['fin'] else [])
        r['dist'] = sum(dist(coord, a, b) for a, b in zip(seq, seq[1:]))
        r['carga'] = sum(dem.get(c, 0) for c in r['cli'])
        if m['id'] == 'sdvrp': r['carga'] = sum(e.get(f'{c}.{r["veh"]}', 0) for c in r['cli'])
        if m['id'] == 'vrpb':
            Ls = set(d['set'].get('l', [])); r['entrega'] = sum(dem.get(c, 0) for c in r['cli'] if c in Ls); r['recoge'] = r['carga'] - r['entrega']
    z = d['var'].get('z', {}).get('', None)
    return {'coord': coord, 'rutas': rutas, 'z': z, 'par': par, 'var': d['var'], 'set': d['set'], 'res': d['res'], 'mod': d['mod']}


# ---------------------------------------------------------------------------------------- figuras
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.edgecolor': '#D2D2D7', 'xtick.color': '#6E6E73', 'ytick.color': '#6E6E73',
                     'axes.spines.top': False, 'axes.spines.right': False, 'grid.color': '#E8E8ED'})
RC = ['#0071E3', '#E8710A', '#248A3D', '#8944AB', '#D70015', '#0A7F8C', '#6E6E73']


def figura(m, R, nombre):
    coord = R['coord']; rutas = R['rutas']; par = R['par']
    fig = plt.figure(figsize=(6.2, 3.6), dpi=170); ax = fig.add_axes([0.05, 0.08, 0.52, 0.9])
    ax.set_aspect('equal'); ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.grid(True, lw=0.6)
    ax.set_xticks(range(0, 101, 20)); ax.set_yticks(range(0, 101, 20)); ax.tick_params(labelsize=7.5)
    visit = {c for r in rutas for c in r['cli']}
    H = []
    for k, r in enumerate(rutas):
        col = RC[k % len(RC)]; seq = [r['ini']] + r['cli'] + ([r['fin']] if r['fin'] else [])
        for a, b in zip(seq, seq[1:]):
            ax.annotate('', xy=coord[b], xytext=coord[a], arrowprops=dict(arrowstyle='-|>', color=col, lw=1.8, shrinkA=7, shrinkB=7, mutation_scale=10))
        cl = [c[1:] for c in r['cli']]
        cli = ' → '.join(cl) if len(cl) <= 6 else ' → '.join(cl[:5]) + '\n      → ' + ' → '.join(cl[5:])
        etiqueta = f"R{k+1}: {r['ini'].upper()} → {cli}" + (f" → {r['fin'].upper()}" if r['fin'] else ' (abierta)')
        if m['id'] == 'vrpb': extra = f"   dist {r['dist']:.1f} · entrega {r['entrega']:g} · recoge {r['recoge']:g}"
        elif m['id'] in ('vrpspd', 'vrppd'): extra = f"   dist {r['dist']:.1f}"
        else: extra = f"   dist {r['dist']:.1f}" + (f" · carga {r['carga']:g}" if m['fam'] not in ('Un vehículo', 'Varios viajantes', 'Selectivos') or m['id'] == 'pcvrp' else '')
        H.append(Line2D([0], [0], color=col, lw=3, label=etiqueta + '\n' + extra))
    for n, (x, y) in coord.items():
        if n.startswith('c'):
            gris = m['id'] in ('pcvrp', 'top') and n not in visit
            ax.scatter([x], [y], s=260, color='white' if not gris else '#F2F2F4', edgecolor='#1D1D1F' if not gris else '#B0B0B5', lw=1.3, zorder=5)
            ax.text(x, y, n[1:], ha='center', va='center', fontsize=8.5, fontweight='bold', color='#1D1D1F' if not gris else '#9A9AA0', zorder=6)
        else:
            abierto = True
            if m['id'] == 'lrp': abierto = R['var'].get('w', {}).get(n, 0) > 0.5
            ax.scatter([x], [y], s=360, marker='s', color='#1D1D1F' if abierto else '#C7C7CC', zorder=7)
            ax.text(x, y, n.upper() if len(n) > 1 else 'D', ha='center', va='center', color='white', fontsize=7.5, fontweight='bold', zorder=8)
    if m['id'] == 'vrppd':
        for a, b in [tuple(s.split('.')) for s in R['set'].get('pr', [])]:
            ax.annotate('', xy=coord[b], xytext=coord[a], arrowprops=dict(arrowstyle='->', color='#9A9AA0', lw=0.8, ls='--', shrinkA=9, shrinkB=9))
    fig.legend(handles=H, loc='center left', bbox_to_anchor=(0.585, 0.5), frameon=False, fontsize=7.8, handlelength=1.4, labelspacing=0.9)
    fig.savefig(os.path.join(IMG, nombre + '.png')); plt.close(fig)


def main():
    t0 = time.time()
    with Pool(4) as pool: datos = pool.map(correr, MG.M)
    out = {}
    for m, d in zip(MG.M, datos):
        R = completar(m, d); figura(m, R, 'mod_' + m['id'])
        out[m['id']] = {k: R[k] for k in ('z', 'rutas', 'par', 'var', 'set', 'res', 'mod')}
        out[m['id']]['coord'] = R['coord']
        print(f"{m['num']} {m['sigla']:9s} z={R['z']} rutas={len(R['rutas'])} res={[(r['modelo'], round(r.get('tiempo', 0), 1), r.get('nodos')) for r in R['res']]}")
    json.dump(out, open(os.path.join(BASE, 'modelos.json'), 'w'), ensure_ascii=False)
    print(f'{time.time() - t0:.0f} s')


if __name__ == '__main__':
    main()
