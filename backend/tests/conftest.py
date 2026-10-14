import os, sys, tempfile
os.environ.setdefault("GRAFOS_DB", tempfile.mktemp(suffix=".db"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
