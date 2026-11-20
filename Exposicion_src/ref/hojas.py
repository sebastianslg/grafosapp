"""Hojas de contacto 3x3 de las imágenes de diapositivas: python3 hojas.py prefijo salida_prefijo"""
import sys, glob
from PIL import Image, ImageDraw
fs = sorted(glob.glob(sys.argv[1] + '-*.jpg')); out = sys.argv[2]
ims = [Image.open(f) for f in fs]; w, h = ims[0].size
for k in range(0, len(ims), 9):
    o = Image.new('RGB', (w * 3 + 8, h * 3 + 8), (120, 120, 120))
    for j, im in enumerate(ims[k:k + 9]): o.paste(im, ((j % 3) * (w + 4), (j // 3) * (h + 4)))
    o.save(f'{out}{k // 9:02d}.png')
print(len(ims), w, h)
