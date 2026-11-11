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

/**
 * Genera una serie anual plausible cuando el modelo no entrega una serie
 * utilizable. El año y la magnitud los decide el modelo.
 */
function generarSerie(anioBoom, veces, nombre) {
  const indiceBoom = Math.max(
    12,
    Math.min(N_ANIOS - 1, anioBoom - ANIO_MIN)
  );
  const semilla = hashNombre(nombre);
  const base = 12 + (semilla % 35); // 12..46
  const pico = Math.max(base + 10, Math.round(base * veces));
  const serie = [];

  for (let i = 0; i < N_ANIOS; i++) {
    let v;
    if (i < indiceBoom - 3) {
      const t = i / Math.max(1, indiceBoom - 3);
      v = base * (0.25 + 0.75 * t);
    } else if (i < indiceBoom) {
      v = base;
    } else if (i === indiceBoom) {
      v = pico;
    } else {
      const d = i - indiceBoom;
      v = pico * Math.exp(-d / 5.5) + base * 0.06;
    }

    // Variación determinista para que no sea una línea perfecta.
    if (i < indiceBoom - 3 || i > indiceBoom) {
      v += ((semilla + i * 7) % 7) - 3;
    }
    serie.push(Math.max(0, Math.round(v)));
  }
  return serie;
}

function detectarBoom(serie) {
  let mejor = null;
  for (let i = 3; i < N_ANIOS; i++) {
    const previo = (serie[i - 1] + serie[i - 2] + serie[i - 3]) / 3;
    if (previo <= 0) continue;
    const ratio = serie[i] / previo;
    if (!mejor || ratio > mejor.ratio) {
      mejor = { i, ratio, previo };
    }
  }

  if (!mejor) {
    let iMax = 0;
    for (let i = 1; i < N_ANIOS; i++) {
      if (serie[i] > serie[iMax]) iMax = i;
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
    ? Math.max(2, Math.min(30, vecesModelo))
    : 8;

  const serie = generarSerie(anioBoom, vecesObjetivo, nombre);
  const boom = detectarBoom(serie);
  if (!boom) return null;

  const anio = ANIO_MIN + boom.i;
  const n = serie[boom.i];
  const prev = Math.round(boom.previo);
  const extra = n - prev;
  const veces = prev > 0 ? Math.round((n / prev) * 10) / 10 : 0;

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

const MAX_FUENTES = 8;
const MAX_TEXTO = 700;

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

function normalizarUrl(url) {
  return String(url || "")
    .trim()
    .replace(/[),.;]+$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

async function fetchJson(url, opciones = {}, timeout = 9000) {
  const respuesta = await fetch(url, {
    ...opciones,
    signal: AbortSignal.timeout(timeout),
  });
  if (!respuesta.ok) return null;
  return respuesta.json();
}

async function buscarTavily(nombre, anio, apiKey) {
  if (!apiKey) return [];
  const consulta = `"${nombre}" Chile ${anio || ""} nombre famoso causa`.trim();
  try {
    const data = await fetchJson(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: consulta,
          search_depth: "basic",
          max_results: 5,
          include_answer: false,
          include_raw_content: false,
        }),
      },
      12000
    );
    return (data?.results || [])
      .filter((r) => r && r.url)
      .map((r) => ({
        origen: "Tavily",
        titulo: recortar(r.title || r.url, 180),
        url: String(r.url),
        texto: recortar(r.content || ""),
      }));
  } catch {
    return [];
  }
}

async function buscarWikipedia(nombre, anio) {
  // Buscamos el nombre exacto: así aparecen telenovelas, series, canciones o
  // personajes homónimos, que son las causas típicas de un alza. El año del
  // boom no siempre coincide con el año de la obra, por eso no lo forzamos.
  const consulta = `"${nombre}"`;
  try {
    const busqueda = await fetchJson(
      "https://es.wikipedia.org/w/api.php?" +
        new URLSearchParams({
          action: "query",
          list: "search",
          srsearch: consulta,
          srlimit: "4",
          format: "json",
          formatversion: "2",
          utf8: "1",
          origin: "*",
        })
    );
    const resultados = busqueda?.query?.search || [];
    if (!resultados.length) return [];

    const titulos = resultados.map((r) => r.title).join("|");
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
          })
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
      url: "https://es.wikipedia.org/wiki/" + encodeURIComponent(r.title.replace(/ /g, "_")),
      texto: recortar(extractos[r.title] || r.snippet || ""),
    }));
  } catch {
    return [];
  }
}

