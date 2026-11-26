// E2 / V4 — comparación de un nombre contra las referencias de su categoría.
// Sin beeswarm, sin botones en pantalla y sin puntos inventados.

const ORDEN_CATEGORIAS = [
  "Teleseries",
  "Música / Viña",
  "Otras causas televisivas",
  "No televisivas",
  "Sin categoría",
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
  "sin identificar": "Sin categoría",
  "sin categoria": "Sin categoría",
};

const CATEGORIAS_TV = new Set([
  "Teleserie",
  "Música / Viña",
  "Series y animación",
  "TV en vivo",
]);

const RETRASO_ENTRE_BEBES = 25;

// Colores de categoría: deliberadamente fuera del verde/amarillo/rojo que
// usan las líneas de referencia.
const COLORES_CATEGORIA = {
  "Teleseries": "#2a6fdb",
  "Música / Viña": "#7b4bd8",
  "Otras causas televisivas": "#0f8f9e",
  "No televisivas": "#c2478a",
  "Sin categoría": "#898781",
};

const COLORES_REFERENCIA = {
  alta: "#2f9e44",
  media: "#d7a400",
  baja: "#c63b3b",
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

function formatearAlzaCorta(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return "Sin alza";
  const texto = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return texto + "x";
}

function formatearNombre(p) {
  return `${p.nombre} (${p.anio})`;
}

function formatearNumero(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
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
    .map((b) => {
      const n = Number(b.n);
      const veces = Number(b.veces);
      const prev =
        Number(b.prev) || (veces > 0 && n > 0 ? n / veces : 0);
      return {
        nombre: b.nombre,
        anio: Number(b.anio),
        veces,
        n,
        prev,
        extra: Number(b.extra),
        categoria: b.categoria,
        grupo: grupoDeCategoria(b.categoria),
        causa: String(b.causa || "").trim(),
        confianza: b.confianza || "",
        fuente: b.fuente || "",
        causaEstimada: false,
        serie: b.serie,
        real: true,
      };
    })
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
      causa: String(data.causa || "").trim(),
      confianza: data.confianza || "Baja",
      fuente: data.fuente || "",
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

function limpiarColorCategoria() {
  const contenido = document.querySelector(".comparador-contenido");
  if (contenido) contenido.style.removeProperty("--categoria-color");
  const categoriaEl = document.getElementById("comparador-categoria");
  if (categoriaEl) categoriaEl.style.color = "";
  const eyebrow = document.querySelector(".comparador-eyebrow");
  if (eyebrow) eyebrow.style.color = "";
}

function mostrarCargando(nombre) {
  abrirComparador();
  ocultarDetalleNombre();
  limpiarColorCategoria();
  document.getElementById("comparador-categoria").textContent = "Buscando…";
  const nombreEl = document.getElementById("comparador-nombre");
  if (nombreEl) {
    nombreEl.textContent = `Analizando «${nombre}» y buscando su categoría…`;
  }
  const motivoEl = document.getElementById("comparador-motivo");
  if (motivoEl) {
    motivoEl.hidden = true;
    motivoEl.textContent = "";
  }
  mostrarVisualComparador(false);
  const mensaje = document.getElementById("comparador-mensaje");
  mensaje.hidden = false;
  mensaje.textContent = "Buscando registros reales y categoría.";
}

function mostrarMensaje(titulo, texto) {
  abrirComparador();
  ocultarDetalleNombre();
  limpiarColorCategoria();
  document.getElementById("comparador-categoria").textContent = titulo;
  const nombreEl = document.getElementById("comparador-nombre");
  if (nombreEl) nombreEl.textContent = "";
  const motivoEl = document.getElementById("comparador-motivo");
  if (motivoEl) {
    motivoEl.hidden = true;
    motivoEl.textContent = "";
  }
  const grafico = document.getElementById("comparador-grafico");
  if (typeof Plotly !== "undefined" && grafico) {
    try {
      Plotly.purge(grafico);
    } catch (error) {
      console.warn("No se pudo limpiar el gráfico:", error);
    }
  }
  if (grafico) grafico.innerHTML = "";
  mostrarVisualComparador(false);
  const mensaje = document.getElementById("comparador-mensaje");
  mensaje.hidden = false;
  mensaje.textContent = texto;
}

function mostrarComparador(grupo) {
  abrirComparador();
  const refs = REFERENCIAS[grupo];
  const usuarios = ESTADO[grupo] || [];

  const colorCategoria = COLORES_CATEGORIA[grupo] || "#0b0b0b";
  const contenido = document.querySelector(".comparador-contenido");
  if (contenido) contenido.style.setProperty("--categoria-color", colorCategoria);

  const categoriaEl = document.getElementById("comparador-categoria");
  categoriaEl.textContent = grupo;
  categoriaEl.style.color = colorCategoria;
  const eyebrow = document.querySelector(".comparador-eyebrow");
  if (eyebrow) eyebrow.style.color = colorCategoria;

  const actual = usuarios.find((p) => p.esActual) || puntoActual;
  const nombreEl = document.getElementById("comparador-nombre");
  const motivoEl = document.getElementById("comparador-motivo");
  if (nombreEl) {
    nombreEl.textContent = actual
      ? `Tu nombre: ${formatearNombre(actual)} · ${formatearVeces(actual.veces)}`
      : "Comparación contra las referencias de la categoría.";
  }
  if (motivoEl) {
    const causa = String(actual?.causa || "").trim();
    motivoEl.hidden = !causa;
    motivoEl.textContent = causa;
    motivoEl.classList.toggle("motivo-ia", !!actual?.causaEstimada);
  }

  mostrarVisualComparador(true);
  document.getElementById("comparador-mensaje").hidden = true;

  dibujarSeries(grupo, refs, usuarios);

  // Al volver de un mensaje, el contenedor pudo haber estado oculto. Forzamos
  // un resize después de que el navegador aplique el nuevo layout.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      if (typeof Plotly !== "undefined" && Plotly.Plots) {
        Plotly.Plots.resize("comparador-grafico");
      }
    });
  }
}

