import { construirBoom, CATEGORIAS } from "./boom.js";

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
