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

export function normalizarTexto(value) {
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

export function detectarTipoFuente(titulo) {
  const texto = String(titulo || "");
  return TIPOS.find((tipo) => tipo.patron.test(texto)) || null;
}

/**
 * Solo consideramos que una fuente "es una obra" si el título empieza con el
 * nombre y luego viene el tipo entre paréntesis o tras dos puntos. Así
 * evitamos confundir una noticia sobre "Emilia ... nuevo disco" con una
 * canción llamada Emilia.
 */
export function tituloPareceObra(titulo, nombre) {
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
export async function buscarFuentes(nombre, anio, env = {}, consultasExtra = []) {
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

export function formatearFuentes(fuentes) {
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

export function obtenerFuente(url, fuentes) {
  const buscada = normalizarUrl(url);
  if (!buscada) return null;
  return fuentes.find((f) => normalizarUrl(f.url) === buscada) || null;
}

export function resumenFuentes(fuentes, max = 6) {
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
export function elegirCausaProbable(nombre, anio, fuentes) {
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
