# Datos reales de nombres (Registro Civil, 1920-2021)

Los archivos `a.json` … `z.json` de esta carpeta son shards del dataset
público [`guaguas`](https://github.com/rivaquiroga/guaguas) (Servicio de
Registro Civil e Identificación de Chile, licencia CC0). Cada shard corresponde
a la primera letra del nombre normalizado.

Formato:

```json
{
  "yesenia": {
    "nombre": "Yesenia",
    "serie": [102 números, uno por año desde 1920 hasta 2021]
  }
}
```

La serie suma todas las variantes de sexo. Se incluyen los nombres con al
menos 20 inscripciones en total para mantener los shards livianos; los nombres
más raros se resuelven con la estimación IA de la aplicación.

Los datos oficiales terminan en 2021. No se rellenan los años 2022-2025 con
ceros: el gráfico de un nombre real se corta en 2021. Solo las estimaciones IA
pueden llegar hasta 2025 y se muestran con la etiqueta `IA · estimado`.

Para regenerar los shards:

```bash
python E2/v2/scripts/generar_guaguas.py
```

El script descarga el CSV original si no lo encuentra. El CSV crudo no se
versiona.
