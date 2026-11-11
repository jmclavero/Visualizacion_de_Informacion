# API de nombres (Cloudflare Worker)

Este Worker mantiene las API keys fuera del navegador. El sitio estático solo
conoce la URL del Worker. Hace dos cosas:

1. **Causas reales**: busca en Tavily (opcional), Wikipedia en español y Google
   News RSS, y le pide a DeepSeek que clasifique y cite **solo** esas fuentes.
2. **Estimaciones IA**: para nombres sin datos reales suficientes, estima un
   boom 1920-2025. La serie se marca como `ia: true`.

Si no hay una fuente real que respalde una causa, responde
`"Sin causa verificada"` y `"Sin identificar"`. Nunca inventa URLs.

## Desplegarlo gratis

### Opción rápida: panel de Cloudflare

1. Crea una cuenta gratuita en <https://dash.cloudflare.com/>.
2. Ve a **Workers & Pages → Create → Worker**.
3. Ponle un nombre, por ejemplo `nombres-api`.
4. En el editor, borra el código de ejemplo y pega **todo** el contenido de
   `worker/standalone.js`.
5. En **Settings → Variables and Secrets**, agrega un **Secret** llamado
   `DEEPSEEK_API_KEY` con tu API key de DeepSeek.
6. Opcional: agrega otro Secret `TAVILY_API_KEY` para mejorar la búsqueda. Sin
   él, el Worker igual usa Wikipedia y Google News.
7. Deploy. Copia la URL del Worker.
8. En `E2/v2/api-config.js` ajusta las dos URLs:
   ```js
   window.API_BOOM_URL = "https://TU-WORKER.workers.dev/api/boom";
   window.API_CAUSA_URL = "https://TU-WORKER.workers.dev/api/causa";
   ```

### Opción con Wrangler

```bash
cd worker
npm install -g wrangler
wrangler login
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put TAVILY_API_KEY   # opcional
wrangler deploy
```

Para regenerar el archivo único que se pega en el panel:

```bash
node worker/build-standalone.mjs
```

## Endpoints

### `POST /api/causa`

Para un nombre real con alza. Busca fuentes y clasifica la causa.

```json
{ "nombre": "Yesenia", "anio": 1989, "veces": 5.2 }
```

Respuesta con causa verificada:

```json
{
  "categoria": "Teleserie",
  "categoria_viz": "Teleseries",
  "causa": "La telenovela Yesenia popularizó el nombre.",
  "fuente": "https://es.wikipedia.org/wiki/Yesenia_(telenovela_de_1987)",
  "confianza": "Media"
}
```

Sin fuente válida:

```json
{
  "categoria": "Sin identificar",
  "categoria_viz": "Sin identificar",
  "causa": "Sin causa verificada",
  "fuente": "",
  "confianza": "Sin verificar"
}
```

### `POST /api/boom`

Para nombres sin datos reales suficientes. Devuelve una serie estimada de 106
años (1920-2025) y `"ia": true`.

```json
{ "nombre": "Zzyzx" }
```

La causa solo se acepta si viene respaldada por una URL de las fuentes
encontradas; si no, también devuelve `"Sin causa verificada"`.

## Seguridad

- Las keys viven solo en los Secrets del Worker.
- CORS permite GitHub Pages (`jmclavero.github.io`) y `localhost`.
- El Worker valida el nombre, las categorías y que la URL citada exista entre
  las fuentes reales.
- No subas `.dev.vars` ni `.env` al repositorio.
