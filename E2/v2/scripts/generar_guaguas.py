"""Genera los shards de nombres reales del Registro Civil para E2/v2.

Fuente: paquete `guaguas` (rivaquiroga/guaguas), datos del Servicio de
Registro Civil e Identificación de Chile, 1920-2021, licencia CC0:
https://raw.githubusercontent.com/rivaquiroga/guaguas/main/data-raw/1920-2021.csv

El CSV crudo no se versiona. El resultado son archivos JSON por letra:

    E2/v2/data/guaguas/a.json ... z.json, _.json

Cada archivo es un objeto:
    { "clave normalizada": { "nombre": "Nombre visible", "serie": [102 enteros] } }

La serie va de 1920 a 2021 y suma todas las variantes de sexo. Para evitar
shards gigantes, se incluyen nombres con al menos 20 inscripciones en total;
los nombres más raros se resuelven con la estimación IA de la aplicación.

Uso:
    python E2/v2/scripts/generar_guaguas.py [ruta/al/1920-2021.csv]

Si no se pasa una ruta ni existe GUAGUAS_CSV, el CSV se descarga solo.
"""

import csv
import json
import os
import sys
import tempfile
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path

CSV_URL = (
    "https://raw.githubusercontent.com/rivaquiroga/guaguas/main/"
    "data-raw/1920-2021.csv"
)

ANIO_MIN = 1920
ANIO_MAX = 2021
N_ANIOS = ANIO_MAX - ANIO_MIN + 1

BASE = Path(__file__).resolve().parent.parent
RAW = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else os.environ.get(
        "GUAGUAS_CSV", str(Path(tempfile.gettempdir()) / "guaguas_1920_2021.csv")
    )
)
OUT = BASE / "data" / "guaguas"


def normalizar(nombre: str) -> str:
    s = unicodedata.normalize("NFD", nombre)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().split())


def letra(clave: str) -> str:
    if not clave:
        return "_"
    c = clave[0]
    if "a" <= c <= "z":
        return c
    return "_"


def main() -> None:
    if not RAW.exists():
        print(f"Descargando {CSV_URL} …")
        RAW.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(CSV_URL, RAW)

    series = defaultdict(lambda: [0] * N_ANIOS)
    display = defaultdict(lambda: defaultdict(int))

    with RAW.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for fila in reader:
            nombre = (fila.get("nombre") or "").strip()
            if not nombre:
                continue
            clave = normalizar(nombre)
            if not clave:
                continue
            try:
                anio = int(fila["anio"])
                n = int(fila["n"])
            except (KeyError, ValueError):
                continue
            if not (ANIO_MIN <= anio <= ANIO_MAX):
                continue
            series[clave][anio - ANIO_MIN] += n
            display[clave][nombre] += n

    shards = defaultdict(dict)
    for clave, serie in series.items():
        # Nombres ultra raros (menos de 20 inscripciones en 102 años) no
        # alcanzan para un gráfico/boom útil; se dejan para la estimación IA.
        if sum(serie) < 20:
            continue
        visible = max(display[clave].items(), key=lambda kv: kv[1])[0]
        shards[letra(clave)][clave] = {
            "nombre": visible,
            "serie": serie,
        }

    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for key, data in sorted(shards.items()):
        path = OUT / f"{key}.json"
        path.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        total += len(data)
        print(f"{path.name}: {len(data)} nombres, {path.stat().st_size/1024:.0f} KB")

    print(f"Total: {total} nombres en {len(shards)} shards.")


if __name__ == "__main__":
    main()
