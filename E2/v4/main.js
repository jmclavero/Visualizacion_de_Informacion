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

// Colores de categoría: deliberadamente fuera del verde/amarillo/rojo que
// usan las líneas de referencia.
const COLORES_CATEGORIA = {
  "Teleseries": "#2a6fdb",
  "Música / Viña": "#7b4bd8",
  "Otras causas televisivas": "#0f8f9e",
  "No televisivas": "#c2478a",
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
  limpiarColorCategoria();
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
  limpiarColorCategoria();
  document.getElementById("comparador-categoria").textContent = titulo;
  document.getElementById("comparador-descripcion").textContent = "";
  document.getElementById("comparador-grafico").innerHTML = "";
  document.getElementById("comparador-normalizado").innerHTML = "";
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

  const colorCategoria = COLORES_CATEGORIA[grupo] || "#0b0b0b";
  const contenido = document.querySelector(".comparador-contenido");
  if (contenido) contenido.style.setProperty("--categoria-color", colorCategoria);

  const categoriaEl = document.getElementById("comparador-categoria");
  categoriaEl.textContent = grupo;
  categoriaEl.style.color = colorCategoria;
  const eyebrow = document.querySelector(".comparador-eyebrow");
  if (eyebrow) eyebrow.style.color = colorCategoria;

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
    "Verde: referencia alta · amarillo: media · rojo: baja. La línea sólida " +
    "es tu nombre; el resto queda atenuado. Los puntos huecos son alzas " +
    "menores a 4x. En el gráfico de alza, 1x equivale al promedio de los 3 " +
    "años previos al boom, así las alzas se comparan sin importar el volumen." +
    estimada;

  dibujarSeries(grupo, refs, usuarios);
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

function baseDePunto(punto) {
  const prev = Number(punto?.prev);
  if (Number.isFinite(prev) && prev > 0) return prev;

  // Si el punto no trae la base explícita, se recalcula con la misma regla
  // del alza: promedio de los 3 años anteriores al boom.
  const serie = Array.isArray(punto?.serie) ? punto.serie : [];
  const anio = Number(punto?.anio);
  const indice = anio - Number(DATOS?.anio_min);
  if (Number.isInteger(indice) && indice >= 3) {
    const previos = [
      serie[indice - 1],
      serie[indice - 2],
      serie[indice - 3],
    ].map(Number);
    if (previos.every((v) => Number.isFinite(v) && v >= 0)) {
      const promedio = previos.reduce((a, b) => a + b, 0) / 3;
      if (promedio > 0) return promedio;
    }
  }

  const n = Number(punto?.n);
  const veces = Number(punto?.veces);
  if (Number.isFinite(n) && Number.isFinite(veces) && n > 0 && veces > 0) {
    return n / veces;
  }
  return null;
}

function opacidadDeFila(fila) {
  if (fila.esActual) return 1;
  return fila.esReferencia ? 0.55 : 0.4;
}

function anchoDeFila(fila) {
  if (fila.esActual) return 3.6;
  return fila.esReferencia ? 1.8 : 2.2;
}

function yDeFila(fila, anios, normalizado) {
  const serie = Array.isArray(fila.punto.serie) ? fila.punto.serie : [];
  const base = normalizado ? baseDePunto(fila.punto) : null;
  if (normalizado && !base) return null;

  return anios.map((_, i) => {
    const valor = Number(serie[i]);
    if (!Number.isFinite(valor) || valor <= 0) return null;
    return normalizado ? valor / base : valor;
  });
}

function etiquetaMultiplo(valor) {
  const n = Number(valor);
  let texto;
  if (n >= 1) {
    texto = Number.isInteger(n) ? String(n) : n.toFixed(1);
  } else {
    texto = n.toFixed(2);
  }
  return texto.replace(".", ",") + "x";
}

function agregarMarcadores(trazas, datos, esActual) {
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
      size: esActual ? 11.5 : 10.5,
      color: esActual ? "#0b0b0b" : "rgba(11, 11, 11, 0.58)",
    },
    marker: {
      size: datos.size,
      color: datos.color,
      symbol: datos.symbol,
      line: { color: "#ffffff", width: esActual ? 2.2 : 1.4 },
    },
    opacity: esActual ? 1 : 0.62,
    hoverinfo: "skip",
    showlegend: false,
  });
}

