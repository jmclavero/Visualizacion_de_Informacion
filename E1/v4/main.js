// Visualización: bebés → alzas (beeswarm), con panel de detalle.
// Todo corre en el navegador (sin servidor): d3 para el enjambre, Plotly para
// el gráfico de detalle y Tone.js + Web Speech API para la sonificación.

const raiz = getComputedStyle(document.documentElement);

// Config común de Plotly (sin zoom, responsive).
const SIN_ZOOM = { displayModeBar: false, responsive: true, scrollZoom: false };

let DATOS = null; // { anio_min, anio_max, comunes: [...], booms: [...] }
let IDENTIFICADOS = []; // DATOS.booms sin "Sin identificar"

// ---------- Carga de datos ----------

fetch("data/nombres.json")
  .then((r) => r.json())
  .then((datos) => {
    DATOS = datos;
    IDENTIFICADOS = DATOS.booms.filter((b) => b.categoria_viz !== "Sin identificar");
    rellenarBebes();
    animarBebes(); // la slide de bebés es la primera: se colorean al cargar
    dibujarSwarm();
  });

// ---------- Gráfico de detalle (serie anual del alza) ----------

function dibujarDetalle(b, contenedorId, color) {
  const anios = [];
  for (let a = DATOS.anio_min; a <= DATOS.anio_max; a++) anios.push(a);

  const traza = {
    x: anios,
    y: b.serie,
    mode: "lines",
    type: "scatter",
    fill: "tozeroy",
    line: { color, width: 2 },
    fillcolor: color + "22",
    hovertemplate: "%{x}: %{y} inscripciones<extra></extra>",
  };

  const layout = {
    margin: { t: 10, r: 10, b: 30, l: 50 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    xaxis: { range: [DATOS.anio_min - 2, DATOS.anio_max + 2], gridcolor: "#e1e0d9", fixedrange: true },
    yaxis: { title: "Inscripciones", rangemode: "tozero", gridcolor: "#e1e0d9", fixedrange: true },
    dragmode: false,
    shapes: [
      {
        type: "line",
        x0: b.anio,
        x1: b.anio,
        y0: 0,
        y1: Math.max(...b.serie) * 1.05,
        line: { color: "#0b0b0b", width: 1, dash: "dot" },
      },
    ],
    annotations: [
      {
        x: b.anio,
        y: Math.max(...b.serie) * 1.05,
        text: "alza",
        showarrow: false,
        yanchor: "bottom",
        font: { size: 11, color: "#52514e" },
      },
    ],
    font: { family: "system-ui, sans-serif", color: "#0b0b0b" },
  };

  Plotly.react(contenedorId, [traza], layout, SIN_ZOOM);
}

// ---------- Sonificación (Tone.js + Web Speech API) ----------
//
// Único sonido de la página: al hacer clic en un boom (burbuja o barra),
// suena un tono (timbre fijo por categoría, altura según la magnitud del
// boom) y una voz narra el dato — estrategias de la cápsula técnica T4.

// Escala pentatónica mayor en semitonos, dos octavas y media — cualquier
// nota de esta lista suena "bien" combinada con las demás, a diferencia de
// usar semitonos cromáticos sueltos.
const ESCALA_PENTATONICA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const NOTA_RAIZ_MIDI = 52; // E3: grave pero audible en parlantes de notebook

const ARCHIVOS_SONIDO = {
  "Teleseries": "sfx/applause.mp3",
  "Música / Viña": "sfx/saxophone.mp3",
  "Otras causas televisivas": "sfx/news.mp3",
  "Sin identificar": "sfx/no-classification.mp3",
};

function notasDesdeT(t, cantidad) {
  const base = Math.round(Math.max(0, Math.min(1, t)) * (ESCALA_PENTATONICA.length - 1));
  const notas = [];
  for (let i = 0; i < cantidad; i++) {
    const indice = Math.min(base + i * 2, ESCALA_PENTATONICA.length - 1);
    notas.push(Tone.Frequency(NOTA_RAIZ_MIDI + ESCALA_PENTATONICA[indice], "midi").toFrequency());
  }
  return notas;
}

function tDesdeVeces(veces) {
  // "veces sobre lo previo" va de 4 (umbral de boom) a ~187 (Yesenia); log
  // porque la mayoría de los booms son chicos y unos pocos son enormes.
  const t = Math.log(veces / 4) / Math.log(187 / 4);
  return Math.max(0, Math.min(1, t));
}

let voces = null;
let pitchShift = null;
let popSynth = null;
let cargaPromesa = null;

function asegurarAudio() {
  return Tone.start().then(() => {
    if (!cargaPromesa) {
      // El PitchShift cambia la altura sin alterar la velocidad del audio.
      pitchShift = new Tone.PitchShift({ pitch: 0 }).toDestination();
      // "No televisivas" usa un arpegio de notas sintetizadas (sin mp3).
      popSynth = new Tone.PolySynth(Tone.MembraneSynth, {
        pitchDecay: 0.01,
        octaves: 3,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.8, sustain: 0.08, release: 0.6 },
        volume: -8,
      }).connect(pitchShift);
      voces = new Tone.Players(ARCHIVOS_SONIDO).connect(pitchShift);
      // Tone.loaded() resuelve cuando todos los buffers terminaron de cargar.
      cargaPromesa = Tone.loaded();
    }
    return cargaPromesa;
  });
}

