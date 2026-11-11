import { construirBoom, CATEGORIAS, GRUPO } from "./boom.js";
import {
  buscarFuentes,
  formatearFuentes,
  obtenerFuente,
} from "./fuentes.js";

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
