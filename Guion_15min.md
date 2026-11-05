# Guion de 15 minutos · 35 diapositivas (≈ 25 s cada una)

Mantengo las 35 diapositivas (mínimo pedido) pero se pasan rápido: las de modelos y de métodos, ~20 s; las clave (17, 21, 29–32, 34), ~30–60 s; portada, divisores y referencias, 5–10 s. Total ≈ 13 min hablando + 2 min de margen.
**Para aprenderlo:** lee todo una vez en voz alta (8 min) y repite solo las negritas (5 min).

**1 · Portada (10 s).** Buenos días, soy Juan Sebastián Salas. Presento los modelos matemáticos de las variantes del VRP y los métodos heurísticos para resolverlos.
**2 · Agenda (10 s).** Cuatro bloques: lo visto en clase, otros modelos, heurísticas y metaheurísticas, y ejemplos resueltos.
**3 · Por qué importa (20 s).** El transporte es el **6–7 % del precio** de los productos y **40–60 % de los costos logísticos**; la logística es cerca del 8 % del PIB de EE. UU. Por eso mejorar rutas es la gran palanca de costos.
**4 · Repaso (35 s).** **TSP**: un viajante, entra y sale una vez de cada cliente, MTZ evita subtours. **mTSP**: m viajantes desde el depósito. **CVRP**: agrega capacidad. **VRPTW**: agrega ventanas de tiempo con una M grande.
**5 · Notación (15 s).** N clientes, K vehículos, costo c, tiempo t, demanda d, capacidad Q y **x(i,j,k) = 1 si el vehículo k va de i a j**. Cada variante agrega una restricción a este núcleo.
**6 · OVRP (20 s).** Ruteo **abierto**: no regresa al depósito, se quitan los arcos de regreso. Ej.: rutas escolares.
**7 · DCVRP (20 s).** Además de capacidad, **tope de distancia L por ruta**. Ej.: mensajería con 8 h máximas.
**8 · HFVRP (20 s).** **Flota mixta**: cada tipo con su capacidad, costo fijo y costo por km. Ej.: camiones y tractocamión.
**9 · MDVRP (20 s).** **Varios depósitos**; cada ruta vuelve al suyo. Ej.: supermercados con bodegas regionales.
**10 · LRP (20 s).** **Localizar y rutear**: variable binaria para abrir cada depósito. Ej.: el CD de las tiendas ARA.
**11 · VRPPD / SDVRP (20 s).** Recoger y entregar con precedencia; entrega dividida cuando un cliente supera la capacidad de un vehículo.
**12 · Otras variantes (20 s).** Con tráfico, dos niveles, flota tercerizada, abiertas y cerradas, estocásticas y con drones: cada una cambia un elemento del modelo.
**13 · Resumen (10 s).** Esta tabla resume el bloque: **todo es el núcleo más una restricción**.
**14 · Divisor C (5 s).** ¿Cómo resolverlos cuando son muy grandes?
**15 · ¿Por qué no solo exacto? (30 s).** El VRP es **NP-difícil**: las rutas crecen factorialmente. En la práctica hay miles de clientes y poco tiempo; una buena solución rápida vale más que el óptimo tarde. Heurísticas simples (60-70), programación matemática (70-80), metaheurísticas (desde 1980).
**16 · Mapa de métodos (25 s).** Exactos (branch and bound, cut, price), heurísticas (constructivas y mejora local), metaheurísticas (trayectoria y poblacionales) e híbridos.
**17 · Clarke-Wright (60 s).** Cada cliente parte con su ruta propia. **Ahorro s(i,j) = c(0,i) + c(0,j) − c(i,j)**. Se ordenan de mayor a menor y se unen si caben en la capacidad. Con 6 clientes y Q = 10: se unen 1–2, 3–4 y 5–6; 2–3 no, porque sumarían 15. **Resultado 39,32, igual al óptimo por fuerza bruta**; no siempre acierta.
**18 · Otras constructivas (20 s).** Vecino más cercano (rápida, calidad modesta), barrido por ángulo e inserción.
**19 · Mejora local (25 s).** **2-opt**: dos arcos que se cruzan se reemplazan por otros dos más cortos. Entre rutas: relocate y swap.
**20 · Cuatro metaheurísticas (25 s).** Tabú (memoria), recocido (acepta peores), genético (población) y hormigas (feromona).
**21 · Recocido (30 s).** Si empeora en Δ, se acepta con probabilidad **e^(−Δ/T)**. T alta explora; T baja es mejora local; se enfría multiplicando por ~0,95.
**22 · Genético y hormigas (30 s).** Genético: cromosoma = orden de visita, **cruce OX** y mutación. Hormigas: la probabilidad crece con la **feromona τ** y la visibilidad 1/c; la feromona se evapora.
**23 · Tabú (15 s).** Se elige el mejor vecino aunque empeore y la **lista tabú** impide deshacerlo. (Valores ilustrativos.)
**24 · Parámetros (10 s).** Cada método tiene sus perillas y se ajustan con pruebas.
**25 · Exactos y matheurísticas (25 s).** Exactos: garantizan óptimo pero escalan poco. Matheurísticas: usan el solver dentro de una búsqueda.
**26 · Cuándo usar cada uno (25 s).** Exacto: óptimo probado y pocos clientes. Heurística: rápida. Metaheurística: mejor calidad. **Heurística para empezar, metaheurística para mejorar, exacto para validar.**
**27 · Guía de decisión (20 s).** ¿Pocos clientes y necesito el óptimo? Exacto. Si no, heurística, metaheurística o matheurística.
**28 · Divisor D (5 s).** Veamos las fórmulas del curso funcionando con 25 tiendas en Cali.
**29 · Ejemplo 1 TSP (25 s).** 26 nodos, modelo MTZ del curso: **72,048 km, óptimo probado**, ruta sobre calles reales.
**30 · Ejemplo 2 mTSP (30 s).** Dos supervisores. Sin límites: 72,4 km pero 24 y 1 tiendas, injusto. Balanceado 12–13: **+3,2 km** y reparto justo. Minimizar la ruta más larga: la peor jornada baja de 71 a 40 km.
**31 · Ejemplo 3 flota y ventanas (25 s).** Camión (capacidad 5) y tractocamión (34): el óptimo usa dos camiones llenos y el tractocamión con 4. Con ventanas se verificó que todas las llegadas caen en su franja.
**32 · Ejemplo 4 LRP (30 s).** El CD es una decisión: mal ubicado, **93,6 km**; ubicación óptima, **72,4 km (−22,7 %)**.
**33 · Herramienta (25 s).** Solo optimización: muestra mejor solución, cota y **gap** en vivo, se puede parar y ver lo mejor, y simula los vehículos con Gantt.
**34 · Conclusiones (30 s).** Un mismo núcleo; modelos pequeños, aplicaciones grandes; exacto da óptimo pero escala poco, las metaheurísticas escalan; en la práctica se combinan.
**35 · Referencias (5 s).** Referencias en APA. Gracias, quedo atento a preguntas.

## Si te preguntan
- **Gap:** (mejor solución − mejor cota) / mejor solución; 0 % = óptimo probado.
- **MTZ vs DFJ:** MTZ es un solo modelo (el del curso); DFJ agrega cortes y suele ser más rápido.
- **¿Garantiza el óptimo una heurística?** No; Clarke-Wright acertó en el ejemplo, pero no siempre.
