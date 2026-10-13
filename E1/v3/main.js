// Visualización: portada → bebés → alzas (beeswarm), con panel de detalle.
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

// Los booms "Sin identificar" no tienen timbre propio: se usa el de "Otra
// causa" para que el earcon no falle.
function timbreDe(b) {
  return b.categoria_viz === "Sin identificar" ? "Otra causa" : b.categoria_viz;
}

function reproducirEarcon(b) {
  if (!voces) return;
  const clave = timbreDe(b);
  const synth = voces[clave];
  if (!synth) return;
  const nota = notaDesdeT(tDesdeVeces(b.veces));
  const duracion = Math.min(1.0, 0.2 + b.extra / 2000);
  const anterior = ultimoInicioPorCategoria[clave] || 0;
  const inicio = Math.max(Tone.now(), anterior + 0.02);
  synth.triggerAttackRelease(nota, duracion, inicio);
  ultimoInicioPorCategoria[clave] = inicio;
}

function decirBoom(b) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const causa = b.causa || "sin causa identificada";
  const texto = `${b.nombre}. De ${Math.round(b.prev)} a ${b.n} inscripciones en ${b.anio}. ${causa}.`;
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "es-CL";
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

// ---------- Navegación entre slides ----------
//
// Las slides permanecen en el DOM y se ocultan/muestran con su clase de
// salida (se deslizan hacia arriba para avanzar y hacia abajo para volver).
// El z-index (portada > bebés > swarm) hace que la de arriba cubra a la de
// abajo al retroceder.

const CLASE_SALIDA = {
  portada: "portada-salida",
  bebes: "overview-salida",
  swarm: "swarm-salida",
};

let pasoActual = "portada"; // "portada" | "bebes" | "swarm"
let bebesAnimados = false;

function elPaso(paso) {
  if (paso === "portada") return document.getElementById("portada");
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

function avanzarPortada() {
  if (pasoActual !== "portada") return;
  pasoActual = "bebes";
  ocultarPaso("portada");
  if (!bebesAnimados) {
    bebesAnimados = true;
    animarBebes(); // los bebés se colorean mientras la portada se desliza
  }
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
  } else if (pasoActual === "bebes") {
    pasoActual = "portada";
    mostrarPaso("portada");
  }
}

// ---------- Portada de presentación ----------
//
// Pantalla de título. Un clic en cualquier parte avanza a la slide de bebés.

function initPortada() {
  const portada = document.getElementById("portada");
  if (!portada) return;
  portada.addEventListener("click", avanzarPortada);
}

initPortada();

// ---------- Overview de los 100 bebés ----------
//
// Pantalla intermedia entre la portada y la visualización. Cada figura
// representa 1 de cada 100 guaguas "extra" atribuibles a causas
// identificadas; las celestes son las atribuibles a teleseries. La
// proporción sale de DATOS.booms: suma de "extra" de los booms de teleserie
// sobre la suma de "extra" de todos los booms identificados.

const SVG_BEBE = `
  <svg viewBox="0 0 24 24" role="img">
    <circle cx="12" cy="7.6" r="4.9" />
    <path d="M12 12.4c-4.1 0-6.9 2.5-6.9 6 0 1.3 1 2.3 2.3 2.3h9.2c1.3 0 2.3-1 2.3-2.3 0-3.5-2.8-6-6.9-6z" />
    <path d="M12 2.1c1 0 1.9.6 2.3 1.5" fill="none" stroke="currentColor"
      stroke-width="1.3" stroke-linecap="round" />
  </svg>`;

const RETRASO_ENTRE_BEBES = 30; // ms entre una figura y la siguiente

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
  const overview = document.getElementById("overview");
  if (!overview) return;
  overview.addEventListener("click", avanzarBebes);

  const atras = document.getElementById("bebes-atras");
  if (atras) {
    atras.addEventListener("click", (ev) => {
      ev.stopPropagation();
      volverAtras();
    });
  }
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
  // colorearán; el resto queda gris. Todas parten en gris.
  totalCeleste = nCeleste;

  grid.innerHTML = "";
  for (let i = 0; i < 100; i++) {
    const div = document.createElement("div");
    div.className = "bebe";
    div.innerHTML = SVG_BEBE;
    grid.appendChild(div);
  }

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
    setTimeout(() => el.classList.add("bebe-tv"), i * RETRASO_ENTRE_BEBES);
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

