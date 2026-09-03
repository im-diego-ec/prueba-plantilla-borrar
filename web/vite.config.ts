// [FRONT] Configuracion del frontend de mi-proyecto: build, servidor de dev y
// runner de pruebas. Este paquete ENTERO es el bloque [FRONT] del andamio — un
// proyecto sin interfaz borra el directorio web/ completo, la linea "web" de
// pnpm-workspace.yaml y los bloques marcados [FRONT] de eslint.config.mjs.
//
// POR QUE LA CONFIG DE PRUEBAS VIVE ACA Y NO EN UN vitest.config.ts PROPIO.
// Vitest lee la clave `test` del vite.config.ts del paquete, asi que un archivo
// aparte no compra nada y cuesta dos cosas concretas:
//   1. Las pruebas de componente tienen que correr con EL MISMO pipeline con el
//      que se construye la app (plugin de React, alias, variables VITE_*). Dos
//      archivos son dos verdades que se separan sin que nada avise: el dia que
//      el build gane un alias, las pruebas dejan de resolver ese import y el
//      arreglo no esta donde uno lo busca.
//   2. Un archivo mas que el linter no mira (su ignore global apunta a
//      **/*.config.ts) y que por lo tanto habria que declarar como exclusion en
//      package.json. Una exclusion menos es una decision menos que revisar.
// El propio vitest.config.base.mjs de la raiz documenta esta forma en su
// ejemplo. Si el proyecto llega a necesitar proyectos de vitest separados
// (unitarias vs. de navegador), ahi si conviene el archivo aparte, y entra con
// su motivo escrito.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { coberturaDelMarco } from "../vitest.config.base.mjs";

// `defineConfig` se importa de "vitest/config" y no de "vite": es el unico de
// los dos que tipa la clave `test`. Con el de vite hace falta la augmentation
// que viaja dentro de vitest, y esa augmentation tiene que aterrizar sobre la
// MISMA copia de vite que resuelve este paquete; cuando no coincide, el sintoma
// es TS2769 ("'test' does not exist in type 'UserConfigExport'"). La otra salida
// —un remap de rutas en el tsconfig para que las dos copias de vite resuelvan a
// una sola— arregla el sintoma pagando con una linea de configuracion que nadie
// va a saber por que esta. En tiempo de ejecucion las dos funciones son la
// misma: normalizan y devuelven el objeto.
const { coverage } = coberturaDelMarco();

export default defineConfig({
  // TAILWIND ENTRA COMO PLUGIN DE VITE, NO POR POSTCSS. Desde Tailwind 4 la
  // configuracion vive en la hoja de estilos (src/index.css) y el cableado es
  // este plugin: por eso este paquete ya no trae tailwind.config.js,
  // postcss.config.js ni autoprefixer. La via de postcss sigue existiendo
  // (@tailwindcss/postcss) y es la que corresponde a un proyecto que NO use
  // vite; aca la de vite es mas rapida y una pieza menos que mantener.
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  test: {
    // Los componentes de React necesitan un DOM. jsdom lo simula; solo lo
    // cargan las pruebas, el build no lo ve.
    //
    // GOTCHA MEDIDO en este entorno, para el dia que una prueba mire errores:
    // bajo jsdom, `instanceof Error` es FALSE para un DOMException (jsdom
    // expone el DOMException de Node y el Error de jsdom, que son realms
    // distintos). Si hay que reconocerlo, la comparacion que sirve es
    // `instanceof DOMException`.
    environment: "jsdom",

    // globals: true NO es pereza de imports —las pruebas de este paquete
    // importan describe/it/expect explicitamente—: Testing Library registra su
    // limpieza del DOM en un afterEach GLOBAL, y sin globals ese enganche no
    // existe, asi que el DOM de una prueba se filtra a la siguiente y aparecen
    // fallos que dependen del orden.
    globals: true,

    // La cobertura la reparte el marco desde la raiz (umbral del area, el
    // `include` que hace que la medicion abarque todo el fuente del paquete, y
    // el projectRoot del reporter lcov en la raiz del monorepo, que es lo que
    // hace comparables las rutas SF: entre paquetes). Va AL FINAL a proposito:
    // asi nadie la pisa mas abajo sin que el diff lo muestre.
    coverage: {
      ...coverage,
      // La lista del marco MAS lo de este paquete, concatenada y no
      // reemplazada: reemplazarla sacaria de la medicion los .d.ts y las
      // propias pruebas, que es lo contrario de lo que se quiere. El motivo de
      // cada exclusion vive en projects.cobertura.excluidos de package.json, donde
      // tambien lo lee el marco.
      exclude: [...coverage.exclude, "src/main.tsx"],
    },
  },
});