// El sonido se elige por el grupo del swarm, no por categoria_viz.
function timbreDe(b) {
  return GRUPO_SWARM[b.categoria] || "Sin identificar";
}

// Ajuste de volumen por sonido (dB): "news" un poco más bajo y "people" un
// poco más alto que el resto.
const AJUSTE_VOLUMEN = {
  "Otras causas televisivas": -4,
  "No televisivas": 4,
};

// Rango de pitch/velocidad para los sonidos sampleados (mp3).
const RANGO_POR_DEFECTO = { rateMin: 0.9, rateMax: 1.35, pitchMin: -10, pitchMax: 7 };

function reproducirEarcon(b) {
  if (!pitchShift) return;
  const clave = timbreDe(b);
  const t = tDesdeVeces(b.veces);

  // Volumen según la magnitud, con ajuste por sonido y tope en 0 dB.
  let volumen = -18 + 12 * t + (AJUSTE_VOLUMEN[clave] || 0);
  volumen = Math.max(-10, Math.min(0, volumen));

  // "No televisivas": arpegio de 3 notas ascendentes (~2 s en total).
  if (clave === "No televisivas") {
    if (!popSynth) return;
    if (voces) voces.stopAll();
    popSynth.volume.value = volumen;
    pitchShift.pitch = 0;
    const notas = notasDesdeT(t, 3);
    const intervalo = 0.45 - 0.15 * t; // 0.45 s (chicas) → 0.30 s (grandes)
    let tiempo = Tone.now() + 0.02;
    notas.forEach((f) => {
      popSynth.triggerAttackRelease(f, "8n", tiempo);
      tiempo += intervalo * (0.9 + Math.random() * 0.2); // jitter ±10 %
    });
    return;
  }

  if (!voces) return;
  if (!voces.has(clave)) return;
  voces.stopAll();
  const player = voces.player(clave);
  player.volume.value = volumen;

  player.playbackRate =
    RANGO_POR_DEFECTO.rateMin +
    (RANGO_POR_DEFECTO.rateMax - RANGO_POR_DEFECTO.rateMin) * t;
  pitchShift.pitch =
    RANGO_POR_DEFECTO.pitchMin +
    (RANGO_POR_DEFECTO.pitchMax - RANGO_POR_DEFECTO.pitchMin) * t;

  // Si el mismo sonido ya está sonando (dobles clics rápidos), se corta
  // y se reinicia en vez de apilarse o lanzar error.
  player.stop();
  player.start();
}

// ---------- Navegación entre slides ----------
//
// Las slides permanecen en el DOM y se ocultan/muestran con su clase de
// salida (se deslizan hacia arriba para avanzar y hacia abajo para volver).
// El z-index (bebés > swarm) hace que la de arriba cubra a la de abajo al
// retroceder.

