# E2 / V4 — Comparación por voz

La V4 conserva la overview, pero elimina los botones de interacción en el
computador. Todo se controla desde el micrófono del celular.

## Flujo

1. La overview muestra el texto:
   **“Presiona el botón del micrófono y di tu nombre”**.
2. Debajo se muestra automáticamente un QR para conectar el celular. No hay
   botón “Conectar”.
3. Al reconocer un nombre, se pasa automáticamente a la pantalla de
   comparación.
4. Si se dice otro nombre, la pantalla se actualiza sin botones.

## Comparación

- Se usan los **59 puntos curados con categoría**.
- Para la categoría del nombre se eligen tres referencias reales:
  - Alza alta.
  - Alza media (el punto real más cercano a la mediana).
  - Alza baja.
- No se interpolan ni inventan puntos.
- Los nombres dichos se guardan por categoría y se muestran junto a las
  referencias.
- Si un nombre no alcanza 4x, se muestra igual en la zona **Alza mínima
  (<4x)**.
- Si no hay registros o no se puede categorizar, se informa y no se inventa
  un punto.

## Gráfico

Dot plot horizontal con escala logarítmica:

- Referencias alta, media y baja.
- Nombres dichos por el usuario.
- Zona sombreada para alzas menores a 4x.
- Etiquetas con nombre, año y valor exacto.

## Datos

Se usan los mismos shards completos del Registro Civil que en V3.
