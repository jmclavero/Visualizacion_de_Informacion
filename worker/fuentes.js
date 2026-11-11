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
export async function buscarFuentes(nombre, anio, env = {}) {
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

export function formatearFuentes(fuentes) {
  return fuentes
    .map(
      (f, i) =>
        `[${i + 1}] (${f.origen}) ${f.titulo}\nURL: ${f.url}\n${f.texto}`
    )
    .join("\n\n");
}

export function obtenerFuente(url, fuentes) {
  const buscada = normalizarUrl(url);
  if (!buscada) return null;
  return fuentes.find((f) => normalizarUrl(f.url) === buscada) || null;
}
