"""Verifica que cada cuadro de texto de un deck quepa en su caja: mide el texto con las métricas de Liberation Sans /
Mono (compatibles con Arial / Courier New), lo divide en líneas como lo hace PowerPoint y compara la altura con la caja.
Uso: python3 verificar_textos.py build/log_deck.json"""
import sys, json
from PIL import ImageFont

FD = '/usr/share/fonts/truetype/liberation/'
_cache = {}
def fuente(fam, bold, size):
    mono = 'courier' in (fam or '').lower()
    k = (mono, bold, round(size * 4))
    if k not in _cache:
        nombre = ('LiberationMono-' if mono else 'LiberationSans-') + ('Bold' if bold else 'Regular') + '.ttf'
        _cache[k] = ImageFont.truetype(FD + nombre, size=max(1, int(round(size * 4))))   # 4x para precisión
    return _cache[k]

def ancho(texto, fam, bold, size):
    return fuente(fam, bold, size).getlength(texto) / 4.0   # puntos

def parrafos(runs):
    pars = [[]]
    for r in runs:
        partes = str(r['t']).split('\n')
        for k, p in enumerate(partes):
            if k > 0: pars.append([])
            pars[-1].append(dict(r, t=p))
        if r.get('br'): pars.append([])
    return [p for p in pars if p] or [[]]

def lineas_parrafo(par, wpt):
    """envuelve por palabras usando el ancho real de cada fragmento"""
    if not par: return 1, 12
    size = max(r['s'] for r in par); bullet = any(r.get('bu') for r in par)
    avail = wpt - (11 if bullet else 0)
    tokens = []
    for r in par:
        for w in __import__('re').findall(r'\S+\s*|\s+', r['t']): tokens.append((w, r))
    n = 1; cur = 0.0
    for w, r in tokens:
        a = ancho(w, r['f'], r['b'], r['s']); a_sin = ancho(w.rstrip(), r['f'], r['b'], r['s'])
        if cur + a_sin > avail and cur > 0:
            n += 1; cur = a
            while cur > avail: n += 1; cur -= avail
        else: cur += a
    return n, size

def verificar(log, tol=0.04):
    malos = []
    for e in log:
        if e.get('tabla'):
            total = 0.0
            for fila in e['filas']:
                hmax = e['rowH']
                for celda, cw in zip(fila, e['colW']):
                    n, _ = lineas_parrafo([{'t': celda['t'], 's': e['size'], 'b': celda['b'], 'f': 'Arial'}], cw * 72 - 0.16 * 72)
                    hmax = max(hmax, n * e['size'] * 1.17 / 72 + 0.06)
                total += hmax
            if e['y'] + total > e['maxY'] + tol:
                malos.append((e['n'], 'tabla', round(e['y'] + total, 2), 'límite', e['maxY'], e['filas'][0][0]['t'][:30]))
            continue
        if e['w'] is None or e['h'] is None: continue
        wpt = e['w'] * 72; h = 0.0
        pars = parrafos(e['runs'])
        for k, p in enumerate(pars):
            n, size = lineas_parrafo(p, wpt)
            h += n * size * 1.17 / 72 + (e['ps'] / 72 if k < len(pars) - 1 else 0)
        if h > e['h'] + tol:
            txt = ''.join(r['t'] for r in e['runs'])[:70].replace('\n', ' ')
            malos.append((e['n'], round(h, 2), round(e['h'], 2), txt))
        if e['x'] + e['w'] > 13.34 + 1e-6 or e['y'] + e['h'] > 7.51: malos.append((e['n'], 'fuera de la diapositiva', e['x'], e['y']))
    return malos

if __name__ == '__main__':
    log = json.load(open(sys.argv[1]))
    m = verificar(log)
    for x in m: print('DESBORDE', x)
    print(f'{len(log)} cuadros de texto revisados; {len(m)} con problemas')