const CLASE_SALIDA = {
  bebes: "overview-salida",
  swarm: "swarm-salida",
};

let pasoActual = "bebes"; // "bebes" | "swarm"

function elPaso(paso) {
  if (paso === "bebes") return document.getElementById("overview");
  if (paso === "swarm") return document.getElementById("swarm");
  return null;
}

function ocultarPaso(paso) {
  const el = elPaso(paso);
  if (el) el.classList.add(CLASE_SALIDA[paso]);
}

function mostrarPaso(paso) {
  const el = elPaso(paso);
  if (el) el.classList.remove(CLASE_SALIDA[paso]);
}

function avanzarBebes() {
  if (pasoActual !== "bebes") return;
  pasoActual = "swarm";
  ocultarPaso("bebes");
}

function volverAtras() {
  if (pasoActual === "swarm") {
    volverSwarm();
    pasoActual = "bebes";
    mostrarPaso("bebes");
  }
}

// ---------- Overview de los 100 bebés ----------
//
// Primera slide de la presentación. Cada figura
// representa 1 de cada 100 guaguas "extra" atribuibles a causas
// identificadas; las celestes son las atribuibles a teleseries. La
// proporción sale de DATOS.booms: suma de "extra" de los booms de teleserie
// sobre la suma de "extra" de todos los booms identificados.

const RETRASO_ENTRE_BEBES = 25; // ms entre una figura y la siguiente

// Categorías (campo "categoria", no "categoria_viz") que cuentan como
// televisión. "categoria_viz" agrupa series/animación y TV en vivo dentro
// de "Otra causa", por eso aquí se usa la categoría detallada.
const CATEGORIAS_TV = new Set([
  "Teleserie",
  "Música / Viña",
  "Series y animación",
  "TV en vivo",
]);

let totalCeleste = 0;
let pendienteAnimacion = false;

function initOverview() {
  const continuar = document.getElementById("bebes-continuar");
  if (continuar) continuar.addEventListener("click", avanzarBebes);
}

function rellenarBebes() {
  if (!DATOS) return;
  const grid = document.getElementById("bebes-grid");
  if (!grid) return;

  // Denominador: TODOS los booms detectados (203), no solo los identificados.
  // Así, "cada 100 bebés" son los bebés cuyos nombres hicieron boom; las 100
  // figuras resumen a esos bebés (ponderados por su "extra").
  const tv = DATOS.booms.filter((b) => CATEGORIAS_TV.has(b.categoria));
  const extraTv = tv.reduce((acc, b) => acc + b.extra, 0);
  const extraTotal = DATOS.booms.reduce((acc, b) => acc + b.extra, 0);
  const pct = extraTotal > 0 ? extraTv / extraTotal : 0;
  const nCeleste = Math.round(pct * 100);
  const nGris = 100 - nCeleste;

  // Las primeras nCeleste figuras (orden de lectura) son las que se
  // colorearán; el resto queda gris. La grilla ya fue pre-renderizada en
  // gris desde el HTML, así que aquí solo calculamos los conteos.
  totalCeleste = nCeleste;

  document.getElementById("bebe-tv-conteo").textContent = `${nCeleste} de 100`;
  document.getElementById("bebe-gris-conteo").textContent = `${nGris} de 100`;

  if (pendienteAnimacion) animarBebes();
}

function animarBebes() {
  const grid = document.getElementById("bebes-grid");
  if (!grid) return;

  const hijos = grid.children;
  if (hijos.length === 0) {
    // Los datos aún no llegaron: rellenarBebes lanzará la animación al terminar.
    pendienteAnimacion = true;
    return;
  }

  pendienteAnimacion = false;
  for (let i = 0; i < totalCeleste && i < hijos.length; i++) {
    const el = hijos[i];
    const retraso = i * RETRASO_ENTRE_BEBES;
    setTimeout(() => {
      el.classList.add("bebe-tv");
    }, retraso);
  }
}

initOverview();