async function buscarGoogleNews(nombre, anio) {
  const consulta = `"${nombre}" Chile ${anio || ""} nombre`;
  const url =
    "https://news.google.com/rss/search?" +
    new URLSearchParams({
      q: consulta.trim(),
      hl: "es-CL",
      gl: "CL",
      ceid: "CL:es",
    });

  try {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!respuesta.ok) return [];
    const xml = await respuesta.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 5);

    return items
      .map((m) => {
        const bloque = m[1];
        const tag = (nombreTag) => {
          const encontrado = bloque.match(
            new RegExp(`<${nombreTag}[^>]*>([\\s\\S]*?)<\\/${nombreTag}>`, "i")
          );
          return encontrado ? encontrado[1] : "";
        };
        return {
          origen: "Google News",
          titulo: recortar(tag("title"), 180),
          url: limpiarHtml(tag("link")),
          texto: recortar(tag("description")),
        };
      })
      .filter((f) => f.url && /^https?:\/\//i.test(f.url));
  } catch {
    return [];
  }
}

/**
 * Devuelve una lista de fuentes reales deduplicadas.
 * Nunca inventa fuentes: si todas las búsquedas fallan, devuelve [].
 */
async function buscarFuentes(nombre, anio, env = {}) {
  const [tavily, wikipedia, noticias] = await Promise.all([
    buscarTavily(nombre, anio, env.TAVILY_API_KEY),
    buscarWikipedia(nombre, anio),
    buscarGoogleNews(nombre, anio),
  ]);

  const vistos = new Set();
  const fuentes = [];
  for (const fuente of [...tavily, ...wikipedia, ...noticias]) {
    const clave = normalizarUrl(fuente.url) + "|" + fuente.titulo.toLowerCase();
    if (!fuente.url || vistos.has(clave)) continue;
    vistos.add(clave);
    fuentes.push(fuente);
    if (fuentes.length >= MAX_FUENTES) break;
  }
  return fuentes;
}

function formatearFuentes(fuentes) {
  return fuentes
    .map(
      (f, i) =>
        `[${i + 1}] (${f.origen}) ${f.titulo}\nURL: ${f.url}\n${f.texto}`
    )
    .join("\n\n");
}

