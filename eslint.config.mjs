// Flat config de ESLint 9 para el monorepo. Una sola config en la raiz que
// ESLint resuelve hacia arriba desde cada paquete (`eslint .` dentro de
// web/ o api/ usa esta).
//
// La POLITICA del marco, en cuatro lineas:
//   1. Reglas type-checked en ERROR sobre codigo FUENTE (no sobre config ni
//      generados). El lint corre con --max-warnings=0: no existe el "warning
//      tolerado" que nadie arregla.
//   2. La familia no-unsafe-* y no-explicit-any se apagan SOLO en tests, y es
//      una decision, no deuda (ver el bloque correspondiente).
//   3. `no-console` es ERROR en el codigo de producto del backend: todo log
//      pasa por la libreria de log estructurado.
//   4. `prettier` va SIEMPRE al final: apaga las reglas de formato que
//      colisionan con el formateador.
//
// ADAPTAR AL PROYECTO: los globs usan los paquetes de este repo. Los bloques
// marcados [FRONT] aplican solo si hay frontend React — si no lo hay, borralos
// junto a sus imports y a sus devDependencies.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks"; // [FRONT]
import reactRefresh from "eslint-plugin-react-refresh"; // [FRONT]
import pluginQuery from "@tanstack/eslint-plugin-query"; // [FRONT] solo con TanStack Query
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // No lintar generados/artefactos ni archivos de config.
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      // El reporte HTML de cobertura que escribe el propio `pnpm test`
      // (reportsDirectory: "coverage" en vitest.config.base.mjs). Sin esta
      // linea, `pnpm verificar` corrido DOS VECES en la misma maquina no lintea
      // lo mismo: la primera pasada mide el fuente del proyecto y la segunda le
      // suma seis archivos JS que genero la pasada anterior
      // (coverage/lcov-report/{block-navigation,prettify,sorter}.js por
      // paquete). Ya esta en .gitignore; el linter tambien tiene que saberlo.
      "**/coverage/**",
      // MISMO CASO QUE coverage/, medido en un sitio recien generado: `astro
      // build` escribe `<paquete>/.astro/{content,types}.d.ts` con los tipos de
      // las colecciones de contenido, y sin esta linea `pnpm verificar` sale 0
      // la primera vez y 1 la SEGUNDA —seis errores sobre archivos que la
      // persona no escribio y que la herramienta reescribe en cada compilacion—.
      "**/.astro/**",
      "**/*.config.js",
      "**/*.config.mjs",
      "**/*.config.ts",
      // Agregar aqui los directorios GENERADOS del proyecto. Ejemplos reales:
      //   "web/src/components/ui/**",  // componentes de UI generados
      //   "api/src/generated/**",      // cliente generado del ORM
    ],
  },

  // Base no type-checked para todo el TS/JS.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Reglas TYPE-CHECKED solo en codigo fuente (no-floating-promises necesita
  // informacion de tipos). projectService autodetecta el tsconfig de cada
  // paquete, asi que no hay que enumerar proyectos aqui.
  {
    files: ["api/src/**/*.ts", "web/src/**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Args no usados con prefijo _ son intencionales (p.ej. la firma de 4
      // argumentos que un errorHandler de Express exige).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Entorno Node: el backend, los scripts operativos (.mjs one-off, migraciones
  // de datos), la suite E2E (el runner orquesta el navegador DESDE Node) y las
  // herramientas de agente que reparte el marco.
  //
  // LA ULTIMA ENTRADA NO ES DECORATIVA, y se descubrio corriendo el lint sobre un
  // repo recien instanciado: el andamio reparte .claude/skills/projects-archive-change/
  // aplicar-deltas.mjs, que es un script de Node (usa process y console), y sin este
  // glob `pnpm lint` sale con 26 errores de no-undef sobre un archivo que el propio
  // marco escribio. O sea: el repo nuevo nacia ROJO antes de tener una linea de
  // codigo de producto. El arreglo es declarar su entorno, NO agregarlo a los
  // ignores: el archivo es codigo real y el linter tiene que mirarlo.
  {
    files: [
      "api/**/*.ts",
      "api/scripts/**/*.mjs",
      "scripts/**/*.mjs",
      "e2e/**/*.mjs",
      ".claude/skills/**/*.mjs",
    ],
    languageOptions: { globals: { ...globals.node } },
  },

  // Logging estructurado: en el codigo de producto del backend todo log pasa
  // por lib/log.ts (JSON consultable, niveles con semantica de alerta,
  // requestId automatico). console.* directo queda prohibido — log.ts es la
  // unica excepcion (disable inline en ese archivo) y los tests quedan fuera
  // (espian console y eso esta bien).
  {
    files: ["api/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: { "no-console": "error" },
  },

  // [FRONT] Entorno browser + React.
  {
    files: ["web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Error, no warning: las excepciones legitimas (entrypoint,
      // provider+hook en el mismo archivo) llevan disable POR ARCHIVO con su
      // porque escrito al lado.
      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
    },
  },

  // [FRONT] TanStack Query: reglas recomendadas, acotadas al frontend.
  ...pluginQuery.configs["flat/recommended"].map((c) => ({
    ...c,
    files: ["web/**/*.{ts,tsx}"],
  })),
  {
    files: ["web/**/*.{ts,tsx}"],
    rules: {
      // Una queryKey incompleta cachea respuestas de otra consulta: error.
      "@tanstack/query/exhaustive-deps": "error",
    },
  },

  // [FRONT] Promesas en el front: recommendedTypeChecked ya deja
  // no-floating-promises en ERROR (los fire-and-forget intencionales llevan
  // `void` explicito). Lo que se ajusta aqui es misused-promises:
  // checksVoidReturn.attributes=false porque el patron del repo es
  // onClick={handlerAsync} donde TODO handler atrapa internamente (red global
  // + try/catch) — el caso "atributo" es falso positivo; el resto de la regla
  // queda en error.
  {
    files: ["web/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // Tests: la familia no-unsafe-* y no-explicit-any quedan OFF — DECISION, no
  // deuda: el `.body` de un cliente HTTP de test es `any` por la libreria, y la
  // unica "correccion" posible son casts que el compilador NO verifica
  // (cumplimiento cosmetico). El contrato real lo verifican las aserciones del
  // test al ejecutarse. En codigo de producto estas reglas son ERROR (un any
  // ahi si esconde bugs que llegan a usuarios). Todo lo demas
  // (floating-promises, misused, unused-vars, ...) sigue activo tambien aqui.
  {
    files: ["**/*.test.{ts,tsx}", "api/src/test-helpers.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      // unbound-method: el patron expect(mock.metodo).toHaveBeenCalled() la
      // dispara siempre; typescript-eslint recomienda oficialmente apagarla en
      // tests (los mocks no dependen de `this`).
      "@typescript-eslint/unbound-method": "off",
    },
  },

  // [FRONT] IDENTIDAD VISUAL DEL AREA. Solo las reglas de marca que un ARBOL DE
  // SINTAXIS puede decidir por si solo. El manual completo (tokens, componentes,
  // tipografia, data viz) es la skill `la organización-design` de la organizacion; lo que
  // no se negocia vive en la constitucion del marco, seccion "Identidad visual y
  // el idioma del producto".
  //
  // QUE CUBRE Y QUE NO, contra las 7 reglas de esa seccion:
  //   marca-texto-oscuro-sobre-acento .... cubierta (1, 2)
  //   marca-solo-tokens .................. cubierta (3, 4, 5)
  //   marca-tema-y-foco .................. a medias (6, 7): el foco si; "los dos
  //                                        temas con su interruptor" no lo
  //                                        decide un arbol.
  //   marca-redaccion .................... a medias (8, 9): el formateo y los
  //                                        rotulos si; "mayuscula solo al
  //                                        principio de la frase" no.
  //   marca-el-logo-no-se-redibuja ....... cubierta (10)
  //   marca-idioma-castellano ............ NO: un arbol no juzga idioma. La fija
  //                                        el instalador al crear el repo.
  //   marca-lo-que-el-marco-no-transporta  NO, y a proposito: mientras la marca
  //                                        no entregue los archivos de la
  //                                        tipografia, el marco NO pone en rojo
  //                                        a nadie por tipografia. Poner el
  //                                        sello sobre una sustitucion la
  //                                        convertiria en la norma.
  //
  // POR QUE EN "error" Y NO EN AVISO. No hay opcion intermedia: este repo corre
  // `eslint . --max-warnings=0` (politica 1, arriba), asi que un "warn" YA es un
  // rojo. Y no hace falta estreno gradual: este archivo llega por el andamio, o
  // sea a un repo NUEVO, con cero violaciones. Un repo que ya existe no lo
  // recibe y adopta el bloque cuando quiera, en su propio PR.
  //
  // EL ALCANCE ES PROPIO, NO HEREDADO. Se acota con `files` al fuente de la
  // interfaz y NO se apoya en la lista global de `ignores` de arriba: un repo
  // puede haberla recortado (un consumidor borro "**/*.config.js") y estas
  // reglas no tienen por que depender de eso para no morder donde no deben.
  //
  // Y DESDE TAILWIND 4 EL LUGAR DONDE LOS VALORES DE MARCA SE ESCRIBEN NO ES UN
  // ARCHIVO DE CONFIGURACION SINO LA HOJA DE ESTILOS: el bloque `@theme` de
  // web/src/index.css. Eso saca ese archivo del alcance de este
  // linter por construccion —ESLint no analiza CSS— en vez de por una linea de
  // `ignores` que alguien puede borrar. Que esos valores COINCIDAN con los del
  // sistema sigue sin poder verlo un linter: eso lo verifica la revision de
  // artefactos.
  //
  // LIMITES DECLARADOS, y conviene leerlos antes de confiar:
  //   - El nombre de la clase del acento lo elige el proyecto. Aca se reconocen
  //     "orange" y "accent" en el nombre. Un proyecto que llame a su acento de
  //     otra forma se sale del alcance SIN QUE NADA AVISE. Derivarlo del token
  //     en vez de enumerarlo exige que el marco transporte los tokens, que es la
  //     pieza siguiente.
  //   - Los selectores ven strings en el codigo, no estilo computado: un color
  //     que llega por variable, por props o desde el servidor no se ve aca.
  {
    files: ["web/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        // (1)(2) BLANCO SOBRE EL ACENTO. La regla mas dura del sistema y la que
        // mas veces se rompio: blanco sobre naranja da 2.9:1 y FALLA WCAG AA; el
        // texto oscuro da 6.7:1. No existia en el kit del sistema, se escribio
        // aca. Van dos selectores porque la clase puede estar en un string
        // suelto (el caso comun, incluso DENTRO de una plantilla: ahi la parte
        // variable es un Literal) o en la parte fija de una plantilla.
        {
          selector: String.raw`Literal[value=/(?=[\s\S]*\b(?:bg|from|to|via)-(?:[a-z]+-)?(?:orange|accent))(?=[\s\S]*\btext-white\b)/]`,
          message:
            "Texto blanco sobre el acento de marca: 2.9:1, falla WCAG AA. Sobre el naranja va texto OSCURO (6.7:1).",
        },
        {
          selector: String.raw`TemplateElement[value.raw=/(?=[\s\S]*\b(?:bg|from|to|via)-(?:[a-z]+-)?(?:orange|accent))(?=[\s\S]*\btext-white\b)/]`,
          message:
            "Texto blanco sobre el acento de marca, en la parte fija de una plantilla: 2.9:1, falla WCAG AA. Sobre el naranja va texto OSCURO.",
        },
        // (3)(4) COLOR ESCRITO A MANO. Un hex no es un atajo: es un valor que
        // nadie va a poder cambiar cuando la marca cambie, y que ningun check
        // distingue de un error de tipeo.
        {
          selector: String.raw`Literal[value=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/]`,
          message:
            "Color escrito a mano. Los colores vienen de los tokens del sistema (clase o variable). El unico lugar donde se escribe un hex es el bloque @theme de src/index.css.",
        },
        {
          selector: String.raw`TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/]`,
          message:
            "Color escrito a mano dentro de una plantilla. Los colores vienen de los tokens del sistema.",
        },
        // (5) MEDIDA O Z-INDEX A MANO. El valor arbitrario entre corchetes es la
        // forma que tiene Tailwind de decir "me salgo de la escala". La escala es
        // el token; salirse es la excepcion que se justifica, no el default. Los
        // ejes que NO estan en la lista (grid-cols, aspect, ...) quedan
        // permitidos a proposito: ahi el valor arbitrario es lo normal.
        {
          selector: String.raw`Literal[value=/\b(?:w|h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|text|bg|border|rounded|shadow|leading|tracking|z|top|left|right|bottom|inset)-\[/]`,
          message:
            "Medida o color fuera de la escala del sistema (valor arbitrario entre corchetes). Usa el token; si la escala de verdad no alcanza, se amplia la escala, no el caso.",
        },
        // (6) EL FOCO QUE SE APAGA SIN REEMPLAZO. Deja la interfaz inusable con
        // teclado, y es una forma de romperla que NO se ve mirandola. El
        // reemplazo se busca en TODO el string, no solo en lo que sigue: el
        // orden de las clases no cambia el resultado.
        {
          selector: String.raw`Literal[value=/^(?![\s\S]*(?:focus-visible:|\bring-))[\s\S]*\boutline-none\b/]`,
          message:
            "outline-none sin un foco visible que lo reemplace. El sistema exige anillo doble en :focus-visible; sin eso la interfaz queda inusable con teclado.",
        },
        // (7) focus: DONDE VA focus-visible:. La variante focus: dispara tambien
        // con el mouse, asi que el anillo aparece donde no corresponde y el
        // final previsible es que alguien lo apague para todos. Las variantes
        // compuestas (group-focus:, peer-focus:) quedan fuera a proposito.
        {
          selector: String.raw`Literal[value=/(?:^|\s)focus:(?:ring|outline|border)/]`,
          message:
            "Usa focus-visible: y no focus: para el anillo de foco: focus: dispara con el mouse y termina en que alguien lo apague para todos.",
        },
        // (8) FECHA U HORA SIN LOCALE. Sin locale explicito el resultado depende
        // de la maquina que corre el codigo: sale distinto en el navegador de un
        // usuario, en CI y en el contenedor.
        {
          selector: String.raw`CallExpression[callee.property.name=/^toLocale(?:Date|Time)String$/]:not([arguments.length>0])`,
          message:
            "Fecha u hora formateada sin locale explicito: el resultado depende de la maquina. Usa Intl.DateTimeFormat con su locale.",
        },
        // (9) ROTULO QUE NO DICE QUE VA A PASAR. Un boton nombra su accion
        // (Guardar, Crear cuenta); "Aceptar" y "Click aqui" no dicen nada. La
        // lista es corta y exacta a proposito: "Aceptar terminos" SI es un
        // rotulo valido y no dispara.
        {
          selector: String.raw`JSXText[value=/^\s*(?:Aceptar|OK|Ok|Click aqu[i\u00ed]|Clic aqu[i\u00ed]|Haz clic aqu[i\u00ed])\s*$/]`,
          message:
            "El rotulo tiene que decir que va a pasar (Guardar, Crear cuenta), no Aceptar ni Click aqui.",
        },
        // (10) EL LOGO NO SE REDIBUJA. Un SVG a mano "que se parece" es otra
        // marca con el mismo nombre, y es un error que se repite: una estrella
        // de lineas rectas donde la oficial tiene curvas pasa la revision
        // porque de lejos se parece. La salida existe y es mejor practica
        // igual: una ilustracion propia vive en un archivo .svg que se
        // importa, no en el JSX.
        {
          selector: String.raw`JSXOpeningElement[name.name="svg"]`,
          message:
            "SVG dibujado en el JSX. El logo y los iconos se usan desde el sistema; una ilustracion propia va en un archivo .svg importado.",
        },
      ],
    },
  },

  // Debe ir al final: apaga reglas de formato que colisionan con Prettier.
  prettier
);