// ---------- Slide del beeswarm (punto 2) ----------
//
// Enjambre de los 203 booms: x = grupo de causa, y = "veces" (escala
// logarítmica, porque casi todos los booms se agrupan entre 4x y 8x).
// El layout se calcula con d3-force (forceX al centro del grupo, forceY al
// valor de "veces", forceCollide para separar los puntos) y se dibuja en SVG.

const ORDEN_SWARM = [
  "Teleseries",
  "Música / Viña",
  "Otras causas televisivas",
  "No televisivas",
  "Sin identificar",
];

const GRUPO_SWARM = {
  "Teleserie": "Teleseries",
  "Música / Viña": "Música / Viña",
  "Series y animación": "Otras causas televisivas",
  "TV en vivo": "Otras causas televisivas",
  "Política, realeza y noticias": "No televisivas",
  "Cine": "No televisivas",
  "Deporte": "No televisivas",
  "Ciencia y espacio": "No televisivas",
  "Migración": "No televisivas",
  "Sin identificar": "Sin identificar",
};

const COLOR_SWARM = {
  "Teleseries": raiz.getPropertyValue("--cat-teleserie").trim(),
  "Música / Viña": raiz.getPropertyValue("--cat-musica").trim(),
  "Otras causas televisivas": raiz.getPropertyValue("--cat-otra").trim(),
  "No televisivas": raiz.getPropertyValue("--cat-no-tv").trim(),
  "Sin identificar": raiz.getPropertyValue("--cat-sin-identificar").trim(),
};

const RADIO_SWARM = 5;

// Dimensiones internas del SVG y factor de zoom de página completa.
const ANCHO_SWARM = 820;
const ALTO_SWARM = 430;
const ZOOM_SWARM = 3;
const TICKS_Y_SWARM = [4, 6, 10, 20, 40, 80, 160, 300];

let svgSwarm = null;
let capaSwarm = null; // <g> contenedor del dibujo (ya no se transforma)
let nodoActivo = null;
let timerDetalleSwarm = null;
let zoomSwarm = { k: 1, tx: 0, ty: 0 }; // transform actual de #swarm-zoom
// Grupos visibles en el gráfico. Parte vacío: cada botón de la leyenda
// agrega (o quita) su grupo, para que el lector construya la comparación
// categoría por categoría en vez de recibir los 203 puntos de golpe.
let gruposActivos = new Set();
let nodosSwarm = null; // layout fijo de los 203 puntos (se calcula una vez)
let capaPuntosSwarm = null; // <g> donde viven los círculos
let mensajeVacioSwarm = null; // texto que se muestra con el gráfico vacío

function actualizarLeyendaSwarm() {
  document.querySelectorAll("#swarm-leyenda .item").forEach((item) => {
    const activo = gruposActivos.has(item.dataset.grupo);
    item.classList.toggle("inactivo", !activo);
    item.setAttribute("aria-pressed", activo ? "true" : "false");
  });
}

function alternarGrupoSwarm(grupo) {
  if (gruposActivos.has(grupo)) gruposActivos.delete(grupo);
  else gruposActivos.add(grupo);
  volverSwarm();
  actualizarLeyendaSwarm();
  actualizarPuntosSwarm();
}

function construirLeyendaSwarm() {
  const cont = document.getElementById("swarm-leyenda");
  if (!cont) return;
  cont.innerHTML = "";
  ORDEN_SWARM.forEach((grupo) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "item";
    item.dataset.grupo = grupo;
    item.textContent = grupo;
    item.style.setProperty("--color-grupo", COLOR_SWARM[grupo]);
    item.addEventListener("click", () => alternarGrupoSwarm(grupo));
    cont.appendChild(item);
  });
  actualizarLeyendaSwarm();
}

// Tooltip que sigue al cursor al pasar sobre un punto.
function posicionarTooltipSwarm(ev) {
  const tip = document.getElementById("swarm-tooltip");
  const swarm = document.getElementById("swarm");
  if (!tip || !swarm || tip.hidden) return;
  const r = swarm.getBoundingClientRect();
  const x = ev.clientX - r.left;
  const y = ev.clientY - r.top;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let left = x + 14;
  let top = y + 14;
  if (left + w > r.width - 6) left = x - w - 14;
  if (top + h > r.height - 6) top = y - h - 14;
  tip.style.left = `${Math.max(6, left)}px`;
  tip.style.top = `${Math.max(6, top)}px`;
}

