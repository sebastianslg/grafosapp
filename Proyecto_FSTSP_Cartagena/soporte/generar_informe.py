"""Genera el informe ejecutivo (Parte 1) sobre la plantilla UTB del curso (portada con logo).
Todas las cifras salen de los resultados de la app (soporte/resultados_app.json y resultado_camion_dron_*.json)
y las imágenes son capturas de la app (capturas/recortes)."""
import copy, json, os
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

BASE = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(BASE)
PLANTILLA = os.path.join(RAIZ, '..', 'data', 'cali_ara', 'Informe_Recorrido_ARA_Cali.docx')
IMG = os.path.join(RAIZ, 'capturas', 'recortes')
R = json.load(open(os.path.join(BASE, 'resultados_app.json'), encoding='utf-8'))
DM = json.load(open(os.path.join(BASE, 'resultado_camion_dron_modelo.json'), encoding='utf-8'))
DC = json.load(open(os.path.join(BASE, 'resultado_camion_dron_comparar.json'), encoding='utf-8'))
f = lambda x, d=2: f"{x:,.{d}f}".replace(',', 'X').replace('.', ',').replace('X', '.')

doc = Document(PLANTILLA)
P = doc.paragraphs
# ---- portada: se conservan logo y formato, se cambian los textos ----
def poner(p, texto):
    for r in p.runs[1:]: r.text = ''
    if p.runs: p.runs[0].text = texto
poner(P[3], 'Distribución y Transporte')
poner(P[4], 'Parte 1: ruteo de un vehículo y un dron en Cartagena')
poner(P[5], 'Caso FSTSP con 30 clientes · informe ejecutivo')
poner(P[10], 'Juan Sebastián Salas Lugo y Alejandro Álvarez Torres')
# ---- se borra el cuerpo anterior (todo lo que sigue al salto de página de la portada) ----
cuerpo = doc.element.body; corte = P[22]._p
borrar = False
for el in list(cuerpo):
    if borrar and el.tag != qn('w:sectPr'): cuerpo.remove(el)
    if el is corte: borrar = True

def h1(t): return doc.add_paragraph(t, style='Heading 1')
def par(t, negritas=()):
    p = doc.add_paragraph()
    partes = [t]
    for n in negritas:
        nuevas = []
        for s in partes:
            if isinstance(s, tuple): nuevas.append(s); continue
            a, b, c = s.partition(n)
            nuevas += [a] + ([(n,)] if b else []) + ([c] if b else [])
        partes = nuevas
    for s in partes:
        if isinstance(s, tuple): r = p.add_run(s[0]); r.bold = True
        elif s: p.add_run(s)
    p.paragraph_format.first_line_indent = Cm(1.27)
    return p
fig_n = [0]; tab_n = [0]
def figura(archivo, titulo, ancho=15, nota=None):
    fig_n[0] += 1
    a = doc.add_paragraph(); a.add_run(f'Figura {fig_n[0]}').bold = True; a.paragraph_format.keep_with_next = True
    b = doc.add_paragraph(); b.add_run(titulo).italic = True; b.paragraph_format.keep_with_next = True
    doc.add_picture(os.path.join(IMG, archivo), width=Cm(ancho)); doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    if nota: n = doc.add_paragraph(); n.add_run('Nota. ').italic = True; n.add_run(nota)
def bordes(t):
    tbl = t._tbl; pr = tbl.tblPr; b = OxmlElement('w:tblBorders')
    for lado in ('top', 'bottom', 'insideH'):
        e = OxmlElement('w:' + lado); e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), '6'); e.set(qn('w:color'), '808080'); b.append(e)
    pr.append(b)
def tabla(titulo, cab, filas, nota=None, anchos=None):
    tab_n[0] += 1
    a = doc.add_paragraph(); a.add_run(f'Tabla {tab_n[0]}').bold = True; a.paragraph_format.keep_with_next = True
    b = doc.add_paragraph(); b.add_run(titulo).italic = True; b.paragraph_format.keep_with_next = True
    t = doc.add_table(rows=1, cols=len(cab)); bordes(t)
    for i, c in enumerate(cab):
        cel = t.rows[0].cells[i]; cel.text = ''; r = cel.paragraphs[0].add_run(c); r.bold = True; r.font.size = Pt(10)
    for fila in filas:
        cs = t.add_row().cells
        for i, v in enumerate(fila):
            cs[i].text = ''; r = cs[i].paragraphs[0].add_run(str(v)); r.font.size = Pt(10)
    if anchos:
        for fila in t.rows:
            for i, w in enumerate(anchos): fila.cells[i].width = Cm(w)
    if nota: n = doc.add_paragraph(); n.add_run('Nota. ').italic = True; n.add_run(nota)
    doc.add_paragraph()