function construirTrazas(filas, refs, anios, normalizado) {
  const trazas = [];
  const marcadoresOtros = {
    x: [],
    y: [],
    text: [],
    color: [],
    size: [],
    symbol: [],
  };
  const marcadoresActual = {
    x: [],
    y: [],
    text: [],
    color: [],
    size: [],
    symbol: [],
  };

  // Las demás líneas primero y la del nombre actual al final, para que
  // siempre quede por encima.
  const orden = [
    ...filas.filter((fila) => !fila.esActual),
    ...filas.filter((fila) => fila.esActual),
  ];

  for (const fila of orden) {
    const color = colorDeFila(fila, 0, refs);
    const y = yDeFila(fila, anios, normalizado);
    if (!y) continue;

    const actual = !!fila.esActual;
    const serie = Array.isArray(fila.punto.serie) ? fila.punto.serie : [];
    const hover = normalizado
      ? `<b>${nombreLeyenda(
          fila
        )}</b><br>%{x}: %{y:.2~f}x sobre el nivel previo<extra></extra>`
      : `<b>${nombreLeyenda(
          fila
        )}</b><br>%{x}: %{y} inscripciones<extra></extra>`;

    trazas.push({
      x: anios,
      y,
      mode: "lines",
      type: "scatter",
      name: nombreLeyenda(fila),
      line: {
        color,
        width: anchoDeFila(fila),
        dash: actual ? "solid" : "dash",
      },
      opacity: opacidadDeFila(fila),
      connectgaps: true,
      hovertemplate: hover,
      showlegend: true,
    });

    const anio = Number(fila.punto.anio);
    let yBoom = Number(fila.punto.n);
    if (!Number.isFinite(yBoom) || yBoom <= 0) {
      yBoom = Number(serie[anio - DATOS.anio_min]);
    }
    if (!Number.isFinite(yBoom) || yBoom <= 0) {
      const maximo = Math.max(...serie);
      if (maximo > 0) yBoom = maximo;
    }
    if (!Number.isFinite(yBoom) || yBoom <= 0) continue;

    if (normalizado) {
      const base = baseDePunto(fila.punto);
      if (!base) continue;
      yBoom = yBoom / base;
    }

    const minimo = !!fila.punto.sinAlza || Number(fila.valor) < 4;
    const bucket = actual ? marcadoresActual : marcadoresOtros;
    bucket.x.push(anio);
    bucket.y.push(yBoom);
    bucket.text.push(
      Number(fila.valor) > 0 ? formatearVeces(fila.valor) : "Sin alza"
    );
    bucket.color.push(color);
    bucket.size.push(actual ? 14 : 10);
    bucket.symbol.push(minimo ? "circle-open" : "circle");
  }

  agregarMarcadores(trazas, marcadoresOtros, false);
  agregarMarcadores(trazas, marcadoresActual, true);
  return trazas;
}

function alturaComparador() {
  return Math.max(
    440,
    Math.min(
      620,
      typeof window !== "undefined" ? window.innerHeight - 300 : 560
    )
  );
}

function layoutComparador(altura, normalizado, filas) {
  let yTicks;
  let yTitle;

  if (normalizado) {
    const valores = [];
    for (const fila of filas) {
      const base = baseDePunto(fila.punto);
      if (!base) continue;
      const serie = Array.isArray(fila.punto.serie) ? fila.punto.serie : [];
      for (const valor of serie) {
        const n = Number(valor);
        if (Number.isFinite(n) && n > 0) valores.push(n / base);
      }
    }
    const maximo = Math.max(2, ...valores);
    const minimo = Math.min(1, ...valores);
    const candidatos = [0.01, 0.1, 0.5, 1, 2, 4, 16, 64, 256, 1024];
    yTicks = candidatos.filter(
      (v) => v >= Math.max(0.01, minimo * 0.8) && v <= maximo * 1.25
    );
    if (!yTicks.includes(1)) yTicks.push(1);
    yTicks.sort((a, b) => a - b);
    yTitle = "Veces sobre el nivel previo (log)";
  } else {
    const maxY = Math.max(
      1,
      ...filas.flatMap((f) =>
        (Array.isArray(f.punto.serie) ? f.punto.serie : []).map(Number)
      )
    );
    yTicks = [1, 10, 100, 1000, 10000, 100000].filter(
      (v) => v <= maxY * 1.15
    );
    yTitle = "Inscripciones (escala log)";
  }

  const layout = {
    height: altura,
    margin: { t: 88, r: 28, b: 52, l: 72 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: "system-ui, sans-serif", color: "#0b0b0b" },
    legend: {
      orientation: "h",
      x: 0,
      y: 1.14,
      xanchor: "left",
      yanchor: "top",
      font: { size: 10 },
      itemclick: false,
      itemdoubleclick: false,
      bgcolor: "rgba(255,255,255,0.75)",
    },
    hovermode: "x unified",
    xaxis: {
      title: { text: "Año", font: { size: 11.5 } },
      range: [DATOS.anio_min - 1, DATOS.anio_max + 1],
      tickvals: [1920, 1940, 1960, 1980, 2000, 2020],
      ticktext: ["1920", "1940", "1960", "1980", "2000", "2020"],
      gridcolor: "#e1e0d9",
      zeroline: false,
      fixedrange: true,
    },
    yaxis: {
      type: "log",
      title: { text: yTitle, font: { size: 11.5 } },
      tickvals: yTicks,
      ticktext: normalizado
        ? yTicks.map(etiquetaMultiplo)
        : yTicks.map((v) =>
            v >= 1000 ? v.toLocaleString("es-CL") : String(v)
          ),
      gridcolor: "#e1e0d9",
      zeroline: false,
      fixedrange: true,
      automargin: true,
    },
  };

  if (normalizado) {
    layout.shapes = [
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        yref: "y",
        y0: 1,
        y1: 1,
        line: { color: "#c3c2b7", width: 1, dash: "dot" },
      },
    ];
  }

  return layout;
}

function dibujarSeries(grupo, refs, usuarios) {
  if (typeof Plotly === "undefined") return;

  const filas = construirFilas(grupo, refs, usuarios);
  if (!filas.length) return;

  const anios = Array.from(
    { length: DATOS.anio_max - DATOS.anio_min + 1 },
    (_, i) => DATOS.anio_min + i
  );
  const altura = alturaComparador();

  const trazas = construirTrazas(filas, refs, anios, false);
  const trazasNormalizadas = construirTrazas(filas, refs, anios, true);

  Plotly.react(
    "comparador-grafico",
    trazas,
    layoutComparador(altura, false, filas),
    { displayModeBar: false, responsive: true, scrollZoom: false }
  );

  Plotly.react(
    "comparador-normalizado",
    trazasNormalizadas,
    layoutComparador(altura, true, filas),
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
