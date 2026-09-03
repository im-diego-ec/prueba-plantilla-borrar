// api/vitest.config.ts
import { defineConfig } from "vitest/config";
import { coberturaDelMarco } from "../vitest.config.base.mjs";

/**
 * La cobertura NO se configura aca: se hereda de la raiz con
 * coberturaDelMarco(), que reparte el minimo del area, el `include` que hace que
 * la medicion abarque TODO el fuente del paquete (sin eso el total miente: el
 * modulo que nadie prueba no baja el promedio, desaparece) y el projectRoot del
 * reporter lcov en la raiz del monorepo (sin eso, api y web emiten rutas
 * indistinguibles y la compuerta de cobertura no sabe de quien es cada linea).
 * Un paquete puede EXIGIR mas pasandole otro numero; menos, no.
 */
export default defineConfig({
  test: {
    environment: "node",
    ...coberturaDelMarco(),
  },
});