let temporizadorDetalle = null;
let temporizadorCierreDetalle = null;

function ocultarDetalleNombre(immediate = false) {
  clearTimeout(temporizadorDetalle);
  clearTimeout(temporizadorCierreDetalle);
  temporizadorDetalle = null;
  temporizadorCierreDetalle = null;

  const panel = document.getElementById("detalle-panel");
  if (!panel) return;
  panel.classList.remove("visible");

  const finalizar = () => {
    if (panel.classList.contains("visible")) return;
    panel.hidden = true;
    if (typeof Plotly !== "undefined") {
      try {
        Plotly.purge("detalle-grafico");
      } catch (error) {
        // El panel puede no haber sido dibujado todavía.
      }
    }
  };

  if (immediate) finalizar();
  else temporizadorCierreDetalle = setTimeout(finalizar, 420);
}

function dibujarDetalleNombre(punto, grupo) {
  if (typeof Plotly === "undefined") return;
  const panel = document.getElementById("detalle-panel");
  const contenedor = document.getElementById("detalle-grafico");
  if (!panel || panel.hidden || !contenedor) return;

  const serie = Array.isArray(punto?.serie) ? punto.serie : [];
  if (!serie.length) return;

  const anios = Array.from(
    { length: DATOS.anio_max - DATOS.anio_min + 1 },
    (_, i) => DATOS.anio_min + i
  );
  const y = anios.map((_, i) => {
    const valor = Number(serie[i]);
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  });
  const anio = Number(punto.anio);
  const n = Number(punto.n);
  const tieneAlza = Number(punto.veces) > 0 && Number.isFinite(n) && n > 0;
  const color = COLORES_CATEGORIA[grupo] || "#0b0b0b";
  const altura = Math.max(
    160,
    Math.floor(contenedor.getBoundingClientRect().height || 220)
  );
  const maxY = Math.max(1, ...y.filter((v) => Number.isFinite(v)));
  const yTicks = [1, 10, 100, 1000, 10000, 100000].filter(
    (v) => v <= maxY * 1.15
  );

  const trazas = [
    {
      x: anios,
      y,
      mode: "lines",
      type: "scatter",
      line: { color, width: 2.5 },
      connectgaps: true,
      hovertemplate: "<b>%{x}</b><br>%{y} inscripciones<extra></extra>",
      showlegend: false,
    },
  ];

  if (tieneAlza) {
    trazas.push({
      x: [anio],
      y: [n],
      mode: "markers+text",
      type: "scatter",
      text: [formatearVeces(punto.veces)],
      textposition: "top center",
      textfont: { size: 10, color: "#0b0b0b" },
      marker: {
        size: 11,
        color,
        line: { color: "#ffffff", width: 2 },
      },
      hovertemplate:
        "<b>Alza</b><br>%{x}: %{y} inscripciones<extra></extra>",
      showlegend: false,
    });
  }

  const layout = {
    height: altura,
    margin: { t: 10, r: 16, b: 32, l: 46 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: "system-ui, sans-serif", color: "#0b0b0b", size: 10 },
    showlegend: false,
    hovermode: "closest",
    xaxis: {
      range: [DATOS.anio_min, DATOS.anio_max],
      tickvals: [1920, 1940, 1960, 1980, 2000, 2020],
      ticktext: ["1920", "1940", "1960", "1980", "2000", "2020"],
      tickfont: { size: 9 },
      gridcolor: "#e1e0d9",
      zeroline: false,
      fixedrange: true,
    },
    yaxis: {
      type: "log",
      tickvals: yTicks,
      ticktext: yTicks.map((v) =>
        v >= 1000 ? v.toLocaleString("es-CL") : String(v)
      ),
      tickfont: { size: 9 },
      gridcolor: "#e1e0d9",
      zeroline: false,
      fixedrange: true,
      automargin: true,
    },
  };

  if (tieneAlza) {
    layout.shapes = [
      {
        type: "line",
        xref: "x",
        x0: anio,
        x1: anio,
        yref: "paper",
        y0: 0,
        y1: 1,
        line: { color: "#0b0b0b", width: 1, dash: "dot" },
        layer: "below",
      },
    ];
  }

  Plotly.react("detalle-grafico", trazas, layout, {
    displayModeBar: false,
    responsive: true,
    scrollZoom: false,
  });
}