function mostrarTooltipSwarm(ev, d) {
  const tip = document.getElementById("swarm-tooltip");
  if (!tip) return;
  const grupo = GRUPO_SWARM[d.boom.categoria] || "Sin identificar";
  tip.innerHTML =
    `<strong>${d.boom.nombre} (${d.boom.anio})</strong><br>` +
    `<span class="punto-color" style="background:${COLOR_SWARM[grupo]}"></span>` +
    `${grupo} · Alza de ${d.veces.toFixed(1)}x veces`;
  tip.hidden = false;
  posicionarTooltipSwarm(ev);
}

function ocultarTooltipSwarm() {
  const tip = document.getElementById("swarm-tooltip");
  if (tip) tip.hidden = true;
}

function llenarDetalleSwarm(b) {
  const grupo = GRUPO_SWARM[b.categoria] || "Sin identificar";
  const color = COLOR_SWARM[grupo];

  document.getElementById("swarm-detalle-nombre").textContent = `${b.nombre} (${b.anio})`;

  const chip = document.getElementById("swarm-detalle-chip");
  chip.textContent = grupo;
  chip.style.background = color;

  const causaEl = document.getElementById("swarm-detalle-causa");
  causaEl.textContent = b.causa
    ? `Coincide con: ${b.causa}.`
    : "Sin causa identificada.";

  const metaEl = document.getElementById("swarm-detalle-meta");
  const fuenteHtml = b.fuente
    ? ` · <a href="${b.fuente}" target="_blank" rel="noopener">fuente</a>`
    : "";
  metaEl.innerHTML =
    `De ${Math.round(b.prev)} a ${b.n} inscripciones (${b.veces.toFixed(1)}x), ` +
    `+${b.extra} guaguas extra${fuenteHtml}`;

  dibujarDetalle(b, "swarm-grafico-detalle", color);
}

function mostrarPanelSwarm(b) {
  const el = document.getElementById("swarm-detalle");
  if (!el) return;
  el.hidden = false;
  // Fuerza un reflow para que la transición de entrada se reproduzca.
  void el.offsetWidth;
  el.classList.add("visible");
  llenarDetalleSwarm(b);
}

function seleccionarPuntoSwarm(ev, d) {
  const zoom = document.getElementById("swarm-zoom");
  const swarm = document.getElementById("swarm");
  const circle = ev && ev.currentTarget ? ev.currentTarget : null;
  if (!zoom || !swarm || !circle) return;

  nodoActivo = d;
  ocultarTooltipSwarm();

  // Resaltar el punto seleccionado (borde rojo pulsante).
  document
    .querySelectorAll("#grafico-swarm .punto-seleccionado")
    .forEach((el) => el.classList.remove("punto-seleccionado"));
  circle.classList.add("punto-seleccionado");

  // Sonificación: tono según la magnitud + narración de voz.
  asegurarAudio()
    .then(() => {
      reproducirEarcon(d.boom);
      decirBoom(d.boom);
    })
    .catch(() => {});

  // Coordenadas locales del punto dentro de #swarm-zoom, invirtiendo el
  // transform actual (funciona aunque ya haya un zoom activo).
  const zoomRect = zoom.getBoundingClientRect();
  const rect = circle.getBoundingClientRect();
  const k0 = zoomSwarm.k || 1;
  const localX = (rect.left + rect.width / 2 - zoomRect.left) / k0;
  const localY = (rect.top + rect.height / 2 - zoomRect.top) / k0;

  const swarmRect = swarm.getBoundingClientRect();
  const esMovil = window.matchMedia("(max-width: 720px)").matches;
  let anchorX;
  let anchorY;
  if (esMovil) {
    // Panel como bottom sheet: el punto se ancla en la franja superior libre.
    anchorX = swarmRect.width * 0.5;
    anchorY = swarmRect.height * 0.14;
  } else {
    // Panel lateral derecho: el punto se ancla al área libre de la izquierda.
    const anchoPanel = Math.min(620, swarmRect.width);
    anchorX = Math.max(swarmRect.width * 0.15, (swarmRect.width - anchoPanel) / 2);
    anchorY = swarmRect.height * 0.5;
  }
  const k = ZOOM_SWARM;
  const tx = anchorX - k * localX;
  const ty = anchorY - k * localY;

  zoomSwarm = { k, tx, ty };
  zoom.style.transformOrigin = "0 0";
  zoom.style.transition = "transform 0.6s ease-in-out";
  zoom.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
  swarm.classList.add("zoom-activo");
  animarEjeYFlotante();

  const volver = document.getElementById("swarm-volver");
  if (volver) volver.hidden = false;
  const atras = document.getElementById("swarm-atras");
  if (atras) atras.hidden = true;

  // El panel se muestra cuando el zoom ya llegó a su destino.
  const el = document.getElementById("swarm-detalle");
  if (el) {
    el.classList.remove("visible");
    el.hidden = true;
  }
  clearTimeout(timerDetalleSwarm);
  timerDetalleSwarm = setTimeout(() => {
    if (nodoActivo === d) {
      mostrarPanelSwarm(d.boom);
      actualizarEjeYFlotante();
    }
  }, 620);
}

