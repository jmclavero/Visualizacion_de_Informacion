// E2 / V4 — comparación de un nombre contra las referencias de su categoría.
// Sin beeswarm, sin botones en pantalla y sin puntos inventados.

const ORDEN_CATEGORIAS = [
  "Teleseries",
  "Música / Viña",
  "Otras causas televisivas",
  "No televisivas",
];

const CATEGORIA_A_GRUPO = {
  teleserie: "Teleseries",
  "musica / vina": "Música / Viña",
  "series y animacion": "Otras causas televisivas",
  "tv en vivo": "Otras causas televisivas",
  "politica, realeza y noticias": "No televisivas",
  cine: "No televisivas",
  deporte: "No televisivas",
  "ciencia y espacio": "No televisivas",
  migracion: "No televisivas",
  "religion / tradicion": "No televisivas",
  "moda / tendencia": "No televisivas",
  "sin identificar": null,
};

const CATEGORIAS_TV = new Set([
  "Teleserie",
  "Música / Viña",
  "Series y animación",
  "TV en vivo",
]);

const RETRASO_ENTRE_BEBES = 25;

const raiz = getComputedStyle(document.documentElement);
const COLORES = {
  "Teleseries": raiz.getPropertyValue("--cat-teleserie").trim(),
  "Música / Viña": raiz.getPropertyValue("--cat-musica").trim(),
  "Otras causas televisivas": raiz.getPropertyValue("--cat-otra").trim(),
  "No televisivas": raiz.getPropertyValue("--cat-no-tv").trim(),
};

let DATOS = null;
let PUNTOS_CURADOS = [];
let REFERENCIAS = {};
let ESTADO = Object.fromEntries(ORDEN_CATEGORIAS.map((g) => [g, []]));
let grupoActual = null;
let puntoActual = null;
let vozOcupada = false;
let totalCeleste = 0;
let pendienteAnimacion = false;

// ---------- Utilidades ----------