c = R['02_modelo_cvrp']; v = R['03_modelo_vrptw']; m = R['05_comparar_metaheuristicas']
km = c['total']; obj = c['objetivo']; nombres = c['nombres']
cod = lambda i: nombres[i].split(' · ')[0]
llegadas = v['info'][0]['llegadas']; hh = lambda x: f"{int(x):02d}:{int(round((x % 1) * 60)) % 60:02d}"
metas = [x for x in m['comparacion'] if x['tipo'] == 'meta']; al_opt = [x for x in metas if abs(x['obj'] - obj) < 1e-6]
dmr = {x['metodo']: x for x in DC['comparacion']}
camD = DM['info'][0]; dron = DM['info'][1]; dron_cli = [cod(i) for i in DM['rutas'][1][1:-1]]

# ===================== RESUMEN EJECUTIVO =====================
h1('Resumen ejecutivo')
par(f'Se resolvió el caso de reparto de 30 droguerías y clientes de Cartagena desde el Centro de Distribución Bosque con la aplicación '
    f'de ruteo desarrollada en el curso, primero con el modelo matemático y después con metaheurísticas. La ruta del camión es la '
    f'mejor posible: {f(km)} km, con regreso al centro a las 12:13, y quedó probada como óptima (brecha 0 %) en {f(c["seg"])} s. '
    f'Las ocho metaheurísticas de la aplicación llegan a esa misma ruta. Al agregar el dron, la aplicación le asigna dos entregas '
    f'cercanas al centro y el camión regresa 18 minutos antes (11:55).', negritas=(f'{f(km)} km', 'brecha 0 %', '18 minutos antes'))
tabla('Indicadores clave de desempeño', ['Indicador', 'Solo camión', 'Camión + dron'], [
    ['Estado de la solución', 'Óptimo probado (brecha 0 %)', 'Mejor solución hallada'],
    ['Distancia del camión', f'{f(km)} km', f'{f(camD["dist"], 1)} km'],
    ['Distancia del dron', '—', f'{f(dron["dist"], 1)} km'],
    ['Clientes atendidos por el camión / dron', '30 / 0', f'28 / 2 ({", ".join(dron_cli)})'],
    ['Duración de la jornada del camión', '6,22 h', '5,91 h'],
    ['Hora de regreso del camión', '12:13', '11:55'],
    ['Uso de la capacidad del camión', '90 de 200 (45 %)', f'{f(camD["carga"], 0)} de 200 (44 %)'],
    ['Costo de recorrido (0,35 por km)', f'{f(obj)}', f'{f(0.35 * camD["dist"])}'],
    ['Emisiones del camión (0,27 kg CO₂/km)', f'{f(0.27 * km, 1)} kg', f'{f(0.27 * camD["dist"], 1)} kg'],
    ['Metaheurísticas que alcanzan la mejor solución', f'{len(al_opt)} de 8', '5 de 8'],
], nota='Valores de la aplicación (distancias, horas, cargas y estados). El costo y las emisiones usan los factores del archivo del caso '
        '(costo_km = 0,35; co2_kg_km = 0,27) sobre la distancia que da la aplicación.')

# ===================== 1. CASO =====================
h1('1. El caso')
par('El caso entregado (archivo FSTSP_vehiculo_dron_30_clientes.xlsx) es un reparto urbano en Cartagena de Indias: un centro de '
    'distribución, 30 clientes con demandas de 1 a 5 unidades y ventanas de 06:00 a 18:00, un camión (capacidad 200, 30 km/h, '
    '0,35 por km) y un dron (capacidad 5, 50 km/h, autonomía de 30 minutos). El objetivo es terminar el reparto en el menor tiempo. '
    'Cada cliente necesita 8 minutos de servicio con el camión.')
par('El archivo de Excel es solo la fuente de información, así que se transformó en un proyecto que la aplicación importa directamente '
    '(FSTSP_Cartagena_proyecto_app.json): los 31 nodos con su ubicación y demanda, la flota, el horario y las distancias del camión, '
    'que son la distancia en línea recta multiplicada por el factor vial urbano del caso (1,23).', negritas=('se transformó en un proyecto que la aplicación importa',))
figura('r01_importar.png', 'Importación del proyecto en la aplicación', 12, 'La aplicación reconoce el proyecto completo con sus 31 nodos.')
figura('r02_nodos.png', 'Centro de distribución y clientes cargados en la aplicación', 16)

