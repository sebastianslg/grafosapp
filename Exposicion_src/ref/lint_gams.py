"""Revisión estática básica de los .gms (no sustituye a compilar con GAMS)."""
import re, glob, os, sys
ok = True
for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), '..', '..', 'GAMS_algoritmos', '*.gms'))):
    t = open(f, encoding='utf-8').read(); lines = t.split('\n'); name = os.path.basename(f)
    # 1) comentarios con * deben ir en la columna 1
    for n, l in enumerate(lines, 1):
        if re.match(r'^\s+\*', l): print(name, n, 'COMENTARIO SANGRADO', l[:60]); ok = False
    # 2) paréntesis balanceados por instrucción (se ignora el texto entre comillas y los bloques $onText)
    body = re.sub(r'\$onText.*?\$offText', '', t, flags=re.S)
    body = re.sub(r"'[^'\n]*'", "''", body)
    body = '\n'.join(l for l in body.split('\n') if not l.startswith('*') and not l.startswith('$'))
    depth = 0
    for n, ch in enumerate(body):
        if ch == '(': depth += 1
        if ch == ')': depth -= 1
        if depth < 0: print(name, 'paréntesis de cierre extra'); ok = False; break
    if depth != 0: print(name, 'paréntesis sin cerrar', depth); ok = False
    # 3) identificadores declarados duplicados (sin distinguir mayúsculas)
    decl = []
    for m in re.finditer(r'(?im)^(set|sets|parameter|parameters|scalar|scalars|alias|binary variable|binary variables|positive variable|positive variables|variable|variables|equations|equation|model)\b(.*?);', body, flags=re.S):
        kw = m.group(1).lower(); cuerpo = m.group(2)
        cuerpo = re.sub(r'/[^/]*/', ' ', cuerpo)      # quita listas de datos
        if kw == 'alias':
            decl += re.findall(r'[A-Za-z_]\w*', cuerpo)[1:]
            continue
        # separar entradas por comas o saltos de línea que NO estén dentro de paréntesis
        prof = 0; ent = ''; entradas = []
        for ch in cuerpo:
            if ch == '(': prof += 1
            if ch == ')': prof -= 1
            if (ch == ',' or ch == '\n') and prof == 0: entradas.append(ent); ent = ''
            else: ent += ch
        entradas.append(ent)
        for e in entradas:
            mm = re.match(r"\s*([A-Za-z_]\w*)", e)
            if mm: decl.append(mm.group(1))
    vistos = {}
    for d in decl:
        k = d.lower()
        if k in vistos and kw not in ('alias',): print(name, 'DUPLICADO', d); ok = False
        vistos[k] = 1
    # 4) palabras reservadas usadas como nombres (comprobación puntual)
    for r in ('rows', 'cols', 'solve', 'table', 'loop'):
        if r in vistos: print(name, 'nombre reservado', r); ok = False
print('LINT OK' if ok else 'LINT CON AVISOS')
