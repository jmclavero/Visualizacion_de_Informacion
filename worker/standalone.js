export const ANIO_MIN = 1920;
export const ANIO_MAX = 2025;
export const N_ANIOS = ANIO_MAX - ANIO_MIN + 1; // 106

export const CATEGORIAS = [
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

export const GRUPO = {
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

function hashNombre(nombre) {
  let h = 2166136261;
  const texto = normalizarNombre(nombre);
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizarSerie(valor) {
  if (!Array.isArray(valor)) return null;
  const serie = valor.map((v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  if (serie.length < N_ANIOS) {
    return serie.concat(Array(N_ANIOS - serie.length).fill(0));
  }
  return serie.slice(0, N_ANIOS);
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
 * Si el modelo trae una serie con un alza clara, se usa. Si no, se genera
 * una serie a partir de anio_boom y veces.
 */
export function construirBoom(nombre, raw) {
  if (!raw) return null;

  let serie = normalizarSerie(raw.serie);
  let boom = serie ? detectarBoom(serie) : null;

  // Si la serie viene vacía, plana o sin alza, generamos una plausible.
  if (!serie || !boom || boom.ratio < 1.2) {
    const anioModelo = Number(raw.anio_boom);
    const anioBoom = Number.isFinite(anioModelo)
      ? Math.max(1930, Math.min(ANIO_MAX, Math.round(anioModelo)))
      : 1980;
    const vecesModelo = Number(raw.veces);
    const veces = Number.isFinite(vecesModelo)
      ? Math.max(2, Math.min(30, vecesModelo))
      : 8;

    serie = generarSerie(anioBoom, veces, nombre);
    boom = detectarBoom(serie);
  }

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
  return `Estima la historia del nombre "${nombre}" en Chile.

Elige:
- Un año de boom entre 1930 y 2025.
- Una magnitud de alza ("veces") entre 2 y 30.
- Una categoría exactamente de esta lista:
${CATEGORIAS.map((c) => `- ${c}`).join("\n")}
- Una causa breve en español.
- El sexo asociado: "F", "M" o "Sin dato".

No devuelvas una serie anual: el backend la generará a partir del año y la magnitud.
No es necesario que los datos sean reales; son una estimación.

Devuelve SOLO un objeto JSON válido, sin markdown ni texto adicional:
{
  "nombre": "${nombre}",
  "sexo": "F" | "M" | "Sin dato",
  "categoria": "una de las categorías de la lista",
  "anio_boom": 1989,
  "veces": 5.2,
  "causa": "explicación breve en español"
}`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

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
                "Eres un analista de nombres chilenos. Respondes siempre con JSON válido y datos estimados, sin explicaciones fuera del JSON.",
            },
            { role: "user", content: prompt(nombre) },
          ],
          response_format: { type: "json_object" },
          temperature: 0.4,
          max_tokens: 1000,
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
        { error: "DeepSeek respondió con error " + deepseek.status + "." },
        502,
        origin
      );
    }

    let data;
    try {
      data = await deepseek.json();
    } catch {
      return respuestaJson({ error: "Respuesta inválida de DeepSeek." }, 502, origin);
    }

    const contenido = data?.choices?.[0]?.message?.content;
    if (!contenido) {
      return respuestaJson({ error: "DeepSeek no devolvió contenido." }, 502, origin);
    }

    let raw;
    try {
      raw = JSON.parse(limpiarJson(contenido));
    } catch {
      return respuestaJson(
        { error: "DeepSeek no devolvió un JSON válido." },
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