let svgSwarm = null;
let capaSwarm = null; // <g> contenedor del dibujo (ya no se transforma)
let nodoActivo = null;
let timerDetalleSwarm = null;
let zoomSwarm = { k: 1, tx: 0, ty: 0 }; // transform actual de #swarm-zoom
let gruposActivos = new Set(ORDEN_SWARM); // filtro de la leyenda (multiselección)

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
  // No permitir quedar en cero: se vuelve a mostrar todo.
  if (gruposActivos.size === 0) gruposActivos = new Set(ORDEN_SWARM);
  volverSwarm();
  dibujarSwarm();
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
    item.style.background = COLOR_SWARM[grupo];
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
    `${grupo} · ${d.veces.toFixed(1)}x`;
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
    ? `Coincide con: ${b.causa}. (Confianza: ${b.confianza.toLowerCase()}; coincidir en el tiempo no prueba causa.)`
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
    if (nodoActivo === d) mostrarPanelSwarm(d.boom);
  }, 620);
}

function volverSwarm() {
  nodoActivo = null;
  clearTimeout(timerDetalleSwarm);

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

function dibujarSwarm() {
  if (!DATOS || typeof d3 === "undefined") return;
  const cont = document.getElementById("grafico-swarm");
  if (!cont) return;

  construirLeyendaSwarm();

  // Solo los grupos activos (filtro de la leyenda); si el filtro deja menos
  // categorías, se reparten en todo el ancho y los puntos se dibujan más
  // grandes para verlos con más detalle.
  const activos = ORDEN_SWARM.filter((g) => gruposActivos.has(g));
  const dominio = activos.length > 0 ? activos : ORDEN_SWARM;
  const radio =
    dominio.length >= ORDEN_SWARM.length
      ? RADIO_SWARM
      : Math.min(14, RADIO_SWARM * Math.sqrt(ORDEN_SWARM.length / dominio.length));

  const nodos = DATOS.booms
    .map((b) => ({
      boom: b,
      grupo: GRUPO_SWARM[b.categoria] || "Sin identificar",
      veces: b.veces,
    }))
    .filter((n) => dominio.includes(n.grupo));

  const W = 820;
  const H = 430;
  const margen = { t: 18, r: 24, b: 46, l: 58 };

  const x = d3
    .scaleBand()
    .domain(dominio)
    .range([margen.l, W - margen.r])
    .paddingInner(0.35)
    .paddingOuter(0.2);

  const centroX = (grupo) => x(grupo) + x.bandwidth() / 2;

  const y = d3
    .scaleLog()
    .domain([3, 300])
    .range([H - margen.b, margen.t]);

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

  cont.innerHTML = "";
  svgSwarm = d3
    .select(cont)
    .append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Capa que se transforma al hacer zoom (todo el gráfico crece junto).
  capaSwarm = svgSwarm.append("g").attr("class", "capa");

  // Grilla horizontal + eje y.
  const yTicks = [4, 6, 10, 20, 40, 80, 160, 300].filter((v) => v <= 300);
  const grilla = capaSwarm.append("g").attr("class", "grilla");
  grilla
    .selectAll("line")
    .data(yTicks)
    .join("line")
    .attr("x1", margen.l)
    .attr("x2", W - margen.r)
    .attr("y1", (v) => y(v))
    .attr("y2", (v) => y(v));

  const ejeY = capaSwarm.append("g").attr("class", "eje");
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

  // Eje x (categorías).
  const ejeX = capaSwarm.append("g").attr("class", "eje");
  ejeX
    .selectAll("text")
    .data(dominio)
    .join("text")
    .attr("x", (g) => centroX(g))
    .attr("y", H - margen.b + 26)
    .attr("text-anchor", "middle")
    .text((g) => g);

  // Puntos.
  capaSwarm
    .append("g")
    .selectAll("circle")
    .data(nodos)
    .join("circle")
    .attr("class", "punto")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", radio)
    .attr("fill", (d) => COLOR_SWARM[d.grupo])
    .attr("fill-opacity", 0.85)
    .on("mouseover", (ev, d) => mostrarTooltipSwarm(ev, d))
    .on("mousemove", (ev) => posicionarTooltipSwarm(ev))
    .on("mouseout", () => ocultarTooltipSwarm())
    .on("click", (ev, d) => seleccionarPuntoSwarm(ev, d));
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
