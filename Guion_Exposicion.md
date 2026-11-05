# Guion de la exposición · Ruteo de vehículos (35 diapositivas, ~30 min)

**Cómo estudiarlo en 30 minutos:** (1) lee solo la columna «Frase ancla» de la tabla (5 min). (2) Lee el guion completo una vez en voz alta (15 min). (3) Repite solo las diapositivas 17, 21, 29–32 sin mirar (10 min), que son las que más preguntas generan.
Ritmo: ~50 s por diapositiva; las de portada, divisores y referencias, 10–15 s.

## Frases ancla (lo mínimo que debes recordar)
| # | Diapositiva | Frase ancla |
|---|---|---|
| 1 | Portada | Qué hicimos: modelos y métodos del VRP |
| 2 | Agenda | A clase · B modelos · C heurísticas · D ejemplos |
| 3 | Por qué importa | 6–7 %, 40–60 %, 8 % |
| 4 | Repaso | TSP → mTSP → CVRP → VRPTW |
| 5 | Notación | N, K, c, t, d, Q, x(i,j,k) |
| 6 | OVRP | No regresa al depósito |
| 7 | DCVRP | Tope de distancia por ruta |
| 8 | HFVRP | Flota mixta: Q, costo fijo, costo/km |
| 9 | MDVRP | Varios depósitos |
| 10 | LRP | Abrir depósito + rutear |
| 11 | VRPPD / SDVRP | Recoger-entregar; entrega dividida |
| 12 | Otras variantes | TDVRP, 2E, VRPPC, COMVRP, SVRP, VRPD |
| 13 | Resumen | Todo agrega restricciones al núcleo |
| 14 | Divisor C | Cómo resolver cuando es grande |
| 15 | ¿Por qué no exacto? | NP-difícil; tiempo; tres eras |
| 16 | Mapa de métodos | Exactos · heurísticas · metaheurísticas · híbridos |
| 17 | Clarke-Wright | sᵢⱼ = c₀ᵢ + c₀ⱼ − cᵢⱼ → 39,32 |
| 18 | Otras constructivas | Vecino cercano, barrido, inserción |
| 19 | 2-opt / relocate | Quitar cruces |
| 20 | Cuatro metaheurísticas | Tabú, recocido, genético, hormigas |
| 21 | Recocido | e^(−Δ/T) |
| 22 | Genético y ACO | Cruce OX; feromona τ |
| 23 | Tabú paso a paso | Memoria para no volver atrás |
| 24 | Parámetros | Cada método tiene sus perillas |
| 25 | Exactos y matheurísticas | B&B, B&C, B&P, LNS |
| 26 | Cuándo usar cada uno | Calidad, tiempo, tamaño |
| 27 | Guía de decisión | Pocos clientes → exacto |
| 28 | Divisor D | Ejemplos con nuestra herramienta |
| 29 | Ejemplo 1 TSP | 72,048 km, óptimo probado |
| 30 | Ejemplo 2 mTSP | 3 formas de repartir |
| 31 | Ejemplo 3 flota + ventanas | Capacidad y franja cumplidas |
| 32 | Ejemplo 4 LRP | 93,6 → 72,4 km (−22,7 %) |
| 33 | Herramienta | Gap en vivo, parar, simulación |
| 34 | Conclusiones | Mismo núcleo; exacto vs heurístico |
| 35 | Referencias | APA 7 |

## Guion completo

**1 · Portada (10 s).** Buenos días. Soy Juan Sebastián Salas. Les presento la investigación sobre los modelos matemáticos de las variantes del problema de ruteo de vehículos, y sobre las heurísticas y metaheurísticas para resolverlos.

**2 · Agenda (20 s).** Cuatro bloques: A, lo que vimos en clase; B, los modelos matemáticos de las demás variantes; C, heurísticas y metaheurísticas; y D, ejemplos resueltos con optimización exacta.

**3 · Por qué importa (40 s).** El transporte pesa entre el 6 y el 7 % del precio final de los productos. Las decisiones de transporte generan entre el 40 y el 60 % de los costos logísticos. Y la logística es cerca del 8 % del PIB de Estados Unidos. Por eso mejorar rutas es la palanca económica más grande de la cadena.

**4 · Repaso (50 s).** En clase vimos cuatro modelos. TSP: un viajante visita n clientes, entra y sale una vez de cada uno, y se evitan subtours con MTZ. mTSP: m viajantes salen del depósito, cumpliendo que salen m y regresan m. CVRP: agrega la capacidad de cada vehículo. VRPTW: agrega ventanas de tiempo con una restricción de tiempo con una M grande.

**5 · Notación (40 s).** Usaremos siempre lo mismo: N clientes, K vehículos, costo cᵢⱼ, tiempo tᵢⱼ, demanda dⱼ, capacidad Qₖ y la variable binaria xᵢⱼₖ, que vale 1 si el vehículo k va de i a j. Casi todos los modelos son este núcleo más una restricción nueva.

