"""Intérprete mínimo del subconjunto de GAMS usado en los programas de GAMS_algoritmos (salvo el 12).
Sirve para verificar que la lógica escrita en GAMS produce los mismos resultados que las implementaciones de
referencia en Python. NO es GAMS: no detecta errores de sintaxis propios de GAMS."""
import re, math, sys

TOK = re.compile(r"""\s*(?:(?P<num>\d+\.\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|\d+(?:[eE][-+]?\d+)?)|(?P<id>[A-Za-z_][A-Za-z_0-9]*)|(?P<str>'[^']*'|"[^"]*")|(?P<op>\*\*|<=|>=|<>|[-+*/<>=$(),;]))""")

def limpiar(texto):
    texto = re.sub(r'\$onText.*?\$offText', '', texto, flags=re.S | re.I)
    out = []
    for l in texto.split('\n'):
        if l.startswith('*') or l.startswith('$'): continue
        out.append(l)
    return '\n'.join(out)

def tokenizar(t):
    pos = 0; toks = []
    while pos < len(t):
        if t[pos:].strip() == '': break
        m = TOK.match(t, pos)
        if not m: raise SyntaxError('token inesperado: ' + t[pos:pos + 40])
        pos = m.end()
        k = m.lastgroup; v = m.group(k)
        toks.append((k, v))
    return toks