function obtenerFuente(url, fuentes) {
  const buscada = normalizarUrl(url);
  if (!buscada) return null;
  return fuentes.find((f) => normalizarUrl(f.url) === buscada) || null;
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

function resultadoSinCausa() {
  return {
    categoria: "Sin identificar",
    categoria_viz: "Sin identificar",
    causa: "Sin causa verificada",
    fuente: "",
    confianza: "Sin verificar",
  };
}

function promptCausa(nombre, anio, veces, fuentes) {
  return `Nombre: "${nombre}"
Año del alza real: ${anio}
Alza: ${veces}x en el Registro Civil de Chile.

Fuentes reales encontradas (usa SOLO estas):
${formatearFuentes(fuentes)}

Clasifica la causa del alza de este nombre en Chile usando únicamente las fuentes.
Categorías permitidas:
${CATEGORIAS.map((c) => `- ${c}`).join("\n")}

Reglas obligatorias:
- No inventes hechos, años, programas, canciones ni personas.
- La causa debe ser una frase breve en español respaldada por una fuente.
- "fuente" debe ser la URL EXACTA de una de las fuentes de arriba.
- Si las fuentes no permiten sostener una causa con sentido, devuelve:
  categoria "Sin identificar", causa "Sin causa verificada", fuente "".
- No confundas una coincidencia de nombre con una causa.

Devuelve SOLO este JSON:
{
  "categoria": "una de las categorías",
  "causa": "frase breve",
  "fuente": "URL exacta o cadena vacía",
  "confianza": "Alta" | "Media" | "Baja" | "Sin verificar"
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
- Una magnitud de alza ("veces") entre 2 y 30.
- Una categoría de la lista, SOLO si una fuente la respalda.
- Una causa breve, SOLO si una fuente la respalda.
- El sexo asociado: "F", "M" o "Sin dato".

Categorías permitidas:
${CATEGORIAS.map((c) => `- ${c}`).join("\n")}

Reglas:
- No inventes una URL. Si no hay fuente que respalde la causa, usa
  categoria "Sin identificar", causa "Sin causa verificada", fuente "".
- Si sí hay una fuente, "fuente" debe ser su URL EXACTA.
- La serie anual la genera el backend; no la devuelvas.

Devuelve SOLO este JSON:
{
  "nombre": "${nombre}",
  "sexo": "F" | "M" | "Sin dato",
  "categoria": "una de las categorías",
  "anio_boom": 1989,
  "veces": 5.2,
  "causa": "frase breve",
  "fuente": "URL exacta o cadena vacía",
  "confianza": "Estimada"
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

  if (!fuentes.length) {
    return respuestaJson(resultadoSinCausa(), 200, origin);
  }

  let raw;
  try {
    raw = await consultarModelo(
      apiKey,
      "Eres un investigador riguroso de nombres chilenos. Solo clasificas y citas fuentes entregadas. Nunca inventas hechos ni URLs. Respondes siempre con JSON válido.",
      promptCausa(
        nombre,
        Number.isFinite(anio) ? anio : "sin dato",
        Number.isFinite(veces) ? veces : "sin dato",
        fuentes
      )
    );
  } catch (error) {
    console.error("Causa:", error.message);
    return respuestaJson(resultadoSinCausa(), 200, origin);
  }

  const categoria = categoriaValida(raw?.categoria);
  const causa = String(raw?.causa || "").trim().slice(0, 300);
  const fuente = obtenerFuente(raw?.fuente, fuentes);

  // Sin una fuente real citada y válida no hay causa verificada.
  if (
    !categoria ||
    categoria === "Sin identificar" ||
    !causa ||
    pareceSinCausa(causa) ||
    !fuente
  ) {
    return respuestaJson(resultadoSinCausa(), 200, origin);
  }

  const confianza = ["Alta", "Media", "Baja"].includes(raw?.confianza)
    ? raw.confianza
    : "Media";

  return respuestaJson(
    {
      categoria,
      categoria_viz: GRUPO[categoria] || "Sin identificar",
      causa,
      fuente: fuente.url,
      confianza,
    },
    200,
    origin
  );
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

  let raw;
  try {
    raw = await consultarModelo(
      apiKey,
      "Eres un analista de nombres chilenos. Estimas series plausibles y solo clasificas causas respaldadas por las fuentes entregadas. Nunca inventas URLs. Respondes siempre con JSON válido.",
      promptBoom(nombre, fuentes),
      1000
    );
  } catch (error) {
    console.error("Boom:", error.message);
    return respuestaJson(
      { error: "No se pudo generar la estimación: " + error.message },
      502,
      origin
    );
  }

  const boom = construirBoom(nombre, raw);
  if (!boom) {
    return respuestaJson(
      { error: "La serie generada no tiene el formato esperado." },
      502,
      origin
    );
  }

  const categoria = categoriaValida(raw?.categoria);
  const causa = String(raw?.causa || "").trim().slice(0, 300);
  const fuente = obtenerFuente(raw?.fuente, fuentes);

  if (
    !categoria ||
    categoria === "Sin identificar" ||
    !causa ||
    pareceSinCausa(causa) ||
    !fuente
  ) {
    boom.categoria = "Sin identificar";
    boom.categoria_viz = "Sin identificar";
    boom.causa = "Sin causa verificada";
    boom.fuente = "";
  } else {
    boom.categoria = categoria;
    boom.categoria_viz = GRUPO[categoria] || "Sin identificar";
    boom.causa = causa;
    boom.fuente = fuente.url;
  }

  boom.confianza = "Estimada";
  boom.ia = true;
  boom.causa_ia = !!boom.fuente;

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

    if (path === "/api/boom" || path === "/") {
      return manejarBoom(body, env, origin);
    }

    return respuestaJson({ error: "Ruta no encontrada." }, 404, origin);
  },
};
