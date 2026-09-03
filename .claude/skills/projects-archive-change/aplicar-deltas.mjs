#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Aplica los deltas de un change de OpenSpec a los specs VIVOS, replicando la
// semantica del `openspec archive` sin usar el CLI.
//
// POR QUE EXISTE. En Windows `openspec archive` falla con EPERM al renombrar la
// carpeta del change y hace ROLLBACK de todo — despues de haber impreso
// "Specs updated successfully". Quien se queda con el mensaje cree que archivo
// y no archivo nada. Este script hace la parte que el CLI no logra hacer en esa
// plataforma: fundir los deltas en los specs vivos. El movimiento de la carpeta
// se hace aparte, con `git mv` (ese si funciona: el lock es sobre el rename del
// DIRECTORIO, no sobre los archivos).
//
// USO, desde la raiz del repo:
//   node .claude/skills/projects-archive-change/aplicar-deltas.mjs <nombre-del-change>
//   node .claude/skills/projects-archive-change/aplicar-deltas.mjs <nombre-del-change> --simulacro
//
// Variables de entorno (mismos defaults que el layout estandar de OpenSpec):
//   OPENSPEC_CHANGES  carpeta de changes  (default: openspec/changes)
//   OPENSPEC_SPECS    carpeta de specs    (default: openspec/specs)
//
// ORDEN DE APLICACION, y no es negociable:
//   1. RENAMED   — primero, porque los bloques MODIFIED del delta vienen con el
//                  titulo NUEVO: si el rename no se aplico antes, el MODIFIED no
//                  encuentra su requirement en el spec vivo.
//   2. MODIFIED  — REEMPLAZA EL REQUIREMENT COMPLETO. No es un merge linea a
//                  linea: lo que el delta no repite, se pierde. Esa es la
//                  semantica real del archive y por eso existe el guardrail de
//                  deltas en CI.
//   3. REMOVED   — borra el bloque entero del requirement.
//   4. ADDED     — al final, para que la insercion no corra los offsets de las
//                  busquedas anteriores.
//
// DOS GUARDAS, las dos deliberadas:
//   · FAIL-CLOSED AL PLANIFICAR: se planifica TODO (todas las capabilities) y
//     recien despues se escribe. Si una sola operacion no cuadra —un MODIFIED
//     cuyo requirement no existe en el spec vivo, un ADDED que ya existe, un
//     encabezado de seccion desconocido— no se escribe NI UN archivo y el
//     script sale 1. Nunca deja los specs a medio aplicar.
//   · CERO OPERACIONES ES ROJO: si el script no aplico ni una sola operacion,
//     REVIENTA. Un archive que no aplica nada y dice "listo" es exactamente el
//     fail-open que el marco combate, y ya paso de verdad.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { spawnSync } from "node:child_process";

const CHANGES = process.env.OPENSPEC_CHANGES || "openspec/changes";
const SPECS = process.env.OPENSPEC_SPECS || "openspec/specs";
const SECCIONES = ["ADDED", "MODIFIED", "REMOVED", "RENAMED"];

const args = process.argv.slice(2);
const SIMULACRO = args.includes("--simulacro");
const CHANGE = args.find((a) => !a.startsWith("--"));

// ---------------------------------------------------------------------------
// LOS TRES MODOS PORTABLES, y por que existen.
//
// Este procedimiento se usa sobre todo en Windows, que es donde el CLI de
// archive miente. Hasta el 2026-08-24 la skill exigia Git Bash porque tres de
// sus pasos estaban escritos en shell de Unix: un `awk` para leer un campo de
// un YAML, un `diff <(...) <(...)` —sustitucion de procesos, que ni siquiera
// existe en `sh`— para comparar dos conteos, y un `${var#...}` para recortar un
// prefijo de ruta. O sea que la herramienta pensada para la plataforma menos
// confiable exigia justo el interprete que ahi puede faltar, y "abri bash
// primero" no es un requisito que ningun otro documento del proyecto pida.
//
// Los tres viven aca ahora. Node ya era requisito del paso 2 y corre en las
// tres plataformas; lo unico que queda en la linea de comandos es `git`, `node`
// y —en el repo del marco— `gh`, que tambien son de las tres.
// ---------------------------------------------------------------------------

