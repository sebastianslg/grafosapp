"""Prepara python-embed\\ para Windows: descarga el Python 3.12.7 oficial (embebido, sin instalación),
verifica su SHA-256 y lo extrae en la carpeta de la aplicación. Así la app abre con un doble clic
aunque el equipo no tenga Python instalado.

Uso (una sola vez, desde la carpeta Parcial_Grafos_App):  python herramientas/preparar_python_windows.py
"""
import hashlib
import os
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

URL = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-embed-amd64.zip"
SHA256 = "0d57bb6cb078b74d23dbfe91f77d6780d45bed328911609f1f7ee2ba1606bf44"
RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "python-embed"


def main():
    with tempfile.TemporaryDirectory() as tmp:
        zip_path = Path(tmp) / "python-embed.zip"
        print("Descargando", URL)
        with urllib.request.urlopen(URL, timeout=300) as r, open(zip_path, "wb") as f:
            shutil.copyfileobj(r, f)
        digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
        if digest != SHA256:
            sys.exit(f"SHA-256 no coincide ({digest}); no se instala.")
        print("SHA-256 verificado.")
        if DESTINO.exists():
            shutil.rmtree(DESTINO)
        DESTINO.mkdir()
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(DESTINO)
    if not (DESTINO / "pythonw.exe").exists():
        sys.exit("No se encontró pythonw.exe tras extraer.")
    print("Listo:", DESTINO)


if __name__ == "__main__":
    main()
