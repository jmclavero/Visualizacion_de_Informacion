const ANIO_MIN = 1920;
const ANIO_MAX = 2025;
const N_ANIOS = ANIO_MAX - ANIO_MIN + 1; // 106

const CATEGORIAS = [
  "Teleserie",
  "Música / Viña",
  "Series y animación",
  "TV en vivo",
  "Política, realeza y noticias",
  "Cine",
  "Deporte",
  "Ciencia y espacio",
  "Migración",
  "Religión / tradición",
  "Moda / tendencia",
  "Sin identificar",
];

const GRUPO = {
  "Teleserie": "Teleseries",
  "Música / Viña": "Música / Viña",
  "Series y animación": "Otras causas televisivas",
  "TV en vivo": "Otras causas televisivas",
  "Política, realeza y noticias": "No televisivas",
  "Cine": "No televisivas",
  "Deporte": "No televisivas",
  "Ciencia y espacio": "No televisivas",
  "Migración": "No televisivas",
  "Religión / tradición": "No televisivas",
  "Moda / tendencia": "No televisivas",
  "Sin identificar": "Sin identificar",
};

function normalizarNombre(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function nombreVisible(value) {
  return String(value || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-CL")
    .replace(/(^|\s)(\p{L})/gu, (_, espacio, letra) => espacio + letra.toUpperCase());
}

function hashNombre(nombre) {
  let h = 2166136261;
  const texto = normalizarNombre(nombre);
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const FORMAS = ["pico", "ola", "sostenido", "evento"];
const POPULARIDADES = {
  "muy raro": 6,
  raro: 12,
  "poco comun": 25,
  "poco común": 25,
  comun: 50,
  común: 50,
  "muy comun": 100,
  "muy común": 100,
};

function formaPorCategoria(categoria, semilla) {
  const mapa = {
    "Teleserie": "pico",
    "Música / Viña": "ola",
    "Series y animación": "pico",
    "TV en vivo": "evento",
    "Política, realeza y noticias": "evento",
    "Cine": "pico",
    "Deporte": "evento",
    "Ciencia y espacio": "evento",
    "Migración": "sostenido",
    "Religión / tradición": "sostenido",
    "Moda / tendencia": "ola",
    "Sin identificar": "ola",
  };
  const base = mapa[categoria] || "ola";
  // Pequeña variación para que dos nombres de la misma categoría no tengan
  // exactamente la misma forma.
  if (base === "pico" && semilla % 5 === 0) return "ola";
  if (base === "ola" && semilla % 7 === 0) return "pico";
  if (base === "evento" && semilla % 9 === 0) return "pico";
  return base;
}

function basePorPopularidad(popularidad, semilla) {
  const valor = String(popularidad || "").toLowerCase().trim();
  if (POPULARIDADES[valor]) return POPULARIDADES[valor];
  const numero = Number(popularidad);
  if (Number.isFinite(numero)) return Math.max(5, Math.min(180, Math.round(numero)));
  return 8 + (semilla % 53); // 8..60
}

/**
 * Genera una serie anual plausible cuando el modelo no entrega una serie
 * utilizable. No usa una única curva: cambia la forma, la base, el ancho del
 * pico, la caída y el ruido según el nombre y la categoría.
 */
function generarSerie(anioBoom, veces, nombre, categoria, forma, popularidad) {
  const indiceBoom = Math.max(
    8,
    Math.min(N_ANIOS - 2, anioBoom - ANIO_MIN)
  );
  const semilla = hashNombre(nombre);
  const base = basePorPopularidad(popularidad, semilla);
  const formaElegida =
    FORMAS.includes(String(forma || "").toLowerCase()) &&
    String(forma).toLowerCase() !== "sin_dato"
      ? String(forma).toLowerCase()
      : formaPorCategoria(categoria, semilla);
  const objetivo = Math.max(base + 8, Math.round(base * veces));
  const serie = [];

  const meseta =
    formaElegida === "evento"
      ? 0
      : formaElegida === "pico"
        ? semilla % 2
        : formaElegida === "ola"
          ? 2 + (semilla % 3)
          : 4 + (semilla % 5);
  const caida =
    formaElegida === "evento"
      ? 1.4
      : formaElegida === "pico"
        ? 2.5 + (semilla % 4)
        : formaElegida === "ola"
          ? 5 + (semilla % 5)
          : 10 + (semilla % 8);

  const inicioCrecimiento = Math.max(
    2,
    indiceBoom - (12 + (semilla % 20))
  );

  for (let i = 0; i < N_ANIOS; i++) {
    let v;

    if (i < indiceBoom) {
      if (i < inicioCrecimiento) {
        // El nombre empieza siendo raro y crece lentamente.
        const t = i / Math.max(1, inicioCrecimiento);
        v = base * (0.08 + 0.92 * Math.pow(t, 0.8));
      } else {
        // Los 3 años previos al pico están cerca de la base; así el alza
        // medida no queda inflada por una rampa artificial.
        const t =
          (i - inicioCrecimiento) /
          Math.max(1, indiceBoom - inicioCrecimiento);
        v = base * (0.9 + 0.1 * t);
      }
    } else if (i <= indiceBoom + meseta) {
      v = objetivo * (1 - ((i - indiceBoom) / Math.max(1, meseta + 1)) * 0.05);
    } else {
      const d = i - indiceBoom - meseta;
      v = objetivo * Math.exp(-d / caida) + base * 0.25;
    }

    // Ruido determinista y pequeño, no una línea perfecta.
    const ruido = (((semilla + i * 53) % 15) - 7) / 100;
    v += v * ruido;

    // Eco secundario ocasional, como en las series reales.
    if (
      semilla % 3 === 0 &&
      i === indiceBoom + meseta + 4 + (semilla % 3)
    ) {
      v += objetivo * 0.06;
    }

    serie.push(Math.max(0, Math.round(v)));
  }

  return serie;
}

function detectarPico(serie, indiceBoom) {
  const centro = Math.max(3, Math.min(N_ANIOS - 1, indiceBoom));
  const desde = Math.max(3, centro - 3);
  const hasta = Math.min(N_ANIOS - 1, centro + 5);

  let mejor = centro;
  let valor = serie[mejor] || 0;
  for (let i = desde; i <= hasta; i++) {
    if (serie[i] > valor) {
      valor = serie[i];
      mejor = i;
    }
  }
  return mejor;
}

function detectarBoom(serie, centro = null) {
  let mejor = null;
  const desde = centro === null ? 3 : Math.max(3, centro - 3);
  const hasta =
    centro === null ? N_ANIOS - 1 : Math.min(N_ANIOS - 1, centro + 5);

  for (let i = desde; i <= hasta; i++) {
    const previo = (serie[i - 1] + serie[i - 2] + serie[i - 3]) / 3;
    if (previo <= 0) continue;
    const ratio = serie[i] / previo;
    if (!mejor || ratio > mejor.ratio) {
      mejor = { i, ratio, previo };
    }
  }

  if (!mejor) {
    let iMax =
      centro === null
        ? 0
        : Math.max(3, Math.min(N_ANIOS - 1, Math.round(centro)));
    if (centro === null) {
      for (let i = 1; i < N_ANIOS; i++) {
        if (serie[i] > serie[iMax]) iMax = i;
      }
    }
    const previo =
      iMax >= 3
        ? (serie[iMax - 1] + serie[iMax - 2] + serie[iMax - 3]) / 3
        : 0;
    mejor = {
      i: iMax,
      previo,
      ratio: previo > 0 ? serie[iMax] / previo : 0,
    };
  }
  return mejor;
}

/**
 * Convierte la respuesta del modelo en el boom que usa la visualización.
 * El modelo solo decide el año y la magnitud; la serie anual SIEMPRE se
 * genera en el Worker. Así no confiamos en 106 cifras inventadas por el
 * modelo ni las presentamos como si fueran datos reales.
 */
function construirBoom(nombre, raw) {
  if (!raw) return null;

  const anioModelo = Number(raw.anio_boom);
  const anioBoom = Number.isFinite(anioModelo)
    ? Math.max(1930, Math.min(ANIO_MAX, Math.round(anioModelo)))
    : 1980;
  const vecesModelo = Number(raw.veces);
  const vecesObjetivo = Number.isFinite(vecesModelo)
    ? Math.max(2, Math.min(12, vecesModelo))
    : 5;

  const serie = generarSerie(
    anioBoom,
    vecesObjetivo,
    nombre,
    raw.categoria,
    raw.forma,
    raw.popularidad
  );
  const boom = detectarBoom(serie, anioBoom - ANIO_MIN);
  if (!boom) return null;

  const anio = ANIO_MIN + boom.i;
  const n = serie[boom.i];
  const prev = Math.round(boom.previo);
  const extra = n - prev;
  const veces =
    boom.previo > 0 ? Math.round((n / boom.previo) * 10) / 10 : 0;

  const GRUPOS = [
    "Teleseries",
    "Música / Viña",
    "Otras causas televisivas",
    "No televisivas",
    "Sin identificar",
  ];

  let categoria = "Sin identificar";
  let categoriaViz = "Sin identificar";

  if (CATEGORIAS.includes(raw.categoria)) {
    categoria = raw.categoria;
    categoriaViz = GRUPO[categoria] || "Sin identificar";
  } else if (GRUPOS.includes(raw.categoria)) {
    categoriaViz = raw.categoria;
    categoria = raw.categoria === "Teleseries" ? "Teleserie" : "Sin identificar";
  }

  let sexo = String(raw.sexo || "").toUpperCase();
  if (sexo !== "F" && sexo !== "M") sexo = "Sin dato";

  return {
    nombre: nombreVisible(nombre),
    sexo,
    anio,
    prev,
    n,
    extra,
    veces,
    categoria,
    categoria_viz: categoriaViz,
    causa: String(raw.causa || "").trim().slice(0, 300) || "Sin causa identificada.",
    confianza: "Estimada",
    fuente: "",
    serie,
    ia: true,
  };
}

// Búsqueda de fuentes reales para causas de nombres.
// Mezcla Tavily (opcional), Wikipedia en español y Google News RSS.
// El modelo SOLO puede clasificar/citar lo que aparezca aquí.

const MAX_FUENTES = 12;
const MAX_TEXTO = 800;
const WIKI_HEADERS = {
  "User-Agent":
    "NombresChile/1.0 (https://jmclavero.github.io/Visualizacion_de_Informacion/; proyecto educativo)",
  "Api-User-Agent":
    "NombresChile/1.0 (https://jmclavero.github.io/Visualizacion_de_Informacion/; proyecto educativo)",
};

const TIPOS = [
  {
    patron: /telenovela/i,
    categoria: "Teleserie",
    etiqueta: "telenovela",
    palabras: /\b(telenovela|culebr[oó]n|melodrama)\b/i,
  },
  {
    patron: /(serie de televisi[oó]n|serie de tv|series de televisi[oó]n|serie dram[aá]tica)/i,
    categoria: "Series y animación",
    etiqueta: "serie de televisión",
    palabras: /\b(serie|temporada|episodio|protagonista)\b/i,
  },
  {
    patron: /(programa de televisi[oó]n|programa de tv|reality|concurso|late show|matinal)/i,
    categoria: "TV en vivo",
    etiqueta: "programa de televisión",
    palabras: /\b(programa|reality|concurso|matinal|conducci[oó]n)\b/i,
  },
  {
    patron: /(pel[ií]cula|largometraje|film|filme)/i,
    categoria: "Cine",
    etiqueta: "película",
    palabras: /\b(pel[ií]cula|film|largometraje|director|protagonista)\b/i,
  },
  {
    patron: /(canci[oó]n|sencillo|single|[aá]lbum|disco|banda sonora)/i,
    categoria: "Música / Viña",
    etiqueta: "canción o álbum",
    palabras: /\b(canci[oó]n|sencillo|[aá]lbum|disco|int[eé]rprete|cantante|Viña del Mar)\b/i,
  },
  {
    patron:
      /\b(pol[ií]tic[ao]s?|presidente|presidenta|reina|realeza|elecci[oó]n(?:es)?|ministr[oa]|congreso)\b/i,
    categoria: "Política, realeza y noticias",
    etiqueta: "tema político o de actualidad",
  },
  {
    patron:
      /\b(f[uú]tbol|deporte|deportes|atleta|tenis|selecci[oó]n|ol[ií]mpic[oa]s?)\b/i,
    categoria: "Deporte",
    etiqueta: "tema deportivo",
  },
  {
    patron: /\b(migraci[oó]n|inmigrante|extranjero|refugiado)\b/i,
    categoria: "Migración",
    etiqueta: "tema migratorio",
  },
  {
    patron: /\b(espacio|astronauta|ciencia|planeta|nasa)\b/i,
    categoria: "Ciencia y espacio",
    etiqueta: "tema científico o espacial",
  },
];

function normalizarTexto(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarUrl(url) {
  return String(url || "")
    .trim()
    .replace(/[),.;]+$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function limpiarHtml(texto) {
  return String(texto || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function recortar(texto, max = MAX_TEXTO) {
  const limpio = limpiarHtml(texto);
  return limpio.length > max ? limpio.slice(0, max) + "…" : limpio;
}

async function fetchJson(url, opciones = {}, timeout = 9000) {
  const respuesta = await fetch(url, {
    ...opciones,
    signal: AbortSignal.timeout(timeout),
  });
  if (!respuesta.ok) return null;
  return respuesta.json();
}

function extraerAnio(texto) {
  const encontrado = String(texto || "").match(/\b(19\d{2}|20\d{2})\b/);
  return encontrado ? Number(encontrado[1]) : null;
}

function detectarTipoFuente(titulo) {
  const texto = String(titulo || "");
  return TIPOS.find((tipo) => tipo.patron.test(texto)) || null;
}

/**
 * Solo consideramos que una fuente "es una obra" si el título empieza con el
 * nombre y luego viene el tipo entre paréntesis o tras dos puntos. Así
 * evitamos confundir una noticia sobre "Emilia ... nuevo disco" con una
 * canción llamada Emilia.
 */
function tituloPareceObra(titulo, nombre) {
  const tituloNorm = normalizarTexto(titulo);
  const nombreNorm = normalizarTexto(nombre);
  if (!nombreNorm || !tituloNorm.startsWith(nombreNorm)) return false;

  const resto = tituloNorm.slice(nombreNorm.length).trim();
  if (!resto) return false;

  return /^[\s([{\-–—:,"']*(telenovela|serie|pel[ií]cula|canci[oó]n|[aá]lbum|programa|disco|sencillo)\b/i.test(
    resto
  );
}

function puntuarFuente(fuente, nombre, anio) {
  const nombreNorm = normalizarTexto(nombre);
  const tituloNorm = normalizarTexto(fuente.titulo);
  const textoNorm = normalizarTexto(fuente.texto);
  const tipo = detectarTipoFuente(fuente.titulo);
  const tipoObra = tipo && tituloPareceObra(fuente.titulo, nombre) ? tipo : null;
  const anioFuente = extraerAnio(fuente.titulo);

  let score = 0;
  if (tituloNorm.includes(nombreNorm)) score += 6;
  if (textoNorm.includes(nombreNorm)) score += 1;
  if (tipoObra) score += 4;
  if (anio && anioFuente) {
    const distancia = Math.abs(anioFuente - anio);
    if (distancia <= 5) score += 5;
    else if (distancia <= 10) score += 1;
    else score -= 3;
  }
  if (fuente.origen === "Tavily") score += 1;
  if (/nombre|bautiz|popular|moda|famosa|famoso/i.test(fuente.texto)) score += 1;

  return { score, tipo: tipoObra, anioFuente };
}

async function buscarWikipedia(nombre, consultasExtra = []) {
  // Dos búsquedas base y una sola llamada de extractos: menos peticiones y
  // menos riesgo de que Wikipedia nos limite.
  const consultas = [
    `intitle:"${nombre}"`,
    `"${nombre}" telenovela OR serie OR canción OR película OR programa`,
    ...consultasExtra,
  ].filter((consulta, i, arr) => consulta && arr.indexOf(consulta) === i);

  try {
    const busquedas = await Promise.all(
      consultas.map((consulta) =>
        fetchJson(
          "https://es.wikipedia.org/w/api.php?" +
            new URLSearchParams({
              action: "query",
              list: "search",
              srsearch: consulta,
              srlimit: "5",
              format: "json",
              formatversion: "2",
              utf8: "1",
              origin: "*",
            }),
          { headers: WIKI_HEADERS }
        ).catch(() => null)
      )
    );

    const resultados = [];
    const vistos = new Set();
    for (const busqueda of busquedas) {
      for (const r of busqueda?.query?.search || []) {
        if (!r?.title || vistos.has(r.title)) continue;
        vistos.add(r.title);
        resultados.push(r);
      }
    }
    if (!resultados.length) return [];

    const titulos = resultados.slice(0, 16).map((r) => r.title).join("|");
    let extractos = {};
    try {
      const detalle = await fetchJson(
        "https://es.wikipedia.org/w/api.php?" +
          new URLSearchParams({
            action: "query",
            prop: "extracts",
            exintro: "1",
            explaintext: "1",
            titles: titulos,
            format: "json",
            formatversion: "2",
            utf8: "1",
            origin: "*",
          }),
        { headers: WIKI_HEADERS }
      );
      for (const pagina of detalle?.query?.pages || []) {
        extractos[pagina.title] = pagina.extract || "";
      }
    } catch {
      extractos = {};
    }

    return resultados.map((r) => ({
      origen: "Wikipedia",
      titulo: r.title,
      url:
        "https://es.wikipedia.org/wiki/" +
        encodeURIComponent(r.title.replace(/ /g, "_")),
      texto: recortar(extractos[r.title] || r.snippet || ""),
    }));
  } catch {
    return [];
  }
}

function parsearRss(xml) {
  return [...String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .slice(0, 5)
    .map((m) => {
      const bloque = m[1];
      const tag = (nombreTag) => {
        const encontrado = bloque.match(
          new RegExp(`<${nombreTag}[^>]*>([\\s\\S]*?)<\\/${nombreTag}>`, "i")
        );
        return encontrado ? encontrado[1] : "";
      };
      return {
        titulo: recortar(tag("title"), 200),
        url: limpiarHtml(tag("link")),
        texto: recortar(tag("description")),
      };
    })
    .filter((f) => f.url && /^https?:\/\//i.test(f.url));
}

async function buscarGoogleNews(nombre, anio, consultasExtra = []) {
  const consultas = [
    `"${nombre}" Chile ${anio || ""}`.trim(),
    `"${nombre}" telenovela OR serie OR canción Chile`.trim(),
    `"${nombre}" nombre Chile`.trim(),
    ...consultasExtra,
  ].filter((consulta, i, arr) => consulta && arr.indexOf(consulta) === i);

  try {
    const respuestas = await Promise.all(
      consultas.map(async (consulta) => {
        const url =
          "https://news.google.com/rss/search?" +
          new URLSearchParams({
            q: consulta,
            hl: "es-CL",
            gl: "CL",
            ceid: "CL:es",
          });
        try {
          const respuesta = await fetch(url, {
            signal: AbortSignal.timeout(9000),
          });
          if (!respuesta.ok) return [];
          return parsearRss(await respuesta.text());
        } catch {
          return [];
        }
      })
    );

    return respuestas
      .flat()
      .map((f) => ({ origen: "Google News", ...f }));
  } catch {
    return [];
  }
}

async function buscarTavily(nombre, anio, apiKey, consultasExtra = []) {
  if (!apiKey) return [];
  const consultas = [
    `"${nombre}" Chile ${anio || ""} nombre popularidad motivo ` +
      "telenovela serie canción película",
    ...consultasExtra.slice(0, 2),
  ];

  try {
    const respuestas = await Promise.all(
      consultas.map((consulta) =>
        fetchJson(
          "https://api.tavily.com/search",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              query: consulta,
              search_depth: "advanced",
              max_results: 10,
              include_answer: false,
              include_raw_content: false,
            }),
          },
          15000
        ).catch(() => null)
      )
    );

    return respuestas
      .flatMap((data) => data?.results || [])
      .filter((r) => r && r.url)
      .map((r) => ({
        origen: "Tavily",
        titulo: recortar(r.title || r.url, 200),
        url: String(r.url),
        texto: recortar(r.content || ""),
      }));
  } catch {
    return [];
  }
}

/**
 * Devuelve una lista de fuentes reales deduplicadas y ordenadas por
 * relevancia. Nunca inventa fuentes: si todas las búsquedas fallan, [].
 */
async function buscarFuentes(nombre, anio, env = {}, consultasExtra = []) {
  const [tavily, wikipedia, noticias] = await Promise.all([
    buscarTavily(nombre, anio, env.TAVILY_API_KEY, consultasExtra),
    buscarWikipedia(nombre, consultasExtra),
    buscarGoogleNews(nombre, anio, consultasExtra),
  ]);

  const nombreNorm = normalizarTexto(nombre);
  const vistos = new Set();
  const fuentes = [];

  for (const fuente of [...tavily, ...wikipedia, ...noticias]) {
    if (!fuente.url) continue;
    const textoCompleto = normalizarTexto(fuente.titulo + " " + fuente.texto);
    if (!textoCompleto.includes(nombreNorm)) continue;

    const clave = normalizarUrl(fuente.url) + "|" + normalizarTexto(fuente.titulo);
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const { score, tipo, anioFuente } = puntuarFuente(fuente, nombre, anio);
    fuentes.push({
      ...fuente,
      tipo: tipo ? { categoria: tipo.categoria, etiqueta: tipo.etiqueta } : null,
      anio_fuente: anioFuente,
      score,
    });
  }

  return fuentes
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FUENTES);
}

function formatearFuentes(fuentes) {
  return fuentes
    .map(
      (f, i) =>
        `[${i + 1}] (${f.origen}) ${f.titulo}\n` +
        `Tipo: ${f.tipo?.etiqueta || "sin tipo detectado"} · Año: ${
          f.anio_fuente || "sin año"
        }\nURL: ${f.url}\n${f.texto}`
    )
    .join("\n\n");
}

function obtenerFuente(url, fuentes) {
  const buscada = normalizarUrl(url);
  if (!buscada) return null;
  return fuentes.find((f) => normalizarUrl(f.url) === buscada) || null;
}

function resumenFuentes(fuentes, max = 6) {
  return fuentes.slice(0, max).map((f) => ({
    titulo: f.titulo,
    url: f.url,
    origen: f.origen,
    tipo: f.tipo?.etiqueta || "",
    anio: f.anio_fuente || null,
  }));
}

/**
 * Si el modelo no se atreve a afirmar una causa, pero existe una fuente con
 * el mismo nombre y un tipo claro (telenovela, serie, canción, película...)
 * cerca del año del alza, devolvemos una causa PROBABLE, siempre citada.
 */
function elegirCausaProbable(nombre, anio, fuentes) {
  const nombreNorm = normalizarTexto(nombre);
  const candidatos = fuentes
    .filter((f) => f.tipo && normalizarTexto(f.titulo).includes(nombreNorm))
    .map((f) => {
      let cercania = 0;
      if (anio && f.anio_fuente) {
        const distancia = Math.abs(f.anio_fuente - anio);
        if (distancia <= 5) cercania = 3;
        else if (distancia <= 10) cercania = 1;
        else if (distancia > 15) cercania = -5;
      }
      return { f, puntaje: f.score + cercania };
    })
    .filter((c) => {
      if (anio && c.f.anio_fuente) {
        return Math.abs(c.f.anio_fuente - anio) <= 15;
      }
      return true;
    })
    .sort((a, b) => b.puntaje - a.puntaje);

  if (!candidatos.length) return null;

  const f = candidatos[0].f;
  const anioTexto = f.anio_fuente ? ` (${f.anio_fuente})` : "";
  const causa =
    `Coincide con «${f.titulo}»${anioTexto}, una ${f.tipo.etiqueta} cercana ` +
    `al alza${anio ? ` de ${anio}` : ""}; la fuente no confirma una relación ` +
    "causal directa.";

  return {
    categoria: f.tipo.categoria,
    causa,
    fuente: f.url,
    fuente_titulo: f.titulo,
    evidencia: f.titulo,
    tipo: "probable",
    confianza: "Baja",
  };
}

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODELO = "deepseek-chat";

// Orígenes permitidos: GitHub Pages y servidores locales de desarrollo.
const ORIGENES = new Set([
  "https://jmclavero.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function cabecerasCors(origin) {
  const esLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const permitido = ORIGENES.has(origin) || esLocal;
  return {
    "Access-Control-Allow-Origin": permitido ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function respuestaJson(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...cabecerasCors(origin),
    },
  });
}

function limpiarJson(texto) {
  return String(texto || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function categoriaValida(valor) {
  if (!valor) return null;
  if (CATEGORIAS.includes(valor)) return valor;
  const porGrupo = Object.entries(GRUPO).find(([, grupo]) => grupo === valor);
  return porGrupo ? porGrupo[0] : null;
}

function pareceSinCausa(texto) {
  return /^(sin\s+(causa|evidencia|fuente|datos)|no\s+(se\s+)?(encontr|identific|hay)|no\s+se\s+pudo)/i.test(
    String(texto || "").trim()
  );
}

function resultadoSinCausa(fuentes = []) {
  return {
    categoria: "Sin identificar",
    categoria_viz: "Sin identificar",
    causa: "Sin causa verificada",
    fuente: "",
    fuente_titulo: "",
    evidencia: "",
    tipo: "sin_causa",
    confianza: "Sin verificar",
    fuentes: resumenFuentes(fuentes),
  };
}

function evidenciaEnFuente(evidencia, fuente) {
  const buscada = normalizarTexto(evidencia);
  if (!buscada) return false;
  return normalizarTexto(fuente.texto + " " + fuente.titulo).includes(buscada);
}

function fuenteFuerte(fuente, nombre, anio) {
  if (!fuente?.tipo) return false;
  if (!normalizarTexto(fuente.titulo).includes(normalizarTexto(nombre))) {
    return false;
  }
  if (anio && fuente.anio_fuente) {
    return Math.abs(fuente.anio_fuente - anio) <= 15;
  }
  return true;
}

function normalizarResultadoCausa(raw, fuentes, nombre, anio) {
  if (!raw || raw.tipo === "sin_causa") return null;

  const categoria = categoriaValida(raw.categoria);
  const causa = String(raw.causa || "").trim().slice(0, 320);
  const fuente = obtenerFuente(raw.fuente, fuentes);
  const evidencia = String(raw.evidencia || "").trim().slice(0, 400);

  if (
    !categoria ||
    categoria === "Sin identificar" ||
    !causa ||
    pareceSinCausa(causa) ||
    !fuente
  ) {
    return null;
  }

  const evidenciaValida = evidenciaEnFuente(evidencia, fuente);
  let tipo = raw.tipo === "probable" ? "probable" : "documentada";

  // Una causa "documentada" sin cita comprobable se rebaja a probable si la
  // fuente es claramente una obra/programa con el mismo nombre.
  if (tipo === "documentada" && !evidenciaValida) {
    if (fuenteFuerte(fuente, nombre, anio)) tipo = "probable";
    else return null;
  }

  // Una causa probable sin cita solo se acepta si la fuente es fuerte.
  if (tipo === "probable" && !evidenciaValida && !fuenteFuerte(fuente, nombre, anio)) {
    return null;
  }

  const confianza =
    tipo === "documentada"
      ? ["Alta", "Media", "Baja"].includes(raw.confianza)
        ? raw.confianza
        : "Media"
      : "Baja";

  return {
    categoria,
    categoria_viz: GRUPO[categoria] || "Sin identificar",
    causa,
    fuente: fuente.url,
    fuente_titulo: fuente.titulo,
    evidencia: evidencia || fuente.titulo,
    tipo,
    confianza,
    fuentes: resumenFuentes(fuentes),
  };
}

function promptCausa(nombre, anio, veces, fuentes) {
  return `Nombre: "${nombre}"
Año del alza real: ${anio}
Alza: ${veces}x en el Registro Civil de Chile.

Fuentes reales encontradas (usa SOLO estas):
${formatearFuentes(fuentes)}

Clasifica el motivo del alza de este nombre en Chile usando únicamente las fuentes.
Categorías permitidas:
${CATEGORIAS.map((c) => `- ${c}`).join("\n")}

Reglas:
- "documentada": una fuente afirma explícitamente que una obra, programa,
  personaje, canción, película, hecho o figura popularizó o impulsó el nombre.
- "probable": existe una telenovela, serie, programa, canción, película o
  hecho con el mismo nombre y cercano al año del alza, pero la fuente no
  afirma directamente que haya causado el alza. Debes decirlo así.
- No confundas una simple coincidencia con una persona famosa homónima con
  una causa del alza.
- La causa debe ser una frase breve, clara y en español.
- "fuente" debe ser la URL EXACTA de una de las fuentes de arriba.
- "evidencia" debe ser una cita textual de esa fuente; si no hay una cita
  clara, deja la cadena vacía y usa "probable".
- Si ninguna fuente permite sostener una causa con sentido, devuelve
  tipo "sin_causa", categoria "Sin identificar", causa "Sin causa verificada".

Ejemplos de estilo:
- Documentada: "La telenovela Yesenia (1987) popularizó el nombre en Chile."
- Probable: "Coincide con la telenovela Yesenia (1987), cercana al alza;
  no hay una afirmación directa de causalidad."

Devuelve SOLO este JSON:
{
  "categoria": "una de las categorías",
  "causa": "frase breve",
  "fuente": "URL exacta o cadena vacía",
  "evidencia": "cita textual o cadena vacía",
  "tipo": "documentada" | "probable" | "sin_causa",
  "confianza": "Alta" | "Media" | "Baja"
}`;
}

function promptBoom(nombre, fuentes) {
  const bloqueFuentes = fuentes.length
    ? formatearFuentes(fuentes)
    : "(No se encontraron fuentes para este nombre).";

  return `El nombre "${nombre}" no tiene datos reales suficientes en el Registro Civil de Chile (1920-2021). Estima su historia y marca todo como estimación IA.

Fuentes reales disponibles:
${bloqueFuentes}

Elige:
- Un año de boom entre 1930 y 2025.
- Una magnitud de alza ("veces") entre 2 y 12.
- Una forma de curva: "pico", "ola", "sostenido" o "evento".
- Una popularidad base: "raro", "poco comun", "comun" o "muy comun".
- Una categoría de la lista, SOLO si una fuente la respalda.
- Una causa breve, SOLO si una fuente la respalda.
- El sexo asociado: "F", "M" o "Sin dato".

Categorías permitidas:
${CATEGORIAS.map((c) => `- ${c}`).join("\n")}

Reglas:
- "documentada": la fuente afirma explícitamente la relación con el nombre.
- "probable": la fuente muestra una obra/programa/canción/película/evento
  con el mismo nombre y cercano al año estimado, sin afirmar causalidad.
- No inventes una URL. Si no hay fuente que respalde la causa, usa
  tipo "sin_causa", categoria "Sin identificar", causa "Sin causa verificada",
  fuente "".
- "evidencia" debe ser una cita textual de la fuente o cadena vacía.
- La serie anual la genera el backend; no la devuelvas.

Devuelve SOLO este JSON:
{
  "nombre": "${nombre}",
  "sexo": "F" | "M" | "Sin dato",
  "categoria": "una de las categorías",
  "anio_boom": 1989,
  "veces": 5.2,
  "forma": "pico" | "ola" | "sostenido" | "evento",
  "popularidad": "raro" | "poco comun" | "comun" | "muy comun",
  "causa": "frase breve",
  "fuente": "URL exacta o cadena vacía",
  "evidencia": "cita textual o cadena vacía",
  "tipo": "documentada" | "probable" | "sin_causa",
  "confianza": "Alta" | "Media" | "Baja"
}`;
}

async function consultarModelo(apiKey, system, user, maxTokens = 1400) {
  const respuesta = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELO,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(
      `DeepSeek respondió con error ${respuesta.status}: ${detalle.slice(0, 200)}`
    );
  }

  const data = await respuesta.json();
  const contenido = data?.choices?.[0]?.message?.content;
  if (!contenido) throw new Error("DeepSeek no devolvió contenido.");

  try {
    return JSON.parse(limpiarJson(contenido));
  } catch {
    throw new Error("DeepSeek no devolvió un JSON válido.");
  }
}

async function generarConsultas(nombre, anio, apiKey) {
  const prompt = `Nombre: "${nombre}"
Año del alza: ${anio || "sin dato"}
País: Chile.

No afirmes ninguna causa todavía. Propón hasta 4 búsquedas concretas que
podrían encontrar el motivo del alza: telenovela, serie, canción, película,
programa de TV, personaje, evento, moda, migración o noticia. Incluye el
nombre entre comillas y, si ayuda, el año. No inventes URLs.

Devuelve SOLO:
{ "consultas": ["consulta 1", "consulta 2", "..."] }`;

  try {
    const raw = await consultarModelo(
      apiKey,
      "Eres un investigador de nombres chilenos. Propones consultas de búsqueda, no conclusiones. Respondes con JSON válido.",
      prompt,
      500
    );
    if (!Array.isArray(raw?.consultas)) return [];
    return raw.consultas
      .map((c) => String(c || "").trim())
      .filter((c) => c.length >= 4 && c.length <= 140)
      .filter((c, i, arr) => arr.indexOf(c) === i)
      .slice(0, 4);
  } catch (error) {
    console.error("Consultas:", error.message);
    return [];
  }
}

function combinarFuentes(actuales, nuevas) {
  const mapa = new Map();
  for (const fuente of [...actuales, ...nuevas]) {
    if (!fuente?.url) continue;
    const clave = fuente.url + "|" + fuente.titulo;
    if (!mapa.has(clave)) mapa.set(clave, fuente);
  }
  return [...mapa.values()]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 12);
}

async function estimarCategoria(nombre, anio, veces, apiKey) {
  const prompt = `Nombre: "${nombre}"
Año del alza: ${anio || "sin dato"}
Magnitud estimada: ${veces || "sin dato"}x
País: Chile.

Estima la categoría más probable del alza y, si puedes, una causa breve.
Usa conocimiento general. No cites fuentes ni inventes URLs. La causa es una
hipótesis tuya: no la presentes como un dato verificado.

Categorías permitidas:
${CATEGORIAS.map((c) => `- ${c}`).join("\n")}

Reglas:
- Si no existe ninguna referencia cultural, religiosa, migratoria, política,
  deportiva o de moda plausible para ese nombre y año, devuelve
  categoria "Sin identificar".
- Si el nombre es común pero no hay un evento claro, puedes usar
  "Moda / tendencia" o "Religión / tradición" cuando corresponda.
- No inventes un evento, programa o persona que no exista.
- La causa debe ser breve y coherente con el año del alza.

Devuelve SOLO:
{
  "categoria": "una de las categorías",
  "causa": "frase breve o cadena vacía",
  "confianza": "Alta" | "Media" | "Baja",
  "tipo": "estimada_ia"
}`;

  try {
    const raw = await consultarModelo(
      apiKey,
      "Eres un analista de nombres chilenos. Haces estimaciones razonadas y transparentes, sin inventar fuentes. Respondes con JSON válido.",
      prompt,
      650
    );

    const categoria = categoriaValida(raw?.categoria);
    if (!categoria || categoria === "Sin identificar") return null;

    let causa = String(raw?.causa || "").trim().slice(0, 320);
    if (!causa || pareceSinCausa(causa)) {
      causa = "Categoría estimada por IA a partir del nombre y el año del alza.";
    }

    const confianza = ["Alta", "Media", "Baja"].includes(raw?.confianza)
      ? raw.confianza
      : "Baja";

    return {
      categoria,
      categoria_viz: GRUPO[categoria] || "Sin identificar",
      causa,
      fuente: "",
      fuente_titulo: "",
      evidencia: "",
      tipo: "estimada_ia",
      categoria_estimada_ia: true,
      confianza,
      fuentes: [],
    };
  } catch (error) {
    console.error("Estimación:", error.message);
    return null;
  }
}

function completarCausaProbable(resultado, nombre, anio, fuentes) {
  if (resultado) {
    return {
      ...resultado,
      fuentes: resumenFuentes(fuentes),
    };
  }

  const probable = elegirCausaProbable(nombre, anio, fuentes);
  if (!probable) return resultadoSinCausa(fuentes);

  return {
    ...probable,
    categoria_viz: GRUPO[probable.categoria] || "Sin identificar",
    fuentes: resumenFuentes(fuentes),
  };
}

async function manejarCausa(body, env, origin) {
  const nombre = String(body?.nombre || "").trim();
  const anio = Number(body?.anio);
  const veces = Number(body?.veces);

  if (!/^[\p{L}\s'.-]{2,40}$/u.test(nombre)) {
    return respuestaJson(
      { error: "Nombre inválido. Usa solo letras y espacios." },
      400,
      origin
    );
  }

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return respuestaJson(
      { error: "Falta configurar DEEPSEEK_API_KEY en el Worker." },
      500,
      origin
    );
  }

  let fuentes = [];
  try {
    fuentes = await buscarFuentes(nombre, Number.isFinite(anio) ? anio : null, env);
  } catch {
    fuentes = [];
  }

  // Si no apareció una obra/programa claro, pedimos al modelo que proponga
  // búsquedas más específicas y volvemos a buscar. Esto mejora nombres cuyo
  // motivo no aparece con una búsqueda genérica.
  if (!fuentes.some((f) => f.tipo)) {
    const consultas = await generarConsultas(
      nombre,
      Number.isFinite(anio) ? anio : null,
      apiKey
    );
    if (consultas.length) {
      try {
        const extra = await buscarFuentes(
          nombre,
          Number.isFinite(anio) ? anio : null,
          env,
          consultas
        );
        fuentes = combinarFuentes(fuentes, extra);
      } catch {
        // Nos quedamos con las fuentes iniciales.
      }
    }
  }

  if (!fuentes.length) {
    const estimada = await estimarCategoria(nombre, anio, veces, apiKey);
    return respuestaJson(estimada || resultadoSinCausa(), 200, origin);
  }

  let raw = null;
  try {
    raw = await consultarModelo(
      apiKey,
      "Eres un investigador riguroso de nombres chilenos. Solo clasificas y citas fuentes entregadas. Nunca inventas hechos ni URLs. Distingues entre causa documentada y causa probable. Respondes siempre con JSON válido.",
      promptCausa(
        nombre,
        Number.isFinite(anio) ? anio : "sin dato",
        Number.isFinite(veces) ? veces : "sin dato",
        fuentes
      )
    );
  } catch (error) {
    console.error("Causa:", error.message);
  }

  const resultado = normalizarResultadoCausa(raw, fuentes, nombre, anio);
  const final = completarCausaProbable(resultado, nombre, anio, fuentes);

  if (final.tipo === "sin_causa") {
    const estimada = await estimarCategoria(nombre, anio, veces, apiKey);
    if (estimada) {
      return respuestaJson(
        { ...estimada, fuentes: resumenFuentes(fuentes) },
        200,
        origin
      );
    }
  }

  return respuestaJson(final, 200, origin);
}

async function manejarEstimar(body, env, origin) {
  const nombre = String(body?.nombre || "").trim();
  const anio = Number(body?.anio);
  const veces = Number(body?.veces);

  if (!/^[\p{L}\s'.-]{2,40}$/u.test(nombre)) {
    return respuestaJson(
      { error: "Nombre inválido. Usa solo letras y espacios." },
      400,
      origin
    );
  }

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return respuestaJson(
      { error: "Falta configurar DEEPSEEK_API_KEY en el Worker." },
      500,
      origin
    );
  }

  const estimada = await estimarCategoria(nombre, anio, veces, apiKey);
  return respuestaJson(estimada || resultadoSinCausa(), 200, origin);
}

async function manejarBoom(body, env, origin) {
  const nombre = String(body?.nombre || "").trim();
  if (!/^[\p{L}\s'.-]{2,40}$/u.test(nombre)) {
    return respuestaJson(
      { error: "Nombre inválido. Usa solo letras y espacios." },
      400,
      origin
    );
  }

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return respuestaJson(
      { error: "Falta configurar DEEPSEEK_API_KEY en el Worker." },
      500,
      origin
    );
  }

  let fuentes = [];
  try {
    fuentes = await buscarFuentes(nombre, null, env);
  } catch {
    fuentes = [];
  }

  let raw = null;
  try {
    raw = await consultarModelo(
      apiKey,
      "Eres un analista de nombres chilenos. Estimas series plausibles y solo clasificas causas respaldadas por las fuentes entregadas. Distingues entre causa documentada y probable. Nunca inventas URLs. Respondes siempre con JSON válido.",
      promptBoom(nombre, fuentes),
      1100
    );
  } catch (error) {
    console.error("Boom:", error.message);
    return respuestaJson(
      { error: "No se pudo generar la estimación: " + error.message },
      502,
      origin
    );
  }

  let boom = construirBoom(nombre, raw);
  if (!boom) {
    return respuestaJson(
      { error: "La serie generada no tiene el formato esperado." },
      502,
      origin
    );
  }

  if (!fuentes.some((f) => f.tipo)) {
    const consultas = await generarConsultas(nombre, boom.anio, apiKey);
    if (consultas.length) {
      try {
        const extra = await buscarFuentes(nombre, boom.anio, env, consultas);
        fuentes = combinarFuentes(fuentes, extra);
      } catch {
        // Nos quedamos con las fuentes iniciales.
      }
    }
  }

  let causa = completarCausaProbable(
    normalizarResultadoCausa(raw, fuentes, nombre, boom.anio),
    nombre,
    boom.anio,
    fuentes
  );

  if (causa.tipo === "sin_causa") {
    const estimada = await estimarCategoria(
      nombre,
      boom.anio,
      boom.veces,
      apiKey
    );
    if (estimada) {
      causa = { ...estimada, fuentes: resumenFuentes(fuentes) };
      if (estimada.categoria !== boom.categoria) {
        boom =
          construirBoom(nombre, {
            ...raw,
            categoria: estimada.categoria,
          }) || boom;
      }
    }
  }

  if (causa.tipo === "sin_causa") {
    boom.categoria = "Sin identificar";
    boom.categoria_viz = "Sin identificar";
    boom.causa = "Sin causa verificada";
    boom.fuente = "";
    boom.fuente_titulo = "";
    boom.evidencia = "";
    boom.causa_tipo = "sin_causa";
    boom.categoria_estimada_ia = false;
    boom.causa_ia = false;
  } else {
    boom.categoria = causa.categoria;
    boom.categoria_viz = causa.categoria_viz;
    boom.causa = causa.causa;
    boom.fuente = causa.fuente;
    boom.fuente_titulo = causa.fuente_titulo;
    boom.evidencia = causa.evidencia;
    boom.causa_tipo = causa.tipo;
    boom.categoria_estimada_ia = !!causa.categoria_estimada_ia;
    boom.causa_ia = true;
  }

  boom.fuentes = causa.fuentes;
  boom.confianza = "Estimada";
  boom.ia = true;

  return respuestaJson(boom, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cabecerasCors(origin) });
    }

    if (request.method !== "POST") {
      return respuestaJson({ error: "Método no permitido." }, 405, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return respuestaJson({ error: "JSON inválido." }, 400, origin);
    }

    if (path === "/api/causa") {
      return manejarCausa(body, env, origin);
    }

    if (path === "/api/estimar") {
      return manejarEstimar(body, env, origin);
    }

    if (path === "/api/boom" || path === "/") {
      return manejarBoom(body, env, origin);
    }

    return respuestaJson({ error: "Ruta no encontrada." }, 404, origin);
  },
};
