# API de DeepSeek para los nombres (Cloudflare Worker)

Este Worker mantiene la API key fuera del navegador. El sitio estático solo
conoce la URL del Worker.

## Desplegarlo gratis

1. Crea una cuenta gratuita en <https://dash.cloudflare.com/>.
2. Ve a **Workers & Pages → Create → Worker**.
3. Ponle un nombre, por ejemplo `nombres-boom-api`.
4. Reemplaza el código de ejemplo por el contenido de `worker/index.js` y
   `worker/boom.js` (o despliega con Wrangler, ver abajo).
5. En **Settings → Variables and Secrets**, agrega un **Secret** llamado
   `DEEPSEEK_API_KEY` con tu API key de DeepSeek. No la pongas en el código.
6. Deploy. Copia la URL del Worker, por ejemplo:
   `https://nombres-boom-api.TU-SUBDOMINIO.workers.dev`
7. En `E2/v1/api-config.js` reemplaza el valor por:
   ```js
   window.API_BOOM_URL = "https://nombres-boom-api.TU-SUBDOMINIO.workers.dev/api/boom";
   ```

## Con Wrangler (alternativa)

```bash
npm install -g wrangler
wrangler login
cd worker
wrangler secret put DEEPSEEK_API_KEY
wrangler deploy
```

## Endpoint

`POST /api/boom`

```json
{ "nombre": "Yesenia" }
```

Devuelve el boom en el formato de la visualización:

```json
{
  "nombre": "Yesenia",
  "sexo": "F",
  "anio": 1989,
  "prev": 393,
  "n": 2046,
  "extra": 1653,
  "veces": 5.2,
  "categoria": "Teleserie",
  "categoria_viz": "Teleseries",
  "causa": "…",
  "confianza": "Estimada",
  "fuente": "",
  "serie": [106 números],
  "ia": true
}
```

## Seguridad

- La key vive solo en el secret `DEEPSEEK_API_KEY`.
- CORS permite GitHub Pages y `localhost`.
- El Worker valida el nombre y normaliza la respuesta.
- No subas `.dev.vars` ni `.env` al repositorio.
