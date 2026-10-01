// V1 — Nombres en boom: hilo narrativo en 3 pasos.
//   1) grafico-intro: nombres comunes (cambio lento) vs. 2 booms de ejemplo
//      (salto brusco) — establece la pregunta.
//   2) grafico-overview: comparación por categoría, con filtros.
//   3) grafico-ranking: los booms más grandes, para mostrar que las
//      teleseries no solo son más frecuentes, sino las más grandes.
// Un único panel de detalle (#detalle) se abre al hacer clic en cualquier
// burbuja o barra; ahí se reproduce el único sonido de la página: un
// timbre por categoría más una narración por voz (Web Speech API).
// Todo corre en el navegador (sin servidor): Plotly para los gráficos,
// Tone.js para el sonido.

const CATEGORIAS = ["Teleserie", "Música / Viña", "Otra causa"];

const ETIQUETAS = {
  "Teleserie": "Teleseries",
  "Música / Viña": "Música y Viña",
  "Otra causa": "Otra causa identificada",
};

const raiz = getComputedStyle(document.documentElement);
const COLOR = {
  "Teleserie": raiz.getPropertyValue("--cat-teleserie").trim(),
  "Música / Viña": raiz.getPropertyValue("--cat-musica").trim(),
  "Otra causa": raiz.getPropertyValue("--cat-otra").trim(),
};

// Colores solo para los 2 ejemplos del gráfico 1 (antes de introducir las
// categorías en la sección 2) — deliberadamente distintos de COLOR, para no
// insinuar una categoría que todavía no se explicó.
const COLOR_EJEMPLO_1 = "#4a3aa7"; // violeta
const COLOR_EJEMPLO_2 = "#e34948"; // rojo

// Config común para que ningún gráfico quede "pegado" en zoom (sin forma de
// volver atrás si se toca sin querer).
const SIN_ZOOM = { displayModeBar: false, responsive: true, scrollZoom: false };

let DATOS = null; // { anio_min, anio_max, comunes: [...], booms: [...] }
let IDENTIFICADOS = []; // DATOS.booms sin "Sin identificar"
let rangoAnio = [1920, 2021];
let categoriasActivas = new Set(CATEGORIAS);
let boomSeleccionado = null;

// ---------- Carga de datos ----------

fetch("data/nombres.json")
  .then((r) => r.json())
  .then((datos) => {
    DATOS = datos;
    IDENTIFICADOS = DATOS.booms.filter((b) => b.categoria_viz !== "Sin identificar");
    rangoAnio = [datos.anio_min, datos.anio_max];
    document.getElementById("rango-min").min = datos.anio_min;
    document.getElementById("rango-min").max = datos.anio_max;
    document.getElementById("rango-max").min = datos.anio_min;
    document.getElementById("rango-max").max = datos.anio_max;
    document.getElementById("rango-min").value = datos.anio_min;
    document.getElementById("rango-max").value = datos.anio_max;
    document.querySelectorAll(".conteo-identificados").forEach((el) => {
      el.textContent = IDENTIFICADOS.length;
    });
    construirChips();
    dibujarIntro();
    dibujarOverview();
    dibujarRanking();
    renderStats();
    actualizarEtiquetaRango();
  });

// ---------- Sección 1: nombres comunes vs. booms de ejemplo ----------

