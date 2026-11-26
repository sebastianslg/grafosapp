"""Convierte el Excel del caso (FSTSP_vehiculo_dron_30_clientes.xlsx) en un proyecto que importa la app
Parcial de Grafos (botón Importar → archivo .json), sin modificar la app.

- Nodos: depósito DC01 (tipo dc) y 30 clientes, con lat/lon, demanda (peso), servicio y ventana.
- Distancias del vehículo terrestre: Haversine (R = 6371,0088 km) × factor_red = 1,23 (hoja CONFIGURACION_RUTEO), en km.
- Flota: TRUCK01 (capacidad 200, 30 km/h, 0,35 $/km, costo fijo 25).
- Horario: 06:00 a 18:00 (horizonte 0–720 min), servicio 8 min por cliente.
Uso: python convertir_excel_a_app.py ../datos/FSTSP_vehiculo_dron_30_clientes.xlsx ../datos/
"""
import json, math, sys, csv, os
import openpyxl

def haversine(a, b):
    R = 6371.0088
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def main(xlsx, salida):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    filas = lambda h: [r for r in wb[h].iter_rows(min_row=2, values_only=True) if r and r[0] is not None]
    cab = lambda h: [c.value for c in wb[h][1]]
    conf = {r[0]: r[1] for r in filas('CONFIGURACION_RUTEO')}
    factor = float(conf['factor_red'])
    cn = cab('NODOS'); N = [dict(zip(cn, r)) for r in filas('NODOS')]
    cv = cab('VEHICULOS'); V = [dict(zip(cv, r)) for r in filas('VEHICULOS')][0]
    h0 = 6.0   # 06:00
    nodos = []
    for i, n in enumerate(N):
        dep = n['tipo'] == 'deposito'
        nodos.append({'id': i, 'nombre': f"{n['node_id']} · {n['nombre']}", 'codigo': n['node_id'], 'lat': float(n['latitud']), 'lon': float(n['longitud']),
                      'tipo': 'dc' if dep else 'cliente', 'peso': float(n['demanda']) if not dep else 1, 'extra': float(n['demanda']),
                      'vtOn': not dep, 'vtA': h0 + float(n['ventana_inicio']) / 60, 'vtB': h0 + float(n['ventana_fin']) / 60,
                      'habilidades': n.get('habilidades') or ''})
    D = [[None if i == j else round(haversine((a['lat'], a['lon']), (b['lat'], b['lon'])) * factor, 4) for j, b in enumerate(nodos)] for i, a in enumerate(nodos)]
    servicio = max(float(n['servicio']) for n in N if n['tipo'] != 'deposito')
    proyecto = {
        'titulo': 'FSTSP Cartagena · 30 clientes (vehículo terrestre)',
        'subtitulo': 'Caso FSTSP_vehiculo_dron_30_clientes · Cartagena de Indias · distancias Haversine × 1,23',
        'unidad': 'km', 'modoDist': 'euclidiana', 'factor': factor,
        'centro': [sum(n['lat'] for n in nodos) / len(nodos), sum(n['lon'] for n in nodos) / len(nodos)], 'zoom': 13,
        'nodos': nodos, 'D': D,
        'flota': [{'tipo': V['vehicle_id'], 'n': 1, 'cap': float(V['capacidad_carga']), 'costoKm': float(V['costo_km']), 'vel': float(V['velocidad_kmh']), 'fijo': float(V['costo_fijo'])}],
        'vt': {'usar': True, 'inicio': h0, 'servicio': servicio, 'cierre': h0 + float(V['turno_fin']) / 60},
        'parametros_caso': {k: conf[k] for k in conf},
        'vehiculo': V,
    }
    os.makedirs(salida, exist_ok=True)
    with open(os.path.join(salida, 'FSTSP_Cartagena_proyecto_app.json'), 'w', encoding='utf-8') as f:
        json.dump(proyecto, f, ensure_ascii=False, indent=1)
    with open(os.path.join(salida, 'FSTSP_Cartagena_nodos_app.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f); w.writerow(['id', 'nombre', 'lat', 'lon', 'tipo', 'demanda'])
        for n in nodos: w.writerow([n['id'], n['nombre'], n['lat'], n['lon'], n['tipo'], n['extra']])
    dem = sum(n['extra'] for n in nodos)
    print(f"{len(nodos)} nodos ({len(nodos) - 1} clientes), demanda total {dem:g} de {V['capacidad_carga']} de capacidad; servicio {servicio:g} min; factor vial {factor}")

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
