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
  "Religión / tradición",
  "Moda / tendencia",
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
  "Religión / tradición": "No televisivas",
  "Moda / tendencia": "No televisivas",
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

const FORMAS = ["pico", "ola", "sostenido", "evento"];
const POPULARIDADES = {
  "muy raro": 6,
  raro: 12,
  "poco comun": 25,
  "poco común": 25,
  comun: 50,
  común: 50,
  "muy comun": 100,
  "muy común": 100,
};

function formaPorCategoria(categoria, semilla) {
  const mapa = {
    "Teleserie": "pico",
    "Música / Viña": "ola",
    "Series y animación": "pico",
    "TV en vivo": "evento",
    "Política, realeza y noticias": "evento",
    "Cine": "pico",
    "Deporte": "evento",
    "Ciencia y espacio": "evento",
    "Migración": "sostenido",
    "Religión / tradición": "sostenido",
    "Moda / tendencia": "ola",
    "Sin identificar": "ola",
  };
  const base = mapa[categoria] || "ola";
  // Pequeña variación para que dos nombres de la misma categoría no tengan
  // exactamente la misma forma.
  if (base === "pico" && semilla % 5 === 0) return "ola";
  if (base === "ola" && semilla % 7 === 0) return "pico";
  if (base === "evento" && semilla % 9 === 0) return "pico";
  return base;
}

function basePorPopularidad(popularidad, semilla) {
  const valor = String(popularidad || "").toLowerCase().trim();
  if (POPULARIDADES[valor]) return POPULARIDADES[valor];
  const numero = Number(popularidad);
  if (Number.isFinite(numero)) return Math.max(5, Math.min(180, Math.round(numero)));
  return 8 + (semilla % 53); // 8..60
}

/**
 * Genera una serie anual plausible cuando el modelo no entrega una serie
 * utilizable. No usa una única curva: cambia la forma, la base, el ancho del
 * pico, la caída y el ruido según el nombre y la categoría.
 */
function generarSerie(anioBoom, veces, nombre, categoria, forma, popularidad) {
  const indiceBoom = Math.max(
    8,
    Math.min(N_ANIOS - 2, anioBoom - ANIO_MIN)
  );
  const semilla = hashNombre(nombre);
  const base = basePorPopularidad(popularidad, semilla);
  const formaElegida =
    FORMAS.includes(String(forma || "").toLowerCase()) &&
    String(forma).toLowerCase() !== "sin_dato"
      ? String(forma).toLowerCase()
      : formaPorCategoria(categoria, semilla);
  const objetivo = Math.max(base + 8, Math.round(base * veces));
  const serie = [];

  const meseta =
    formaElegida === "evento"
      ? 0
      : formaElegida === "pico"
        ? semilla % 2
        : formaElegida === "ola"
          ? 2 + (semilla % 3)
          : 4 + (semilla % 5);
  const caida =
    formaElegida === "evento"
      ? 1.4
      : formaElegida === "pico"
        ? 2.5 + (semilla % 4)
        : formaElegida === "ola"
          ? 5 + (semilla % 5)
          : 10 + (semilla % 8);

  const inicioCrecimiento = Math.max(
    2,
    indiceBoom - (12 + (semilla % 20))
  );

  for (let i = 0; i < N_ANIOS; i++) {
    let v;

    if (i < indiceBoom) {
      if (i < inicioCrecimiento) {
        // El nombre empieza siendo raro y crece lentamente.
        const t = i / Math.max(1, inicioCrecimiento);
        v = base * (0.08 + 0.92 * Math.pow(t, 0.8));
      } else {
        // Los 3 años previos al pico están cerca de la base; así el alza
        // medida no queda inflada por una rampa artificial.
        const t =
          (i - inicioCrecimiento) /
          Math.max(1, indiceBoom - inicioCrecimiento);
        v = base * (0.9 + 0.1 * t);
      }
    } else if (i <= indiceBoom + meseta) {
      v = objetivo * (1 - ((i - indiceBoom) / Math.max(1, meseta + 1)) * 0.05);
    } else {
      const d = i - indiceBoom - meseta;
      v = objetivo * Math.exp(-d / caida) + base * 0.25;
    }

    // Ruido determinista y pequeño, no una línea perfecta.
    const ruido = (((semilla + i * 53) % 15) - 7) / 100;
    v += v * ruido;

    // Eco secundario ocasional, como en las series reales.
    if (
      semilla % 3 === 0 &&
      i === indiceBoom + meseta + 4 + (semilla % 3)
    ) {
      v += objetivo * 0.06;
    }

    serie.push(Math.max(0, Math.round(v)));
  }

  return serie;
}

function detectarPico(serie, indiceBoom) {
  const centro = Math.max(3, Math.min(N_ANIOS - 1, indiceBoom));
  const desde = Math.max(3, centro - 3);
  const hasta = Math.min(N_ANIOS - 1, centro + 5);

  let mejor = centro;
  let valor = serie[mejor] || 0;
  for (let i = desde; i <= hasta; i++) {
    if (serie[i] > valor) {
      valor = serie[i];
      mejor = i;
    }
  }
  return mejor;
}

function detectarBoom(serie, centro = null) {
  let mejor = null;
  const desde = centro === null ? 3 : Math.max(3, centro - 3);
  const hasta =
    centro === null ? N_ANIOS - 1 : Math.min(N_ANIOS - 1, centro + 5);

  for (let i = desde; i <= hasta; i++) {
    const previo = (serie[i - 1] + serie[i - 2] + serie[i - 3]) / 3;
    if (previo <= 0) continue;
    const ratio = serie[i] / previo;
    if (!mejor || ratio > mejor.ratio) {
      mejor = { i, ratio, previo };
    }
  }

  if (!mejor) {
    let iMax =
      centro === null
        ? 0
        : Math.max(3, Math.min(N_ANIOS - 1, Math.round(centro)));
    if (centro === null) {
      for (let i = 1; i < N_ANIOS; i++) {
        if (serie[i] > serie[iMax]) iMax = i;
      }
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
    ? Math.max(2, Math.min(12, vecesModelo))
    : 5;

  const serie = generarSerie(
    anioBoom,
    vecesObjetivo,
    nombre,
    raw.categoria,
    raw.forma,
    raw.popularidad
  );
  const boom = detectarBoom(serie, anioBoom - ANIO_MIN);
  if (!boom) return null;

  const anio = ANIO_MIN + boom.i;
  const n = serie[boom.i];
  const prev = Math.round(boom.previo);
  const extra = n - prev;
  const veces =
    boom.previo > 0 ? Math.round((n / boom.previo) * 10) / 10 : 0;

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