function mostrarDetalleNombre(punto, grupo) {
  if (!punto || !Array.isArray(punto.serie) || !punto.serie.length) return;

  const panel = document.getElementById("detalle-panel");
  const categoriaEl = document.getElementById("detalle-categoria");
  const titulo = document.getElementById("detalle-titulo");
  const alzaEl = document.getElementById("detalle-alza");
  const iaEl = document.getElementById("detalle-ia");
  const causaEl = document.getElementById("detalle-causa");
  const metaEl = document.getElementById("detalle-meta");
  if (!panel || !categoriaEl || !titulo || !alzaEl || !causaEl || !metaEl) {
    return;
  }

  clearTimeout(temporizadorDetalle);
  clearTimeout(temporizadorCierreDetalle);
  temporizadorDetalle = null;
  temporizadorCierreDetalle = null;

  const color = COLORES_CATEGORIA[grupo] || "#0b0b0b";
  const n = Number(punto.n);
  const prev = Number(punto.prev);
  const causa = String(punto.causa || "").trim();

  panel.style.setProperty("--categoria-color", color);
  categoriaEl.textContent = grupo;
  categoriaEl.style.color = color;
  titulo.textContent = formatearNombre(punto);
  alzaEl.textContent =
    Number(punto.veces) > 0 ? formatearVeces(punto.veces) : "Sin alza";
  if (iaEl) iaEl.hidden = !punto.causaEstimada;

  causaEl.textContent = causa
    ? `${
        punto.causaEstimada ? "Motivo estimado por IA: " : "Motivo: "
      }${causa}`
    : "Sin motivo estimado.";

  const partesMeta = [];
  if (Number.isFinite(n) && n > 0) {
    partesMeta.push(`${formatearNumero(n)} inscripciones en el boom`);
  }
  if (Number.isFinite(prev) && prev > 0) {
    partesMeta.push(`promedio previo ${formatearNumero(prev)}`);
  }
  if (punto.anio) partesMeta.push(`año ${punto.anio}`);
  metaEl.textContent = partesMeta.join(" · ");

  panel.hidden = false;
  void panel.offsetWidth;
  panel.classList.add("visible");

  requestAnimationFrame(() => {
    if (panel.hidden) return;
    dibujarDetalleNombre(punto, grupo);
    if (typeof Plotly !== "undefined" && Plotly.Plots) {
      Plotly.Plots.resize("detalle-grafico");
    }
  });

  temporizadorDetalle = setTimeout(() => {
    ocultarDetalleNombre();
  }, 5000);
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
      tipo: entrada.tipo,
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

function mezclarColor(hexA, hexB, t) {
  const a = String(hexA).replace("#", "");
  const b = String(hexB).replace("#", "");
  const canales = [0, 2, 4].map((offset) => {
    const ca = parseInt(a.slice(offset, offset + 2), 16);
    const cb = parseInt(b.slice(offset, offset + 2), 16);
    return Math.round(ca + (cb - ca) * Math.max(0, Math.min(1, t)));
  });
  return (
    "#" + canales.map((v) => v.toString(16).padStart(2, "0")).join("")
  );
}

function colorDeNivel(valor, refs) {
  const v = Math.max(0.001, Number(valor) || 0);
  const alta = Number(refs?.alta?.veces);
  const media = Number(refs?.media?.veces);
  const baja = Number(refs?.baja?.veces);

  if (!alta || !media || !baja) return COLORES_REFERENCIA.media;
  if (v >= alta) return "#126b2e"; // más evidente que el verde de referencia
  if (v >= media) {
    const t =
      Math.log(v / media) / Math.max(0.0001, Math.log(alta / media));
    return mezclarColor(COLORES_REFERENCIA.media, COLORES_REFERENCIA.alta, t);
  }
  if (v >= baja) {
    const t =
      Math.log(v / baja) / Math.max(0.0001, Math.log(media / baja));
    return mezclarColor(COLORES_REFERENCIA.baja, COLORES_REFERENCIA.media, t);
  }
  return "#9f1f1f"; // más evidente que el rojo de referencia
}

function colorDeFila(fila, indice, refs) {
  if (fila.esReferencia) {
    return COLORES_REFERENCIA[fila.tipo] || COLORES_REFERENCIA.media;
  }
  return colorDeNivel(fila.valor, refs);
}

function nombreLeyenda(fila) {
  return fila.etiqueta
    .replace(" · Tu nombre", "")
    .replace(" · Dicho", "");
}

function etiquetaEje(fila) {
  const nombre = formatearNombre(fila.punto);
  return fila.esActual ? `${nombre} · actual` : nombre;
}

function opacidadDeFila(fila) {
  if (fila.esActual) return 1;
  return fila.esReferencia ? 0.55 : 0.4;
}

function anchoDeFila(fila) {
  if (fila.esActual) return 5;
  return 3;
}

function agregarMarcadoresLollipop(trazas, datos, esActual) {
  if (!datos.x.length) return;

  trazas.push({
    x: datos.x,
    y: datos.y,
    mode: "markers+text",
    type: "scatter",
    text: datos.text,
    textposition: "top center",
    textfont: {
      family: "system-ui, sans-serif",
      size: esActual ? 12.5 : 11,
      color: esActual ? "#0b0b0b" : "rgba(11, 11, 11, 0.62)",
    },
    customdata: datos.customdata,
    marker: {
      size: datos.size,
      color: datos.color,
      symbol: datos.symbol,
      line: { color: "#ffffff", width: esActual ? 2.2 : 1.4 },
    },
    opacity: esActual ? 1 : 0.68,
    hovertemplate:
      "<b>%{customdata[0]}</b><br>Año del boom: %{customdata[1]}" +
      "<br>Alza: %{x:.2~f}x<br>Inscripciones en el boom: %{customdata[2]}" +
      "<br>Promedio previo: %{customdata[3]}" +
      "<br>Aumento absoluto: %{customdata[4]}<extra></extra>",
    showlegend: false,
  });
}

function construirTrazasLollipop(filas, refs) {
  const trazas = [];
  const marcadoresOtros = {
    x: [],
    y: [],
    text: [],
    customdata: [],
    color: [],
    size: [],
    symbol: [],
  };
  const marcadoresActual = {
    x: [],
    y: [],
    text: [],
    customdata: [],
    color: [],
    size: [],
    symbol: [],
  };

  const orden = [
    ...filas.filter((fila) => !fila.esActual),
    ...filas.filter((fila) => fila.esActual),
  ];

  for (const fila of orden) {
    const alza = Number(fila.valor);
    if (!Number.isFinite(alza) || alza <= 0) continue;

    const actual = !!fila.esActual;
    const color = colorDeFila(fila, 0, refs);
    const etiqueta = etiquetaEje(fila);
    const prev = Number(fila.punto.prev);
    const n = Number(fila.punto.n);
    const extra = Number(fila.punto.extra);
    const alzaSegura = Math.max(1.0001, alza);

    trazas.push({
      x: [1, alzaSegura],
      y: [etiqueta, etiqueta],
      mode: "lines",
      type: "scatter",
      line: {
        color,
        width: anchoDeFila(fila),
      },
      opacity: opacidadDeFila(fila),
      hoverinfo: "skip",
      showlegend: false,
    });

    const bucket = actual ? marcadoresActual : marcadoresOtros;
    bucket.x.push(alzaSegura);
    bucket.y.push(etiqueta);
    bucket.text.push(formatearAlzaCorta(alza));
    bucket.customdata.push([
      formatearNombre(fila.punto),
      fila.punto.anio,
      Number.isFinite(n) && n > 0 ? formatearNumero(n) : "Sin dato",
      Number.isFinite(prev) && prev > 0 ? formatearNumero(prev) : "Sin dato",
      Number.isFinite(extra) && extra > 0 ? formatearNumero(extra) : "Sin dato",
    ]);
    bucket.color.push(color);
    bucket.size.push(actual ? 13 : 9);
    bucket.symbol.push(alza < 4 ? "circle-open" : "circle");
  }

  agregarMarcadoresLollipop(trazas, marcadoresOtros, false);
  agregarMarcadoresLollipop(trazas, marcadoresActual, true);
  return trazas;
}

function alturaLollipop(disponible) {
  const respaldo =
    typeof window !== "undefined" ? window.innerHeight - 320 : 560;
  return Math.max(180, Math.floor(Number(disponible) || respaldo));
}

function layoutLollipop(filas, refs, disponible) {
  const altura = alturaLollipop(disponible);
  const altoFila = Math.max(10, (altura - 100) / Math.max(1, filas.length));
  const tamanoEtiqueta = Math.max(6.5, Math.min(11, altoFila * 0.3));
  const etiquetas = filas.map(etiquetaEje);
  const ticktext = filas.map((fila) => {
    const nombre = formatearNombre(fila.punto);
    const nombreHtml = fila.esActual ? `<b>${nombre}</b>` : nombre;
    const n = Number(fila.punto.n);
    return `${nombreHtml}<br>${n > 0 ? formatearNumero(n) : "—"} inscr.`;
  });

  const esAngosto =
    typeof window !== "undefined" && window.innerWidth < 720;
  const maxAlza = Math.max(
    1.1,
    ...filas.map((fila) => Number(fila.valor)).filter((v) => Number.isFinite(v))
  );
  const baseTicks = esAngosto
    ? [1, 4, 16, 64, 256]
    : [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
  const ticks = baseTicks.filter((v) => v <= maxAlza * 1.5);
  const shapes = [];
  const filasCount = filas.length;

  filas.forEach((fila, indice) => {
    if (!fila.esActual) return;
    shapes.push({
      type: "rect",
      xref: "paper",
      x0: 0,
      x1: 1,
      yref: "paper",
      y0: 1 - (indice + 1) / filasCount,
      y1: 1 - indice / filasCount,
      fillcolor: colorDeFila(fila, 0, refs),
      opacity: 0.06,
      line: { width: 0 },
      layer: "below",
    });
  });

  if (maxAlza >= 4) {
    shapes.push({
      type: "line",
      xref: "x",
      x0: 4,
      x1: 4,
      yref: "paper",
      y0: 0,
      y1: 1,
      line: { color: "#c3c2b7", width: 1, dash: "dot" },
      layer: "below",
    });
  }

  return {
    height: altura,
    margin: {
      t: esAngosto ? 28 : 36,
      r: esAngosto ? 52 : 112,
      b: 48,
      l: esAngosto ? 145 : 250,
    },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: "system-ui, sans-serif", color: "#0b0b0b" },
    showlegend: false,
    hovermode: "closest",
    xaxis: {
      type: "log",
      range: [0, Math.log10(maxAlza * (esAngosto ? 1.8 : 1.45))],
      title: {
        text: "Alza (veces, escala log)",
        font: { size: esAngosto ? 10.5 : 11.5 },
      },
      tickvals: ticks,
      ticktext: ticks.map((v) => `${v}x`),
      tickfont: { size: esAngosto ? 9 : 11 },
      gridcolor: "#e1e0d9",
      zeroline: false,
      fixedrange: true,
      automargin: true,
    },
    yaxis: {
      type: "category",
      categoryorder: "array",
      categoryarray: etiquetas.slice().reverse(),
      tickmode: "array",
      tickvals: etiquetas,
      ticktext,
      automargin: true,
      tickfont: { size: tamanoEtiqueta },
      fixedrange: true,
      showgrid: false,
    },
    shapes,
  };
}

function dibujarSeries(grupo, refs, usuarios) {
  if (typeof Plotly === "undefined") return;

  const filas = construirFilas(grupo, refs, usuarios)
    .filter((fila) => Number(fila.valor) > 0)
    .sort(
      (a, b) =>
        Number(b.valor) - Number(a.valor) ||
        Number(b.esActual) - Number(a.esActual)
    );
  if (!filas.length) return;

  const trazas = construirTrazasLollipop(filas, refs);
  if (!trazas.length) return;

  const contenedor = document.getElementById("comparador-grafico");
  const disponible = contenedor
    ? contenedor.getBoundingClientRect().height
    : 0;

  Plotly.react(
    "comparador-grafico",
    trazas,
    layoutLollipop(filas, refs, disponible),
    { displayModeBar: false, responsive: true, scrollZoom: false }
  );
}

let temporizadorRedibujo = null;
window.addEventListener("resize", () => {
  clearTimeout(temporizadorRedibujo);
  temporizadorRedibujo = setTimeout(() => {
    const visual = document.getElementById("comparador-visual");
    if (!visual || visual.hidden || !grupoActual || !REFERENCIAS[grupoActual]) {
      return;
    }
    dibujarSeries(
      grupoActual,
      REFERENCIAS[grupoActual],
      ESTADO[grupoActual] || []
    );
  }, 120);
});

// ---------- Flujo de voz ----------

function avisarSonidoCelular(grupo, punto) {
  if (typeof Protobject === "undefined" || !Protobject.Core) return;
  try {
    Protobject.Core.send({
      tipo: "sonido",
      grupo,
      veces: Number(punto?.veces) || 0,
    }).to("voice.html");
  } catch (error) {
    console.warn("No se pudo enviar el sonido al celular:", error);
  }
}

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
        causa: String(curado.causa || "").trim(),
        confianza: curado.confianza || "",
        fuente: curado.fuente || "",
        causaEstimada: false,
        serie: curado.serie,
        real: true,
        sinAlza: Number(curado.veces) < 4,
      };
      categoria = curado.categoria;
      grupo = grupoDeCategoria(categoria);

      if (!grupo || !punto.causa) {
        const info = await consultarCategoria(
          nombre,
          punto.anio,
          punto.veces
        );
        if (info) {
          if (!grupo) {
            categoria = info.categoria;
            grupo = info.grupo;
            estimada = true;
          }
          if (info.causa) {
            punto.causa = info.causa;
            punto.causaEstimada = true;
            punto.confianza = info.confianza;
            punto.fuente = info.fuente;
          }
        }
        if (!grupo) {
          categoria = "Sin categoría";
          grupo = "Sin categoría";
          estimada = false;
        }
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
      if (info) {
        categoria = info.categoria;
        grupo = info.grupo;
        estimada = true;
        punto.causa = info.causa || "";
        punto.causaEstimada = !!info.causa;
        punto.confianza = info.confianza;
        punto.fuente = info.fuente;
      } else {
        categoria = "Sin categoría";
        grupo = "Sin categoría";
        estimada = false;
        punto.causa = "";
        punto.causaEstimada = false;
      }
    }

    if (!grupo) {
      categoria = "Sin categoría";
      grupo = "Sin categoría";
      estimada = false;
    }

    agregarAlEstado(punto, grupo, categoria, estimada);
    avisarSonidoCelular(grupo, punto);
    mostrarComparador(grupo);
    mostrarDetalleNombre(punto, grupo);
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