function volverSwarm() {
  nodoActivo = null;
  clearTimeout(timerDetalleSwarm);

  document
    .querySelectorAll("#grafico-swarm .punto-seleccionado")
    .forEach((el) => el.classList.remove("punto-seleccionado"));
  cancelAnimationFrame(rafEjeYFlotante);
  ocultarEjeYFlotante();

  const el = document.getElementById("swarm-detalle");
  if (el) {
    el.classList.remove("visible");
    setTimeout(() => {
      if (!el.classList.contains("visible")) el.hidden = true;
    }, 450);
  }

  const volver = document.getElementById("swarm-volver");
  if (volver) volver.hidden = true;
  const atras = document.getElementById("swarm-atras");
  if (atras) atras.hidden = false;

  const zoom = document.getElementById("swarm-zoom");
  if (zoom) {
    zoom.style.transition = "transform 0.6s ease-in-out";
    zoom.style.transform = "none";
  }
  zoomSwarm = { k: 1, tx: 0, ty: 0 };

  const swarm = document.getElementById("swarm");
  if (swarm) swarm.classList.remove("zoom-activo");
}

function ocultarEjeYFlotante() {
  const cont = document.getElementById("swarm-eje-y");
  if (cont) cont.hidden = true;
}

// Muestra los multiplicadores del eje Y junto a cada línea horizontal cuando
// el eje original quedó fuera de vista por el zoom. Reutiliza los mismos
// <span> para poder actualizarlos en cada frame sin parpadeos.
function actualizarEjeYFlotante() {
  const cont = document.getElementById("swarm-eje-y");
  const swarm = document.getElementById("swarm");
  const svg = document.querySelector("#grafico-swarm svg");
  const etiquetasY = document.querySelectorAll("#grafico-swarm .eje-y text");
  const lineas = document.querySelectorAll("#grafico-swarm .grilla line");
  if (!cont || !swarm || !svg || etiquetasY.length === 0 || lineas.length === 0) {
    ocultarEjeYFlotante();
    return;
  }

  // Si el eje original sigue visible horizontalmente, no hace falta el flotante.
  const ejeVisible = [...etiquetasY].some((el) => {
    const r = el.getBoundingClientRect();
    return r.right > 4 && r.left < window.innerWidth - 4;
  });
  if (ejeVisible) {
    ocultarEjeYFlotante();
    return;
  }

  // Crea las etiquetas una sola vez (una por tick).
  if (cont.children.length !== lineas.length) {
    cont.innerHTML = "";
    lineas.forEach((_, i) => {
      const item = document.createElement("span");
      item.className = "item";
      item.textContent = `${TICKS_Y_SWARM[i]}x`;
      item.hidden = true;
      cont.appendChild(item);
    });
  }

  const svgRect = svg.getBoundingClientRect();
  const base = swarm.getBoundingClientRect().top;
  let visibles = 0;

  lineas.forEach((linea, i) => {
    const item = cont.children[i];
    if (!item) return;
    const r = linea.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const dentro =
      y >= svgRect.top + 1 &&
      y <= svgRect.bottom - 1 &&
      y >= 1 &&
      y <= window.innerHeight - 1;
    item.hidden = !dentro;
    if (dentro) {
      item.style.top = `${y - base}px`;
      visibles++;
    }
  });

  cont.hidden = visibles === 0;
}

