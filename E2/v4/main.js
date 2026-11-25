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

function mostrarCargando(nombre) {
  abrirComparador();
  document.getElementById("comparador-categoria").textContent = "Buscando…";
  document.getElementById(
    "comparador-descripcion"
  ).textContent = `Analizando «${nombre}» y buscando su categoría…`;
  document.getElementById("comparador-grafico").hidden = true;
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
  document.getElementById("comparador-grafico").hidden = true;
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

  const grafico = document.getElementById("comparador-grafico");
  grafico.hidden = false;
  document.getElementById("comparador-mensaje").hidden = true;

  const nota = document.getElementById("comparador-nota");
  const estimada = actual?.categoriaEstimada
    ? " La categoría de tu nombre es una estimación IA."
    : "";
  nota.textContent =
    "Las referencias alta, media y baja son nombres reales de los 59 booms " +
    "curados de esta categoría. Tus nombres se agregan a medida que los dices." +
    estimada;

  dibujarComparador(grupo, refs, usuarios);
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

function dibujarComparador(grupo, refs, usuarios) {
  if (typeof Plotly === "undefined") return;

  const filas = construirFilas(grupo, refs, usuarios);
  if (!filas.length) return;

  const colorGrupo = COLORES[grupo] || "#2a78d6";
  const xMax = Math.max(
    8,
    ...filas.map((f) => Math.max(0.55, Number(f.valor) || 0))
  ) * 1.25;

  const xs = filas.map((f) =>
    Math.max(0.55, Number.isFinite(Number(f.valor)) ? Number(f.valor) : 0)
  );
  const texts = filas.map((f) =>
    Number(f.valor) > 0 ? formatearVeces(f.valor) : "Sin alza"
  );

  // Línea de cada fila, desde el inicio del eje hasta el punto.
  const trazasLineas = filas.map((f, i) => ({
    x: [0.5, xs[i]],
    y: [f.etiqueta, f.etiqueta],
    mode: "lines",
    type: "scatter",
    line: {
      color: f.esActual ? "#e34948" : colorGrupo,
      width: f.esActual ? 2.5 : 1.5,
    },
    hoverinfo: "skip",
    showlegend: false,
  }));

  const trazaPuntos = {
    x: xs,
    y: filas.map((f) => f.etiqueta),
    mode: "markers+text",
    type: "scatter",
    text: texts,
    textposition: "middle right",
    textfont: {
      family: "system-ui, sans-serif",
      size: 12,
      color: "#0b0b0b",
    },
    marker: {
      size: filas.map((f) => (f.esActual ? 16 : 11)),
      color: filas.map((f) => (f.esActual ? "#e34948" : colorGrupo)),
      line: {
        color: filas.map((f) => (f.esActual ? "#0b0b0b" : "#ffffff")),
        width: filas.map((f) => (f.esActual ? 2 : 1.5)),
      },
    },
    hoverinfo: "skip",
    showlegend: false,
  };

  const etiquetas = filas.map((f) => f.etiqueta);
  const alturaDisponible =
    typeof window !== "undefined" ? window.innerHeight - 250 : 500;
  const alturas = Math.max(
    420,
    Math.min(760, alturaDisponible),
    150 + filas.length * 54
  );

  const esAngosto =
    typeof window !== "undefined" && window.innerWidth < 720;
  const layout = {
    height: alturas,
    margin: {
      t: 52,
      r: esAngosto ? 52 : 84,
      b: 54,
      l: esAngosto ? 168 : 230,
    },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: "system-ui, sans-serif", color: "#0b0b0b" },
    showlegend: false,
    hovermode: false,
    xaxis: {
      type: "log",
      title: { text: "Alza (veces)", font: { size: 12 } },
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
      tickfont: { size: 12 },
      gridcolor: "rgba(0,0,0,0.04)",
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
        font: { size: 11, color: "#8a5a00" },
      },
    ],
  };

  Plotly.react(
    "comparador-grafico",
    [...trazasLineas, trazaPuntos],
    layout,
    { displayModeBar: false, responsive: true, scrollZoom: false }
  );
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
