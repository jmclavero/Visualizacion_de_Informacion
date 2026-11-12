import { construirBoom, CATEGORIAS, GRUPO } from "./boom.js";
import {
  buscarFuentes,
  elegirCausaProbable,
  formatearFuentes,
  normalizarTexto,
  obtenerFuente,
  resumenFuentes,
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
