// Genera worker/standalone.js (un solo archivo para pegar en Cloudflare).
// Uso: node worker/build-standalone.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const archivos = ["boom.js", "fuentes.js", "index.js"];

const partes = archivos.map((archivo) => {
  let codigo = fs.readFileSync(path.join(dir, archivo), "utf8");

  // Quita imports (los módulos se concatenan en orden).
  codigo = codigo.replace(
    /^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm,
    ""
  );

  // Quita "export" de declaraciones, pero conserva "export default".
  codigo = codigo.replace(
    /^export\s+(?=(?:const|let|var|function|async\s+function|class)\b)/gm,
    ""
  );

  return codigo.trim();
});

const salida = partes.join("\n\n") + "\n";
fs.writeFileSync(path.join(dir, "standalone.js"), salida, "utf8");
console.log(`standalone.js: ${salida.length} caracteres`);