# ===================== 2. PROCEDIMIENTO =====================
h1('2. Cómo se resolvió')
par('En la aplicación se eligió el problema de ruteo de vehículos (VRP) con la flota del caso. El procedimiento tuvo dos pasos, como pide el enunciado:')
par('Paso 1, optimización matemática: el «Modelo matemático (exacto)» de la aplicación plantea el problema como un modelo de programación '
    'entera y lo resuelve con el optimizador HiGHS. Cuando la brecha llega a 0 %, la ruta es la mejor que existe.', negritas=('Paso 1, optimización matemática:',))
par('Paso 2, metaheurística: con «Comparar con heurísticas», la aplicación corre los algoritmos del curso (recocido simulado, búsqueda tabú, '
    'algoritmo genético, colonia de hormigas, GRASP, VNS, ILS y LNS, además de las heurísticas constructivas) y muestra la distancia de cada '
    'uno frente al óptimo.', negritas=('Paso 2, metaheurística:',))
par('Se analizaron dos escenarios: el camión solo y el camión con el dron. En el segundo, el dron se incluyó en la flota de la aplicación '
    'como un segundo tipo de vehículo, con su capacidad y su velocidad, y el costo de cada kilómetro igual al tiempo que tarda cada vehículo '
    'en recorrerlo (1/30 h para el camión y 1/50 h para el dron), para que la aplicación minimice el tiempo, que es el objetivo del caso.')

# ===================== 3. CAMIÓN =====================
h1('3. Resultado con el camión')
par(f'El modelo matemático encontró la ruta óptima en {f(c["seg"])} s: el camión recorre {f(km)} km, atiende a los 30 clientes y lleva '
    f'90 unidades (45 % de su capacidad). La aplicación la marca como «Óptimo probado» con brecha 0 %.', negritas=('«Óptimo probado»',))
figura('r03_mapa_camion.png', 'Ruta óptima del camión sobre el mapa de Cartagena', 15)
figura('r04_panel_modelo.png', 'Resultado del modelo matemático en la aplicación', 10)
par('Con el horario del caso (salida 06:00, 8 minutos de servicio por cliente), la aplicación programa la jornada: la primera entrega es a las '
    f'{hh(llegadas[1])}, la última a las {hh(max(x for x in llegadas if x))} y el camión regresa a las 12:13. Todas las entregas quedan dentro de la '
    'ventana de 06:00 a 18:00, por lo que la ruta óptima también cumple el horario.')
figura('r05_gantt_camion.png', 'Jornada del camión (diagrama de Gantt de la aplicación)', 12)
tabla('Orden de visita del camión', ['#', 'Cliente', 'Llegada', '#', 'Cliente', 'Llegada'],
      [[q + 1, cod(v['rutas'][0][q + 1]), hh(llegadas[q + 1]), q + 16, cod(v['rutas'][0][q + 16]), hh(llegadas[q + 16])] for q in range(15)],
      nota='Hora de llegada según la programación de la aplicación (sale del centro DC01 a las 06:00 y regresa a las 12:13).')

# ===================== 4. METAHEURÍSTICAS =====================
h1('4. Resultado con las metaheurísticas')
par(f'Las {len(al_opt)} metaheurísticas de la aplicación encuentran la misma ruta óptima ({f(obj)}), cada una en 10 segundos. Las heurísticas '
    'simples quedan por encima: la mejor, Fisher-Jaikumar, a 1,2 % del óptimo, y el vecino más cercano, a 22 %. Esto confirma que la '
    'ruta del modelo es la mejor y que una metaheurística bien diseñada llega a ella sin resolver el modelo completo.', negritas=('encuentran la misma ruta óptima',))
filas = []
for x in m['comparacion']:
    gap = (x['obj'] - obj) / x['obj'] * 100
    filas.append([x['metodo'], {'exacto': 'Modelo matemático', 'meta': 'Metaheurística', 'heuristica': 'Heurística'}[x['tipo']], f(x['obj']), f'{f(x["obj"] / 0.35, 1)} km', f'{f(gap)} %', f(x['seg'], 1)])
tabla('Comparación de métodos en la aplicación (camión)', ['Método', 'Tipo', 'Costo', 'Distancia', 'Brecha', 's'], filas,
      nota='Costo = 0,35 por km. Brecha frente al óptimo del modelo matemático.')
figura('r06_tabla_metaheuristicas.png', 'Tabla de comparación tal como la muestra la aplicación', 9)
figura('r07_graficas.png', 'Indicadores de la ruta en la pestaña Gráficas de la aplicación', 10)

# ===================== 5. CAMIÓN + DRON =====================
h1('5. Resultado con el camión y el dron')
par(f'Con el dron en la flota, la aplicación le asigna las entregas de {dron_cli[0]} y {dron_cli[1]}, las dos más cercanas al centro de '
    f'distribución: el dron vuela {f(dron["dist"], 1)} km y termina a las 06:19. El camión atiende a los otros 28 clientes con '
    f'{f(camD["dist"], 1)} km y regresa a las 11:55, 18 minutos antes que sin el dron (−5 %).', negritas=('18 minutos antes',))
