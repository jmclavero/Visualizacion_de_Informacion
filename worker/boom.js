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
export function construirBoom(nombre, raw) {
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
