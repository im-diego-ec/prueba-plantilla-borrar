// Base de cobertura compartida del monorepo. Vive en la RAIZ y cada paquete la
// extiende desde su propia config:
//
//   // web/vite.config.ts
//   import { defineConfig } from "vitest/config";
//   import { coberturaDelMarco } from "../vitest.config.base.mjs";
//   export default defineConfig({ test: { ...coberturaDelMarco() } });
//
// POR QUE ESTO LO REPARTE EL MARCO Y NO LO ESCRIBE CADA PAQUETE. El umbral del
// total no es una preferencia del paquete: es el minimo del area. Cuando cada
// paquete lo escribia solo, el numero terminaba siendo el que su propia medicion
// daba ese dia. La firma de ese modo de fijarlo es visible: un umbral con
// decimales (functions: 70.6 y parecidos) no es una vara que alguien eligio, es
// la medicion copiada, y no exige nada porque ya esta cumplida por construccion
// en el instante en que se escribe — solo puede bajar despues, nunca subir.
// Repartirlo desde aca hace que un paquete nuevo NAZCA con el piso del marco.
//
// LA OTRA MITAD DE LA COMPUERTA NO ESTA ACA, Y ES A PROPOSITO. Estos umbrales
// los hace cumplir vitest cuando corren las pruebas del paquete, asi que
// bajarlos es una linea de diff bajo review. Pero un umbral que el propio
// paquete puede bajar no es un piso: por eso la action cobertura-diff del marco
// mide el total POR SU CUENTA, desde el lcov, contra el minimo del marco, y ahi
// el umbral local solo puede SUBIR la exigencia. Medido: bajar estos cuatro
// numeros a 40 daba EXIT 0 en toda la integracion.
//
// SI UN PAQUETE TODAVIA NO LLEGA AL MINIMO no se baja el umbral: se declara la
// deuda en SU package.json, con motivo y con fecha, y el marco la reporta en
// cada corrida hasta que se paga o vence.
//
//   "projects": { "cobertura": {
//       "piso":  { "lineas": 71.2, "funciones": 70.6, "ramas": 68.0 },
//       "deuda": { "motivo": "deuda heredada al absorber el paquete; el plan
//                              esta en el issue N",
//                  "fecha": "AAAA-MM-DD" } } }
//
// OJO CON EL PISO: solo se declaran las metricas que el reporte de este paquete
// EMITE. Un piso sobre una metrica que llega sin un solo dato es ROJO, y a
// proposito: el piso es un ratchet y un ratchet que no tiene contra que comparar
// dejo de proteger la ganancia acumulada. Antes de esa regla, apagar el ratchet
// de un paquete costaba lo mismo que cambiar el reporter o recortar el `include`, y
// la corrida seguia en verde imprimiendo "n/a". Un paquete sin ramas no declara
// "ramas".
//
// Y NO HACE FALTA DECLARAR NADA PARA QUE APAGAR UNA METRICA SEA ROJO. El marco
// compara los items que llegan contra el denominador que el propio reporte
// declara por registro (LF:, FNF:, BRF:), asi que "FNF:0" —el reporter diciendo
// que midio funciones y no habia ninguna— pasa como n/a, y un reporte sin FNF: y
// sin un solo FN: no pasa: eso es no medir. Las dos formas de romperlo, medidas
// sobre un reporte real de un paquete que estaba a 70,70% de funciones: sacarle
// los registros de funciones convertia el rojo en EXIT 0 sin un solo aviso, y
// borrarle solo los registros sin cubrir, dejando FNF: intacto, publicaba 95,83%
// con la fila en OK. Un denominador corto no baja la cobertura: la infla.
//
// POR QUE .mjs Y NO .ts, que seria lo esperable en este stack: un .ts en la
// raiz del monorepo no cae bajo el tsconfig de ningun paquete, asi que el censo
// de fuentes lo marcaria como archivo sin programa de tipos y el repo nuevo
// nace en rojo. Un .mjs no necesita programa de tipos (el censo solo se lo
// exige a los lenguajes que tienen verificacion de tipos) y el linter si lo
// mira, porque el ignore de eslint apunta a "*.config.mjs" y este archivo no
// termina asi. O sea: visible para las dos herramientas, sin declarar ninguna
// exclusion. Si lo renombras a .ts, agregale su tsconfig o su exclusion con
// motivo escrito.

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** La raiz del monorepo: este archivo vive ahi. */
export const RAIZ_DEL_MONOREPO = dirname(fileURLToPath(import.meta.url));

/**
 * El minimo del area, en un solo lugar. Un paquete puede exigir MAS pasandole
 * otro numero; menos, no: el marco lo vuelve a comprobar contra 80 desde el
 * lcov y la integracion falla igual.
 */
export const MINIMO_DEL_MARCO = 80;

export function coberturaDelMarco(minimo = MINIMO_DEL_MARCO) {
  return {
    coverage: {
      provider: "v8",

      // QUE ENTRA AL CALCULO, Y POR QUE ES LA MITAD DE LA COMPUERTA. El reporte
      // tiene que traer TAMBIEN los archivos que ninguna prueba importo: si
      // solo trajera los importados, el modulo que nadie prueba no baja el
      // promedio —simplemente no existe— y el paquete queda verde contra si
      // mismo. El plano del total del marco lo detectaria como archivo sin dato
      // de cobertura, pero el umbral de aca abajo no.
      //
      // ESO YA NO SE PIDE CON `all: true`. La incertidumbre que este bloque
      // declaraba mientras el stack estaba en vitest 2.x quedo resuelta al subir
      // la mayor, y la respuesta es que la opcion DESAPARECIO: hoy el alcance lo
      // fija `include` y nada mas. MEDIDO en vitest 4.1.11, sobre un andamio
      // recien instanciado y agregandole un `web/src/huerfano.ts` que ninguna
      // prueba importa: con `all: true` y sin `all: true` el reporte lo trae
      // igual, en 0%, y baja el total del paquete de 100% a 91,66%. O sea la
      // opcion habria quedado INERTE, y una opcion inerte con un comentario que
      // la declara load-bearing es peor que no tenerla: el proximo que la lea va
      // a creer que la compuerta la sostiene ella.
      //
      // src y nada mas: la config, los scripts y los generados no son codigo que
      // a este paquete le corresponda probar. Lo que se saca a proposito se
      // declara en projects.cobertura.excluidos del package.json, con su motivo
      // escrito, y ahi lo ve el marco tambien.
      include: ["src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],

      reportsDirectory: "coverage",

      // projectRoot en la raiz del MONOREPO, no del paquete: las rutas SF: del
      // lcov tienen que ser comparables contra las de git. Sin esto dos
      // paquetes emiten "src/..." indistinguibles entre si, la action no puede
      // decir a que archivo corresponde cada linea y da rojo por rutas
      // ambiguas. Es el error de cableado numero uno de un monorepo.
      reporter: [
        ["text", {}],
        ["lcov", { projectRoot: RAIZ_DEL_MONOREPO }],
      ],

      // Los cuatro umbrales del TOTAL del paquete. statements no es redundante
      // con lines: una linea con varias sentencias puede estar "cubierta" con
      // sentencias sin ejecutar.
      thresholds: {
        lines: minimo,
        functions: minimo,
        branches: minimo,
        statements: minimo,
      },
    },
  };
}
