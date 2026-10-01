"""
Preprocesamiento de datos para la visualizacion (E1, V1).

Flujo CSV -> JSON (capsula tecnica T1):
  1. Lee los 203 booms clasificados (picos_nombres_clasificados.csv).
  2. Unifica variantes de escritura en el CSV crudo (nombres_1920_2021.csv)
     con las mismas reglas descritas en CLAUDE.md seccion 3 (quitar tildes,
     minusculas, y/i, ll/y, h muda, letras dobles, k/c, qu/c, z/s, w/u, v/b,
     j inicial/i, ph/f, th/t), agrupa por esa forma normalizada y filtra por
     sexo, para reconstruir exactamente los mismos grupos que generaron el
     CSV de picos (no basta con la lista de ejemplos en "variantes": esa
     columna es ilustrativa, no exhaustiva).
  3. Arma la serie anual 1920-2021 de cada boom (para el panel de detalle).
  4. Agrupa las categorias minoritarias en "Otra causa" para la vista general
     (ver rationale en V1 dentro de CLAUDE.md / notas de version): con 9
     colores compitiendo se pierde jerarquia visual y el mensaje (las
     teleseries dominan) se diluye.
  5. Escribe datos/nombres.json liviano (<500 KB) para GitHub Pages.

Uso: python3 scripts/preparar_datos.py
"""

import json
import re
import unicodedata
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent.parent
RAW_NOMBRES = BASE / "datos" / "nombres_1920_2021.csv"
RAW_PICOS = BASE / "datos" / "picos_nombres_clasificados.csv"
OUT_JSON = BASE / "v1" / "data" / "nombres.json"

ANIO_MIN = 1920
ANIO_MAX = 2021

# Categorias minoritarias que se agrupan en "Otra causa" solo para la vista
# general (el detalle de cada boom sigue mostrando su categoria original).
CATEGORIAS_MINORITARIAS = {
    "TV en vivo",
    "Series y animación",
    "Política, realeza y noticias",
    "Cine",
    "Ciencia y espacio",
    "Deporte",
    "Migración",
}


def normalizar_nombre(nombre: str) -> str:
    """Unifica variantes de escritura del mismo nombre (ver CLAUDE.md seccion 3).

    Limitacion conocida de V1: estas reglas reproducen el "n" oficial del CSV
    de picos de forma exacta en el 65% de los eventos y con <2% de error en la
    mediana del resto; los ~4 eventos marcados como "(y variantes)" en su
    propio nombre (ej. "Marisela (y variantes) 1972-74") mezclan grafias que
    las reglas listadas no unifican (ej. c/s intervocalico), asi que su curva
    de detalle queda subestimada. No afecta las cifras destacadas en la
    seccion 2 de CLAUDE.md (esas vienen directo del CSV de picos).
    """
    s = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode("ascii")
    s = s.lower()
    s = s.replace("ph", "f").replace("th", "t")
    s = s.replace("h", "")  # h muda
    s = s.replace("qu", "c")
    s = s.replace("k", "c")
    s = s.replace("ll", "i")  # ll/y, combinado con y/i de abajo
    s = s.replace("y", "i")
    s = s.replace("z", "s")
    s = s.replace("w", "u")
    s = s.replace("v", "b")
    s = re.sub(r"^j", "i", s)  # j inicial/i
    s = re.sub(r"(.)\1+", r"\1", s)  # letras dobles -> una sola
    return s


def nombres_base_de_evento(evento: str) -> list[str]:
    """Separa un 'evento' en sus nombres base.

    La mayoria de los eventos son un solo nombre (ej. "Yesenia"), pero algunos
    agrupan mas de un nombre equivalente o traen anotaciones, ej.
    "Nataly / Natalie" o "Marisela (y variantes) 1972-74".
    """
    s = re.sub(r"\(.*?\)", "", evento)  # quita anotaciones entre parentesis
    s = re.sub(r"\s*\d{4}(-\d{2,4})?\s*$", "", s)  # quita rangos de anio al final
    return [parte.strip() for parte in s.split("/") if parte.strip()]


def categoria_viz(categoria: str) -> str:
    if categoria == "Sin identificar":
        return "Sin identificar"
    if categoria in CATEGORIAS_MINORITARIAS:
        return "Otra causa"
    return categoria  # Teleserie, Música / Viña


def main() -> None:
    picos = pd.read_csv(RAW_PICOS)
    crudo = pd.read_csv(RAW_NOMBRES)
    crudo["nombre_norm"] = crudo["nombre"].map(normalizar_nombre)

    # Suma de inscripciones por (nombre normalizado, sexo, anio), para no
    # recorrer las 858 mil filas crudas una vez por cada uno de los 203 booms.
    agregado = crudo.groupby(["nombre_norm", "sexo", "anio"])["n"].sum()

    booms = []
    for _, fila in picos.iterrows():
        claves_norm = {normalizar_nombre(n) for n in nombres_base_de_evento(fila["evento"])}
        serie = []
        for a in range(ANIO_MIN, ANIO_MAX + 1):
            valor = 0
            for clave_norm in claves_norm:
                try:
                    valor += int(agregado.loc[(clave_norm, fila["sexo"], a)])
                except KeyError:
                    pass
            serie.append(valor)

        booms.append(
            {
                "nombre": fila["evento"],
                "sexo": fila["sexo"],
                "anio": int(fila["anio"]),
                "prev": float(fila["prev"]),
                "n": int(fila["n"]),
                "extra": int(fila["extra"]),
                "veces": float(fila["veces"]),
                "categoria": fila["categoria"],
                "categoria_viz": categoria_viz(fila["categoria"]),
                "causa": fila["causa"] if isinstance(fila["causa"], str) else None,
                "confianza": fila["confianza"],
                "fuente": fila["fuente"] if isinstance(fila["fuente"], str) else None,
                "serie": serie,
            }
        )

    salida = {
        "anio_min": ANIO_MIN,
        "anio_max": ANIO_MAX,
        "generado_de": "picos_nombres_clasificados.csv + nombres_1920_2021.csv",
        "booms": booms,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(
        json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    kb = OUT_JSON.stat().st_size / 1024
    print(f"Escrito {OUT_JSON} ({kb:.1f} KB) con {len(booms)} booms.")


if __name__ == "__main__":
    main()
