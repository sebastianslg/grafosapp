"""gamsx: intérprete del subconjunto de GAMS que usan los programas de la exposición.

Ejecuta declaraciones (Set, Alias, Parameter, Scalar, Table, Variable, Equation, Model), asignaciones con
condiciones $, loop / while / if, display y solve (LP / RMIP / MIP) resolviendo con HiGHS (scipy.optimize.milp).
Imita los chequeos de compilación de GAMS más comunes: identificadores no declarados o duplicados, palabras
reservadas, índices no controlados, violaciones de dominio, ord() sobre conjuntos dinámicos, variables sin sufijo
fuera de ecuaciones, ecuaciones sin definición y comentarios '*' que no están en la columna 1.

NO es GAMS: sirve para comprobar que el modelo escrito produce la solución esperada. La prueba definitiva es
ejecutar los archivos en GAMS.
"""
import re, math, time, itertools, sys
import numpy as np

RESERVADAS = set('''abort acronym acronyms alias all and binary break card continue diag display do else elseif
endfor endif endloop endwhile eps equation equations execute file files for free if inf integer loop maximizing
minimizing model models na negative no nonnegative not option options or ord parameter parameters positive prod put
repeat sameas scalar scalars semicont semiint set sets smax smin solve sos1 sos2 sum system table tables until using
variable variables while xor yes eq ne lt le gt ge undf'''.split())
FUNCIONES = {'abs', 'sqrt', 'sqr', 'exp', 'log', 'min', 'max', 'floor', 'ceil', 'round', 'mod', 'power', 'arctan2',
             'arctan', 'sin', 'cos', 'ord', 'card', 'sameas', 'sign', 'trunc'}
INF = float('inf')


class ErrorGAMS(Exception):
    pass


# ----------------------------------------------------------------------------------------------- léxico
TOKRE = re.compile(r"""(?P<sp>[ \t\r]+)|(?P<nl>\n)|
 (?P<num>(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?(?![A-Za-z_]))|
 (?P<id>[A-Za-z_][A-Za-z_0-9]*)|
 (?P<str>'[^'\n]*'|"[^"\n]*")|
 (?P<op>=e=|=l=|=g=|=E=|=L=|=G=|\.\.|\*\*|<=|>=|<>|[-+*/<>=$(),;.:])""", re.X)


def lexico(texto):
    """Devuelve tokens (tipo, valor, línea, col_ini, col_fin). Elimina comentarios y bloques $onText."""
    lineas = texto.split('\n'); out = []; en_texto = False
    for nl, l in enumerate(lineas, 1):
        s = l.strip().lower()
        if en_texto:
            if s.startswith('$offtext'): en_texto = False
            continue
        if l[:1] == '$':
            if s.startswith('$ontext'): en_texto = True
            continue
        if l[:1] == '*': continue
        if s.startswith('*') and not l.startswith('*'):
            raise ErrorGAMS(f'línea {nl}: un comentario con * debe empezar en la columna 1')
        pos = 0
        while pos < len(l):
            m = TOKRE.match(l, pos)
            if not m: raise ErrorGAMS(f'línea {nl}: carácter inesperado {l[pos:pos+15]!r}')
            k = m.lastgroup; v = m.group(k)
            if k not in ('sp', 'nl'):
                if k == 'op': v = v.lower()
                out.append((k, v, nl, m.start(), m.end()))
            pos = m.end()
    return out


# ----------------------------------------------------------------------------------------------- AST
class N:
    __slots__ = ('t', 'a')
    def __init__(self, t, *a): self.t = t; self.a = a
    def __repr__(self): return f'{self.t}{self.a}'


class Lin:
    """Expresión lineal: const + sum coef * var."""
    __slots__ = ('c', 'k')
    def __init__(self, k=None, c=0.0): self.k = k or {}; self.c = c
    def add(self, o, s=1.0):
        r = Lin(dict(self.k), self.c)
        if isinstance(o, Lin):
            for v, a in o.k.items(): r.k[v] = r.k.get(v, 0.0) + s * a
            r.c += s * o.c
        else: r.c += s * o
        return r
    def mul(self, f):
        return Lin({v: a * f for v, a in self.k.items()}, self.c * f)


def es_lin(x): return isinstance(x, Lin) and len(x.k) > 0


def num(x):
    if isinstance(x, Lin):
        if x.k: raise ErrorGAMS('expresión con variables donde se esperaba un número')
        return x.c
    return x


class Simbolo:
    def __init__(self, tipo, nombre, dom, texto=''):
        self.tipo = tipo; self.nombre = nombre; self.dom = dom; self.texto = texto
        self.datos = {}          # parámetros: tupla -> valor ; conjuntos: tupla -> True
        self.orden = []          # conjuntos 1-D: lista ordenada de etiquetas
        self.dinamico = False
        self.vtipo = None        # variables
        self.lo = {}; self.up = {}; self.l = {}; self.m = {}
        self.defn = None         # ecuaciones: (dominio, condición, lhs, tipo, rhs)
        self.attr = {}           # modelos


