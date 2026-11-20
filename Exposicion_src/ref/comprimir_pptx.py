"""Recomprime un .pptx con DEFLATE (pptxgenjs lo guarda sin compresión): python3 comprimir_pptx.py archivo.pptx"""
import sys, zipfile, shutil, os
for f in sys.argv[1:]:
    tmp = f + '.tmp'
    with zipfile.ZipFile(f) as zi, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zo:
        nombres = zi.namelist(); nombres.sort(key=lambda n: n != '[Content_Types].xml')
        for n in nombres: zo.writestr(n, zi.read(n))
    shutil.move(tmp, f); print(f, os.path.getsize(f) // 1024, 'KB')
