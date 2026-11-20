"""Ejecuta los .gms con el intérprete mínimo y compara con las implementaciones de referencia en Python."""
import sys, time, os, json
sys.path.insert(0, os.path.dirname(__file__))
from gams_mini import Interp
from instancia import *
import algoritmos as A
GD = os.path.join(os.path.dirname(__file__), '..', '..', 'GAMS_algoritmos')
def correr(nombre):
    t = open(os.path.join(GD, nombre + '.gms'), encoding='utf-8').read(); it = Interp(t); t0 = time.time(); it.ejecutar_programa()
    tr = [int(it.par['tr'][(f'p{k}',)]) for k in range(1, 11)]
    return it, tr, time.time() - t0
def py(f, *a, **k):
    NEV[0] = 0; r = f(*a, **k); return r, NEV[0]
def main(solo=None):
    nn, _ = A.vecino_mas_cercano(); res = {}
    casos = {
        '01_vecino_mas_cercano': lambda: (nn, 0),
        '02_barrido': lambda: (lambda r: (r[0], 10))(A.barrido()),
        '03_insercion_mas_barata': lambda: (lambda r: (r[1], 0))(A.insercion_mas_barata()),
        '04_dos_opt': lambda: (lambda r, n: (r[0], n))(*py(A.dos_opt, nn)),
        '05_vnd_relocate_swap_2opt': lambda: (lambda r, n: (r[0], n))(*py(A.vnd, nn)),
        '06_busqueda_tabu': lambda: (lambda r, n: (r[0], n))(*py(A.busqueda_tabu, nn)),
        '07_recocido_simulado': lambda: (lambda r, n: (r[0], n))(*py(A.recocido_simulado, nn)),
        '08_algoritmo_genetico': lambda: (lambda r, n: (r[0], n))(*py(A.algoritmo_genetico)),
        '09_colonia_de_hormigas': lambda: (lambda r, n: (r[0], n))(*py(A.colonia_hormigas)),
        '10_grasp': lambda: (lambda r, n: (r[0], n))(*py(A.grasp)),
        '11_vns': lambda: (lambda r, n: (r[0], n))(*py(A.vns, nn)),
    }
    ok = True
    for nombre, f in casos.items():
        if solo and solo not in nombre: continue
        try:
            it, tr, seg = correr(nombre)
        except Exception as ex:
            print('ERROR', nombre, repr(ex)); ok = False; continue
        ptr, pnev = f()
        cost = it.par['costo_final'][()]; nev = int(it.par['nev'].get((), 0))
        iguales = tr == list(ptr) and abs(cost - evaluar(list(ptr))) < 1e-9
        NEV[0] = 0
        print(('OK   ' if iguales else 'DIFF ') + nombre, 'costo GAMS-sim', round(cost, 4), 'tour', tr, '| ref', list(ptr), '| nev', nev, 'ref', pnev, '| %.1f s' % seg)
        if not iguales: ok = False
        res[nombre] = {'tour': tr, 'costo': cost, 'nev': nev}
    return ok, res
if __name__ == '__main__':
    ok, res = main(sys.argv[1] if len(sys.argv) > 1 else None); print('TODO IGUAL' if ok else 'HAY DIFERENCIAS')
