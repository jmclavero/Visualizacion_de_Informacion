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

/**
 * Convierte la respuesta cruda del modelo en el formato de boom que usa la
 * visualización. Calcula el año de mayor alza a partir de la serie, para no
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