function normalizarNombre(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function limpiarNombreVoz(value) {
  return String(value || "")
    .replace(/^(me llamo|mi nombre es|soy|el nombre es)\s+/i, "")
    .replace(/[.,!?¿¡]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function grupoDeCategoria(categoria) {
  const clave = normalizarNombre(categoria);
  return CATEGORIA_A_GRUPO[clave] || null;
}

function clavePunto(p) {
  return normalizarNombre(p.nombre) + "|" + Number(p.anio);
}

function formatearVeces(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return "Sin alza";
  return n.toFixed(1).replace(".", ",") + "x";
}

function formatearNombre(p) {
  return `${p.nombre} (${p.anio})`;
}

function estadoV4(texto) {
  const el = document.getElementById("v4-estado");
  if (el) el.textContent = texto;
}

// ---------- Overview ----------

function rellenarBebes() {
  if (!DATOS) return;
  const tv = DATOS.booms.filter((b) => CATEGORIAS_TV.has(b.categoria));
  const extraTv = tv.reduce((acc, b) => acc + b.extra, 0);
  const extraTotal = DATOS.booms.reduce((acc, b) => acc + b.extra, 0);
  const pct = extraTotal > 0 ? extraTv / extraTotal : 0;
  const nCeleste = Math.round(pct * 100);

  totalCeleste = nCeleste;
  document.getElementById("bebe-tv-conteo").textContent = `${nCeleste} de 100`;
  document.getElementById(
    "bebe-gris-conteo"
  ).textContent = `${100 - nCeleste} de 100`;
  if (pendienteAnimacion) animarBebes();
}

function animarBebes() {
  const grid = document.getElementById("bebes-grid");
  if (!grid) return;
  if (grid.children.length === 0) {
    pendienteAnimacion = true;
    return;
  }
  pendienteAnimacion = false;
  for (let i = 0; i < totalCeleste && i < grid.children.length; i++) {
    const el = grid.children[i];
    setTimeout(() => el.classList.add("bebe-tv"), i * RETRASO_ENTRE_BEBES);
  }
}

function generarQR() {
  const cont = document.getElementById("v4-qr");
  if (!cont) return;
  if (typeof QRCode === "undefined") {
    setTimeout(generarQR, 250);
    return;
  }
  cont.innerHTML = "";
  const base = location.href.replace(/[^/]*$/, "");
  const url = base + "voice.html" + location.search;
  try {
    new QRCode(cont, {
      text: url,
      width: 184,
      height: 184,
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch {
    estadoV4("Abre voice.html en el teléfono para conectar el micrófono.");
  }
}

window.ocultarQRV4 = function () {
  const caja = document.getElementById("v4-qr-caja");
  if (caja) caja.hidden = true;
  estadoV4("Micrófono conectado. Di tu nombre.");
};

window.actualizarEstadoV4 = function (estado, texto) {
  if (estado === "escuchando") {
    estadoV4("Escuchando… di tu nombre.");
  } else if (estado === "listo") {
    estadoV4("Nombre recibido. Calculando la comparación…");
  } else if (estado === "error") {
    estadoV4(texto || "No se entendió el nombre. Intenta de nuevo.");
  } else if (texto) {
    estadoV4(texto);
  }
};

// ---------- Datos reales ----------

function construirPuntosCurados() {
  return DATOS.booms
    .map((b) => ({
      nombre: b.nombre,
      anio: Number(b.anio),
      veces: Number(b.veces),
      n: Number(b.n),
      extra: Number(b.extra),
      categoria: b.categoria,
      grupo: grupoDeCategoria(b.categoria),
      serie: b.serie,
      real: true,
    }))
    .filter((p) => p.grupo && ORDEN_CATEGORIAS.includes(p.grupo));
}

function construirReferencias() {
  REFERENCIAS = {};
  for (const grupo of ORDEN_CATEGORIAS) {
    const puntos = PUNTOS_CURADOS.filter((p) => p.grupo === grupo).sort(
      (a, b) => a.veces - b.veces
    );
    if (!puntos.length) continue;

    const baja = puntos[0];
    const alta = puntos[puntos.length - 1];
    let indiceMedia = Math.floor((puntos.length - 1) / 2);
    let media = puntos[indiceMedia];
    if (media === alta && indiceMedia > 0) media = puntos[indiceMedia - 1];
    if (media === baja && indiceMedia < puntos.length - 1) {
      media = puntos[indiceMedia + 1];
    }

    REFERENCIAS[grupo] = { alta, media, baja };
  }
}

function expandirSerie(serie) {
  if (!Array.isArray(serie)) return [];
  if (serie.length && Array.isArray(serie[0])) {
    const largo = DATOS.anio_max - DATOS.anio_min + 1;
    const completa = Array(largo).fill(0);
    for (const par of serie) {
      const indice = Number(par?.[0]);
      const valor = Number(par?.[1]);
      if (
        Number.isInteger(indice) &&
        indice >= 0 &&
        indice < largo &&
        Number.isFinite(valor)
      ) {
        completa[indice] = Math.max(0, Math.round(valor));
      }
    }
    return completa;
  }
  return serie.slice(0, DATOS.anio_max - DATOS.anio_min + 1);
}

const cacheShards = new Map();

async function cargarShardReal(nombre) {
  const clave = normalizarNombre(nombre);
  if (!clave) return null;
  const letra = /^[a-z]/.test(clave) ? clave[0] : "_";

  let data = cacheShards.get(letra);
  if (!data) {
    const respuesta = await fetch(`data/guaguas/${letra}.json`);
    if (!respuesta.ok) return null;
    data = await respuesta.json();
    cacheShards.set(letra, data);
  }

  const entrada = data[clave];
  if (!entrada) return null;
  return { ...entrada, serie: expandirSerie(entrada.serie) };
}

function detectarBoomSerie(serie, minimoInscripciones = 0) {
  let mejor = null;
  for (let i = 3; i < serie.length; i++) {
    if (serie[i] <= 0 || serie[i] < minimoInscripciones) continue;
    const previo = (serie[i - 1] + serie[i - 2] + serie[i - 3]) / 3;
    if (previo <= 0) continue;
    const ratio = serie[i] / previo;
    if (!mejor || ratio > mejor.ratio) {
      mejor = { i, ratio, previo };
    }
  }
  return mejor;
}

function puntoDesdeSerieReal(nombre, entrada) {
  const serie = entrada.serie;
  // Para comparar usamos el mejor año con al menos 20 inscripciones; si no
  // existe, caemos al mejor año disponible. Así no tomamos como "alza" un
  // año con 1 o 2 inscripciones.
  const boom = detectarBoomSerie(serie, 20) || detectarBoomSerie(serie);
  if (!boom) {
    const maximo = Math.max(...serie);
    if (maximo <= 0) return null;
    return {
      nombre: entrada.nombre || nombre,
      anio: DATOS.anio_min + serie.indexOf(maximo),
      veces: 0,
      n: maximo,
      extra: maximo,
      serie,
      sinAlza: true,
      real: true,
    };
  }

  const n = serie[boom.i];
  const prev = Math.round(boom.previo);
  return {
    nombre: entrada.nombre || nombre,
    anio: DATOS.anio_min + boom.i,
    veces: Math.round((n / boom.previo) * 10) / 10,
    n,
    prev,
    extra: n - prev,
    serie,
    real: true,
    sinAlza: boom.ratio < 4,
  };
}

function buscarCurado(nombre) {
  const buscado = normalizarNombre(nombre);
  if (!buscado) return null;
  const encontrados = DATOS.booms.filter(
    (b) => !b.ia && normalizarNombre(b.nombre) === buscado
  );
  if (!encontrados.length) return null;
  return encontrados.sort((a, b) => b.veces - a.veces)[0];
}

async function consultarCategoria(nombre, anio, veces) {
  const api = window.API_ESTIMAR_URL;
  if (!api) return null;

  try {
    const respuesta = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, anio, veces }),
      signal:
        typeof AbortSignal !== "undefined" && AbortSignal.timeout
          ? AbortSignal.timeout(60000)
          : undefined,
    });
    if (!respuesta.ok) return null;
    const data = await respuesta.json();
    const grupo = grupoDeCategoria(data?.categoria);
    if (!grupo) return null;
    return {
      categoria: data.categoria,
      grupo,
      estimada: true,
      confianza: data.confianza || "Baja",
    };
  } catch {
    return null;
  }
}

// ---------- Estado por categoría ----------

function agregarAlEstado(punto, grupo, categoria, estimada) {
  const clave = normalizarNombre(punto.nombre);
  // Solo el último nombre dicho queda marcado como actual, incluso si se
  // cambia de categoría.
  for (const g of ORDEN_CATEGORIAS) {
    for (const p of ESTADO[g]) p.esActual = false;
  }

  let existente = ESTADO[grupo].find(
    (p) => normalizarNombre(p.nombre) === clave
  );

  if (!existente) {
    existente = { ...punto };
    ESTADO[grupo].push(existente);
  } else {
    Object.assign(existente, punto);
  }

  existente.grupo = grupo;
  existente.categoria = categoria;
  existente.categoriaEstimada = !!estimada;
  existente.esActual = true;
  puntoActual = existente;
  grupoActual = grupo;
}

// ---------- Pantallas ----------

function abrirComparador() {
  const overview = document.getElementById("overview");
  const comparador = document.getElementById("comparador");
  if (overview) overview.hidden = true;
  if (comparador) comparador.hidden = false;
  document.body.classList.add("comparador-activo");
  window.scrollTo({ top: 0, behavior: "auto" });
}

function mostrarVisualComparador(visible) {
  const visual = document.getElementById("comparador-visual");
  if (visual) visual.hidden = !visible;
}

function mostrarCargando(nombre) {
  abrirComparador();
  document.getElementById("comparador-categoria").textContent = "Buscando…";
  document.getElementById(
    "comparador-descripcion"
  ).textContent = `Analizando «${nombre}» y buscando su categoría…`;
  mostrarVisualComparador(false);
  const mensaje = document.getElementById("comparador-mensaje");
  mensaje.hidden = false;
  mensaje.textContent = "Buscando registros reales y categoría.";
  document.getElementById("comparador-nota").textContent = "";
}

function mostrarMensaje(titulo, texto) {
  abrirComparador();
  document.getElementById("comparador-categoria").textContent = titulo;
  document.getElementById("comparador-descripcion").textContent = "";
  document.getElementById("comparador-grafico").innerHTML = "";
  document.getElementById("comparador-alza").innerHTML = "";
  mostrarVisualComparador(false);
  const mensaje = document.getElementById("comparador-mensaje");
  mensaje.hidden = false;
  mensaje.textContent = texto;
  document.getElementById("comparador-nota").textContent =
    "No se inventan puntos para completar la comparación.";
}

function mostrarComparador(grupo) {
  abrirComparador();
  const refs = REFERENCIAS[grupo];
  const usuarios = ESTADO[grupo] || [];

  document.getElementById("comparador-categoria").textContent = grupo;
  const actual = usuarios.find((p) => p.esActual) || puntoActual;
  document.getElementById(
    "comparador-descripcion"
  ).textContent = actual
    ? `Tu nombre: ${formatearNombre(actual)} · ${formatearVeces(actual.veces)}`
    : "Comparación contra las referencias de la categoría.";

  mostrarVisualComparador(true);
  document.getElementById("comparador-mensaje").hidden = true;

  const nota = document.getElementById("comparador-nota");
  const estimada = actual?.categoriaEstimada
    ? " La categoría de tu nombre es una estimación IA."
    : "";
  nota.textContent =
    "Arriba se comparan las series anuales de cada nombre; abajo, el punto " +
    "de alza. Las referencias alta, media y baja son nombres reales de los 59 " +
    "booms curados de esta categoría. Tus nombres se agregan a medida que los " +
    "dices." +
    estimada;

  dibujarSeries(grupo, refs, usuarios);
  dibujarAlza(grupo, refs, usuarios);
}

// ---------- Gráfico de comparación ----------

function construirFilas(grupo, refs, usuarios) {
  const filas = [];
  const usados = new Set();

  const entradasRef = [
    { tipo: "alta", etiqueta: "Alta", punto: refs?.alta },
    { tipo: "media", etiqueta: "Media", punto: refs?.media },
    { tipo: "baja", etiqueta: "Baja", punto: refs?.baja },
  ];

  for (const entrada of entradasRef) {
    if (!entrada.punto) continue;
    const clave = clavePunto(entrada.punto);
    usados.add(clave);
    const usuario = usuarios.find((p) => clavePunto(p) === clave);
    const marca = usuario
      ? usuario.esActual
        ? " · Tu nombre"
        : " · Dicho"
      : "";
    filas.push({
      etiqueta: `${entrada.etiqueta}${marca} · ${formatearNombre(
        entrada.punto
      )}`,
      valor: entrada.punto.veces,
      punto: entrada.punto,
      esReferencia: true,
      esActual: !!usuario?.esActual,
    });
  }

  const usuariosExtra = usuarios
    .filter((p) => !usados.has(clavePunto(p)))
    .sort((a, b) => Number(b.esActual) - Number(a.esActual) || b.veces - a.veces);

  for (const p of usuariosExtra) {
    filas.push({
      etiqueta: `${p.esActual ? "Tú" : "Dicho"} · ${formatearNombre(p)}`,
      valor: p.veces,
      punto: p,
      esReferencia: false,
      esActual: !!p.esActual,
    });
  }

  return filas;
}

function colorDeFila(fila, indice, colorGrupo) {
  if (fila.esActual) return "#e34948";
  if (fila.esReferencia) return colorGrupo;
  const paleta = [
    colorGrupo,
    "#2a78d6",
    "#1baf7a",
    "#8a5cf6",
    "#c98a18",
    "#0f9b8e",
    "#d4577a",
  ];
  return paleta[(indice + 1) % paleta.length];
}

function nombreLeyenda(fila) {
  return fila.etiqueta
    .replace(" · Tu nombre", "")
    .replace(" · Dicho", "");
}

function dibujarSeries(grupo, refs, usuarios) {
  if (typeof Plotly === "undefined") return;

  const filas = construirFilas(grupo, refs, usuarios);
  if (!filas.length) return;

  const colorGrupo = COLORES[grupo] || "#2a78d6";
  const anios = Array.from(
    { length: DATOS.anio_max - DATOS.anio_min + 1 },
    (_, i) => DATOS.anio_min + i
  );

  const trazas = [];
  const boomX = [];
  const boomY = [];
  const boomText = [];
  const boomColors = [];
  const boomSizes = [];
  const boomSymbols = [];
  const boomLineColors = [];
  const boomLineWidths = [];

  filas.forEach((fila, indice) => {
    const color = colorDeFila(fila, indice, colorGrupo);
    const serie = Array.isArray(fila.punto.serie) ? fila.punto.serie : [];
    const y = anios.map((_, i) => {
      const valor = Number(serie[i]);
      return Number.isFinite(valor) && valor > 0 ? valor : null;
    });

    trazas.push({
      x: anios,
      y,
      mode: "lines",
      type: "scatter",
      name: nombreLeyenda(fila),
      line: {
        color,
        width: fila.esActual ? 3.5 : fila.esReferencia ? 1.6 : 2.3,
        dash: fila.esReferencia && !fila.esActual ? "dot" : "solid",
      },
      opacity: fila.esReferencia && !fila.esActual ? 0.72 : 1,
      connectgaps: true,
      hovertemplate: `<b>${nombreLeyenda(
        fila
      )}</b><br>%{x}: %{y} inscripciones<extra></extra>`,
      showlegend: true,
    });

    const anio = Number(fila.punto.anio);
    let yBoom = Number(fila.punto.n);
    if (!Number.isFinite(yBoom) || yBoom <= 0) {
      yBoom = Number(serie[anio - DATOS.anio_min]);
    }
    if (!Number.isFinite(yBoom) || yBoom <= 0) {
      const maximo = Math.max(...serie);
      if (maximo > 0) {
        yBoom = maximo;
      }
    }
    if (!Number.isFinite(yBoom) || yBoom <= 0) return;

    boomX.push(anio);
    boomY.push(yBoom);
    boomText.push(
      Number(fila.valor) > 0 ? formatearVeces(fila.valor) : "Sin alza"
    );
    boomColors.push(color);
    boomSizes.push(fila.esActual ? 14 : 10);
    const minima =
      !!fila.punto.sinAlza || Number(fila.valor) < 4;
    boomSymbols.push(minima ? "circle-open" : "circle");
    boomLineColors.push(fila.esActual ? "#0b0b0b" : "#ffffff");
    boomLineWidths.push(fila.esActual ? 2 : 1.5);
  });

  if (boomX.length) {
    trazas.push({
      x: boomX,
      y: boomY,
      mode: "markers+text",
      type: "scatter",
      text: boomText,
      textposition: "top center",
      textfont: { family: "system-ui, sans-serif", size: 11, color: "#0b0b0b" },
      marker: {
        size: boomSizes,
        color: boomColors,
        symbol: boomSymbols,
        line: { color: boomLineColors, width: boomLineWidths },
      },
      hovertemplate: "<b>%{text}</b><br>%{x}<extra></extra>",
      showlegend: false,
    });
  }

  const altura = Math.max(
    420,
    Math.min(
      620,
      typeof window !== "undefined" ? window.innerHeight - 360 : 500
    )
  );
  const maxY = Math.max(
    1,
    ...filas.flatMap((f) =>
      (Array.isArray(f.punto.serie) ? f.punto.serie : []).map(Number)
    )
  );
  const yTicks = [1, 10, 100, 1000, 10000, 100000].filter(
    (v) => v <= maxY * 1.15
  );

  const layout = {
    height: altura,
    margin: { t: 96, r: 30, b: 52, l: 72 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: "system-ui, sans-serif", color: "#0b0b0b" },
    legend: {
      orientation: "h",
      x: 0,
      y: 1.16,
      xanchor: "left",
      yanchor: "top",
      font: { size: 10.5 },
      itemclick: false,
      itemdoubleclick: false,
      bgcolor: "rgba(255,255,255,0.75)",
    },
    hovermode: "x unified",
    xaxis: {
      title: { text: "Año", font: { size: 12 } },
      range: [DATOS.anio_min - 1, DATOS.anio_max + 1],
      tickvals: [1920, 1940, 1960, 1980, 2000, 2020],
      ticktext: ["1920", "1940", "1960", "1980", "2000", "2020"],
      gridcolor: "#e1e0d9",
      zeroline: false,
      fixedrange: true,
    },
    yaxis: {
      type: "log",
      title: { text: "Inscripciones (escala log)", font: { size: 12 } },
      tickvals: yTicks,
      ticktext: yTicks.map((v) =>
        v >= 1000 ? v.toLocaleString("es-CL") : String(v)
      ),
      gridcolor: "#e1e0d9",
      zeroline: false,
      fixedrange: true,
      automargin: true,
    },
  };

  Plotly.react("comparador-grafico", trazas, layout, {
    displayModeBar: false,
    responsive: true,
    scrollZoom: false,
  });
}

function dibujarAlza(grupo, refs, usuarios) {
  if (typeof Plotly === "undefined") return;

  const filas = construirFilas(grupo, refs, usuarios);
  if (!filas.length) return;

  const colorGrupo = COLORES[grupo] || "#2a78d6";
  const xMax = Math.max(
    8,
    ...filas.map((f) => Math.max(0.55, Number(f.valor) || 0))
  ) * 1.8;
  const xs = filas.map((f) =>
    Math.max(0.55, Number.isFinite(Number(f.valor)) ? Number(f.valor) : 0)
  );
  const texts = filas.map((f) =>
    Number(f.valor) > 0 ? formatearVeces(f.valor) : "Sin alza"
  );
  const etiquetas = filas.map((f) => f.etiqueta);
  const colores = filas.map((f, i) => colorDeFila(f, i, colorGrupo));

  const lineas = filas.map((f, i) => ({
    x: [0.5, xs[i]],
    y: [f.etiqueta, f.etiqueta],
    mode: "lines",
    type: "scatter",
    line: {
      color: colores[i],
      width: f.esActual ? 2.5 : 1.5,
    },
    hoverinfo: "skip",
    showlegend: false,
  }));

  const puntos = {
    x: xs,
    y: etiquetas,
    mode: "markers+text",
    type: "scatter",
    text: texts,
    textposition: "middle right",
    textfont: { family: "system-ui, sans-serif", size: 11, color: "#0b0b0b" },
    marker: {
      size: filas.map((f) => (f.esActual ? 15 : 10)),
      color: colores,
      symbol: filas.map((f, i) =>
        Number(f.valor) < 4 || !!f.punto.sinAlza ? "circle-open" : "circle"
      ),
      line: {
        color: filas.map((f) => (f.esActual ? "#0b0b0b" : "#ffffff")),
        width: filas.map((f) => (f.esActual ? 2 : 1.5)),
      },
    },
    hoverinfo: "skip",
    showlegend: false,
  };

  const altura = Math.max(145, 58 + filas.length * 30);
  const layout = {
    height: altura,
    margin: { t: 40, r: 82, b: 36, l: 230 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: "system-ui, sans-serif", color: "#0b0b0b" },
    showlegend: false,
    hovermode: false,
    xaxis: {
      type: "log",
      title: { text: "Alza (veces)", font: { size: 11 } },
      range: [Math.log10(0.5), Math.log10(xMax)],
      tickvals: [1, 2, 4, 8, 16, 32, 64, 128, 256].filter(
        (v) => v <= xMax * 1.02
      ),
      ticktext: [1, 2, 4, 8, 16, 32, 64, 128, 256]
        .filter((v) => v <= xMax * 1.02)
        .map((v) => `${v}x`),
      gridcolor: "#e1e0d9",
      zeroline: false,
      fixedrange: true,
    },
    yaxis: {
      type: "category",
      categoryorder: "array",
      categoryarray: etiquetas.slice().reverse(),
      automargin: true,
      tickfont: { size: 10.5 },
      fixedrange: true,
    },
    shapes: [
      {
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: 0.5,
        x1: 4,
        y0: 0,
        y1: 1,
        fillcolor: "#f2e7c9",
        opacity: 0.55,
        line: { width: 0 },
        layer: "below",
      },
      {
        type: "line",
        xref: "x",
        yref: "paper",
        x0: 4,
        x1: 4,
        y0: 0,
        y1: 1,
        line: { color: "#c98a18", width: 1.5, dash: "dot" },
      },
    ],
    annotations: [
      {
        xref: "x",
        yref: "paper",
        x: Math.sqrt(0.5 * 4),
        y: 1.04,
        text: "Alza mínima (<4x)",
        showarrow: false,
        font: { size: 10, color: "#8a5a00" },
      },
    ],
  };

  Plotly.react("comparador-alza", [...lineas, puntos], layout, {
    displayModeBar: false,
    responsive: true,
    scrollZoom: false,
  });
}

// ---------- Flujo de voz ----------

async function manejarNombreVoz(nombreCrudo) {
  if (vozOcupada) return;
  const nombre = limpiarNombreVoz(nombreCrudo);
  if (!nombre) {
    estadoV4("No se entendió el nombre. Intenta de nuevo.");
    return;
  }

  vozOcupada = true;
  if (typeof window.ocultarQRV4 === "function") window.ocultarQRV4();
  mostrarCargando(nombre);
  try {
    const curado = buscarCurado(nombre);
    let punto = null;
    let categoria = null;
    let grupo = null;
    let estimada = false;

    if (curado) {
      punto = {
        nombre: curado.nombre,
        anio: Number(curado.anio),
        veces: Number(curado.veces),
        n: Number(curado.n),
        extra: Number(curado.extra),
        prev: Number(curado.prev),
        serie: curado.serie,
        real: true,
        sinAlza: Number(curado.veces) < 4,
      };
      categoria = curado.categoria;
      grupo = grupoDeCategoria(categoria);

      if (!grupo) {
        const info = await consultarCategoria(
          nombre,
          punto.anio,
          punto.veces
        );
        if (!info) {
          mostrarMensaje(
            "Sin categoría",
            `Se encontraron registros para «${nombre}», pero no se pudo determinar una categoría.`
          );
          return;
        }
        categoria = info.categoria;
        grupo = info.grupo;
        estimada = true;
      }
    } else {
      const entrada = await cargarShardReal(nombre);
      if (!entrada) {
        mostrarMensaje(
          "Sin registros",
          `No hay registros para «${nombre}» en el Registro Civil de Chile entre 1920 y 2021.`
        );
        return;
      }

      punto = puntoDesdeSerieReal(nombre, entrada);
      if (!punto) {
        mostrarMensaje(
          "Sin alza",
          `Hay registros para «${nombre}», pero no hay datos suficientes para calcular una comparación.`
        );
        return;
      }

      const info = await consultarCategoria(
        nombre,
        punto.anio,
        punto.veces
      );
      if (!info) {
        mostrarMensaje(
          "Sin categoría",
          `Se encontraron registros para «${nombre}», pero no se pudo determinar una categoría.`
        );
        return;
      }
      categoria = info.categoria;
      grupo = info.grupo;
      estimada = true;
    }

    if (!grupo) {
      mostrarMensaje(
        "Sin categoría",
        `No se pudo asignar «${nombre}» a una categoría. No se agrega a la comparación.`
      );
      return;
    }

    agregarAlEstado(punto, grupo, categoria, estimada);
    mostrarComparador(grupo);
  } catch (error) {
    mostrarMensaje(
      "No se pudo procesar",
      "Ocurrió un error al buscar el nombre: " + error.message
    );
  } finally {
    vozOcupada = false;
  }
}

window.manejarNombreVoz = manejarNombreVoz;

// ---------- Arranque ----------

fetch("data/nombres.json")
  .then((r) => r.json())
  .then((datos) => {
    DATOS = datos;
    PUNTOS_CURADOS = construirPuntosCurados();
    construirReferencias();
    rellenarBebes();
    animarBebes();
  })
  .catch((error) => {
    estadoV4("No se pudieron cargar los datos: " + error.message);
  });

generarQR();