class Interp:
    def __init__(self, texto, anular=None):
        self.toks = tokenizar(limpiar(texto)); self.i = 0
        self.sets = {}; self.alias = {}; self.par = {}; self.dom = {}; self.escalar = set()
        self.env = {}; self.anular = anular or {}
        self.pos = {}   # set -> {label: ordinal}
    # ---------------- utilidades de tokens
    def pk(self, k=0):
        return self.toks[self.i + k] if self.i + k < len(self.toks) else (None, None)
    def nx(self):
        t = self.toks[self.i]; self.i += 1; return t
    def es(self, v, k=0):
        t = self.pk(k); return t[1] is not None and t[1].lower() == v.lower() and t[0] in ('id', 'op')
    def ex(self, v):
        t = self.nx()
        if t[1].lower() != v.lower(): raise SyntaxError(f'se esperaba {v} y llegó {t} cerca de {self.toks[max(0,self.i-6):self.i+4]}')
    # ---------------- declaraciones
    def base(self, s): return self.alias.get(s.lower(), s.lower())
    def lista_datos(self):
        """lee / ... / y devuelve lista de (clave, valor)"""
        self.ex('/'); items = []; cur = []
        while not self.es('/'):
            t = self.nx()
            if t[1] == ',': items.append(cur); cur = []
            else: cur.append(t)
        self.ex('/'); items.append(cur); return [x for x in items if x]
    def expandir(self, lab):
        m = re.match(r'^([A-Za-z_]+)(\d+)\*([A-Za-z_]+)(\d+)$', lab)
        if m:
            return [f'{m.group(1)}{n}' for n in range(int(m.group(2)), int(m.group(4)) + 1)]
        return [lab]
    def decl(self, kw):
        kw = kw.lower()
        while True:
            nombre = self.nx()[1].lower(); dom = []
            if self.es('('):
                self.nx()
                while not self.es(')'):
                    t = self.nx()
                    if t[1] != ',': dom.append(t[1].lower() if t[1] != '*' else '*')
                self.ex(')')
            if self.pk()[0] == 'str': self.nx()
            datos = None
            if self.es('/'): datos = self.lista_datos()
            if kw in ('set', 'sets'):
                elems = []
                for it in datos or []:
                    lab = ''.join(x[1] for x in it if x[0] != 'str')
                    elems += self.expandir(lab)
                self.sets[nombre] = elems; self.pos[nombre] = {e: k + 1 for k, e in enumerate(elems)}
            elif kw in ('parameter', 'parameters', 'scalar', 'scalars'):
                self.dom[nombre] = dom; self.par[nombre] = {}
                if kw.startswith('scalar'): self.escalar.add(nombre)
                for it in datos or []:
                    toks = [x for x in it if x[0] != 'str']
                    if kw.startswith('scalar'): self.par[nombre][()] = float(toks[-1][1])
                    else: self.par[nombre][(toks[0][1],)] = float(toks[1][1])
            if self.es(';'): self.nx(); return
            if self.es(','): self.nx()
    # ---------------- expresiones (cierres)
    def parse_expr(self): return self.p_or()
    def p_or(self):
        a = self.p_and()
        while self.es('or'):
            self.nx(); b = self.p_and(); a = (lambda a, b: lambda e: 1.0 if (a(e) != 0 or b(e) != 0) else 0.0)(a, b)
        return a
    def p_and(self):
        a = self.p_not()
        while self.es('and'):
            self.nx(); b = self.p_not(); a = (lambda a, b: lambda e: 1.0 if (a(e) != 0 and b(e) != 0) else 0.0)(a, b)
        return a
    def p_not(self):
        if self.es('not'):
            self.nx(); a = self.p_not(); return lambda e: 1.0 if a(e) == 0 else 0.0
        return self.p_rel()
    def p_rel(self):
        a = self.p_add()
        t = self.pk()
        if t[0] == 'op' and t[1] in ('<', '>', '<=', '>=', '=', '<>'):
            self.nx(); b = self.p_add(); op = t[1]
            f = {'<': lambda x, y: x < y, '>': lambda x, y: x > y, '<=': lambda x, y: x <= y, '>=': lambda x, y: x >= y, '=': lambda x, y: x == y, '<>': lambda x, y: x != y}[op]
            return lambda e: 1.0 if f(a(e), b(e)) else 0.0
        return a
    def p_add(self):
        a = self.p_mul()
        while self.pk()[0] == 'op' and self.pk()[1] in '+-' and self.pk()[1] != '':
            op = self.nx()[1]; b = self.p_mul()
            a = (lambda a, b: lambda e: a(e) + b(e))(a, b) if op == '+' else (lambda a, b: lambda e: a(e) - b(e))(a, b)
        return a
    def p_mul(self):
        a = self.p_pow()
        while self.pk()[0] == 'op' and self.pk()[1] in ('*', '/'):
            op = self.nx()[1]; b = self.p_pow()
            a = (lambda a, b: lambda e: a(e) * b(e))(a, b) if op == '*' else (lambda a, b: lambda e: a(e) / b(e))(a, b)
        return a
    def p_pow(self):
        a = self.p_un()
        if self.pk()[1] == '**':
            self.nx(); b = self.p_un(); return lambda e: a(e) ** b(e)
        return a
    def p_un(self):
        if self.pk() == ('op', '-'):
            self.nx(); a = self.p_un(); return lambda e: -a(e)
        if self.pk() == ('op', '+'):
            self.nx(); return self.p_un()
        return self.p_cond()
    def p_cond(self):
        a = self.p_atom()
        if self.pk() == ('op', '$'):
            self.nx(); c = self.p_condicion(); return (lambda a, c: lambda e: a(e) if c(e) != 0 else 0.0)(a, c)
        return a
    def p_condicion(self):
        if self.es('('):
            self.nx(); c = self.parse_expr(); self.ex(')'); return c
        return self.p_atom()
    def p_indices(self):
        """lee (a,b,...) de índices y devuelve lista de cierres que dan etiquetas (o None)"""
        self.ex('('); args = []
        while True:
            args.append(self.p_indice())
            if self.es(','): self.nx(); continue
            break
        self.ex(')'); return args
    def p_indice(self):
        t = self.pk()
        if t[0] == 'str':
            self.nx(); lab = t[1][1:-1].lower(); return ('lab', lab)
        if t[0] == 'id' and self.pk(1) == ('op', '-') or (t[0] == 'id' and self.pk(1) == ('op', '+')):
            nombre = t[1].lower(); self.nx(); sg = self.nx()[1]; d = self.p_mul(); return ('lag', nombre, sg, d)
        if t[0] == 'id':
            self.nx(); return ('set', t[1].lower())
        raise SyntaxError('índice no válido ' + str(t))
    def resolver(self, args, env):
        """devuelve etiquetas ya resueltas (o None si queda fuera de rango)"""
        out = []
        for a in args:
            if a[0] == 'lab': out.append(a[1])
            elif a[0] == 'set':
                v = env.get(a[1])
                if v is None: raise KeyError('índice libre ' + a[1])
                out.append(v)
            else:
                v = env.get(a[1]); b = self.base(a[1]); elems = self.sets[b]; k = self.pos[b][v] - 1
                d = int(a[3](env)); k = k + d if a[2] == '+' else k - d
                if k < 0 or k >= len(elems): return None
                out.append(elems[k])
        return tuple(out)
    def p_atom(self):
        t = self.nx()
        if t[0] == 'num':
            v = float(t[1]); return lambda e: v
        if t[0] == 'op' and t[1] == '(':
            a = self.parse_expr(); self.ex(')'); return a
        if t[0] == 'id':
            nm = t[1].lower()
            if nm in ('sum', 'smin', 'smax'): return self.p_agreg(nm)
            if nm in ('ord', 'floor', 'mod', 'sqrt', 'sqr', 'exp', 'min', 'max', 'abs', 'arctan2', 'card') and self.es('('):
                return self.p_func(nm)
            if self.es('('):
                args = self.p_indices(); P = self.par
                def f(e, nm=nm, args=args):
                    k = self.resolver(args, e)
                    return 0.0 if k is None else P[nm].get(k, 0.0)
                return f
            if nm in self.alias or nm in self.sets:
                return lambda e, nm=nm: e[nm]   # etiqueta del índice (solo para comparaciones raras)
            P = self.par
            return lambda e, nm=nm: P[nm].get((), 0.0)
        raise SyntaxError('átomo inesperado ' + str(t))
    def p_func(self, nm):
        self.ex('(')
        if nm == 'ord':
            s = self.nx()[1].lower(); self.ex(')'); b = self.base(s); pos = self.pos[b]
            return lambda e: float(pos[e[s]])
        if nm == 'card':
            s = self.nx()[1].lower(); self.ex(')'); n = len(self.sets[self.base(s)]); return lambda e: float(n)
        args = [self.parse_expr()]
        while self.es(','): self.nx(); args.append(self.parse_expr())
        self.ex(')')
        f = {'floor': lambda x: float(math.floor(x)), 'sqrt': math.sqrt, 'sqr': lambda x: x * x, 'exp': math.exp, 'abs': abs}.get(nm)
        if nm == 'mod': return lambda e: self.gmod(args[0](e), args[1](e))
        if nm == 'min': return lambda e: min(a(e) for a in args)
        if nm == 'max': return lambda e: max(a(e) for a in args)
        if nm == 'arctan2': return lambda e: math.atan2(args[0](e), args[1](e))
        return lambda e: f(args[0](e))
    @staticmethod
    def gmod(x, y): return x - y * math.trunc(x / y)
    def p_agreg(self, nm):
        self.ex('('); idx = []
        if self.es('('):
            self.nx()
            while not self.es(')'):
                t = self.nx()
                if t[1] != ',': idx.append(t[1].lower())
            self.ex(')')
        else: idx.append(self.nx()[1].lower())
        cond = None
        if self.pk() == ('op', '$'): self.nx(); cond = self.p_condicion()
        self.ex(','); ex = self.parse_expr(); self.ex(')')
        sets = [self.sets[self.base(s)] for s in idx]
        def f(e):
            old = {s: e.get(s) for s in idx}
            acc = 0.0 if nm == 'sum' else None
            def rec(k):
                nonlocal acc
                if k == len(idx):
                    if cond is None or cond(e) != 0:
                        v = ex(e)
                        if nm == 'sum': acc = acc + v
                        elif nm == 'smin': acc = v if acc is None else min(acc, v)
                        else: acc = v if acc is None else max(acc, v)
                    return
                for el in sets[k]:
                    e[idx[k]] = el; rec(k + 1)
            rec(0)
            for s, v in old.items():
                if v is None: e.pop(s, None)
                else: e[s] = v
            if acc is None: return 1e300 if nm == 'smin' else -1e300
            return acc
        return f
    # ---------------- sentencias
    def p_bloque(self, fin):
        """lee sentencias hasta que aparezca (sin consumirlo) alguno de los tokens de 'fin'"""
        sts = []
        while True:
            while self.es(';'): self.nx()
            t = self.pk()
            if t[1] is not None and t[1].lower() in fin: break
            sts.append(self.p_sent())
        return sts
    def ejecutar(self, sts):
        for s in sts: s()
    def p_sent(self):
        t = self.pk(); nm = t[1].lower()
        if nm in ('set', 'sets', 'parameter', 'parameters', 'scalar', 'scalars'):
            self.nx(); self.decl(nm); return lambda: None
        if nm == 'alias':
            self.nx(); self.ex('('); nombres = []
            while not self.es(')'):
                x = self.nx()
                if x[1] != ',': nombres.append(x[1].lower())
            self.ex(')'); self.ex(';')
            for a in nombres[1:]: self.alias[a] = self.base(nombres[0])
            return lambda: None
        if nm in ('display', 'option'):
            while not self.es(';'): self.nx()
            self.nx(); return lambda: None
        if nm in ('model', 'solve', 'equations', 'equation', 'binary', 'positive', 'variable', 'variables'):
            raise NotImplementedError('no soportado en el intérprete: ' + nm)
        if nm == 'loop': return self.p_loop()
        if nm == 'while': return self.p_while()
        if nm == 'if': return self.p_if()
        return self.p_asig()
    def p_loop(self):
        self.nx(); self.ex('('); s = self.nx()[1].lower(); cond = None
        if self.pk() == ('op', '$'): self.nx(); cond = self.p_condicion()
        self.ex(','); cuerpo = self.p_bloque(')'); self.ex(')'); self.ex(';')
        b = self.base(s); elems = self.sets[b]
        def run():
            old = self.env.get(s)
            for el in list(elems):
                self.env[s] = el
                if cond is None or cond(self.env) != 0: self.ejecutar(cuerpo)
            if old is None: self.env.pop(s, None)
            else: self.env[s] = old
        return run
    def p_while(self):
        self.nx(); self.ex('('); cond = self.parse_expr(); self.ex(','); cuerpo = self.p_bloque(')'); self.ex(')'); self.ex(';')
        def run():
            n = 0
            while cond(self.env) != 0:
                self.ejecutar(cuerpo); n += 1
                if n > 100000: raise RuntimeError('while sin fin')
        return run
    def p_if(self):
        self.nx(); self.ex('('); ramas = []; sino = None
        cond = self.parse_expr(); self.ex(','); cuerpo = self.p_bloque(('elseif', 'else', ')')); ramas.append((cond, cuerpo))
        while True:
            if self.es('elseif'):
                self.nx(); c = self.parse_expr(); self.ex(','); b = self.p_bloque(('elseif', 'else', ')')); ramas.append((c, b))
            elif self.es('else'):
                self.nx(); sino = self.p_bloque(('elseif', 'else', ')'))
            else: break
        self.ex(')'); self.ex(';')
        def run():
            for c, b in ramas:
                if c(self.env) != 0: self.ejecutar(b); return
            if sino is not None: self.ejecutar(sino)
        return run
    def p_asig(self):
        nm = self.nx()[1].lower(); args = []
        if self.es('('): args = self.p_indices()
        cond = None
        if self.pk() == ('op', '$'): self.nx(); cond = self.p_condicion()
        self.ex('='); rhs = self.parse_expr(); self.ex(';')
        libres = []
        for a in args:
            if a[0] == 'set': libres.append(a[1])
        def run():
            env = self.env; libs = [s for s in libres if s not in env]
            def aplicar():
                if cond is not None and cond(env) == 0: return
                v = rhs(env); k = self.resolver(args, env)
                if k is None: return
                self.par[nm][k] = v
            if not libs: aplicar(); return
            def rec(k):
                if k == len(libs): aplicar(); return
                s = libs[k]
                for el in self.sets[self.base(s)]:
                    env[s] = el; rec(k + 1)
                env.pop(s, None)
            rec(0)
        return run
    def ejecutar_programa(self):
        sts = []
        while self.i < len(self.toks):
            while self.es(';'): self.nx()
            if self.i >= len(self.toks): break
            sts.append(self.p_sent())
        # aplicar anulaciones de escalares (p. ej. reducir iteraciones) antes de ejecutar
        self.ejecutar(sts)