class Interprete:
    def __init__(self, texto, nombre='modelo', tiempo_max=None, log=False):
        self.nombre = nombre; self.T = lexico(texto); self.i = 0
        self.sim = {}; self.uel = []; self.uelpos = {}
        self.salida = []; self.opciones = {'optcr': 0.1, 'optca': 0.0, 'reslim': 1000.0}
        self.tiempo_max = tiempo_max; self.log = log; self.resoluciones = []

    # ---------------------------------------------------------------- utilidades
    def pk(self, k=0):
        j = self.i + k
        return self.T[j] if j < len(self.T) else ('eof', None, -1, 0, 0)
    def v(self, k=0):
        t = self.pk(k); return t[1].lower() if t[1] is not None and t[0] in ('id', 'op') else t[1]
    def nx(self):
        t = self.pk(); self.i += 1; return t
    def ex(self, val):
        t = self.nx()
        if t[1] is None or t[1].lower() != val:
            raise ErrorGAMS(f'línea {t[2]}: se esperaba «{val}» y se encontró «{t[1]}»')
        return t
    def err(self, msg, t=None):
        t = t or self.pk(); raise ErrorGAMS(f'línea {t[2]}: {msg}')
    def etiqueta(self, lab):
        lab = lab.strip("'\"").lower()
        if lab not in self.uelpos: self.uelpos[lab] = len(self.uel); self.uel.append(lab)
        return lab
    def get(self, nombre, t=None):
        s = self.sim.get(nombre.lower())
        if s is None: self.err(f'símbolo no declarado: {nombre}', t)
        return s
    def base(self, s):
        while s.tipo == 'alias': s = self.sim[s.dom]
        return s
    def declarar(self, s, t):
        if s.nombre in RESERVADAS or s.nombre in FUNCIONES: self.err(f'«{s.nombre}» es una palabra reservada de GAMS', t)
        if s.nombre in self.sim: self.err(f'«{s.nombre}» ya fue declarado (GAMS no distingue mayúsculas)', t)
        self.sim[s.nombre] = s

    # ---------------------------------------------------------------- ejecución
    def ejecutar(self):
        self.t0 = time.time()
        while self.pk()[0] != 'eof':
            st = self.sentencia()
            if st is not None: self.exec_st(st)
        # comprobaciones finales: ecuaciones declaradas sin definir
        return self

    # ---------------------------------------------------------------- parser de sentencias
    def sentencia(self):
        t = self.pk(); w = self.v()
        if w in ('set', 'sets'): self.nx(); self.decl_set(); return None
        if w == 'alias': self.nx(); self.decl_alias(); return None
        if w in ('parameter', 'parameters', 'scalar', 'scalars'): self.nx(); self.decl_par(w.startswith('scalar')); return None
        if w in ('table',): self.nx(); self.decl_tabla(); return None
        if w in ('positive', 'binary', 'integer', 'free', 'negative', 'nonnegative') and self.v(1) in ('variable', 'variables'):
            self.nx(); self.nx(); self.decl_var(w if w != 'nonnegative' else 'positive'); return None
        if w in ('variable', 'variables'): self.nx(); self.decl_var('free'); return None
        if w in ('equation', 'equations'): self.nx(); self.decl_ecu(); return None
        if w in ('model', 'models'): self.nx(); self.decl_modelo(); return None
        if t[0] == 'id' and self.v(1) in ('..', '(', '$') and self.es_defn():
            self.defn_ecu(); return None
        return self.st_ejecutable()

    def es_defn(self):
        """id[(dom)][$cond].. ? busca '..' antes de ';' y de '='"""
        j = self.i; prof = 0
        while j < len(self.T):
            v = self.T[j][1]
            if v == '(': prof += 1
            elif v == ')': prof -= 1
            elif v == '..' and prof == 0: return True
            elif v in (';', '=') and prof == 0: return False
            j += 1
        return False

    def texto_opt(self):
        if self.pk()[0] == 'str': return self.nx()[1].strip("'\"")
        return ''

    def dominio(self):
        dom = []
        if self.v() == '(':
            self.nx()
            while self.v() != ')':
                t = self.nx()
                if t[1] == ',': continue
                if t[1] == '*': dom.append('*'); continue
                self.get(t[1], t); dom.append(t[1].lower())
            self.ex(')')
        return dom

    def fin_item(self):
        """tras un ítem de declaración: ',' -> sigue, ';' -> termina, otra cosa en línea nueva -> sigue"""
        if self.v() == ',': self.nx(); return False
        if self.v() == ';': self.nx(); return True
        if self.pk()[0] == 'id': return False
        self.err(f'se esperaba «;» y se encontró «{self.pk()[1]}»')

    def leer_lista(self):
        """/ ... / -> lista de ítems; cada ítem: lista de tokens"""
        self.ex('/'); items = []; cur = []
        while self.v() != '/':
            t = self.nx()
            if t[0] == 'eof': self.err('falta «/» de cierre')
            if t[1] == ',' : items.append(cur); cur = []
            elif cur and t[2] != cur[-1][2] and not (cur[-1][1] in ('.', '*') or t[1] in ('.', '*')):
                items.append(cur); cur = [t]           # salto de línea separa ítems
            else: cur.append(t)
        self.ex('/'); items.append(cur); return [x for x in items if x]

    def expandir(self, toks):
        """['c', '1', '*', 'c10'] etc -> lista de etiquetas"""
        txt = [t[1] for t in toks]
        if '*' in txt:
            k = txt.index('*'); a = ''.join(txt[:k]).strip("'\""); b = ''.join(txt[k + 1:]).strip("'\"")
            ma = re.match(r'^(.*?)(\d+)$', a); mb = re.match(r'^(.*?)(\d+)$', b)
            if not ma or not mb or ma.group(1) != mb.group(1): self.err(f'rango inválido {a}*{b}', toks[0])
            n1, n2 = int(ma.group(2)), int(mb.group(2))
            return [f'{ma.group(1)}{n}' for n in range(n1, n2 + 1)]
        return [''.join(x.strip("'\"") for x in txt)]

    def decl_set(self):
        while True:
            t = self.nx(); nombre = t[1].lower(); dom = self.dominio(); s = Simbolo('set', nombre, dom or ['*'], self.texto_opt())
            self.declarar(s, t)
            if self.v() == '/':
                for it in self.leer_lista():
                    toks = [x for x in it if x[0] != 'str' or True]
                    # quitar texto explicativo final ('...') si hay más tokens
                    if len(toks) > 1 and toks[-1][0] == 'str' and any(x[0] != 'str' for x in toks[:-1]): toks = toks[:-1]
                    partes = [[]]
                    for x in toks:
                        if x[1] == '.': partes.append([])
                        else: partes[-1].append(x)
                    if len(partes) == 1:
                        for lab in self.expandir(partes[0]):
                            lab = self.etiqueta(lab); self.agregar_set(s, (lab,), t)
                    else:
                        listas = [[self.etiqueta(l) for l in self.expandir(p)] for p in partes]
                        for tup in itertools.product(*listas): self.agregar_set(s, tup, t)
            if self.fin_item(): break

    def agregar_set(self, s, tup, t=None):
        if s.dom != ['*'] and len(tup) != len(s.dom): self.err(f'dimensión incorrecta en {s.nombre}', t)
        for k, d in enumerate(s.dom):
            if d != '*' and not self.miembro(d, (tup[k],)): self.err(f'violación de dominio: {tup[k]} no está en {d} ({s.nombre})', t)
        if tup not in s.datos:
            s.datos[tup] = True
            if len(tup) == 1: s.orden.append(tup[0])

    def miembro(self, nombre, tup):
        s = self.base(self.sim[nombre]); return tup in s.datos

    def decl_alias(self):
        self.ex('('); nombres = []
        while self.v() != ')':
            t = self.nx()
            if t[1] != ',': nombres.append(t)
        self.ex(')'); self.ex(';')
        orig = self.get(nombres[0][1], nombres[0])
        for t in nombres[1:]:
            s = Simbolo('alias', t[1].lower(), self.base(orig).nombre); self.declarar(s, t)

    def decl_par(self, escalar):
        while True:
            t = self.nx(); nombre = t[1].lower(); dom = [] if escalar else self.dominio()
            s = Simbolo('par', nombre, dom, self.texto_opt()); self.declarar(s, t)
            if self.v() == '/':
                for it in self.leer_lista():
                    if escalar or not dom:
                        val = self.valor_dato(it); s.datos[()] = val
                    else:
                        # claves separadas por '.', valor al final
                        val = self.valor_dato(it[-1:]) if it[-1][0] == 'num' else None
                        neg = len(it) >= 2 and it[-2][1] == '-'
                        claves_tok = it[:-2] if neg else it[:-1]
                        if val is None: self.err('dato sin valor', it[0])
                        if neg: val = -val
                        partes = [[]]
                        for x in claves_tok:
                            if x[1] == '.': partes.append([])
                            else: partes[-1].append(x)
                        listas = [[self.etiqueta(l) for l in self.expandir(p)] for p in partes]
                        for tup in itertools.product(*listas): self.asignar_par(s, tup, val, t)
            if self.fin_item(): break

    def valor_dato(self, toks):
        txt = ''.join(x[1] for x in toks).lower()
        if txt in ('inf', '+inf'): return INF
        if txt == '-inf': return -INF
        if txt == 'eps': return 0.0
        try: return float(txt)
        except ValueError: self.err(f'valor numérico inválido: {txt}', toks[0])

    def asignar_par(self, s, tup, val, t=None):
        if len(tup) != len(s.dom): self.err(f'dimensión incorrecta en {s.nombre}', t)
        for k, d in enumerate(s.dom):
            if d != '*' and not self.miembro(d, (tup[k],)): self.err(f'violación de dominio: {tup[k]} no está en {d} ({s.nombre})', t)
        if val == 0: s.datos.pop(tup, None)
        else: s.datos[tup] = val

    def decl_tabla(self):
        t = self.nx(); nombre = t[1].lower(); dom = self.dominio(); s = Simbolo('par', nombre, dom, self.texto_opt()); self.declarar(s, t)
        if len(dom) != 2: self.err('solo se admiten tablas de 2 dimensiones', t)
        filas = {}
        while self.v() != ';':
            x = self.nx(); filas.setdefault(x[2], []).append(x)
        self.ex(';')
        lineas = sorted(filas)
        cab = [(x[1], x[3], x[4]) for x in filas[lineas[0]]]
        for ln in lineas[1:]:
            toks = filas[ln]; fila = self.etiqueta(toks[0][1]); k = 1
            while k < len(toks):
                x = toks[k]; neg = False
                if x[1] == '-': neg = True; k += 1; x = toks[k]
                if x[0] != 'num' and x[1].lower() not in ('inf', 'eps'): self.err(f'dato inválido en tabla {nombre}: {x[1]}', x)
                val = self.valor_dato([x]) * (-1 if neg else 1)
                ini, fin = (toks[k - 1][3] if neg else x[3]), x[4]
                col = None
                for (lab, ci, cf) in cab:
                    if not (fin <= ci or ini >= cf): col = lab; break
                if col is None: self.err(f'valor fuera de columna en tabla {nombre} (línea {ln})', x)
                self.asignar_par(s, (fila, self.etiqueta(col)), val, x); k += 1

    def decl_var(self, vtipo):
        while True:
            t = self.nx(); s = Simbolo('var', t[1].lower(), self.dominio(), self.texto_opt()); s.vtipo = vtipo; self.declarar(s, t)
            if self.fin_item(): break

    def decl_ecu(self):
        while True:
            t = self.nx(); s = Simbolo('ecu', t[1].lower(), self.dominio(), self.texto_opt()); self.declarar(s, t)
            if self.fin_item(): break

    def decl_modelo(self):
        t = self.nx(); s = Simbolo('modelo', t[1].lower(), [], self.texto_opt()); self.declarar(s, t)
        self.ex('/'); ecs = []
        while self.v() != '/':
            x = self.nx()
            if x[1] == ',': continue
            if x[1].lower() == 'all': ecs = 'all'; continue
            e = self.get(x[1], x)
            if e.tipo != 'ecu': self.err(f'{x[1]} no es una ecuación', x)
            ecs.append(e.nombre)
        self.ex('/'); self.ex(';')
        if ecs == 'all': ecs = [x.nombre for x in self.sim.values() if x.tipo == 'ecu']   # GAMS: «all» = ecuaciones declaradas hasta aquí
        s.attr['ecs'] = ecs
        s.attr.update(modelstat=0, solvestat=0, objval=0.0, nodusd=0, resusd=0.0, objest=0.0, numvar=0, numequ=0)

    def defn_ecu(self):
        t = self.nx(); s = self.get(t[1], t)
        if s.tipo != 'ecu': self.err(f'{t[1]} no es una ecuación', t)
        dom = []
        if self.v() == '(':
            self.nx()
            while self.v() != ')':
                x = self.nx()
                if x[1] != ',': self.get(x[1], x); dom.append(x[1].lower())
            self.ex(')')
        if len(dom) != len(s.dom): self.err(f'la definición de {s.nombre} no coincide con su dominio', t)
        for a, b in zip(dom, s.dom):
            sa, sb = self.sim[a], self.sim[b]
            if a != b and not (sa.tipo == 'alias' and self.base(sa).nombre == b) and not (sb.tipo == 'alias' and self.base(sb).nombre == a) \
               and not (sa.tipo == 'alias' and sb.tipo == 'alias' and self.base(sa) is self.base(sb)):
                self.err(f'la ecuación {s.nombre} se declaró sobre ({",".join(s.dom)}) y se define sobre ({",".join(dom)})', t)
        cond = None
        if self.v() == '$': self.nx(); cond = self.primario()
        self.ex('..'); lhs = self.expr()
        op = self.nx()[1]
        if op not in ('=e=', '=l=', '=g='): self.err('se esperaba =e=, =l= o =g=')
        rhs = self.expr(); self.ex(';')
        if s.defn is not None: self.err(f'la ecuación {s.nombre} ya está definida', t)
        s.defn = (dom, cond, lhs, op, rhs, t[2])

    # ---------------------------------------------------------------- sentencias ejecutables
    def st_ejecutable(self):
        t = self.pk(); w = self.v()
        if w == 'loop':
            self.nx(); self.ex('('); dom, cond = self.dominio_ctrl(); self.ex(','); cuerpo = self.bloque((')',)); self.ex(')'); self.opt_pc()
            return N('loop', dom, cond, cuerpo)
        if w == 'while':
            self.nx(); self.ex('('); c = self.expr(); self.ex(','); cuerpo = self.bloque((')',)); self.ex(')'); self.opt_pc()
            return N('while', c, cuerpo)
        if w == 'if':
            self.nx(); self.ex('('); ramas = []; c = self.expr(); self.ex(','); cuerpo = self.bloque((')', 'elseif', 'else')); ramas.append((c, cuerpo))
            otro = []
            while self.v() in ('elseif', 'else'):
                if self.v() == 'elseif':
                    self.nx(); c = self.expr(); self.ex(','); cuerpo = self.bloque((')', 'elseif', 'else')); ramas.append((c, cuerpo))
                else:
                    self.nx(); otro = self.bloque((')',))
            self.ex(')'); self.opt_pc(); return N('if', ramas, otro)
        if w == 'display':
            self.nx(); items = []
            while self.v() != ';':
                if self.v() == ',': self.nx(); continue
                if self.pk()[0] == 'str': items.append(('txt', self.nx()[1])); continue
                x = self.nx(); s = self.get(x[1], x); attr = None
                if self.v() == '.': self.nx(); attr = self.nx()[1].lower()
                items.append(('sim', s.nombre, attr))
            self.ex(';'); return N('display', items, t[2])
        if w in ('option', 'options'):
            self.nx()
            while self.v() != ';':
                if self.v() == ',': self.nx(); continue
                k = self.nx()[1].lower()
                if self.v() == '=':
                    self.nx(); val = self.nx()[1]
                    if val == '-': val = '-' + self.nx()[1]
                    self.opciones[k] = val
            self.ex(';'); return None
        if w == 'solve':
            self.nx(); m = self.get(self.nx()[1]); self.ex('using'); tipo = self.nx()[1].lower(); sentido = self.nx()[1].lower()
            obj = self.get(self.nx()[1]); self.ex(';')
            if tipo not in ('lp', 'mip', 'rmip'): self.err(f'tipo de modelo no admitido: {tipo}')
            if sentido not in ('minimizing', 'maximizing'): self.err('se esperaba minimizing o maximizing')
            return N('solve', m.nombre, tipo, sentido, obj.nombre, t[2])
        if w == 'abort':
            self.nx(); c = None
            if self.v() == '$': self.nx(); c = self.primario()
            msg = self.texto_opt(); self.ex(';'); return N('abort', c, msg, t[2])
        if t[0] == 'id':
            return self.asignacion()
        self.err(f'sentencia no reconocida: «{t[1]}»')

    def opt_pc(self):
        if self.v() == ';': self.nx()

    def bloque(self, fines):
        cuerpo = []
        while self.v() not in fines:
            if self.v() == ';': self.nx(); continue
            if self.pk()[0] == 'eof': self.err('bloque sin cerrar')
            st = self.st_ejecutable()
            if st is not None: cuerpo.append(st)
            if self.v() == ';': self.nx()
        return cuerpo

    def asignacion(self):
        t = self.nx(); s = self.get(t[1], t); attr = None
        if self.v() == '.': self.nx(); attr = self.nx()[1].lower()
        idx = self.indices() if self.v() == '(' else []
        cond = None
        if self.v() == '$': self.nx(); cond = self.primario()
        self.ex('='); e = self.expr(); self.ex(';')
        if s.tipo == 'var' and attr not in ('l', 'lo', 'up', 'fx', 'm', 'prior'): self.err(f'asignación a la variable {s.nombre} sin sufijo (.l, .lo, .up, .fx)', t)
        if s.tipo in ('ecu', 'modelo', 'alias'): self.err(f'no se puede asignar a {s.nombre}', t)
        return N('asig', s.nombre, attr, idx, cond, e, t[2])

    def indices(self):
        self.ex('('); idx = []
        while self.v() != ')':
            if self.v() == ',': self.nx(); continue
            x = self.nx()
            if x[0] == 'str': idx.append(('lab', self.etiqueta(x[1]))); continue
            nombre = x[1].lower()
            if self.v() in ('+', '-') and self.pk(1)[0] == 'num':
                sg = 1 if self.nx()[1] == '+' else -1; d = int(float(self.nx()[1])); idx.append(('lag', nombre, sg * d))
            else: idx.append(('ix', nombre))
        self.ex(')'); return idx

    def dominio_ctrl(self):
        """i | (i,j) | arc(i,j) | (i,j)$cond | i$cond"""
        dom = []
        if self.v() == '(':
            self.nx()
            while self.v() != ')':
                x = self.nx()
                if x[1] == ',': continue
                self.get(x[1], x)
                if self.v() == '(':
                    sub = [y[1] for y in self.indices()]; dom.append(('tup', x[1].lower(), sub))
                else: dom.append(('set', x[1].lower()))
            self.ex(')')
        else:
            x = self.nx(); self.get(x[1], x)
            if self.v() == '(':
                sub = [y[1] for y in self.indices()]; dom.append(('tup', x[1].lower(), sub))
            else: dom.append(('set', x[1].lower()))
        cond = None
        if self.v() == '$': self.nx(); cond = self.primario()
        return dom, cond

    # ---------------------------------------------------------------- expresiones
    def expr(self): return self.e_or()
    def e_or(self):
        a = self.e_and()
        while self.v() in ('or', 'xor'):
            op = self.nx()[1].lower(); a = N('bin', op, a, self.e_and())
        return a
    def e_and(self):
        a = self.e_not()
        while self.v() == 'and': self.nx(); a = N('bin', 'and', a, self.e_not())
        return a
    def e_not(self):
        if self.v() == 'not': self.nx(); return N('not', self.e_not())
        return self.e_cmp()
    def e_cmp(self):
        a = self.e_add()
        ops = {'=': 'eq', '<>': 'ne', '<': 'lt', '>': 'gt', '<=': 'le', '>=': 'ge', 'eq': 'eq', 'ne': 'ne', 'lt': 'lt', 'gt': 'gt', 'le': 'le', 'ge': 'ge'}
        while self.v() in ops:
            op = ops[self.nx()[1].lower()]; a = N('cmp', op, a, self.e_add())
        return a
    def e_add(self):
        a = self.e_mul()
        while self.v() in ('+', '-'):
            op = self.nx()[1]; a = N('bin', op, a, self.e_mul())
        return a
    def e_mul(self):
        a = self.e_un()
        while self.v() in ('*', '/'):
            op = self.nx()[1]; a = N('bin', op, a, self.e_un())
        return a
    def e_un(self):
        if self.v() == '-': self.nx(); return N('neg', self.e_un())
        if self.v() == '+': self.nx(); return self.e_un()
        return self.e_pow()
    def e_pow(self):
        a = self.e_dollar()
        if self.v() == '**': self.nx(); a = N('bin', '**', a, self.e_un())
        return a
    def e_dollar(self):
        a = self.primario()
        while self.v() == '$':
            self.nx(); a = N('dollar', a, self.primario())
        return a

    def primario(self):
        t = self.pk(); w = self.v()
        if t[0] == 'num': self.nx(); return N('num', float(t[1]))
        if t[0] == 'str': self.nx(); return N('lab', self.etiqueta(t[1]))
        if w == '(':
            self.nx(); e = self.expr(); self.ex(')'); return e
        if w == '-': self.nx(); return N('neg', self.primario())
        if w == 'not': self.nx(); return N('not', self.primario())
        if t[0] != 'id': self.err(f'expresión inválida en «{t[1]}»')
        self.nx()
        if w in ('yes',): return N('num', 1.0)
        if w in ('no',): return N('num', 0.0)
        if w == 'inf': return N('num', INF)
        if w == 'eps': return N('num', 0.0)
        if w in ('sum', 'prod', 'smin', 'smax'):
            self.ex('('); dom, cond = self.dominio_ctrl(); self.ex(','); body = self.expr(); self.ex(')')
            return N('agg', w, dom, cond, body)
        if w in FUNCIONES:
            self.ex('('); args = []
            while self.v() != ')':
                if self.v() == ',': self.nx(); continue
                if w in ('ord', 'card') or (w == 'sameas'):
                    x = self.pk()
                    if x[0] == 'str': self.nx(); args.append(N('lab', self.etiqueta(x[1]))); continue
                    if x[0] == 'id' and self.v(1) in (',', ')'): self.nx(); self.get(x[1], x); args.append(N('setref', x[1].lower())); continue
                args.append(self.expr())
            self.ex(')'); return N('fn', w, args, t[2])
        s = self.get(t[1], t); attr = None
        if self.v() == '.' and self.pk(1)[0] == 'id':
            self.nx(); attr = self.nx()[1].lower()
        idx = self.indices() if self.v() == '(' else []
        return N('ref', s.nombre, attr, idx, t[2])

    # ---------------------------------------------------------------- evaluación
    def resolver_idx(self, s, idx, env, ln):
        tup = []
        for k, ix in enumerate(idx):
            if ix[0] == 'lab': tup.append(ix[1]); continue
            nombre = ix[1]
            if nombre in env: lab = env[nombre]
            else:
                ss = self.sim.get(nombre)
                if ss is None: raise ErrorGAMS(f'línea {ln}: símbolo no declarado: {nombre}')
                if ss.tipo in ('set', 'alias'): raise ErrorGAMS(f'línea {ln}: índice no controlado «{nombre}» en {s.nombre}')
                raise ErrorGAMS(f'línea {ln}: {nombre} no es un conjunto')
            if ix[0] == 'lag':
                bs = self.base(self.sim[nombre]); orden = bs.orden; p = orden.index(lab) + ix[2]
                if p < 0 or p >= len(orden): return None
                lab = orden[p]
            tup.append(lab)
        if s.tipo in ('par', 'var', 'ecu') and len(tup) != len(s.dom):
            raise ErrorGAMS(f'línea {ln}: {s.nombre} tiene {len(s.dom)} índices y se usaron {len(tup)}')
        return tuple(tup)

    def iterar(self, dom, cond, env):
        """genera entornos extendidos para un dominio de control"""
        listas = []
        def rec(k, e):
            if k == len(dom):
                if cond is None or self.verdad(self.ev(cond, e)): yield e
                return
            d = dom[k]
            if d[0] == 'set':
                nombre = d[1]
                if nombre in e: raise ErrorGAMS(f'el índice {nombre} ya está controlado')
                bs = self.base(self.sim[nombre]); s = self.sim[nombre]
                for lab in self.elementos(nombre):
                    e2 = dict(e); e2[nombre] = lab; yield from rec(k + 1, e2)
            else:
                s = self.sim[d[1]]; sub = d[2]
                for tup in list(self.base(s).datos.keys()):
                    e2 = dict(e); ok = True
                    for nm, lab in zip(sub, tup):
                        if nm in e2 and e2[nm] != lab: ok = False; break
                        e2[nm] = lab
                    if ok: yield from rec(k + 1, e2)
        yield from rec(0, env)

    def elementos(self, nombre):
        s = self.sim[nombre]
        if s.tipo == 'alias': s = self.base(s)
        if len(s.dom) > 1: raise ErrorGAMS(f'{nombre} es multidimensional')
        return [x for x in s.orden if (x,) in s.datos]

    def verdad(self, x):
        x = num(x); return x != 0

    def ev(self, n, env):
        t = n.t
        if t == 'num': return n.a[0]
        if t == 'lab': raise ErrorGAMS(f'etiqueta {n.a[0]} usada como valor')
        if t == 'neg':
            x = self.ev(n.a[0], env); return x.mul(-1) if isinstance(x, Lin) else -x
        if t == 'not': return 0.0 if self.verdad(self.ev(n.a[0], env)) else 1.0
        if t == 'dollar':
            c = self.verdad(self.ev(n.a[1], env))
            if not c: return 0.0
            return self.ev(n.a[0], env)
        if t == 'bin':
            op = n.a[0]
            if op == 'and':
                return 1.0 if self.verdad(self.ev(n.a[1], env)) and self.verdad(self.ev(n.a[2], env)) else 0.0
            if op == 'or':
                return 1.0 if self.verdad(self.ev(n.a[1], env)) or self.verdad(self.ev(n.a[2], env)) else 0.0
            if op == 'xor':
                return 1.0 if self.verdad(self.ev(n.a[1], env)) != self.verdad(self.ev(n.a[2], env)) else 0.0
            a = self.ev(n.a[1], env); b = self.ev(n.a[2], env)
            if op in ('+', '-'):
                s = 1.0 if op == '+' else -1.0
                if isinstance(a, Lin): return a.add(b, s)
                if isinstance(b, Lin): return b.mul(s).add(a)
                return a + s * b
            if op == '*':
                if es_lin(a) and es_lin(b): raise ErrorGAMS('producto de variables: el modelo dejaría de ser lineal')
                if isinstance(a, Lin): return a.mul(num(b))
                if isinstance(b, Lin): return b.mul(a)
                if a == 0 or b == 0: return 0.0
                return a * b
            if op == '/':
                b = num(b)
                if b == 0: raise ErrorGAMS('división por cero')
                if isinstance(a, Lin): return a.mul(1.0 / b)
                return a / b
            if op == '**':
                return num(a) ** num(b)
        if t == 'cmp':
            a = num(self.ev(n.a[1], env)); b = num(self.ev(n.a[2], env)); op = n.a[0]; eps = 1e-12
            r = {'eq': a == b, 'ne': a != b, 'lt': a < b, 'gt': a > b, 'le': a <= b, 'ge': a >= b}[op]
            return 1.0 if r else 0.0
        if t == 'agg':
            w, dom, cond, body = n.a
            if w == 'sum':
                acc = 0.0
                for e in self.iterar(dom, cond, env):
                    x = self.ev(body, e)
                    if isinstance(x, Lin): acc = x.add(acc) if not isinstance(acc, Lin) else acc.add(x)
                    elif isinstance(acc, Lin): acc = acc.add(x)
                    else: acc += x
                return acc
            vals = [num(self.ev(body, e)) for e in self.iterar(dom, cond, env)]
            if w == 'prod': return float(np.prod(vals)) if vals else 1.0
            if w == 'smin': return min(vals) if vals else INF
            if w == 'smax': return max(vals) if vals else -INF
        if t == 'fn': return self.ev_fn(n, env)
        if t == 'setref': raise ErrorGAMS(f'conjunto {n.a[0]} usado como valor')
        if t == 'ref': return self.ev_ref(n, env)
        raise ErrorGAMS(f'nodo desconocido {t}')

    def ev_fn(self, n, env):
        f, args, ln = n.a
        if f == 'ord':
            a = args[0]
            if a.t != 'setref': raise ErrorGAMS(f'línea {ln}: ord() requiere un índice')
            nombre = a.a[0]
            if nombre not in env: raise ErrorGAMS(f'línea {ln}: índice no controlado «{nombre}» en ord()')
            bs = self.base(self.sim[nombre])
            if bs.dinamico: raise ErrorGAMS(f'línea {ln}: ord() sobre el conjunto dinámico {bs.nombre} no está permitido en GAMS')
            return float(bs.orden.index(env[nombre]) + 1)
        if f == 'card':
            a = args[0]; nombre = a.a[0] if a.t in ('setref',) else (a.a[0] if a.t == 'ref' else None)
            s = self.sim[nombre]
            if s.tipo in ('set', 'alias'): return float(len(self.base(s).datos))
            return float(len(s.datos))
        if f == 'sameas':
            def lab(a):
                if a.t == 'lab': return a.a[0]
                if a.t == 'setref':
                    if a.a[0] not in env: raise ErrorGAMS(f'línea {ln}: índice no controlado «{a.a[0]}» en sameas()')
                    return env[a.a[0]]
                raise ErrorGAMS(f'línea {ln}: argumento inválido en sameas')
            return 1.0 if lab(args[0]) == lab(args[1]) else 0.0
        v = [num(self.ev(a, env)) for a in args]
        if f == 'abs': return abs(v[0])
        if f == 'sqrt': return math.sqrt(v[0])
        if f == 'sqr': return v[0] * v[0]
        if f == 'exp': return math.exp(v[0])
        if f == 'log': return math.log(v[0])
        if f == 'min': return min(v)
        if f == 'max': return max(v)
        if f == 'floor': return float(math.floor(v[0] + 1e-12))
        if f == 'ceil': return float(math.ceil(v[0] - 1e-12))
        if f == 'trunc': return float(int(v[0]))
        if f == 'sign': return float((v[0] > 0) - (v[0] < 0))
        if f == 'round': return float(round(v[0], int(v[1]) if len(v) > 1 else 0))
        if f == 'mod': return math.fmod(v[0], v[1])
        if f == 'power': return v[0] ** v[1]
        if f == 'arctan2': return math.atan2(v[0], v[1])
        if f == 'arctan': return math.atan(v[0])
        if f == 'sin': return math.sin(v[0])
        if f == 'cos': return math.cos(v[0])
        raise ErrorGAMS(f'función no admitida {f}')

    def ev_ref(self, n, env):
        nombre, attr, idx, ln = n.a; s = self.sim[nombre]
        if s.tipo in ('set', 'alias'):
            if not idx:
                if nombre in env: raise ErrorGAMS(f'línea {ln}: conjunto {nombre} usado como valor')
                raise ErrorGAMS(f'línea {ln}: conjunto {nombre} usado como valor')
            tup = self.resolver_idx(s, idx, env, ln)
            if tup is None: return 0.0
            return 1.0 if tup in self.base(s).datos else 0.0
        if s.tipo == 'modelo':
            if attr is None: raise ErrorGAMS(f'línea {ln}: modelo usado como valor')
            return float(s.attr.get(attr, 0.0))
        tup = self.resolver_idx(s, idx, env, ln)
        if s.tipo == 'par':
            if attr is not None: raise ErrorGAMS(f'línea {ln}: los parámetros no tienen sufijos')
            if tup is None: return 0.0
            return s.datos.get(tup, 0.0)
        if s.tipo == 'var':
            if tup is None: return 0.0
            if attr is None:
                if not self.en_ecuacion: raise ErrorGAMS(f'línea {ln}: la variable {nombre} se usa sin sufijo fuera de una ecuación (use .l)')
                return Lin({(nombre, tup): 1.0})
            if attr == 'l': return s.l.get(tup, 0.0)
            if attr == 'lo': return s.lo.get(tup, self.lo_def(s))
            if attr == 'up': return s.up.get(tup, self.up_def(s))
            if attr == 'm': return s.m.get(tup, 0.0)
            raise ErrorGAMS(f'línea {ln}: sufijo .{attr} no admitido')
        if s.tipo == 'ecu':
            if attr == 'l': return 0.0
            if attr == 'm': return 0.0
        raise ErrorGAMS(f'línea {ln}: referencia inválida a {nombre}')

    en_ecuacion = False

    def lo_def(self, s):
        return {'free': -INF, 'positive': 0.0, 'binary': 0.0, 'integer': 0.0, 'negative': -INF}[s.vtipo]
    def up_def(self, s):
        return {'free': INF, 'positive': INF, 'binary': 1.0, 'integer': 100.0, 'negative': 0.0}[s.vtipo]

    # ---------------------------------------------------------------- ejecución de sentencias
    def exec_st(self, st, env=None):
        env = env or {}
        t = st.t
        if self.tiempo_max and time.time() - self.t0 > self.tiempo_max: raise ErrorGAMS('tiempo máximo de interpretación excedido')
        if t == 'asig': return self.exec_asig(st, env)
        if t == 'loop':
            dom, cond, cuerpo = st.a
            for e in list(self.iterar(dom, cond, env)):
                for x in cuerpo: self.exec_st(x, e)
            return
        if t == 'while':
            c, cuerpo = st.a; n = 0
            while self.verdad(self.ev(c, env)):
                for x in cuerpo: self.exec_st(x, env)
                n += 1
                if n > 10_000_000: raise ErrorGAMS('while sin terminar')
            return
        if t == 'if':
            ramas, otro = st.a
            for c, cuerpo in ramas:
                if self.verdad(self.ev(c, env)):
                    for x in cuerpo: self.exec_st(x, env)
                    return
            for x in otro: self.exec_st(x, env)
            return
        if t == 'display': return self.exec_display(st, env)
        if t == 'solve': return self.exec_solve(st)
        if t == 'abort':
            c, msg, ln = st.a
            if c is None or self.verdad(self.ev(c, env)): raise ErrorGAMS(f'línea {ln}: abort: {msg}')
            return
        raise ErrorGAMS(f'sentencia desconocida {t}')

    def exec_asig(self, st, env):
        nombre, attr, idx, cond, e, ln = st.a; s = self.sim[nombre]
        # índices libres del lado izquierdo: los que no están en env
        libres = []
        for ix in idx:
            if ix[0] in ('ix', 'lag') and ix[1] not in env:
                ss = self.sim.get(ix[1])
                if ss is None: raise ErrorGAMS(f'línea {ln}: símbolo no declarado {ix[1]}')
                if ss.tipo not in ('set', 'alias'): raise ErrorGAMS(f'línea {ln}: {ix[1]} no es un conjunto')
                if ('set', ix[1]) not in libres: libres.append(('set', ix[1]))
        if s.tipo in ('set',):
            s.dinamico = True
        for e2 in list(self.iterar(libres, None, env)):
            if cond is not None and not self.verdad(self.ev(cond, e2)): continue
            tup = self.resolver_idx(s, idx, e2, ln) if idx or s.tipo != 'set' else ()
            if tup is None: continue
            val = num(self.ev(e, e2))
            if s.tipo == 'par':
                if len(s.dom) != len(tup): raise ErrorGAMS(f'línea {ln}: dimensión incorrecta en {nombre}')
                for k, d in enumerate(s.dom):
                    if d != '*' and not self.miembro(d, (tup[k],)): raise ErrorGAMS(f'línea {ln}: violación de dominio en {nombre}: {tup[k]}')
                if val == 0: s.datos.pop(tup, None)
                else: s.datos[tup] = val
            elif s.tipo == 'set':
                for k, d in enumerate(s.dom):
                    if d != '*' and not self.miembro(d, (tup[k],)): raise ErrorGAMS(f'línea {ln}: violación de dominio en {nombre}')
                if val != 0:
                    if tup not in s.datos:
                        s.datos[tup] = True
                        if len(tup) == 1: s.orden.append(tup[0]); s.orden.sort(key=lambda x: self.uelpos[x])
                else:
                    if tup in s.datos:
                        del s.datos[tup]
                        if len(tup) == 1: s.orden.remove(tup[0])
            elif s.tipo == 'var':
                if attr == 'l': s.l[tup] = val
                elif attr == 'lo': s.lo[tup] = val
                elif attr == 'up': s.up[tup] = val
                elif attr == 'fx': s.lo[tup] = val; s.up[tup] = val; s.l[tup] = val
                elif attr == 'm': s.m[tup] = val
            else:
                raise ErrorGAMS(f'línea {ln}: asignación inválida a {nombre}')

    def exec_display(self, st, env):
        items, ln = st.a; reg = []
        for it in items:
            if it[0] == 'txt': reg.append(('txt', it[1].strip("'\""))); continue
            s = self.sim[it[1]]; attr = it[2]
            if s.tipo == 'par': reg.append((s.nombre, dict(s.datos)))
            elif s.tipo == 'var':
                d = s.l if attr in (None, 'l') else (s.lo if attr == 'lo' else s.up)
                reg.append((s.nombre + '.' + (attr or 'l'), {k: v for k, v in d.items() if abs(v) > 1e-9}))
            elif s.tipo in ('set', 'alias'): reg.append((s.nombre, sorted(self.base(s).datos.keys())))
            elif s.tipo == 'modelo': reg.append((s.nombre, dict(s.attr)))
        self.salida.append((ln, reg))

    # ---------------------------------------------------------------- solve
    def generar(self, modelo):
        m = self.sim[modelo]; ecs = m.attr['ecs']
        nombres = [s.nombre for s in self.sim.values() if s.tipo == 'ecu'] if ecs == 'all' else ecs
        filas = []
        self.en_ecuacion = True
        try:
            for en in nombres:
                s = self.sim[en]
                if s.defn is None: raise ErrorGAMS(f'la ecuación {en} está en el modelo {modelo} pero no tiene definición')
                dom, cond, lhs, op, rhs, ln = s.defn
                ddom = [('set', d) for d in dom]
                for e in self.iterar(ddom, None, {}):
                    if cond is not None:
                        self.en_ecuacion = False
                        ok = self.verdad(self.ev(cond, e)); self.en_ecuacion = True
                        if not ok: continue
                    a = self.ev(lhs, e); b = self.ev(rhs, e)
                    a = a if isinstance(a, Lin) else Lin(c=a); r = a.add(b, -1.0)
                    r.k = {k: v for k, v in r.k.items() if v != 0}
                    if not r.k:
                        cte = r.c; okc = (abs(cte) <= 1e-9) if op == '=e=' else (cte <= 1e-9 if op == '=l=' else cte >= -1e-9)
                        if not okc: raise ErrorGAMS(f'ecuación {en}{tuple(e.values())} sin variables e infactible (línea {ln})')
                        continue
                    filas.append((en, tuple(e.values()), r, op))
        finally:
            self.en_ecuacion = False
        return filas

    def exec_solve(self, st):
        from scipy.optimize import milp, LinearConstraint, Bounds
        from scipy.sparse import csr_matrix
        modelo, tipo, sentido, obj, ln = st.a
        t0 = time.time(); filas = self.generar(modelo)
        cols = {}; orden = []
        for (_, _, r, _) in filas:
            for k in r.k:
                if k not in cols: cols[k] = len(orden); orden.append(k)
        if (obj, ()) not in cols: raise ErrorGAMS(f'línea {ln}: la variable objetivo {obj} no aparece en el modelo')
        n = len(orden); lo = np.zeros(n); up = np.zeros(n); integ = np.zeros(n)
        for j, (vn, tup) in enumerate(orden):
            s = self.sim[vn]; lo[j] = s.lo.get(tup, self.lo_def(s)); up[j] = s.up.get(tup, self.up_def(s))
            if s.vtipo in ('binary', 'integer') and tipo == 'mip': integ[j] = 1
        if obj and self.sim[obj].vtipo != 'free' and False: pass
        rows, colsi, vals, lb, ub = [], [], [], [], []
        for i, (_, _, r, op) in enumerate(filas):
            for k, a in r.k.items(): rows.append(i); colsi.append(cols[k]); vals.append(a)
            b = -r.c
            lb.append(b if op in ('=e=', '=g=') else -np.inf); ub.append(b if op in ('=e=', '=l=') else np.inf)
        A = csr_matrix((vals, (rows, colsi)), shape=(len(filas), n))
        c = np.zeros(n); c[cols[(obj, ())]] = 1.0 if sentido == 'minimizing' else -1.0
        opts = {'disp': False, 'mip_rel_gap': float(self.opciones.get('optcr', 0.1)), 'time_limit': float(self.opciones.get('reslim', 1000))}
        res = milp(c, constraints=[LinearConstraint(A, lb, ub)], bounds=Bounds(lo, up), integrality=integ, options=opts)
        m = self.sim[modelo]; dt = time.time() - t0
        m.attr['numvar'] = n; m.attr['numequ'] = len(filas); m.attr['resusd'] = dt
        m.attr['nodusd'] = int(getattr(res, 'mip_node_count', 0) or 0)
        if res.x is None:
            m.attr['modelstat'] = 4 if res.status == 2 else 14; m.attr['solvestat'] = 1 if res.status == 2 else 3
            self.resoluciones.append(dict(modelo=modelo, tipo=tipo, estado=res.message, n=n, m=len(filas), tiempo=dt))
            return
        for j, (vn, tup) in enumerate(orden):
            val = float(res.x[j])
            if integ[j]: val = float(round(val))
            self.sim[vn].l[tup] = val
        z = float(res.fun) * (1 if sentido == 'minimizing' else -1)
        m.attr['objval'] = z
        bound = getattr(res, 'mip_dual_bound', None)
        if bound is not None and not (isinstance(bound, float) and math.isnan(bound)): m.attr['objest'] = float(bound) * (1 if sentido == 'minimizing' else -1)
        else: m.attr['objest'] = z
        optimo = res.status == 0
        m.attr['modelstat'] = 1 if (optimo and (tipo != 'mip' or float(self.opciones.get('optcr', 0.1)) <= 1e-9 or True)) else 8
        if tipo == 'mip' and res.status == 1: m.attr['modelstat'] = 8
        m.attr['solvestat'] = 1 if optimo else 3
        self.resoluciones.append(dict(modelo=modelo, tipo=tipo, estado='óptimo' if optimo else res.message, z=z, n=n, m=len(filas),
                                      binarias=int(integ.sum()), tiempo=dt, nodos=m.attr['nodusd'], cota=m.attr['objest']))

    # ---------------------------------------------------------------- acceso
    def par(self, nombre):
        s = self.sim[nombre.lower()]; return s.datos.get((), 0.0) if not s.dom else dict(s.datos)
    def nivel(self, nombre):
        s = self.sim[nombre.lower()]; return s.l.get((), 0.0) if not s.dom else {k: v for k, v in s.l.items() if abs(v) > 1e-9}
    def conj(self, nombre):
        return sorted(self.base(self.sim[nombre.lower()]).datos.keys())


def correr(ruta, **kw):
    texto = open(ruta, encoding='utf-8').read()
    it = Interprete(texto, ruta, **kw); it.ejecutar(); return it


if __name__ == '__main__':
    for r in sys.argv[1:]:
        t0 = time.time()
        try:
            it = correr(r); print('OK ', r, f'{time.time() - t0:.1f}s', it.resoluciones[-1:] if it.resoluciones else '')
        except ErrorGAMS as e:
            print('ERR', r, e)