// Actualiza el eje flotante durante toda la transición del zoom para que las
// etiquetas se muevan junto con las líneas (sin esperar a que termine).
let rafEjeYFlotante = null;
function animarEjeYFlotante() {
  cancelAnimationFrame(rafEjeYFlotante);
  const inicio = performance.now();
  const frame = (ahora) => {
    actualizarEjeYFlotante();
    if (ahora - inicio < 700) {
      rafEjeYFlotante = requestAnimationFrame(frame);
    }
  };
  rafEjeYFlotante = requestAnimationFrame(frame);
}

let timerEjeYFlotante = null;
window.addEventListener("resize", () => {
  clearTimeout(timerEjeYFlotante);
  timerEjeYFlotante = setTimeout(() => {
    const swarm = document.getElementById("swarm");
    if (swarm && swarm.classList.contains("zoom-activo")) actualizarEjeYFlotante();
  }, 200);
});

function dibujarSwarm() {
  if (!DATOS || typeof d3 === "undefined") return;
  const cont = document.getElementById("grafico-swarm");
  if (!cont) return;

  construirLeyendaSwarm();

  // Escalas fijas: el eje X siempre reserva lugar para las 5 categorías y el
  // eje Y siempre va de 3x a 300x, aunque el gráfico esté vacío o con un solo
  // grupo. Así, al agregar o quitar grupos nada se mueve ni se reescala, y
  // las posiciones se pueden comparar entre una selección y otra.
  const W = ANCHO_SWARM;
  const H = ALTO_SWARM;
  const margen = { t: 18, r: 24, b: 46, l: 58 };

  const x = d3
    .scaleBand()
    .domain(ORDEN_SWARM)
    .range([margen.l, W - margen.r])
    .paddingInner(0.35)
    .paddingOuter(0.2);

  const centroX = (grupo) => x(grupo) + x.bandwidth() / 2;

  const y = d3
    .scaleLog()
    .domain([3, 300])
    .range([H - margen.b, margen.t]);

  // El layout de los 203 puntos se calcula una sola vez con todos ellos;
  // filtrar solo decide cuáles se dibujan, así cada punto aparece siempre
  // en el mismo lugar.
  if (!nodosSwarm) nodosSwarm = calcularLayoutSwarm(centroX, y, margen, W, H);

  cont.innerHTML = "";
  svgSwarm = d3
    .select(cont)
    .append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  capaSwarm = svgSwarm.append("g").attr("class", "capa");

  // Grilla horizontal + eje y.
  const yTicks = TICKS_Y_SWARM;
  const grilla = capaSwarm.append("g").attr("class", "grilla");
  grilla
    .selectAll("line")
    .data(yTicks)
    .join("line")
    .attr("x1", margen.l)
    .attr("x2", W - margen.r)
    .attr("y1", (v) => y(v))
    .attr("y2", (v) => y(v));

  const ejeY = capaSwarm.append("g").attr("class", "eje eje-y");
  ejeY
    .selectAll("text")
    .data(yTicks)
    .join("text")
    .attr("x", margen.l - 8)
    .attr("y", (v) => y(v))
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "middle")
    .text((v) => `${v}x`);

  capaSwarm
    .append("text")
    .attr("class", "titulo-eje")
    .attr("transform", `translate(14 ${(H - margen.b + margen.t) / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .text("Veces sobre el promedio previo");

  // Eje x (categorías): siempre las 5, aunque su grupo no esté activo.
  const ejeX = capaSwarm.append("g").attr("class", "eje");
  ejeX
    .selectAll("text")
    .data(ORDEN_SWARM)
    .join("text")
    .attr("x", (g) => centroX(g))
    .attr("y", H - margen.b + 26)
    .attr("text-anchor", "middle")
    .text((g) => g);

  // Mensaje del estado vacío, centrado en el área del gráfico.
  mensajeVacioSwarm = capaSwarm
    .append("text")
    .attr("class", "mensaje-vacio")
    .attr("x", (margen.l + W - margen.r) / 2)
    .attr("y", (margen.t + H - margen.b) / 2)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .text("Elige una categoría arriba para ver sus alzas");

  capaPuntosSwarm = capaSwarm.append("g");
  actualizarPuntosSwarm();
}

function calcularLayoutSwarm(centroX, y, margen, W, H) {
  const radio = RADIO_SWARM;
  const nodos = DATOS.booms.map((b, i) => ({
    id: i,
    boom: b,
    grupo: GRUPO_SWARM[b.categoria] || "Sin identificar",
    veces: b.veces,
  }));

  // Semilla determinista: mismo layout en cada carga.
  let semilla = 1;
  const rnd = () => {
    semilla = (semilla * 16807) % 2147483647;
    return semilla / 2147483647;
  };

  nodos.forEach((n) => {
    n.x = centroX(n.grupo) + (rnd() - 0.5) * 6;
    n.y = y(n.veces) + (rnd() - 0.5) * 6;
  });

  const sim = d3
    .forceSimulation(nodos)
    .force("x", d3.forceX((d) => centroX(d.grupo)).strength(0.6))
    .force("y", d3.forceY((d) => y(d.veces)).strength(1))
    .force("collide", d3.forceCollide(radio + 1).strength(1).iterations(4))
    .stop();

  for (let i = 0; i < 320; i++) {
    sim.tick();
    // Acota los puntos al área del gráfico para que el cúmulo inferior no
    // invada la franja de etiquetas del eje X.
    nodos.forEach((n) => {
      n.x = Math.max(margen.l + radio, Math.min(n.x, W - margen.r - radio));
      n.y = Math.max(margen.t + radio, Math.min(n.y, H - margen.b - radio));
    });
  }
  return nodos;
}

// Dibuja solo los puntos de los grupos activos: los que entran crecen desde
// radio 0 y los que salen se encogen, para que se note qué grupo apareció.
function actualizarPuntosSwarm() {
  if (!capaPuntosSwarm || !nodosSwarm) return;
  const visibles = nodosSwarm.filter((n) => gruposActivos.has(n.grupo));

  mensajeVacioSwarm.style("display", visibles.length === 0 ? null : "none");

  capaPuntosSwarm
    .selectAll("circle")
    .data(visibles, (d) => d.id)
    .join(
      (enter) =>
        enter
          .append("circle")
          .attr("class", "punto")
          .attr("cx", (d) => d.x)
          .attr("cy", (d) => d.y)
          .attr("r", 0)
          .attr("fill", (d) => COLOR_SWARM[d.grupo])
          .attr("fill-opacity", 0.85)
          .on("mouseover", (ev, d) => mostrarTooltipSwarm(ev, d))
          .on("mousemove", (ev) => posicionarTooltipSwarm(ev))
          .on("mouseout", () => ocultarTooltipSwarm())
          .on("click", (ev, d) => seleccionarPuntoSwarm(ev, d))
          .call((e) => e.transition().duration(400).attr("r", RADIO_SWARM)),
      (update) => update,
      (exit) =>
        exit
          .style("pointer-events", "none")
          .call((e) => e.transition().duration(250).attr("r", 0).remove())
    );
}

function initSwarm() {
  const swarm = document.getElementById("swarm");
  if (!swarm) return;

  const volver = document.getElementById("swarm-volver");
  if (volver) volver.addEventListener("click", volverSwarm);

  const cerrar = document.getElementById("swarm-detalle-cerrar");
  if (cerrar) cerrar.addEventListener("click", volverSwarm);

  const atras = document.getElementById("swarm-atras");
  if (atras) atras.addEventListener("click", volverAtras);
}

initSwarm();
