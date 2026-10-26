"""Abre la aplicación (TSP_mTSP_Optimizacion.html) en el navegador. No requiere instalar nada más que Python."""
import pathlib, webbrowser
html = pathlib.Path(__file__).with_name("TSP_mTSP_Optimizacion.html")
print("Abriendo", html)
webbrowser.open(html.as_uri())