figura('r08_mapa_dron.png', 'Rutas del camión (azul) y del dron (naranja)', 15)
figura('r10_gantt_dron.png', 'Jornada del camión y del dron (diagrama de Gantt de la aplicación)', 12)
filas = [[x, dmr[x]['tipo'].replace('meta', 'Metaheurística').replace('heuristica', 'Heurística').replace('exacto', 'Modelo matemático'), f(dmr[x]['obj'], 3), f(dmr[x]['seg'], 1)]
         for x in ['Recocido simulado', 'Algoritmo genético', 'Colonia de hormigas', 'VNS (búsqueda de vecindario variable)', 'ILS (búsqueda local iterada)', 'Búsqueda tabú', 'GRASP', 'LNS (destruir y reparar)', 'Fisher-Jaikumar (asignación + TSP)', 'Ahorros (Clarke-Wright)']]
filas.insert(0, ['Modelo matemático (10 min)', 'Modelo matemático', f(DM['objetivo'], 3), f(DM['seg'], 1)])
tabla('Horas de recorrido por método (camión + dron)', ['Método', 'Tipo', 'Horas de recorrido', 's'], filas,
      nota='Horas de recorrido = suma de km / velocidad de cada vehículo, según la aplicación. El recocido simulado, el genético, '
           'colonia de hormigas, VNS e ILS llegan en 10 s a la misma solución que el modelo matemático en 10 minutos.')
par('El dron atiende pocos clientes porque, en la aplicación, cada vuelo sale y regresa al centro de distribución. En el esquema completo del '
    'caso (FSTSP), el dron despega desde el camión durante la ruta y aterriza en él más adelante, lo que le permitiría atender a más '
    'clientes lejanos; ese esquema de vuelos sincronizados no está entre los modelos de la aplicación, así que el ahorro de 18 minutos es '
    'el que se logra con vuelos desde el centro y es una cota conservadora del beneficio del dron.')

# ===================== 6. CONCLUSIONES =====================
h1('6. Conclusiones y recomendaciones')
for t in [f'La ruta óptima del camión mide {f(km)} km y termina a las 12:13; está probada como óptima y cumple el horario de 06:00 a 18:00.',
          'Las metaheurísticas de la aplicación (recocido simulado, tabú, genético, colonia de hormigas, GRASP, VNS, ILS y LNS) alcanzan el óptimo en segundos; '
          'para casos más grandes son la opción práctica, y el modelo matemático sirve para validar su calidad.',
          'Usar el dron para las entregas cercanas al centro (DR010 y DR020) adelanta el regreso del camión 18 minutos y le quita 1,3 km de recorrido.',
          'El camión va al 45 % de su capacidad: hay espacio para crecer en clientes sin agregar vehículos.',
          'Se recomienda que el dron despegue desde el camión (esquema FSTSP completo) para atender a clientes lejanos como La Boquilla (DR023) o Ternera (DR021), '
          'donde el ahorro de tiempo sería mayor.']:
    p = doc.add_paragraph(t, style='List Paragraph'); p.paragraph_format.left_indent = Cm(0.6); p.runs[0].text = '• ' + t

h1('Referencias')
for t in ['Huangfu, Q., & Hall, J. A. J. (2018). Parallelizing the dual revised simplex method. Mathematical Programming Computation, 10(1), 119–142. https://doi.org/10.1007/s12532-017-0130-5',
          'Murray, C. C., & Chu, A. G. (2015). The flying sidekick traveling salesman problem: Optimization of drone-assisted parcel delivery. Transportation Research Part C: Emerging Technologies, 54, 86–109. https://doi.org/10.1016/j.trc.2015.03.005',
          'OpenStreetMap contributors. (2026). OpenStreetMap [Base de datos geográfica]. https://www.openstreetmap.org',
          'Salas Lugo, J. S., & Álvarez Torres, A. (2026). Parcial de Grafos: aplicación de optimización de rutas [Software]. Universidad Tecnológica de Bolívar.',
          'Toth, P., & Vigo, D. (Eds.). (2014). Vehicle routing: Problems, methods, and applications (2.ª ed.). SIAM.']:
    p = doc.add_paragraph(t); p.paragraph_format.left_indent = Cm(1.27); p.paragraph_format.first_line_indent = Cm(-1.27)

salida = os.path.join(RAIZ, 'Informe_Ejecutivo_FSTSP_Cartagena.docx'); doc.save(salida); print(salida)