/** Corre git y devuelve { rc, salida }. No revienta por rc distinto de 0: cada
 *  modo decide que significa un rc, que es la diferencia entre "no hubo
 *  coincidencias" y "no pude mirar". */
function git(...argumentos) {
  const r = spawnSync("git", argumentos, { encoding: "utf8" });
  if (r.error) {
    console.error(
      `::error::no se pudo ejecutar git (${r.error.message}). Sin git este paso no puede afirmar nada, y lo no verificable es rojo.`
    );
    process.exit(1);
  }
  return { rc: r.status, salida: r.stdout || "" };
}

// ---------------------------------------------------------------------------
// GUARDA DE ACOPLE — vive en una funcion porque tiene que correr en TODO camino
// que archive, y no solo en el que aplica deltas.
//
// `openspec/changes/<nombre>/` es una carpeta TRANSITORIA por definicion del
// propio marco: archivar la mueve a `changes/archive/<fecha>-<nombre>/` y
// descartar un change la borra. Asi que NADA de afuera puede depender de una
// ruta de adentro. Cuando pasa, el archive —que es una operacion rutinaria—
// rompe algo que no tiene nada que ver con specs. El caso medido: un banco de
// pruebas REQUERIDO ejecutaba un script guardado dentro de un change en vuelo,
// o sea que archivar ese change dejaba el CI en rojo.
//
// DONDE CORRE, y esto fue un defecto real de este mismo archivo: estaba escrita
// una sola vez, en el camino de los deltas, y los otros dos caminos que archivan
// —`--mover`, y el change que no lleva deltas y se mueve con `git mv` a secas—
// pasaban de largo. O sea que la guarda no cubria el paso que de verdad mueve la
// carpeta. Ahora la llaman los tres, y `--acople` la corre sola para el change
// sin deltas, que es el unico que no toca ningun otro modo.
//
// DOS CLASES DE REFERENCIA, y confundirlas fue el otro defecto. Una dependencia
// EJECUTABLE —un `import`, un `node <ruta>`, un `uses:` de un workflow— se ROMPE
// al archivar: es ROJA. Una mencion en PROSA —un `.md` que nombra la ruta para
// explicar algo— solo queda VIEJA: es AVISO. Tratarlas igual bloqueaba el
// archive por una frase de un documento, y ninguna de las dos salidas que ofrece
// el mensaje rojo se puede aplicar a una frase.
//
// POR QUE LA EJECUTABLE ES ROJA Y NO AVISO: el arreglo esta siempre disponible
// (mover el dependiente, o moverlo junto con el change en el mismo commit) y un
// aviso en un script que se corre a mano no lo lee nadie. No hay pipeline de
// consumidor que este rojo pueda estrenar: ningun workflow invoca este script
// —se corre en la maquina de quien archiva— asi que el unico que lo ve es quien
// pidio archivar.
// ---------------------------------------------------------------------------
const EXTENSIONES_DE_PROSA = /\.(md|markdown|txt|adoc|rst)$/i;

