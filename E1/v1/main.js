// V1 — Nombres en boom: overview + filtros + panel de detalle + sonificación.
// Todo corre en el navegador (sin servidor): Plotly para los gráficos,
// Tone.js para el sonido, Web Speech API para la voz.
//
// El gráfico y el sonido solo comparan los booms CON causa identificada
// (Teleserie, Música / Viña, Otra causa). Los 144 "sin identificar" no son
// una categoría real — es ausencia de dato — así que compararlos como si
// fueran una cuarta categoría exageraba su peso visual y sonoro. Esa
// exclusión se explica aparte en el texto (sesgo de identificación).

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

let DATOS = null; // { anio_min, anio_max, booms: [...] }
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
    document.getElementById("conteo-total").textContent = DATOS.booms.length;
    construirChips();
    dibujarOverview();
    actualizarEtiquetaRango();
  });

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

// ---------- Vista general (overview) ----------

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
    },
    yaxis: {
      type: "category",
      categoryarray: [...CATEGORIAS].reverse(),
      automargin: true,
      gridcolor: "#e1e0d9",
    },
    showlegend: false,
    // shapes[0] es un placeholder invisible: se necesita que el índice ya
    // exista para poder moverlo con Plotly.relayout durante el barrido. Usa
    // una coordenada dentro del rango de datos (no -1) para no afectar el
    // autorange de otros gráficos que reutilicen este patrón.
    shapes: [{ type: "line", x0: DATOS.anio_min, x1: DATOS.anio_min, y0: 0, y1: 0, line: { color: "transparent" } }],
    font: { family: "system-ui, sans-serif", color: "#0b0b0b" },
  };

  Plotly.react("grafico-overview", trazas, layout, { displayModeBar: false, responsive: true });

  const gd = document.getElementById("grafico-overview");
  gd.removeAllListeners?.("plotly_click");
  gd.on("plotly_click", (ev) => {
    const idx = ev.points[0].customdata;
    seleccionarBoom(idx, true);
  });
}

// ---------- Panel de detalle ----------

function seleccionarBoom(idx, conSonido) {
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

  if (conSonido) {
    asegurarAudio().then(() => {
      reproducirEarcon(b);
      decirBoom(b);
    });
  }
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
    // Rango fijo (no autorange): un shape invisible con x fuera de 1920-2021
    // (usado para la línea de progreso de "escuchar la curva") hace que
    // Plotly estire el autorange para incluirlo, aplastando la curva real.
    xaxis: { range: [DATOS.anio_min - 2, DATOS.anio_max + 2], gridcolor: "#e1e0d9" },
    yaxis: { title: "Inscripciones", rangemode: "tozero", gridcolor: "#e1e0d9" },
    shapes: [
      {
        type: "line",
        x0: b.anio,
        x1: b.anio,
        y0: 0,
        y1: Math.max(...b.serie) * 1.05,
        line: { color: "#0b0b0b", width: 1, dash: "dot" },
      },
      // shapes[1] es un placeholder invisible para la linea de progreso de
      // "escuchar la curva" (ver animarLineaDeProgreso).
      { type: "line", x0: b.anio, x1: b.anio, y0: 0, y1: 0, line: { color: "transparent" } },
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

  Plotly.react("grafico-detalle", [traza], layout, { displayModeBar: false, responsive: true });
}

// ---------- Sonificación (Tone.js + Web Speech API) ----------
//
// Estrategias de la cápsula técnica T4 que se usan aquí:
//   - Tonos sintetizados (Tone.js): cada categoría tiene un timbre fijo, y
//     la altura del tono sube con la magnitud del boom ("veces"). Las notas
//     se ajustan a una escala pentatónica para que la secuencia suene
//     musical y no como ruido aleatorio.
//   - Audificación (cápsula 27): "escuchar la curva" traduce directamente
//     la serie de inscripciones de un nombre en un tono que sube y baja,
//     sincronizado con una línea que recorre el gráfico.
//   - Voz (Web Speech API): no solo dice el nombre, narra el dato (de
//     cuánto a cuánto, en qué año) y la causa, como pide la estrategia 4.

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
  // "veces sobre lo previo" va de 4 (umbral de boom) a ~60 (Millaray); log
  // porque la mayoría de los booms son chicos y unos pocos son enormes.
  return Math.log(veces / 4) / Math.log(60 / 4);
}

let voces = null;
let curvaSynth = null;
let tickSynth = null;

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
      curvaSynth = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.3 },
        portamento: 0.05,
        volume: -10,
      }).toDestination();
      tickSynth = new Tone.MembraneSynth({ volume: -22, envelope: { attack: 0.001, decay: 0.08, sustain: 0 } }).toDestination();
      document.getElementById("estado-audio").textContent = "Audio listo.";
    }
  });
}

// Tone.js exige que cada ataque en un mismo instrumento tenga un horario
// estrictamente mayor al anterior. Dos booms de la misma categoría pueden
// caer muy cerca en el tiempo (durante el barrido del siglo), así que se
// guarda el último horario usado por categoría y se fuerza un mínimo de
// separación en vez de confiar en que cada setTimeout dispare en un
// instante distinto.
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

