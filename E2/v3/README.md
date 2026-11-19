# E2 / V3 — Búsqueda estricta

Esta versión parte de la V2, pero cambia la regla central: **solo se grafican
nombres con registros reales**.

## Comportamiento

- Se buscan primero los 203 booms curados.
- Luego se busca en los shards completos del Registro Civil (1920-2021).
- Si el nombre no existe en ninguno de esos datos:
  - se muestra **“Sin registros para «nombre»”**;
  - no se agrega ningún punto;
  - no se inventa una categoría.
- Si el nombre existe pero no tiene un alza suficiente:
  - se muestra su detalle real, sin punto;
  - se intenta estimar su categoría con IA.
- Para entrar al beeswarm se exigen **más de 30 inscripciones en el año del
  peak (31 o más)** y un alza de **4x o superior**.
- Si cumple ambas condiciones:
  - se agrega al beeswarm con datos reales;
  - se busca una causa documentada/probable;
  - si no hay fuente, se intenta una categoría estimada IA.
- Si la IA no encuentra información acorde, la categoría queda en
  **Sin identificar**.

## Datos

Los shards de `data/guaguas/` incluyen los 189.787 nombres del Registro Civil.
Están en formato disperso para no pesar 42 MB. Ver el README de esa carpeta.

El CSV crudo no se versiona. Para regenerar:

```bash
python E2/v3/scripts/generar_guaguas.py
```
