# E2 / V4 — Comparación por voz

La V4 conserva la overview, pero elimina los botones de interacción en el
computador. Todo se controla desde el micrófono del celular.

## Flujo

1. La overview muestra el texto:
   **“Presiona el botón del micrófono y di tu nombre”**.
2. Al lado del overview se muestra automáticamente un QR para conectar el
   celular. No hay botón “Conectar”. En pantallas angostas, el QR pasa debajo.
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
- Si un nombre no alcanza 4x, se muestra igual con un punto hueco y su alza
  indicada en el gráfico.
- Si no hay registros o no se puede categorizar, se informa y no se inventa
  un punto.

## Gráfico

Un único gráfico de líneas con las series anuales reales de cada nombre, eje Y
logarítmico y un marcador en el año del boom de cada uno.

- Referencia alta en **verde**, media en **amarillo** y baja en **rojo**, todas
  con línea segmentada.
- El nombre actual usa una línea segmentada con borde de contraste y un color
  interpolado según su alza: verde intenso sobre la referencia alta, mezcla
  verde-amarilla entre media y alta, mezcla amarilla-roja entre baja y media,
  y rojo intenso bajo la referencia baja.
- El color de la categoría (título y borde superior) es independiente de los
  colores del gráfico.
- Los puntos huecos indican alzas menores a 4x.

Las líneas y los puntos usan solo series reales; no se inventan valores.

## Datos

Se usan los mismos shards completos del Registro Civil que en V3.