document.getElementById("btn-decir").addEventListener("click", () => {
  if (boomSeleccionado) decirBoom(boomSeleccionado);
});

document.getElementById("btn-curva").addEventListener("click", () => {
  if (!boomSeleccionado) return;
  asegurarAudio().then(() => reproducirCurva(boomSeleccionado));
});

// Audificación: desliza el tono siguiendo la curva del nombre, con una
// línea que recorre el gráfico de detalle al mismo tiempo (cápsula 13:
// mismo dato por dos canales a la vez).
let finCurvaAnterior = 0;

function reproducirCurva(b) {
  const max = Math.max(...b.serie, 1);
  const duracionTotal = 4.5; // segundos
  const pasoSeg = duracionTotal / b.serie.length;
  // Si se hace clic de nuevo mientras suena la curva anterior, espera a que
  // termine en vez de pisarla (misma razón que en reproducirEarcon).
  const inicio = Math.max(Tone.now() + 0.05, finCurvaAnterior);
  finCurvaAnterior = inicio + duracionTotal + 0.1;

  curvaSynth.triggerAttack(notaDesdeT(b.serie[0] / max), inicio);
  b.serie.forEach((valor, i) => {
    curvaSynth.frequency.rampTo(notaDesdeT(valor / max), pasoSeg * 0.9, inicio + i * pasoSeg);
  });
  curvaSynth.triggerRelease(inicio + duracionTotal);

  animarLineaDeProgreso("grafico-detalle", DATOS.anio_min, DATOS.anio_max, duracionTotal * 1000, 1);
}

// Mueve una línea vertical sobre un gráfico Plotly durante `duracionMs`,
// para que se vea en qué momento de la curva/línea de tiempo va el sonido.
// Reemplaza el arreglo "shapes" completo en cada cuadro (en vez de apuntar a
// "shapes[i]" con Plotly.relayout, que en la práctica va acumulando formas
// repetidas en vez de reemplazar la que ya existía).
function animarLineaDeProgreso(idGrafico, anioInicio, anioFin, duracionMs, indiceShape) {
  const gd = document.getElementById(idGrafico);
  const t0 = performance.now();
  const shapesBase = gd.layout.shapes.map((s) => ({ ...s }));

  function lineaEn(anio) {
    return {
      type: "line",
      x0: anio,
      x1: anio,
      yref: "paper",
      y0: 0,
      y1: 1,
      line: { color: "#52514e", width: 2 },
    };
  }

  function paso(ahora) {
    const t = Math.min(1, (ahora - t0) / duracionMs);
    const anio = anioInicio + t * (anioFin - anioInicio);
    const shapes = shapesBase.map((s, i) => (i === indiceShape ? lineaEn(anio) : s));
    Plotly.relayout(gd, { shapes });
    if (t < 1) requestAnimationFrame(paso);
    else Plotly.relayout(gd, { shapes: shapesBase });
  }
  requestAnimationFrame(paso);
}

// ---------- Barrido del siglo (overview sonora) ----------

let timeoutsSweep = [];
let sweepActivo = false;

document.getElementById("btn-sweep").addEventListener("click", () => {
  if (sweepActivo) return;
  asegurarAudio().then(iniciarSweep);
});

document.getElementById("btn-sweep-stop").addEventListener("click", detenerSweep);

function iniciarSweep() {
  const puntos = boomsFiltrados().slice().sort((a, b) => a.anio - b.anio);
  if (puntos.length === 0) return;

  sweepActivo = true;
  document.getElementById("btn-sweep").disabled = true;
  document.getElementById("btn-sweep-stop").disabled = false;
  document.getElementById("estado-audio").textContent = "Reproduciendo el siglo…";

  const duracionTotalMs = 16000;
  const span = rangoAnio[1] - rangoAnio[0] || 1;

  // Un "tic" suave cada década, para que el oído tenga una referencia de
  // tiempo mientras pasan los booms (como el segundero de un reloj).
  for (let anio = Math.ceil(rangoAnio[0] / 10) * 10; anio <= rangoAnio[1]; anio += 10) {
    const t = ((anio - rangoAnio[0]) / span) * duracionTotalMs;
    timeoutsSweep.push(setTimeout(() => tickSynth.triggerAttackRelease("C1", 0.05), t));
  }

  puntos.forEach((b) => {
    const t = ((b.anio - rangoAnio[0]) / span) * duracionTotalMs;
    timeoutsSweep.push(setTimeout(() => reproducirEarcon(b), t));
  });

  animarLineaDeProgreso("grafico-overview", rangoAnio[0], rangoAnio[1], duracionTotalMs, 0);
  timeoutsSweep.push(setTimeout(detenerSweep, duracionTotalMs + 400));
}

function detenerSweep() {
  timeoutsSweep.forEach((id) => clearTimeout(id));
  timeoutsSweep = [];
  sweepActivo = false;
  document.getElementById("btn-sweep").disabled = false;
  document.getElementById("btn-sweep-stop").disabled = true;
  document.getElementById("estado-audio").textContent = "Detenido.";
}
