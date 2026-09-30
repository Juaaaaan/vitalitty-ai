import type { NextConfig } from "next";

/**
 * Una sola configuración exportada.
 *
 * Antes este fichero definía dos: un `module.exports` con el límite de body y un
 * `export default` vacío. En un config ESM solo se lee el `export default`, así
 * que el límite nunca estuvo en vigor y cualquier opción añadida al otro bloque
 * habría sido ignorada en silencio — incluido `serverExternalPackages`, cuyo
 * olvido hace fallar el render de PDF en Vercel con un error de empaquetado
 * difícil de leer.
 */
const nextConfig: NextConfig = {
  // Chromium y su driver no se pueden empaquetar: son binarios que deben
  // resolverse en tiempo de ejecución desde node_modules de la función.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