function dibujarIntro() {
  const anios = [];
  for (let a = DATOS.anio_min; a <= DATOS.anio_max; a++) anios.push(a);

  const trazasComunes = DATOS.comunes.map((c, i) => {
    const max = Math.max(...c.serie, 1);
    return {
      x: anios,
      y: c.serie.map((v) => (v / max) * 100),
      mode: "lines",
      type: "scatter",
      line: { color: "#c3c2b7", width: 2 },
      name: "Nombres comunes (María, José, Juan…)",
      legendgroup: "comunes",
      showlegend: i === 0,
      hovertemplate: `${c.nombre}: %{y:.0f}% de su máximo en %{x}<extra></extra>`,
    };
  });

  const ejemplos = [
    { nombre: "Yesenia", anio: 1974, color: COLOR_EJEMPLO_1 },
    { nombre: "Millaray", anio: 2001, color: COLOR_EJEMPLO_2 },
  ]
    .map((e) => ({ ...e, boom: DATOS.booms.find((b) => b.nombre === e.nombre && b.anio === e.anio) }))
    .filter((e) => e.boom);

  const trazasBooms = ejemplos.map((e) => {
    const max = Math.max(...e.boom.serie, 1);
    return {
      x: anios,
      y: e.boom.serie.map((v) => (v / max) * 100),
      mode: "lines",
      type: "scatter",
      line: { color: e.color, width: 3 },
      name: `${e.boom.nombre} (${e.boom.anio})`,
      hovertemplate: `${e.boom.nombre}: %{y:.0f}% de su máximo en %{x}<extra></extra>`,
    };
  });

  const layout = {
    margin: { t: 10, r: 10, b: 30, l: 50 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    xaxis: { gridcolor: "#e1e0d9", fixedrange: true },
    yaxis: {
      title: "% de su propio máximo histórico",
      gridcolor: "#e1e0d9",
      fixedrange: true,
      range: [0, 108],
    },
    dragmode: false,
    legend: { orientation: "h", y: -0.25 },
    font: { family: "system-ui, sans-serif", color: "#0b0b0b" },
  };

  Plotly.newPlot("grafico-intro", [...trazasComunes, ...trazasBooms], layout, SIN_ZOOM);
}

// ---------- Chips de categoría (filtro) ----------

function construirChips() {
  const cont = document.getElementById("chips-categoria");
  CATEGORIAS.forEach((cat) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.dataset.categoria = cat;
    chip.innerHTML = `<span class="punto" style="background:${COLOR[cat]}"></span>${ETIQUETAS[cat]}`;
    chip.addEventListener("click", () => {
      if (categoriasActivas.has(cat)) {
        categoriasActivas.delete(cat);
        chip.classList.add("inactivo");
      } else {
        categoriasActivas.add(cat);
        chip.classList.remove("inactivo");
      }
      dibujarOverview();
    });
    cont.appendChild(chip);
  });
}

// ---------- Slider de década (dos sliders enlazados) ----------

const inputMin = document.getElementById("rango-min");
const inputMax = document.getElementById("rango-max");

function actualizarEtiquetaRango() {
  document.getElementById("rango-label").textContent = `${rangoAnio[0]} – ${rangoAnio[1]}`;
}

[inputMin, inputMax].forEach((input) => {
  input.addEventListener("input", () => {
    let min = parseInt(inputMin.value, 10);
    let max = parseInt(inputMax.value, 10);
    if (min > max) {
      if (input === inputMin) max = min;
      else min = max;
      inputMin.value = min;
      inputMax.value = max;
    }
    rangoAnio = [min, max];
    actualizarEtiquetaRango();
    dibujarOverview();
  });
});

// ---------- Sección 2: vista general por categoría ----------

function boomsFiltrados() {
  return IDENTIFICADOS.filter(
    (b) =>
      categoriasActivas.has(b.categoria_viz) &&
      b.anio >= rangoAnio[0] &&
      b.anio <= rangoAnio[1]
  );
}

