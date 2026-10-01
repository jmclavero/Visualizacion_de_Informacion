// V1 — Nombres en boom: overview + filtros + panel de detalle + sonificación.
// Todo corre en el navegador (sin servidor): Plotly para los gráficos,
// Tone.js para los tonos, Web Speech API para la voz.

const CATEGORIAS = ["Teleserie", "Música / Viña", "Otra causa", "Sin identificar"];

const ETIQUETAS = {
  "Teleserie": "Teleseries",
  "Música / Viña": "Música y Viña",
  "Otra causa": "Otra causa identificada",
  "Sin identificar": "Sin identificar",
};

const raiz = getComputedStyle(document.documentElement);
const COLOR = {
  "Teleserie": raiz.getPropertyValue("--cat-teleserie").trim(),
  "Música / Viña": raiz.getPropertyValue("--cat-musica").trim(),
  "Otra causa": raiz.getPropertyValue("--cat-otra").trim(),
  "Sin identificar": raiz.getPropertyValue("--cat-sin-identificar").trim(),
};

let DATOS = null; // { anio_min, anio_max, booms: [...] }
let rangoAnio = [1920, 2021];
let categoriasActivas = new Set(CATEGORIAS);
let boomSeleccionado = null;

// ---------- Carga de datos ----------

fetch("data/nombres.json")
  .then((r) => r.json())
  .then((datos) => {
    DATOS = datos;
    rangoAnio = [datos.anio_min, datos.anio_max];
    document.getElementById("rango-min").min = datos.anio_min;
    document.getElementById("rango-min").max = datos.anio_max;
    document.getElementById("rango-max").min = datos.anio_min;
    document.getElementById("rango-max").max = datos.anio_max;
    document.getElementById("rango-min").value = datos.anio_min;
    document.getElementById("rango-max").value = datos.anio_max;
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
  return DATOS.booms.filter(
    (b) =>
      categoriasActivas.has(b.categoria_viz) &&
      b.anio >= rangoAnio[0] &&
      b.anio <= rangoAnio[1]
  );
}

function dibujarOverview() {
  if (!DATOS) return;
  const filtrados = boomsFiltrados();
  const maxVeces = Math.max(...DATOS.booms.map((b) => b.veces));
  const sizeref = (2 * maxVeces) / 38 ** 2; // area proporcional al "veces", no al radio

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
        sizemin: 5,
        color: COLOR[cat],
        opacity: cat === "Sin identificar" ? 0.35 : 0.85,
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
  if (b.causa) {
    causaEl.textContent = `Coincide con: ${b.causa}. (Confianza: ${b.confianza.toLowerCase()}; coincidir en el tiempo no prueba causa.)`;
  } else {
    causaEl.textContent = "No se identificó una causa para este boom.";
  }

  const metaEl = document.getElementById("detalle-meta");
  const fuenteHtml = b.fuente ? ` · <a href="${b.fuente}" target="_blank" rel="noopener">fuente</a>` : "";
  metaEl.innerHTML = `De ${Math.round(b.prev)} a ${b.n} inscripciones (${b.veces.toFixed(1)}x), +${b.extra} guaguas extra${fuenteHtml}`;

  dibujarDetalle(b);

  if (conSonido) {
    asegurarAudio().then(() => {
      reproducirEarcon(b);
      decirNombre(b.nombre);
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
    xaxis: { gridcolor: "#e1e0d9" },
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

let voces = null;

function asegurarAudio() {
  return Tone.start().then(() => {
    if (!voces) {
      voces = {
        "Teleserie": new Tone.PolySynth(Tone.AMSynth, {
          envelope: { attack: 0.4, decay: 0.3, sustain: 0.6, release: 1.2 },
          harmonicity: 1.5,
          volume: -6,
        }).toDestination(),
        "Música / Viña": new Tone.Synth({
          oscillator: { type: "sawtooth" },
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 },
          volume: -10,
        }).toDestination(),
        "Otra causa": new Tone.PluckSynth({ attackNoise: 1, dampening: 3000, resonance: 0.9 }).toDestination(),
        "Sin identificar": new Tone.Synth({
          oscillator: { type: "sine" },
          envelope: { attack: 0.005, decay: 0.05, sustain: 0, release: 0.05 },
          volume: -20,
        }).toDestination(),
      };
      curvaSynth = new Tone.Synth({ oscillator: { type: "triangle" }, volume: -12 }).toDestination();
      document.getElementById("estado-audio").textContent = "Audio listo.";
    }
  });
}

let curvaSynth = null;

function notaDesdeVeces(veces) {
  // Mapea "veces sobre lo previo" (4 a ~60) a una nota entre C3 y C6.
  const t = Math.min(1, Math.log(veces / 4) / Math.log(60 / 4));
  const midi = 48 + t * (84 - 48);
  return Tone.Frequency(midi, "midi").toFrequency();
}

function reproducirEarcon(b) {
  const synth = voces[b.categoria_viz];
  const nota = notaDesdeVeces(b.veces);
  const duracion = Math.min(0.9, 0.15 + b.extra / 2500);
  synth.triggerAttackRelease(nota, duracion);
}

function decirNombre(nombre) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(nombre);
  u.lang = "es-CL";
  u.rate = 1;
  speechSynthesis.speak(u);
}

document.getElementById("btn-decir").addEventListener("click", () => {
  if (boomSeleccionado) decirNombre(boomSeleccionado.nombre);
});

document.getElementById("btn-curva").addEventListener("click", () => {
  if (!boomSeleccionado) return;
  asegurarAudio().then(() => reproducirCurva(boomSeleccionado));
});

function reproducirCurva(b) {
  const max = Math.max(...b.serie, 1);
  const pasoMs = 35;
  b.serie.forEach((valor, i) => {
    setTimeout(() => {
      if (valor === 0) return;
      const t = valor / max;
      const midi = 48 + t * (84 - 48);
      const freq = Tone.Frequency(midi, "midi").toFrequency();
      curvaSynth.triggerAttackRelease(freq, 0.08);
    }, i * pasoMs);
  });
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

  puntos.forEach((b) => {
    const t = ((b.anio - rangoAnio[0]) / span) * duracionTotalMs;
    const id = setTimeout(() => reproducirEarcon(b), t);
    timeoutsSweep.push(id);
  });

  const idFin = setTimeout(detenerSweep, duracionTotalMs + 400);
  timeoutsSweep.push(idFin);
}

function detenerSweep() {
  timeoutsSweep.forEach((id) => clearTimeout(id));
  timeoutsSweep = [];
  sweepActivo = false;
  document.getElementById("btn-sweep").disabled = false;
  document.getElementById("btn-sweep-stop").disabled = true;
  document.getElementById("estado-audio").textContent = "Detenido.";
}