function guardaDeAcople(change) {
  const raiz = CHANGES.replace(/\\/g, "/").replace(/\/+$/, "");
  const rutaDelChange = `${raiz}/${change}`;
  const rutaArchive = `${raiz}/archive/`;

  const buscada = spawnSync("git", ["grep", "--full-name", "-n", "-I", "-F", rutaDelChange], {
    encoding: "utf8",
  });

  if (buscada.error || (buscada.status !== 0 && buscada.status !== 1)) {
    console.error(
      `::error::no se pudo preguntarle a git quien referencia "${rutaDelChange}" (${
        buscada.error ? buscada.error.message : `git grep salio ${buscada.status}`
      }), asi que NO se puede afirmar que archivar este change no rompa nada de afuera. Lo no verificable es rojo, nunca exito mudo. Arreglo: corre el script desde la raiz de un arbol git con el change ya rastreado.`
    );
    process.exit(1);
  }

  const deFuera = (buscada.stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((linea) => ({ linea, archivo: linea.slice(0, linea.indexOf(":")) }))
    // Lo de ADENTRO del change puede nombrarse a si mismo cuanto quiera: se
    // mueve entero. Y el archive viejo tampoco cuenta: ya esta archivado.
    .filter(
      ({ archivo }) => !archivo.startsWith(`${rutaDelChange}/`) && !archivo.startsWith(rutaArchive)
    );

  const prosa = deFuera.filter(({ archivo }) => EXTENSIONES_DE_PROSA.test(archivo));
  const ejecutables = deFuera.filter(({ archivo }) => !EXTENSIONES_DE_PROSA.test(archivo));

  for (const { linea } of prosa)
    console.log(`::warning::mencion en prosa que va a quedar vieja: ${linea}`);
  if (prosa.length > 0) {
    console.log(
      `::warning::${prosa.length} mencion(es) en PROSA nombran "${rutaDelChange}", que despues del archive no existe mas. No frenan el archive —una frase vieja no rompe ningun pipeline— pero se actualizan a la ruta de archive en el MISMO commit, o el documento empieza a mentir.`
    );
  }

  if (ejecutables.length === 0) return;

  console.error(
    `::error::${ejecutables.length} linea(s) de FUERA del change DEPENDEN de "${rutaDelChange}", que es una ruta transitoria: archivar el change las deja apuntando a un lugar que ya no existe. NO se movio ni se aplico NADA.`
  );
  for (const { linea } of ejecutables) console.error(`  ${linea}`);
  console.error(
    "Arreglo, una de dos: (a) mover lo referenciado FUERA de openspec/changes/ —a herramientas/ si es una herramienta, o al lado de quien lo usa— y actualizar la ruta en quien lo nombra; (b) si de verdad tiene que viajar con el change, mover al dependiente DENTRO del change y archivarlo junto en el mismo commit. Un `git mv` que deja media dependencia atras es el mismo rojo, un dia despues."
  );
  process.exit(1);
}

// --- MODO 1: el pin del CLI de OpenSpec -----------------------------------
// Reemplaza:  awk '/^      version_openspec:/{f=1} f && /default:/{print; exit}'
// El pin vive en el `default` del input `version_openspec` del workflow
// reusable. Se lee de un archivo, o de la entrada estandar con "-" (que es
// como llega cuando se lo baja del marco sin clonarlo).
if (args.includes("--pin-openspec")) {
  const i = args.indexOf("--pin-openspec");
  const fuente = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "-";
  let texto;
  try {
    texto = readFileSync(fuente === "-" ? 0 : fuente, "utf8");
  } catch (error) {
    console.error(
      `::error::no se pudo leer "${fuente}" (${error.message}). Sin el workflow reusable no hay pin que leer, y el pin NO se adivina: una version inventada del CLI corre otro programa.`
    );
    process.exit(1);
  }
  const lineas = texto.split(/\r?\n/);
  let dentro = false;
  let pin = null;
  for (const linea of lineas) {
    if (/^\s*version_openspec:\s*$/.test(linea)) {
      dentro = true;
      continue;
    }
    if (!dentro) continue;
    const m = linea.match(/^\s*default:\s*"?([0-9]+\.[0-9]+\.[0-9]+)"?\s*$/);
    if (m) {
      pin = m[1];
      break;
    }
    // Otro input empezo: el default que buscabamos no estaba.
    if (/^\s{6}[a-z_]+:\s*$/.test(linea)) break;
  }
  if (!pin) {
    console.error(
      `::error::no encontre un "default: <X.Y.Z>" bajo el input "version_openspec" en "${fuente}". NO se concluyo que no haya pin: se concluyo que no se pudo leer. Revisa que la fuente sea el workflow reusable del marco (.github/workflows/marco-ci.yml) y no otro archivo.`
    );
    process.exit(1);
  }
  console.log(pin);
  process.exit(0);
}

// --- MODO 2: el conteo de escenarios, antes contra despues -----------------
// Reemplaza:  diff <(git grep -c ... HEAD ...) <(git grep -c ... )
// El "antes" se lee de HEAD y el "despues" del arbol de trabajo, sin tocar el
// arbol: NO se usa `git stash`, que sobre un arbol limpio imprime "No local
// changes to save", sale 0, y deja que un `git stash pop` encadenado saque y
// descarte un stash ajeno.
if (args.includes("--escenarios")) {
  const PATRON = "^#### Scenario:";
  // EL "DESPUES" TIENE QUE VER LO NO RASTREADO, y no verlo era un falso verde.
  //
  // EL DEFECTO, medido: cuando el change crea una capability NUEVA —o sea en el
  // primer change de todo proyecto, porque su openspec/specs/ empieza vacio— el
  // archive escribe un spec que git todavia no registro. `git grep` sin
  // `--untracked` no lo ve, el "despues" cuenta cero escenarios para esa
  // capability, y la comparacion contra el "antes" —que tambien es cero, porque el
  // archivo no existia— da "sin diferencias". O sea que la verificacion declaraba
  // correcto un archive del que no habia mirado una sola linea.
  //
  // `--untracked` va SOLO en el "despues": el "antes" se lee de una revision, y
  // ahi no hay nada sin rastrear por definicion.
  //
  // Y LA BANDERA VA ANTES DEL PATRON. Puesta despues, git la lee como el nombre de
  // una revision y sale 128 con «unable to resolve revision: --untracked» —
  // medido, y por eso este orden esta escrito y no es casual.
  const contar = (revision) => {
    const argumentos = ["grep"];
    if (!revision) argumentos.push("--untracked");
    argumentos.push("-c", "-E", PATRON);
    if (revision) argumentos.push(revision);
    argumentos.push("--", SPECS);
    const { rc, salida } = git(...argumentos);
    // rc 0 = hubo coincidencias; rc 1 = ninguna; cualquier otro = no se pudo mirar.
    if (rc !== 0 && rc !== 1) {
      console.error(
        `::error::git grep salio ${rc} contando escenarios en ${revision || "el arbol de trabajo"}: no se pudo tomar la medicion, asi que NO se puede afirmar que no se haya perdido contrato.`
      );
      process.exit(1);
    }
    const mapa = new Map();
    for (const linea of salida.split(/\r?\n/).filter(Boolean)) {
      // Formato: [<revision>:]<ruta>:<conteo>
      const corte = linea.lastIndexOf(":");
      let ruta = linea.slice(0, corte);
      const total = Number(linea.slice(corte + 1));
      if (revision && ruta.startsWith(`${revision}:`)) ruta = ruta.slice(revision.length + 1);
      mapa.set(ruta.replace(/\\/g, "/"), total);
    }
    return mapa;
  };

  const antes = contar("HEAD");
  const despues = contar(null);
  const rutas = [...new Set([...antes.keys(), ...despues.keys()])].sort();

  let bajas = 0;
  let diferencias = 0;
  for (const ruta of rutas) {
    const a = antes.get(ruta) ?? 0;
    const d = despues.get(ruta) ?? 0;
    if (a === d) continue;
    diferencias += 1;
    const signo = d > a ? "+" : "-";
    if (d < a) bajas += 1;
    console.log(`${signo} ${ruta}: ${a} -> ${d}`);
  }

  if (diferencias === 0) {
    console.log(
      "sin diferencias: ningun spec vivo cambio su cantidad de escenarios. Si el script dijo que aplico operaciones, mira el `git diff` antes de seguir — un archive que no movio nada es la misma clase de fallo que el CLI que dice 'listo' sin haber hecho nada."
    );
  }
  if (bajas > 0) {
    console.log(
      `AVISO: ${bajas} spec(s) PERDIERON escenarios. Eso solo es correcto si el delta declaraba un REMOVED. Si no lo declaraba, PARA: es contrato perdido.`
    );
  }
  process.exit(0);
}

// --- MODO 3: mover el change archivo por archivo ---------------------------
// Reemplaza el bucle con `${f#openspec/changes/<change>/}` y `dirname`.
// Mueve TODO lo rastreado —deltas y archivos ocultos incluidos—, que es justo
// lo que se pierde cuando alguien mueve a mano solo los `.md` que recuerda.
if (args.includes("--mover")) {
  const i = args.indexOf("--mover");
  const DESTINO = args[i + 1];
  if (!DESTINO || DESTINO.startsWith("--")) {
    console.error(
      "uso: node aplicar-deltas.mjs <nombre-del-change> --mover <destino> [--simulacro]"
    );
    process.exit(2);
  }
  if (!CHANGE) {
    console.error(
      "uso: node aplicar-deltas.mjs <nombre-del-change> --mover <destino> [--simulacro]"
    );
    process.exit(2);
  }
  // Este es el paso que de verdad mueve la carpeta: la guarda va ANTES del
  // primer `git mv`, tambien en simulacro. Un acople que se descubre despues de
  // mover medio change no se descubre, se sufre.
  guardaDeAcople(CHANGE);
  const origen = `${CHANGES.replace(/\\/g, "/").replace(/\/+$/, "")}/${CHANGE}`;
  const { rc, salida } = git("ls-files", "--", origen);
  if (rc !== 0) {
    console.error(
      `::error::git ls-files salio ${rc} sobre "${origen}": no se pudo listar que archivos mover.`
    );
    process.exit(1);
  }
  const archivos = salida.split(/\r?\n/).filter(Boolean);
  if (archivos.length === 0) {
    console.error(
      `::error::"${origen}" no tiene NI UN archivo rastreado. NO se concluyo que ya este archivado: se concluyo que no hay nada que mover desde aca. Revisa el nombre del change y que estes en la raiz del repo.`
    );
    process.exit(1);
  }
  let movidos = 0;
  for (const archivo of archivos) {
    const relativo = archivo.replace(/\\/g, "/").slice(origen.length + 1);
    const destinoArchivo = `${DESTINO.replace(/\\/g, "/").replace(/\/+$/, "")}/${relativo}`;
    if (SIMULACRO) {
      console.log(`[simulacro] git mv ${archivo} ${destinoArchivo}`);
      movidos += 1;
      continue;
    }
    mkdirSync(dirname(destinoArchivo), { recursive: true });
    const r = git("mv", archivo, destinoArchivo);
    if (r.rc !== 0) {
      console.error(
        `::error::git mv fallo (${r.rc}) moviendo "${archivo}". Se movieron ${movidos} archivo(s) antes de este; el change quedo A MEDIAS y hay que terminarlo o revertirlo a mano — 'git status --short' te dice exactamente donde quedo.`
      );
      process.exit(1);
    }
    movidos += 1;
  }
  console.log(
    SIMULACRO
      ? `[simulacro] ${movidos} archivo(s) planificados y NO movidos. Corre sin --simulacro para moverlos.`
      : `${movidos} archivo(s) movidos a ${DESTINO}. Verificalo: 'git ls-files ${origen}' tiene que salir VACIO.`
  );
  process.exit(0);
}

// --- MODO 4: la guarda de acople, sola -------------------------------------
// Para el change que NO lleva deltas de spec: ese se archiva con `git mv` a
// secas y por eso nunca pasaba por el camino de los deltas. Este modo es el que
// se corre antes de ese `git mv`, y es el unico trabajo que hace.
if (args.includes("--acople")) {
  if (!CHANGE) {
    console.error("uso: node aplicar-deltas.mjs <nombre-del-change> --acople");
    process.exit(2);
  }
  // Un change que no existe no tiene quien lo referencie, y ese "cero" se veria
  // igual que el verde legitimo. Se corta antes de poder decirlo.
  if (!existsSync(join(CHANGES, CHANGE))) {
    console.error(
      `::error::no existe el change "${CHANGE}" en ${CHANGES}: NO se concluyo que nadie dependa de el, se concluyo que no se pudo mirar. Revisa el nombre y que estes en la raiz del repo.`
    );
    process.exit(2);
  }
  guardaDeAcople(CHANGE);
  console.log(
    `nada de fuera de "${CHANGES.replace(/\\/g, "/").replace(/\/+$/, "")}/${CHANGE}" depende de una ruta de adentro: archivarlo no deja a nadie apuntando al vacio.`
  );
  process.exit(0);
}

if (!CHANGE) {
  console.error("uso: node aplicar-deltas.mjs <nombre-del-change> [--simulacro]");
  console.error("     node aplicar-deltas.mjs --pin-openspec <ruta-al-marco-ci.yml | ->");
  console.error("     node aplicar-deltas.mjs --escenarios");
  console.error("     node aplicar-deltas.mjs <nombre-del-change> --mover <destino> [--simulacro]");
  console.error("     node aplicar-deltas.mjs <nombre-del-change> --acople");
  process.exit(2);
}

// Normalizamos CRLF: los anclajes `$` de las expresiones regulares no cruzan un
// `\r`, y estos archivos se editan desde Windows. Sin esto el script no
// encontraria un solo encabezado y saldria por la guarda de cero operaciones —
// ruidoso, pero por el motivo equivocado.
const leer = (ruta) => readFileSync(ruta, "utf8").replace(/\r\n/g, "\n");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Limites del bloque de un requirement: desde su encabezado hasta el siguiente `###` o el fin. */
function bloqueDe(texto, titulo) {
  const re = new RegExp(`^### Requirement: ${esc(titulo)}[ \\t]*$`, "m");
  const ini = texto.search(re);
  if (ini === -1) return null;
  const resto = texto.slice(ini + 1);
  const sig = resto.search(/^### Requirement: /m);
  return { ini, fin: sig === -1 ? texto.length : ini + 1 + sig };
}

/** Texto de una seccion `## <NOMBRE> Requirements` hasta el siguiente `## ` o el fin. */
function seccionDe(texto, nombre) {
  const re = new RegExp(`^## ${nombre} Requirements[ \\t]*$`, "m");
  const ini = texto.search(re);
  if (ini === -1) return "";
  const resto = texto.slice(ini + 1);
  const sig = resto.search(/^## /m);
  return sig === -1 ? texto.slice(ini) : texto.slice(ini, ini + 1 + sig);
}

/** Bloques `### Requirement: ...` de una seccion, con su texto completo. */
function bloquesDe(seccion) {
  const titulos = [...seccion.matchAll(/^### Requirement: (.+?)[ \t]*$/gm)].map((m) => m[1].trim());
  return titulos.map((titulo) => {
    const b = bloqueDe(seccion, titulo);
    return { titulo, texto: seccion.slice(b.ini, b.fin).replace(/\s+$/, "") };
  });
}

/** Pares FROM/TO de `## RENAMED Requirements`. */
function renombresDe(texto) {
  const seccion = seccionDe(texto, "RENAMED");
  if (!seccion) return [];
  const re =
    /^[ \t]*-[ \t]*FROM:[ \t]*`?#{3}[ \t]*Requirement:[ \t]*(.+?)`?[ \t]*$\n[ \t]*-[ \t]*TO:[ \t]*`?#{3}[ \t]*Requirement:[ \t]*(.+?)`?[ \t]*$/gm;
  return [...seccion.matchAll(re)].map((m) => ({ de: m[1].trim(), a: m[2].trim() }));
}

/** Todos los `spec.md` bajo un directorio, con su ruta de capability relativa. */
function deltasDe(raiz, prefijo = "") {
  const salida = [];
  for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
    const ruta = join(raiz, entrada.name);
    const rel = prefijo ? posix.join(prefijo, entrada.name) : entrada.name;
    if (entrada.isDirectory()) salida.push(...deltasDe(ruta, rel));
    else if (entrada.name === "spec.md") salida.push({ capability: prefijo, ruta: raiz });
  }
  return salida;
}

/** Inserta bloques al final de la seccion `## Requirements` del spec vivo. */
function insertarEnRequirements(vivo, bloques) {
  const re = /^## Requirements[ \t]*$/m;
  const ini = vivo.search(re);
  if (ini === -1) return null;
  const resto = vivo.slice(ini + 1);
  const sig = resto.search(/^## /m);
  const fin = sig === -1 ? vivo.length : ini + 1 + sig;
  const nuevo = bloques.map((b) => `${b.texto}\n\n`).join("");
  return `${vivo.slice(0, fin).replace(/\s+$/, "")}\n\n${nuevo}${vivo.slice(fin)}`;
}

// "No pude mirar" y "no habia nada" NO son lo mismo, y confundirlos aca es
// caro: el mensaje de "este change no lleva deltas" invita a archivar con
// `git mv` a secas, o sea a mover el change SIN fundir sus deltas — perdida de
// contrato en silencio, que es exactamente lo que este procedimiento existe
// para evitar. Por eso se distinguen los tres casos antes de concluir nada.
const dirChange = join(CHANGES, CHANGE);
const dirDeltas = join(dirChange, "specs");

if (!existsSync(CHANGES)) {
  console.error(
    `::error::no existe "${CHANGES}" desde este directorio: NO estas en la raiz del repo (o OPENSPEC_CHANGES apunta mal). No se concluyo nada sobre el change "${CHANGE}".`
  );
  console.error(
    "Corre el script desde la raiz del repo (donde vive openspec/), o exporta OPENSPEC_CHANGES."
  );
  process.exit(2);
}

if (!existsSync(dirChange)) {
  const disponibles = readdirSync(CHANGES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "archive")
    .map((e) => e.name);
  console.error(
    `::error::no existe el change "${CHANGE}" en ${CHANGES}: revisa el nombre. NO se concluyo que no tenga deltas.`
  );
  console.error(
    `changes activos: ${disponibles.length > 0 ? disponibles.join(", ") : "(ninguno)"}`
  );
  process.exit(2);
}

// La guarda de acople va ACA, antes de la comprobacion de deltas y antes de
// escribir una sola linea: asi tambien la ve el change que NO lleva deltas, que
// es el que se archiva con `git mv` a secas y por eso es el mas facil de mover
// con una dependencia colgando.
guardaDeAcople(CHANGE);

if (!existsSync(dirDeltas)) {
  console.error(
    `::error::el change "${CHANGE}" EXISTE pero no tiene carpeta de deltas (${dirDeltas}): no hay NADA que aplicar.`
  );
  console.error(
    "Si el change de verdad no lleva deltas de spec, archivalo solo con `git mv` y decilo en el PR (la guarda de acople de arriba ya corrio: este script no vuelve a hacer falta)."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Fase 1: planificar TODO. Cero escrituras.
// ---------------------------------------------------------------------------
const plan = [];
const errores = [];
const avisos = [];
let operaciones = 0;

for (const { capability, ruta } of deltasDe(dirDeltas)) {
  const rutaDelta = join(ruta, "spec.md");
  const rutaViva = join(SPECS, ...capability.split("/"), "spec.md");
  const delta = leer(rutaDelta);

  // Fail-closed ante lo desconocido: una seccion que este script no sabe
  // aplicar no se ignora en silencio (seria perder contrato sin avisar).
  for (const m of delta.matchAll(/^## (.+?) Requirements[ \t]*$/gm)) {
    if (!SECCIONES.includes(m[1].trim())) {
      errores.push(
        `${capability}: seccion desconocida "## ${m[1]} Requirements" — este script no la sabe aplicar`
      );
    }
  }

  const renames = renombresDe(delta);
  const modificados = bloquesDe(seccionDe(delta, "MODIFIED"));
  const removidos = bloquesDe(seccionDe(delta, "REMOVED"));
  const agregados = bloquesDe(seccionDe(delta, "ADDED"));

  let vivo;
  let creada = false;
  if (existsSync(rutaViva)) {
    vivo = leer(rutaViva);
  } else if (agregados.length > 0 && renames.length + modificados.length + removidos.length === 0) {
    // Capability NUEVA: nace en el archive, con Purpose TBD (limite conocido del
    // formato — los deltas no transportan `## Purpose`).
    vivo = `# ${capability.split("/").pop()}\n\n## Purpose\n\nTBD\n\n## Requirements\n`;
    creada = true;
    avisos.push(
      `${capability}: capability NUEVA, nace con "Purpose: TBD" — completalo en el MISMO PR del archive`
    );
  } else {
    errores.push(
      `${capability}: no existe el spec vivo ${rutaViva} y el delta trae operaciones que lo necesitan`
    );
    continue;
  }

  const ops = [];

  for (const { de, a } of renames) {
    if (!bloqueDe(vivo, de))
      errores.push(`${capability}: RENAMED FROM "${de}" no existe en el spec vivo`);
    else if (bloqueDe(vivo, a))
      errores.push(`${capability}: RENAMED TO "${a}" ya existe en el spec vivo`);
    else {
      vivo = vivo.replace(
        new RegExp(`^### Requirement: ${esc(de)}[ \\t]*$`, "m"),
        `### Requirement: ${a}`
      );
      ops.push(`RENAMED  "${de}" -> "${a}"`);
    }
  }

  for (const { titulo, texto } of modificados) {
    const b = bloqueDe(vivo, titulo);
    if (!b) {
      errores.push(
        `${capability}: MODIFIED "${titulo}" no existe en el spec vivo (si lo retitulaste, declaralo en "## RENAMED Requirements")`
      );
      continue;
    }
    vivo = `${vivo.slice(0, b.ini)}${texto}\n\n${vivo.slice(b.fin)}`;
    ops.push(`MODIFIED "${titulo}" (requirement reemplazado COMPLETO)`);
  }

  for (const { titulo } of removidos) {
    const b = bloqueDe(vivo, titulo);
    if (!b) {
      errores.push(`${capability}: REMOVED "${titulo}" no existe en el spec vivo`);
      continue;
    }
    vivo = `${vivo.slice(0, b.ini)}${vivo.slice(b.fin)}`;
    ops.push(`REMOVED  "${titulo}"`);
  }

  const nuevos = [];
  for (const bloque of agregados) {
    if (bloqueDe(vivo, bloque.titulo)) {
      errores.push(`${capability}: ADDED "${bloque.titulo}" YA existe en el spec vivo`);
      continue;
    }
    nuevos.push(bloque);
    ops.push(`ADDED    "${bloque.titulo}"`);
  }
  if (nuevos.length > 0) {
    const conNuevos = insertarEnRequirements(vivo, nuevos);
    if (conNuevos === null)
      errores.push(
        `${capability}: el spec vivo no tiene seccion "## Requirements" donde insertar los ADDED`
      );
    else vivo = conNuevos;
  }

  if (ops.length === 0) {
    avisos.push(`${capability}: el delta no declara ninguna operacion aplicable`);
    continue;
  }

  // Un borrado o un reemplazo pueden dejar tres saltos seguidos. Los specs no
  // usan lineas en blanco multiples como contenido, asi que normalizar es seguro.
  vivo = `${vivo.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "")}\n`;

  operaciones += ops.length;
  plan.push({ capability, rutaViva, contenido: vivo, ops, creada });
}

// ---------------------------------------------------------------------------
// Fase 2: guardas y escritura
// ---------------------------------------------------------------------------
for (const a of avisos) console.log(`::warning::${a}`);

if (errores.length > 0) {
  for (const e of errores) console.error(`  ✗ ${e}`);
  console.error(
    `::error::${errores.length} problema(s) al planificar: NO se escribio ni un archivo y NADA quedo aplicado. Arregla el delta y volve a correr.`
  );
  process.exit(1);
}

// LA GUARDA. Un script de archive que no aplica nada y dice "listo" es el
// fail-open que este procedimiento existe para evitar. Paso de verdad.
if (operaciones === 0) {
  console.error(
    `::error::el change "${CHANGE}" tiene carpeta de deltas pero NO se aplico NI UNA operacion. Esto no sale en verde nunca: o los deltas no declaran ADDED/MODIFIED/REMOVED/RENAMED, o los encabezados no tienen el formato que OpenSpec espera. Revisa ${dirDeltas} antes de mover nada.`
  );
  process.exit(1);
}

for (const { capability, rutaViva, ops, creada } of plan) {
  console.log(`\n${capability}${creada ? "  (capability NUEVA)" : ""}  ->  ${rutaViva}`);
  for (const op of ops) console.log(`  ~ ${op}`);
}

if (SIMULACRO) {
  console.log(
    `\n[simulacro] ${operaciones} operacion(es) planificadas y NO escritas. Corre sin --simulacro para aplicarlas.`
  );
  process.exit(0);
}

for (const { rutaViva, contenido } of plan) {
  mkdirSync(dirname(rutaViva), { recursive: true });
  writeFileSync(rutaViva, contenido);
}

console.log(`\n✓ ${operaciones} operacion(es) aplicadas en ${plan.length} spec(s) vivo(s)`);
console.log(
  "Falta: mover el change con `git mv`, validar --all --strict, correr el guardrail de deltas y completar los Purpose TBD."
);
