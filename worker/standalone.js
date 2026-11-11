export const ANIO_MIN = 1920;
export const ANIO_MAX = 2025;
export const N_ANIOS = ANIO_MAX - ANIO_MIN + 1; // 106

export const CATEGORIAS = [
  "Teleserie",
  "MÃºsica / ViÃ±a",
  "Series y animaciÃ³n",
  "TV en vivo",
  "PolÃ­tica, realeza y noticias",
  "Cine",
  "Deporte",
  "Ciencia y espacio",
  "MigraciÃ³n",
  "Sin identificar",
];

export const GRUPO = {
  "Teleserie": "Teleseries",
  "MÃºsica / ViÃ±a": "MÃºsica / ViÃ±a",
  "Series y animaciÃ³n": "Otras causas televisivas",
  "TV en vivo": "Otras causas televisivas",
  "PolÃ­tica, realeza y noticias": "No televisivas",
  "Cine": "No televisivas",
  "Deporte": "No televisivas",
  "Ciencia y espacio": "No televisivas",
  "MigraciÃ³n": "No televisivas",
  "Sin identificar": "Sin identificar",
};

export function normalizarNombre(value) {
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

/**
 * Convierte la respuesta cruda del modelo en el formato de boom que usa la
 * visualizaciÃ³n. Calcula el aÃ±o de mayor alza a partir de la serie, para no
 * confiar en que el modelo haga esa cuenta.
 */
export function construirBoom(nombre, raw) {
  if (!raw || !Array.isArray(raw.serie)) return null;

  let serie = raw.serie.map((v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  });

  if (serie.length < N_ANIOS) {
    serie = serie.concat(Array(N_ANIOS - serie.length).fill(0));
  }
  if (serie.length > N_ANIOS) {
    serie = serie.slice(0, N_ANIOS);
  }

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

  const anio = ANIO_MIN + mejor.i;
  const n = serie[mejor.i];
  const prev = Math.round(mejor.previo);
  const extra = n - prev;
  const veces = prev > 0 ? Math.round((n / prev) * 10) / 10 : 0;

  const GRUPOS = [
    "Teleseries",
    "MÃºsica / ViÃ±a",
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


const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODELO = "deepseek-chat";

// OrÃ­genes permitidos: GitHub Pages y servidores locales de desarrollo.
const ORIGENES = new Set([
  "https://jmclavero.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function cabecerasCors(origin) {
  const permitido = ORIGENES.has(origin);
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

function prompt(nombre) {
  return `Genera una serie anual ESTIMADA de inscripciones de nacimiento para el nombre "${nombre}" en Chile, desde 1920 hasta 2025 inclusive (106 valores enteros no negativos, uno por aÃ±o).

La serie debe ser plausible: valores bajos o cero al principio, un alza marcada en el aÃ±o en que el nombre se hizo popular por televisiÃ³n, mÃºsica, cine, deporte, polÃ­tica, migraciÃ³n u otra causa, y luego una caÃ­da gradual. No es necesario que los datos sean reales; son una estimaciÃ³n.

Elige UNA categorÃ­a exactamente de esta lista:
${CATEGORIAS.map((c) => `- ${c}`).join("\n")}

Devuelve SOLO un objeto JSON vÃ¡lido, sin markdown ni texto adicional, con esta forma:
{
  "nombre": "${nombre}",
  "sexo": "F" | "M" | "Sin dato",
  "categoria": "una de las categorÃ­as de la lista",
  "causa": "explicaciÃ³n breve en espaÃ±ol",
  "serie": [106 nÃºmeros enteros]
}

La serie debe tener exactamente 106 valores: 1920, 1921, ..., 2025.`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cabecerasCors(origin) });
    }

    if (request.method !== "POST") {
      return respuestaJson({ error: "MÃ©todo no permitido." }, 405, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return respuestaJson({ error: "JSON invÃ¡lido." }, 400, origin);
    }

    const nombre = String(body?.nombre || "").trim();
    if (!/^[\p{L}\s'.-]{2,40}$/u.test(nombre)) {
      return respuestaJson(
        { error: "Nombre invÃ¡lido. Usa solo letras y espacios." },
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

    let deepseek;
    try {
      deepseek = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODELO,
          messages: [
            {
              role: "system",
              content:
                "Eres un analista de nombres chilenos. Respondes siempre con JSON vÃ¡lido y datos estimados, sin explicaciones fuera del JSON.",
            },
            { role: "user", content: prompt(nombre) },
          ],
          response_format: { type: "json_object" },
          temperature: 0.4,
          max_tokens: 3000,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      return respuestaJson(
        { error: "No se pudo contactar a DeepSeek: " + error.message },
        502,
        origin
      );
    }

    if (!deepseek.ok) {
      const detalle = await deepseek.text();
      console.error("DeepSeek error", deepseek.status, detalle.slice(0, 500));
      return respuestaJson(
        { error: "DeepSeek respondiÃ³ con error " + deepseek.status + "." },
        502,
        origin
      );
    }

    let data;
    try {
      data = await deepseek.json();
    } catch {
      return respuestaJson({ error: "Respuesta invÃ¡lida de DeepSeek." }, 502, origin);
    }

    const contenido = data?.choices?.[0]?.message?.content;
    if (!contenido) {
      return respuestaJson({ error: "DeepSeek no devolviÃ³ contenido." }, 502, origin);
    }

    let raw;
    try {
      raw = JSON.parse(limpiarJson(contenido));
    } catch {
      return respuestaJson(
        { error: "DeepSeek no devolviÃ³ un JSON vÃ¡lido." },
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

    return respuestaJson(boom, 200, origin);
  },
};

