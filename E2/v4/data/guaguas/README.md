# Datos reales de nombres (Registro Civil, 1920-2021) — V4

Los archivos `a.json` … `z.json` de esta carpeta son los shards completos
del dataset público [`guaguas`](https://github.com/rivaquiroga/guaguas)
(Servicio de Registro Civil e Identificación de Chile, licencia CC0).

Incluyen los 189.787 nombres del registro, incluso los que tienen una sola
inscripción. Para que el peso sea razonable, cada serie se guarda en formato
disperso: solo los años con inscripciones.

```json
{
  "yesenia": {
    "nombre": "Yesenia",
    "serie": [[54, 326], [55, 350], "..."]
  }
}
```

El índice `0` corresponde a 1920 y el `101` a 2021. El cliente expande la serie
a 102 posiciones antes de graficar.

La V4 usa estos datos para buscar el nombre reconocido por voz. Los 59 puntos
curados con categoría se usan como referencias de comparación.

Para regenerar los shards:

```bash
python E2/v4/scripts/generar_guaguas.py
```

El script descarga el CSV original si no lo encuentra. El CSV crudo no se
versiona.
