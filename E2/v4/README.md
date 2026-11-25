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

Un único **lollipop ordenado por alza**, con una fila por nombre.

- La fila superior es el mayor boom.
- El eje X es logarítmico: cada fila sale de `1x` y termina en el alza del
  nombre.
- El punto del extremo marca el alza; la etiqueta izquierda muestra el nombre,
  el año y las inscripciones en el año del boom.
- El hover muestra año, alza, inscripciones previas, inscripciones del boom y
  aumento absoluto.
- Referencia alta en **verde**, media en **amarillo** y baja en **rojo**.
- El nombre actual usa un color interpolado según su alza: verde intenso
  sobre la referencia alta, mezcla verde-amarilla entre media y alta, mezcla
  amarilla-roja entre baja y media, y rojo intenso bajo la referencia baja.
- La fila del nombre actual queda resaltada con barra más gruesa, punto más
  grande y 100% de opacidad; las demás quedan atenuadas.
- El color de la categoría (título y borde superior) es independiente de los
  colores del gráfico.
- Los puntos huecos indican alzas menores a 4x. Una línea tenue marca el
  umbral de 4x.

Los puntos y las barras usan solo datos reales; no se inventan valores.

## Datos

Se usan los mismos shards completos del Registro Civil que en V3.
