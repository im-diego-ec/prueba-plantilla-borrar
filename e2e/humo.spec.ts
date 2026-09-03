import { expect, test } from "@playwright/test";

/**
 * El humo del andamio: comprueba que el ambiente desplegado sirve la aplicacion
 * y que el arranque del front no murio (el <div id="root"> con algo dentro).
 *
 * NO corre en el CI del PR (ver las excepciones de ci.yml): necesita una URL
 * desplegada. Se corre en la promocion, o local con
 *   E2E_BASE_URL=https://... pnpm -C e2e test
 *
 * Es el primer flujo, no el unico que va a haber: los flujos del producto se
 * agregan como archivos hermanos a medida que existan.
 */
test("la aplicacion desplegada monta su raiz", async ({ page, baseURL }) => {
  // Sin URL no hay nada que verificar, y una prueba que se saltea en silencio es
  // peor que una que falla: aca falla con el arreglo escrito.
  expect(
    baseURL,
    "falta E2E_BASE_URL: la suite E2E corre contra un ambiente desplegado"
  ).toBeTruthy();

  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty();
});
