import { defineConfig } from "@playwright/test";

/**
 * Suite E2E de mi-proyecto: corre contra un ambiente YA DESPLEGADO (dev), no
 * contra localhost, y por eso NO es un paso del CI del PR sino de la promocion
 * — dev en verde es el permiso de prod. Esas son las dos entradas de EXCEPCIONES
 * que .github/workflows/ci.yml declara para este paquete (test y build).
 *
 * La URL viaja por variable de entorno y sin literal de dominio por default: un
 * default con el dominio de alguien mas es la forma de que una corrida local
 * apunte al ambiente equivocado sin que nada avise.
 */
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1, // ambiente compartido: los flujos se serializan a proposito
  retries: 0, // un flujo con escrituras reales no se reintenta a ciegas
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: "retain-on-failure", // el trace solo existe si fallo
  },
});