**6 · OVRP (50 s).** Ruteo abierto: el vehículo termina en su último cliente y no regresa al depósito. Cambia que se eliminan los arcos de regreso. Aplicación: transportistas externos y rutas escolares que terminan en el colegio.

**7 · DCVRP (45 s).** Además de la capacidad, cada ruta tiene un tope de distancia o jornada L: la suma de costos de la ruta no puede pasar de L. Ejemplo: mensajería urbana con máximo 8 horas o 120 km por conductor.

**8 · HFVRP (50 s).** Flota heterogénea: cada tipo de vehículo tiene capacidad, costo fijo y costo por kilómetro propios, y una cantidad disponible. El modelo decide cuántos usar de cada tipo. Ejemplo: camiones de reparto en barrios y un tractocamión para pedidos grandes.

**9 · MDVRP (45 s).** Varios depósitos. Cada ruta sale y vuelve al mismo depósito, y el modelo asigna clientes a depósitos. Ejemplo: una cadena de supermercados con varias bodegas regionales.

**10 · LRP (50 s).** Localización y ruteo a la vez. Se agrega una variable binaria por depósito: abrirlo o no, con costo fijo y capacidad. Ejemplo real: dónde ubicar el centro de distribución de las tiendas ARA en Cali. Esto lo resolvemos más adelante.

**11 · VRPPD y SDVRP (50 s).** Recogidas y entregas: el mismo vehículo recoge antes de entregar, con restricciones de precedencia y carga. Ejemplo: mensajería o taxis compartidos. Entrega dividida: un cliente con más demanda que un vehículo se atiende entre varios; ejemplo, carga a granel.

**12 · Otras variantes (50 s).** Hay más: con tráfico (tiempos que cambian con la hora), de dos niveles, con flota propia y tercerizada, abiertas y cerradas, estocásticas con demanda incierta, y con drones. Cada una cambia una cosa del modelo y tiene su aplicación.

**13 · Resumen (30 s).** Esta tabla resume todo el bloque B: cada variante agrega una restricción o una variable al núcleo.

**14 · Divisor C (10 s).** Pasamos a la pregunta: ¿cómo se resuelven cuando son demasiado grandes para el método exacto?

**15 · ¿Por qué no basta el modelo exacto? (50 s).** El VRP es NP-difícil: generaliza el TSP y el número de rutas crece factorialmente. En la práctica hay miles de clientes y poco tiempo, y una buena solución rápida vale más que el óptimo tarde. Históricamente: heurísticas simples en 1960-70, programación matemática en 1970-80, y metaheurísticas e inteligencia artificial desde 1980.

**16 · Mapa de métodos (40 s).** Cuatro familias: exactos (branch and bound, cut y price), heurísticas (constructivas y de mejora local), metaheurísticas (de trayectoria como tabú o recocido, y poblacionales como genético u hormigas) e híbridos o matheurísticas.

**17 · Clarke-Wright (70 s, la más importante).** Cada cliente empieza en su propia ruta depósito-cliente-depósito. El ahorro de unir i con j es sᵢⱼ = c₀ᵢ + c₀ⱼ − cᵢⱼ. Ordenamos los ahorros de mayor a menor y unimos si caben en la capacidad. En el ejemplo, seis clientes y Q = 10: unimos 1–2, luego 3–4, no unimos 2–3 porque la carga sería 15, y unimos 5–6. Resultado: tres rutas, distancia 39,32. Verificamos con fuerza bruta y es el óptimo; aquí la heurística acertó, no siempre pasa.

**18 · Otras constructivas (45 s).** Vecino más cercano: ir siempre al cliente más cercano que respete la capacidad; es muy rápida y de calidad modesta. Barrido: ordenar clientes por ángulo, cortar por capacidad y resolver un TSP por grupo. Inserción: meter cada cliente donde menos aumenta el costo; admite ventanas de tiempo.

**19 · Mejora local (45 s).** 2-opt: si dos arcos se cruzan se reemplazan por otros dos más cortos, invirtiendo el tramo. Se repite hasta que no mejore. Entre rutas: relocate pasa un cliente a otra ruta, swap intercambia dos clientes.

**20 · Cuatro metaheurísticas (50 s).** Tabú: mejora local con memoria. Recocido simulado: acepta peores con una probabilidad que baja al enfriar. Genético: población con cruce y mutación. Hormigas: dejan feromona en los buenos arcos y esa señal guía a las siguientes.

**21 · Recocido simulado (50 s).** Si el movimiento mejora, se acepta. Si empeora en Δ, se acepta con probabilidad e elevado a menos Δ sobre T. Con T alta explora casi sin restricciones; con T baja se comporta como mejora local. Se enfría, por ejemplo T por 0,95.

