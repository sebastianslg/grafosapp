#!/bin/bash
# Doble clic (Mac) o ./Ejecutar_App.sh (Linux): abre la aplicación en el navegador y se cierra sola al cerrar la ventana.
cd "$(dirname "$0")" || exit 1
PY=""
for c in python3 /usr/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  if [ "$(uname)" = "Darwin" ]; then
    osascript -e 'display dialog "Instale Python 3 desde python.org y vuelva a hacer doble clic." with title "Parcial de Grafos" buttons {"OK"} with icon stop'
  else
    echo "Instale Python 3 (python.org o el gestor de paquetes) y vuelva a ejecutar este archivo." >&2
  fi
  exit 1
fi
nohup "$PY" ejecutar_app.py >/dev/null 2>&1 &
exit 0