function dibujarOverview() {
  if (!DATOS) return;
  const filtrados = boomsFiltrados();
  const maxVeces = Math.max(...IDENTIFICADOS.map((b) => b.veces));
  const sizeref = (2 * maxVeces) / 42 ** 2; // area proporcional al "veces", no al radio

  const trazas = CATEGORIAS.map((cat) => {
    const puntos = filtrados.filter((b) => b.categoria_viz === cat);
    return {
      name: ETIQUETAS[cat],
      x: puntos.map((b) => b.anio),
      y: puntos.map(() => cat),
      customdata: puntos.map((b) => DATOS.booms.indexOf(b)),
      text: puntos.map(
        (b) =>
          `${b.nombre} (${b.sexo}), ${b.anio}<br>${b.veces.toFixed(1)}x sobre lo previo, +${b.extra} guaguas<br>${b.categoria}`
      ),
      hovertemplate: "%{text}<extra></extra>",
      mode: "markers",
      type: "scatter",
      marker: {
        size: puntos.map((b) => b.veces),
        sizemode: "area",
        sizeref,
        sizemin: 6,
        color: COLOR[cat],
        opacity: 0.85,
        line: { width: 1, color: "rgba(0,0,0,0.25)" },
      },
    };
  });

  const layout = {
    margin: { t: 10, r: 10, b: 40, l: 150 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    xaxis: {
      title: "Año del boom",
      range: [1918, 2023],
      gridcolor: "#e1e0d9",
      zeroline: false,
      fixedrange: true,
    },
    yaxis: {
      type: "category",
      categoryarray: [...CATEGORIAS].reverse(),
      automargin: true,
      gridcolor: "#e1e0d9",
      fixedrange: true,
    },
    dragmode: false,
    showlegend: false,
    font: { family: "system-ui, sans-serif", color: "#0b0b0b" },
  };

  Plotly.react("grafico-overview", trazas, layout, SIN_ZOOM);

  const gd = document.getElementById("grafico-overview");
  gd.removeAllListeners?.("plotly_click");
  gd.on("plotly_click", (ev) => {
    const idx = ev.points[0].customdata;
    seleccionarBoom(idx);
  });
}

// ---------- Sección 3: ranking de los booms más grandes ----------

function construirLeyendaRanking() {
  const cont = document.getElementById("leyenda-ranking");
  CATEGORIAS.forEach((cat) => {
    const item = document.createElement("span");
    item.className = "chip chip-estatico";
    item.innerHTML = `<span class="punto" style="background:${COLOR[cat]}"></span>${ETIQUETAS[cat]}`;
    cont.appendChild(item);
  });
}

function dibujarRanking() {
  construirLeyendaRanking();
  const top = IDENTIFICADOS.slice()
    .sort((a, b) => b.veces - a.veces)
    .slice(0, 12);
  // Plotly dibuja barras horizontales de abajo hacia arriba en el orden del
  // arreglo; se invierte para que el boom más grande quede arriba.
  const ordenado = top.slice().reverse();

  const traza = {
    x: ordenado.map((b) => b.veces),
    y: ordenado.map((b) => `${b.nombre} (${b.anio})`),
    customdata: ordenado.map((b) => DATOS.booms.indexOf(b)),
    type: "bar",
    orientation: "h",
    marker: { color: ordenado.map((b) => COLOR[b.categoria_viz]) },
    text: ordenado.map((b) => `${b.veces.toFixed(0)}x`),
    textposition: "outside",
    hovertemplate: "%{y}: %{x:.1f}x sobre lo previo<extra></extra>",
  };

  const layout = {
    margin: { t: 10, r: 40, b: 40, l: 170 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    xaxis: { title: "Veces sobre el promedio previo", gridcolor: "#e1e0d9", fixedrange: true },
    yaxis: { gridcolor: "#e1e0d9", fixedrange: true },
    dragmode: false,
    showlegend: false,
    font: { family: "system-ui, sans-serif", color: "#0b0b0b" },
  };

  Plotly.newPlot("grafico-ranking", [traza], layout, SIN_ZOOM);

  const gd = document.getElementById("grafico-ranking");
  gd.on("plotly_click", (ev) => {
    const idx = ev.points[0].customdata;
    seleccionarBoom(idx);
    document.getElementById("detalle").scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function renderStats() {
  const teleseries = IDENTIFICADOS.filter((b) => b.categoria_viz === "Teleserie");
  const pctConteo = Math.round((teleseries.length / IDENTIFICADOS.length) * 100);
  const extraTotal = IDENTIFICADOS.reduce((acc, b) => acc + b.extra, 0);
  const extraTeleserie = teleseries.reduce((acc, b) => acc + b.extra, 0);
  const pctExtra = Math.round((extraTeleserie / extraTotal) * 100);
  const maximo = IDENTIFICADOS.slice().sort((a, b) => b.veces - a.veces)[0];

  document.getElementById("stat-conteo").textContent =
    `${teleseries.length} de ${IDENTIFICADOS.length} (${pctConteo}%)`;
  document.getElementById("stat-extra").textContent = `${pctExtra}%`;
  document.getElementById("stat-maximo").textContent =
    `${maximo.nombre}, ${maximo.veces.toFixed(0)}x (${maximo.anio})`;
}

// ---------- Panel de detalle (compartido por los gráficos 2 y 3) ----------

function seleccionarBoom(idx) {
  boomSeleccionado = DATOS.booms[idx];
  const b = boomSeleccionado;

  document.getElementById("detalle").classList.add("visible");
  document.getElementById("detalle-nombre").textContent = `${b.nombre} (${b.anio})`;

  const chip = document.getElementById("detalle-chip");
  chip.textContent = ETIQUETAS[b.categoria_viz];
  chip.style.background = COLOR[b.categoria_viz];

  const causaEl = document.getElementById("detalle-causa");
  causaEl.textContent = `Coincide con: ${b.causa}. (Confianza: ${b.confianza.toLowerCase()}; coincidir en el tiempo no prueba causa.)`;

  const metaEl = document.getElementById("detalle-meta");
  const fuenteHtml = b.fuente ? ` · <a href="${b.fuente}" target="_blank" rel="noopener">fuente</a>` : "";
  metaEl.innerHTML = `De ${Math.round(b.prev)} a ${b.n} inscripciones (${b.veces.toFixed(1)}x), +${b.extra} guaguas extra${fuenteHtml}`;

  dibujarDetalle(b);

  asegurarAudio().then(() => {
    reproducirEarcon(b);
    decirBoom(b);
  });
}

function dibujarDetalle(b) {
  const anios = [];
  for (let a = DATOS.anio_min; a <= DATOS.anio_max; a++) anios.push(a);

  const traza = {
    x: anios,
    y: b.serie,
    mode: "lines",
    type: "scatter",
    fill: "tozeroy",
    line: { color: COLOR[b.categoria_viz], width: 2 },
    fillcolor: COLOR[b.categoria_viz] + "22",
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
        text: "boom",
        showarrow: false,
        yanchor: "bottom",
        font: { size: 11, color: "#52514e" },
      },
    ],
    font: { family: "system-ui, sans-serif", color: "#0b0b0b" },
  };

  Plotly.react("grafico-detalle", [traza], layout, SIN_ZOOM);
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

function notaDesdeT(t) {
  const indice = Math.round(Math.max(0, Math.min(1, t)) * (ESCALA_PENTATONICA.length - 1));
  const midi = NOTA_RAIZ_MIDI + ESCALA_PENTATONICA[indice];
  return Tone.Frequency(midi, "midi").toFrequency();
}

function tDesdeVeces(veces) {
  // "veces sobre lo previo" va de 4 (umbral de boom) a ~187 (Yesenia); log
  // porque la mayoría de los booms son chicos y unos pocos son enormes.
  return Math.log(veces / 4) / Math.log(187 / 4);
}

let voces = null;

function asegurarAudio() {
  return Tone.start().then(() => {
    if (!voces) {
      voces = {
        // Teleserie: tono sostenido y cálido, como una nota tenida de cuerdas.
        "Teleserie": new Tone.Synth({
          oscillator: { type: "triangle" },
          envelope: { attack: 0.08, decay: 0.25, sustain: 0.5, release: 1.0 },
          volume: -8,
        }).toDestination(),
        // Música / Viña: pulsado, como una guitarra o arpa.
        "Música / Viña": new Tone.PluckSynth({
          attackNoise: 1,
          dampening: 3500,
          resonance: 0.8,
          volume: -4,
        }).toDestination(),
        // Otra causa: timbre tipo campana/electrónico, claramente distinto.
        "Otra causa": new Tone.FMSynth({ volume: -10 }).toDestination(),
      };
    }
  });
}

// Tone.js exige que cada ataque en un mismo instrumento tenga un horario
// estrictamente mayor al anterior. Si se hace doble clic rápido en dos
// booms de la misma categoría, el segundo podría caer en el mismo instante
// que el primero, así que se fuerza un mínimo de separación.
const ultimoInicioPorCategoria = {};

function reproducirEarcon(b) {
  const synth = voces[b.categoria_viz];
  const nota = notaDesdeT(tDesdeVeces(b.veces));
  const duracion = Math.min(1.0, 0.2 + b.extra / 2000);
  const anterior = ultimoInicioPorCategoria[b.categoria_viz] || 0;
  const inicio = Math.max(Tone.now(), anterior + 0.02);
  synth.triggerAttackRelease(nota, duracion, inicio);
  ultimoInicioPorCategoria[b.categoria_viz] = inicio;
}

function decirBoom(b) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const texto = `${b.nombre}. De ${Math.round(b.prev)} a ${b.n} inscripciones en ${b.anio}. ${b.causa}.`;
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "es-CL";
  u.rate = 1.05;
  speechSynthesis.speak(u);
}