**22 · Genético y hormigas (60 s).** Genético: el cromosoma es el orden de visita. Cruce OX: se copia un tramo del padre A y el resto se completa con el orden del padre B; luego mutación y selección. Hormigas: la probabilidad de ir de i a j crece con la feromona τ y con la visibilidad uno sobre el costo; la feromona se evapora y se refuerza en las rutas cortas.

**23 · Tabú paso a paso (45 s).** En cada iteración se elige el mejor vecino aunque empeore, y se anota el movimiento en la lista tabú para no deshacerlo. Si un movimiento tabú mejora el mejor global, se permite: criterio de aspiración. *(Los valores de la tabla son ilustrativos.)*

**24 · Parámetros (40 s).** Cada método tiene sus perillas: tamaño de la lista en tabú, temperatura y enfriamiento en recocido, población y mutación en genético, alfa, beta y evaporación en hormigas. Se ajustan con pruebas.

**25 · Exactos y matheurísticas (45 s).** Los exactos usan las formulaciones con branch and bound, cortes de subtours y generación de columnas; garantizan el óptimo pero escalan poco. Las matheurísticas usan el solver dentro de una búsqueda, por ejemplo fijando parte de la solución y resolviendo el resto.

**26 · Cuándo usar cada enfoque (45 s).** Exacto: óptimo probado, decenas o pocos cientos de clientes. Heurística: segundos, miles de clientes. Metaheurística: muy buena calidad, de segundos a minutos. Regla práctica: heurística para empezar, metaheurística para mejorar y modelo exacto para validar.

**27 · Guía de decisión (40 s).** ¿Pocos clientes y necesito probar el óptimo? Modelo exacto. Si no: heurística constructiva con mejora local, metaheurística, o matheurística según el caso. Una tienda con 25 puntos usa exacto; una distribuidora con 2 000 pedidos combina métodos.

**28 · Divisor D (10 s).** Ahora vemos las formulaciones del curso funcionando en un caso real de 25 tiendas ARA en Cali, con una herramienta propia basada en HiGHS.

**29 · Ejemplo 1: TSP (45 s).** Un supervisor visita 25 tiendas desde el centro de distribución: 26 nodos. El modelo con las ecuaciones 1 a 3 del curso (MTZ) da 72,048 km, con óptimo probado. La ruta está dibujada sobre las calles reales con distancias por carretera.

**30 · Ejemplo 2: mTSP (50 s).** Dos supervisores, tres formas de repartir. Sin límites: 72,4 km en total, pero un supervisor visita 24 tiendas y el otro 1: barato en total pero injusto. Balanceado, 12 y 13 tiendas: cuesta 3,2 km más y reparte bien. Minimizar la ruta más larga: la peor jornada baja de 71 a 40 km.

**31 · Ejemplo 3: flota y ventanas (45 s).** Flota mixta: camión de reparto con capacidad 5 y tractocamión con 34. Con 14 clientes de peso 1, el óptimo usa dos camiones llenos y un tractocamión con 4. Con ventanas, cada cliente tiene su franja y comprobamos que todas las llegadas quedan dentro y ninguna carga supera la capacidad.

**32 · Ejemplo 4: LRP (50 s).** El centro de distribución no es un dato: se decide. Con el CD mal ubicado, el recorrido TSP es 93,6 km; la ubicación óptima entre los candidatos lo baja a 72,4 km, un 22,7 % menos. Para cada candidato se resuelve el TSP exacto.

**33 · La herramienta (45 s).** Resuelve solo con optimización. Muestra en vivo la mejor solución, la cota inferior y la brecha, o gap, que dice qué tan cerca del óptimo está. Se puede parar cuando se quiera y ver la mejor solución hasta ahí, y simula los vehículos por las calles con un diagrama de Gantt.

**34 · Conclusiones (40 s).** Uno: un mismo núcleo, todas las variantes agregan restricciones o variables. Dos: modelos pequeños, aplicaciones grandes. Tres: el exacto da el óptimo pero escala poco; las metaheurísticas escalan con buena calidad. Cuatro: lo habitual es heurística para empezar, metaheurística para mejorar y modelo exacto para validar.

**35 · Referencias (10 s).** Las referencias están en formato APA. Gracias; quedo atento a preguntas.

## Preguntas probables
- **¿Qué es el gap?** (mejor solución − mejor cota) / mejor solución. Con 0 % el óptimo está probado.
- **¿Por qué MTZ y no DFJ?** MTZ cabe en un solo modelo y es la fórmula del curso; DFJ agrega cortes por iteraciones y suele ser más rápido.
- **¿Una heurística garantiza el óptimo?** No; en Clarke-Wright acertó en el ejemplo, pero no siempre.
- **¿Qué es NP-difícil?** Que no se conoce un algoritmo que resuelva todos los casos en tiempo polinomial.

*Nota: las formulaciones de las variantes que no se vieron en clase y las referencias APA están escritas desde la literatura/memoria; confírmalas antes de exponer.*
