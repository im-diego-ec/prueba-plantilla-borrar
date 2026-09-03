---
name: projects-archive-change
description: Archivar un change de OpenSpec sin usar el CLI de archive — funde los deltas en los specs vivos, mueve el change a changes/archive con git mv y verifica que no se perdio contrato. Usar al cerrar un change de OpenSpec, sobre todo en Windows, donde `openspec archive` miente.
# ALLOWLIST ACOTADO. `allowed-tools` es un allowlist de agente con el mismo poder
# que el archivo de ajustes: `Bash(git:*)` autoriza `git push --force` y `Bash(gh:*)`
# autoriza `gh pr merge`, `gh release create` y `gh api -X DELETE`. Un comodin en la
# posicion del subcomando autoriza mas de lo que nadie reviso, asi que aca solo entran
# LECTURAS acotadas.
# Lo que ESCRIBE fuera del arbol —git checkout, git pull, git add, git commit, git push, gh pr create, el `gh api` que lee el pin del marco y los `npx` del CLI de OpenSpec (que descargan y ejecutan un paquete)— queda deliberadamente afuera: no es que la
# skill no lo haga, es que cada una de esas corridas se PIDE en la sesion. Buscar en el
# arbol va por las tools `Grep` y `Glob` en vez de por `Bash(grep:*)`.
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git ls-files:*), Bash(git grep:*), Bash(grep:*), Bash(git mv:*), Bash(node .claude/skills/projects-archive-change/aplicar-deltas.mjs:*), Read, Grep, Glob, Edit
metadata:
  version: "1.0"
---

# Archivar un change de OpenSpec

> **De donde viene esta skill.** Llego como **scaffold** del marco: se copio UNA vez al
> crear este repo y desde entonces es de este proyecto. No la genera ningun CLI, asi que
> editarla no se pierde en una regeneracion — pero tampoco se actualiza sola. Si la mejoras
> de una forma que le sirva a cualquier proyecto, esa mejora sube al marco (es el tipo (b)
> de la revision trimestral de divergencia), no se queda solo aca.
>
> El nombre lleva el prefijo del marco **a proposito**: el CLI de OpenSpec genera su propia
> skill `openspec-archive-change` en cada repo, y las dos tienen que poder convivir sin que
> una tape a la otra. Esta es la que usa el procedimiento verificado en Windows.

Archivar es el **merge** del ciclo de vida de los specs: los deltas del change
(`openspec/changes/<nombre>/specs/`) se funden en los specs **vivos**
(`openspec/specs/`), que son el contrato vigente, y el change se mueve a
`openspec/changes/archive/YYYY-MM-DD-<nombre>/` como historia inmutable.

Despues de archivar nadie lee el delta para entender el sistema: lee el spec
vivo. El archive responde "por que quedo asi".

Todos los comandos se corren **desde la raiz del repo**, y **corren igual en
PowerShell, en bash y en zsh**: los unicos ejecutables que se invocan son `git`,
`node`, `npx` y `gh`, que estan en las tres plataformas, mas `ls` en una sola
verificacion (en PowerShell `ls` es un alias de `Get-ChildItem` y hace lo mismo).
**No hace falta abrir Git Bash.**
Hasta el 2026-08-24 si hacia falta —tres pasos usaban `awk`, sustitucion de
procesos (`<(...)`) y `${var#...}`, que en PowerShell no existen— y esa exigencia
era justo al reves de lo que esta skill necesita: se usa sobre todo en Windows,
que es donde el CLI de archive falla y donde menos se puede dar por hecho que hay
un bash. Los tres pasos viven ahora en el script `aplicar-deltas.mjs`, que ya
viajaba con la skill.

El script del paso 2 **exige la raiz del repo**: comproba `openspec/changes/` y
el change antes de mirar los deltas, y si no los encuentra te dice cual de las
tres cosas falta (no estas en la raiz / el change no existe / el change no lleva
deltas) en vez de dejarte concluir la equivocada.

---

## Trampa 1, y va primero porque decide todo el procedimiento: en Windows el CLI MIENTE

**No uses `openspec archive` en Windows. Nunca.**

```
Error: Could not safely stage ...\openspec\changes\<change> before the fallback
archive copy (EPERM: operation not permitted, rename ... -> .openspec-move-<uuid>)
```

Lo peligroso no es que falle. Es **como** falla: antes del error imprime

> **`Specs updated successfully`**

y el resumen de los requirements aplicados — y acto seguido hace **rollback de
todo**. Los specs vivos quedan **sin un solo cambio**. Reproducido dos veces el
2026-08-14.

**Sintoma exacto para detectarlo aunque no sospeches**, siempre despues de
cualquier `archive`:

```bash
git status --short
```

Si `openspec/specs/` no aparece modificado y el change sigue fuera de
`changes/archive/`, **el archive no hizo nada**, por mucho que haya dicho que si.

**Que se sabe de la causa.** El lock es sobre el rename del **directorio**, no
sobre los archivos: `git mv` mueve los mismos archivos uno por uno sin problema.
De ahi el procedimiento de abajo, que es exactamente el rodeo verificado en el
proyecto donde nacio el marco.

---

## Paso 0 — Precondiciones

```bash
git checkout main && git pull --ff-only && git checkout -b docs/archive-<nombre-del-change>
```

Averigua el pin del CLI que usa el marco (no lo adivines, no lo tipees de
memoria). **El pin no esta escrito en este repo**: vive en el `default` del input
`version_openspec` del workflow reusable del marco, y este repo lo hereda sin
repetirlo — por eso una subida del pin llega sola y no hay nada que sincronizar.
Se lee del marco sin clonarlo:

```bash
gh api repos/im-diego-ec/Projects/contents/.github/workflows/marco-ci.yml \
  -H "Accept: application/vnd.github.raw" \
  | node .claude/skills/projects-archive-change/aplicar-deltas.mjs --pin-openspec -
```

**Verificacion del pin:** tiene que imprimir **solo el numero**, `X.Y.Z`, y ese es
el numero de todos los comandos `npx` de abajo. Si lo que llega por la tuberia no
es el workflow reusable, el comando sale **1** diciendo que no pudo leer el pin,
en vez de imprimir vacio y dejarte concluir que no hay ninguno.
Si imprime vacio, **para**: no tenes el pin y no se adivina. Las dos causas
reales son que `gh` no este autenticado contra la organizacion o que el marco
haya movido ese input de lugar; en el segundo caso el numero se pide a un builder
y el arreglo de este texto sube al marco.

El allowlist de `.claude/settings.json` de este repo tambien lleva una version
pegada (`npx --yes @fission-ai/openspec@X.Y.Z ...`), pero eso es **lo que este
repo cree**, no la fuente: si difiere de lo que devolvio el comando de arriba, el
allowlist quedo atrasado y actualizarlo es parte de este trabajo.

**No busques el pin con `git grep -n "@fission-ai/openspec@" -- .github/`**: en el marco
devuelve lineas donde la version es una variable de shell (`${VERSION_OPENSPEC}`,
`${PIN}`) y en este repo no devuelve ninguna. En los dos casos te quedas sin
numero, y el paso siguiente pasa a ser una adivinanza.

El paquete es `@fission-ai/openspec`: el nombre pelado `openspec` en npm es un
paquete ajeno (un placeholder 0.0.0). Por eso la version va siempre pegada
(`@X.Y.Z`) y nunca se invoca el CLI sin ella.

Comproba que el change existe, que sus tareas estan completas con evidencia y
que hoy todo valida:

```bash
npx --yes @fission-ai/openspec@X.Y.Z list
npx --yes @fission-ai/openspec@X.Y.Z validate --all --strict
grep -c "^- \[ \]" openspec/changes/<nombre-del-change>/tasks.md
```

`validate` tiene que estar en verde **antes** de tocar nada, y el conteo de tareas
incompletas tiene que dar **`0`** — con `grep -c` la salida es el numero, no el
vacio. Si da cualquier otra cosa, para y decilo: se archiva lo terminado, no lo
que va quedando.

> **Antes decia `git grep -c` y esa forma mentia dos veces.** No imprimia nada
> cuando el conteo era cero, asi que la regla escrita era «sin salida es cero
> tareas abiertas» — y un archivo que git todavia no registro produce EXACTAMENTE
> la misma salida vacia. O sea que «todavia no lo agregaste» y «no queda ninguna
> tarea» se leian igual. Con `grep -c` a secas, cero es `0` y se distingue.

---

## Paso 1 — Inventariar lo que el delta va a hacer

```bash
grep -rn -E "^## .* Requirements" openspec/changes/<nombre-del-change>/specs/
grep -rn "^### Requirement: " openspec/changes/<nombre-del-change>/specs/
```

Anota cuantas operaciones esperas por capability. Ese numero es con lo que vas a
contrastar la salida del paso 2: si el script aplica menos, algo no se detecto.

**Antes de aplicar nada, revisa a mano cada bloque `## MODIFIED Requirements`.**
Un MODIFIED **reemplaza el requirement COMPLETO**: todo escenario vigente que el
delta no repita **se pierde en el archive**, en silencio. El guardrail de deltas
caza la mayoria de esos casos, pero tiene un hueco conocido: **si el titulo del
requirement del delta no existe en el spec vivo, no avisa**. Compara titulo por
titulo contra el spec vivo:

```bash
grep -rn "^### Requirement: " openspec/specs/<capability>/spec.md
```

Un retitulado es legitimo, pero **se declara** en `## RENAMED Requirements` con
su par FROM/TO. Sin declararlo, el MODIFIED apunta a un requirement que no
existe.

---

## Paso 2 — Aplicar los deltas a los specs vivos

Con el script que viaja junto a esta skill. Primero en seco:

> **Antes de planificar nada, el script comprueba quien depende del change.**
> `openspec/changes/<nombre>/` es una carpeta **transitoria**: archivar la mueve y
> descartar el change la borra. Si algo de FUERA del change **depende** de una ruta
> de adentro —un `import`, un `node <ruta>`, un `uses:` de un workflow—, el script
> sale **1** sin escribir una linea y te imprime cada dependencia con su archivo y
> su numero de linea. No es teorico: ya paso — un banco de pruebas **requerido**
> ejecutaba un script guardado dentro de un change en vuelo, o sea que un archive
> rutinario dejaba el CI en rojo por algo que no tenia nada que ver con specs. El
> arreglo es siempre uno de dos —mover el dependiente fuera de
> `openspec/changes/`, o moverlo dentro del change y archivarlo junto en el mismo
> commit—, y los dos estan escritos en el mensaje.
>
> **Una mencion en PROSA no frena el archive.** Un `.md` que nombra la ruta para
> explicar algo no se rompe al archivar: queda viejo. Y ninguna de las dos salidas
> de arriba se le puede aplicar a una frase. Esas salen como `::warning::` con su
> linea, para actualizarlas a la ruta de archive en el mismo commit. La distincion
> importa: tratarlas igual bloqueaba el archive de un change porque un documento
> del repo lo mencionaba.
>
> **La guarda corre en los TRES caminos que archivan**, no solo en este: tambien
> en `--mover` —antes del primer `git mv`, incluso en simulacro— y en `--acople`,
> que es el modo para el change sin deltas, el unico que no pasa por este paso 2.

```bash
node .claude/skills/projects-archive-change/aplicar-deltas.mjs <nombre-del-change> --simulacro
```

Lee la lista de operaciones planificadas y contrastala con el inventario del
paso 1. Si coincide, aplica:

```bash
node .claude/skills/projects-archive-change/aplicar-deltas.mjs <nombre-del-change>
```

**Que hace el script, en el orden que importa:**

1. **RENAMED** primero — los bloques MODIFIED del delta vienen con el titulo
   **nuevo**; si el rename no se aplico antes, el MODIFIED no encuentra su
   requirement.
2. **MODIFIED** despues — reemplaza el **requirement completo**, que es la
   semantica real del archive.
3. **REMOVED** — borra el bloque entero.
4. **ADDED** al final, para no correr los offsets de las busquedas anteriores.

**Sus dos guardas, que son el motivo de que exista:**

- **Fail-closed al planificar.** Planifica todas las capabilities y recien
  despues escribe. Si una sola operacion no cuadra (un MODIFIED cuyo requirement
  no existe, un ADDED que ya existe, un encabezado `## <X> Requirements` que no
  sabe aplicar) **no escribe ni un archivo** y sale 1. Nunca deja los specs a
  medio aplicar.
- **Cero operaciones es ROJO.** Si no aplico ni una sola operacion, revienta con
  exit 1. Ver la trampa 2.

**Verificacion del paso 2** — el diff tiene que existir y tiene que decir lo que
esperabas:

```bash
git status --short openspec/specs/
git diff --stat openspec/specs/
```

Y el conteo de escenarios antes/despues, que es la propiedad que de verdad
importa (ningun escenario desaparece sin que vos lo hayas decidido). El "antes"
se lee de `HEAD`, **sin tocar el arbol de trabajo**:

```bash
node .claude/skills/projects-archive-change/aplicar-deltas.mjs --escenarios
```

Salida esperada: **solo** los specs que tocaste, con su conteo antes y despues, y
ninguna baja que no corresponda a un `REMOVED` declarado. Una baja sin REMOVED
sale con la palabra `AVISO` y ahi **paras**: es contrato perdido. Si no hay
ninguna diferencia lo dice con todas las letras en vez de no imprimir nada — el
silencio y "no cambio nada" se ven iguales y no lo son: si el script dijo que
aplico operaciones y el conteo no se movio en ningun lado, mira el `git diff`
antes de seguir.

> **No uses `git stash` para tomar el "antes".** La receta obvia
> —`git stash && grep ... && git stash pop`— tiene un modo de fallo destructivo y
> silencioso: si el arbol esta limpio (corriste la comprobacion dos veces, o el
> script no aplico nada), `git stash` imprime `No local changes to save` y **sale
> 0**, el `&&` sigue de largo, y el `git stash pop` **saca y descarta un stash
> ajeno** que vos no pusiste ahi. Sintoma exacto: aparece en `git status` un
> archivo modificado que no tocaste, y `git stash list` que antes tenia una
> entrada queda vacia. Reproducido el 2026-08-19. `git grep ... HEAD` no toca el
> arbol y por eso es la forma de arriba.

---

## Trampa 2 — un script de archive que no aplica nada y dice "listo"

**Paso de verdad.** El archive de un change se hizo dos veces; la segunda, el
script **fallo en silencio**: imprimio "deltas aplicados" **sin haber aplicado
ninguno**.

Es la misma clase de fallo que la trampa 1 con otro disfraz: salida en verde
sobre cero trabajo. Por eso el script de esta skill sale **1** cuando el total de
operaciones aplicadas es cero, con este mensaje:

```
::error::el change "<nombre>" tiene carpeta de deltas pero NO se aplico NI UNA
operacion. Esto no sale en verde nunca: o los deltas no declaran
ADDED/MODIFIED/REMOVED/RENAMED, o los encabezados no tienen el formato que
OpenSpec espera.
```

Un archive que no aplica nada es exactamente el fail-open que el marco combate.
**Si el script sale en verde con "0 operaciones", el script esta roto** — no el
change.

---

## Paso 3 — Mover el change con `git mv`

`git mv` funciona donde el rename del CLI falla. Verificado en Windows el
2026-08-19: mueve el directorio completo, con los deltas anidados
(`specs/<capability>/spec.md`) y los archivos ocultos (`.openspec.yaml`).

**Primero la guarda de acople, y no es opcional.** Un `git mv` a secas no
comprueba nada: mueve la carpeta y deja apuntando al vacio a cualquiera que
dependa de una ruta de adentro. Si venis del paso 2, la guarda ya corrio ahi y no
hace falta repetirla. Si el change **no lleva deltas de spec** —y entonces el
paso 2 no se corre nunca— este comando es la unica vez que corre:

```bash
node .claude/skills/projects-archive-change/aplicar-deltas.mjs <nombre-del-change> --acople
```

Sale **0** con una linea diciendo que nadie de afuera depende del change, **1**
nombrando cada dependiente, y **2** si el nombre del change no existe — que no es
lo mismo que "nadie depende de el", y por eso no sale 0.

```bash
git mv openspec/changes/<nombre-del-change> openspec/changes/archive/YYYY-MM-DD-<nombre-del-change>
```

(La carpeta `openspec/changes/archive/` ya existe con los archives anteriores. Si
fuera el primero, el rodeo de abajo la crea solo.)

**Si eso te da EPERM** (el mismo lock que tumba al CLI), el rodeo por archivo
tambien esta verificado y mueve TODO lo rastreado, incluidos deltas y ocultos —
que es justo lo que se pierde cuando alguien mueve a mano solo los tres `.md`
que recuerda:

```bash
node .claude/skills/projects-archive-change/aplicar-deltas.mjs <nombre-del-change> \
  --mover openspec/changes/archive/YYYY-MM-DD-<nombre-del-change> --simulacro
node .claude/skills/projects-archive-change/aplicar-deltas.mjs <nombre-del-change> \
  --mover openspec/changes/archive/YYYY-MM-DD-<nombre-del-change>
```

Este rodeo corre la guarda de acople por su cuenta, antes del primer `git mv` y
tambien en simulacro, asi que no hace falta el `--acople` de arriba si usas este
camino. Primero en seco, como el paso 2: imprime un `git mv` por archivo sin
mover nada.
Sin `--simulacro` los ejecuta uno a uno, creando los subdirectorios que hagan
falta. Si un `git mv` falla a mitad, para ahi y te dice cuantos archivos alcanzo
a mover — un movimiento a medias que se anuncia es recuperable con
`git status --short`; uno que sigue de largo, no. Y si la ruta no tiene NI UN
archivo rastreado es rojo, no un verde mudo: "no hay nada que mover" y "ya estaba
archivado" se ven igual y no son lo mismo.

**La fecha del prefijo es la del archive.** Si el nombre del change ya empieza
con `YYYY-MM-DD-`, no le apiles otra.

**Verificacion del paso 3** — no queda **ni un archivo** en la ruta original (el
`git ls-files` tiene que salir vacio; si imprime algo, eso es lo que te estas
dejando sin archivar), la carpeta no aparece mas y no hay nada sin rastrear:

```bash
git ls-files openspec/changes/<nombre-del-change>/
git status --short
ls openspec/changes/
```

---

## Paso 4 — Las tres verificaciones que cierran el archive

```bash
npx --yes @fission-ai/openspec@X.Y.Z validate --all --strict
npx --yes @fission-ai/openspec@X.Y.Z list
```

- `validate --all --strict` en **verde**, y el total de items validados **baja en
  1** (el change dejo de contar como activo).

> ⚠️ **Si el change creo una capability NUEVA, este comando sale ROJO acá, y es
> esperable.** Una capability nueva nace con `Purpose: TBD` —lo escribio el Paso 2,
> porque los deltas no transportan la seccion `## Purpose`— y `--strict` rechaza
> el TBD. **Le pasa al PRIMER change de todo proyecto**, porque su
> `openspec/specs/` empieza vacio y cualquier delta crea capability.
>
> No es un archive mal hecho: es un paso que todavia no hiciste. **Anda al Paso 5,
> completa los `Purpose`, y volve acá.** Los tres verdes se piden despues de eso.
- `list` **sin changes activos** (o sin el que acabas de archivar).
- **El guardrail de deltas en verde.** Ese no corre en local: vive en el marco y
  llega a este repo por el `uses: ...@<version>` del `ci.yml`, asi que su veredicto se
  lee en el PR. Si lo queres antes del push, hace falta un checkout del marco:
  `node <checkout-del-marco>/actions/guardrail-deltas/check-openspec-deltas.mjs`
  corrido desde la raiz de ESTE repo. No es obligatorio adelantarlo, pero si el
  PR se pone rojo ahi, el arreglo es el mismo del paso 1: el MODIFIED perdio
  escenarios o el retitulado no se declaro.

Los verdes son la evidencia de que el archive quedo bien hecho. Pegalos en el PR,
junto al del guardrail cuando el CI lo publique.

---

## Paso 5 — Los `Purpose: TBD`, en el MISMO PR

Una capability creada por el archive **nace con `Purpose: TBD`**, y un `Purpose`
desactualizado sobrevive al archive: los deltas **no transportan** la seccion
`## Purpose`, asi que el archive reemplaza requirements y deja los encabezados
intactos. No es un bug, es el formato.

```bash
grep -rn -E "Purpose: TBD|^TBD$" openspec/specs/
```

> **Va `grep -r` y no `git grep`, y la diferencia importa acá.** `git grep` solo
> mira lo que git ya tiene registrado: sobre un archivo que el Paso 2 acaba de
> escribir y que todavia no pasó por `git add`, **devuelve vacio** — y ese vacio se
> lee como «no hay ningun TBD». Justo al reves de la verdad, y justo en el caso
> mas comun: la capability recien creada.

Todo lo que aparezca se completa **en este mismo PR**. En el proyecto donde nacio
el marco una capability vivio una semana con el Purpose en TBD sin que nadie lo
notara.

Revisa ademas que el `## Purpose` de las capabilities que tocaste siga siendo
verdad despues del archive.

---

## Paso 6 — PR

```bash
git add -A
git commit -m "docs(openspec): <nombre-del-change> cerrado y archivado — <N>/<N> tareas"
git push -u origin docs/archive-<nombre-del-change>
gh pr create --title "docs(openspec): archive de <nombre-del-change>" --body "Closes #<sub-issue>"
```

`Closes #<numero>` va en el cuerpo **desde la creacion**: es lo unico que crea el
enlace real. Un `ref #N` en texto plano **no enlaza nada**.

En el cuerpo del PR van las tres salidas del paso 4 y una linea que explique que
los specs que aparecen en el diff **son el contrato vigente promovido**, no
contenido nuevo — es la pregunta que sale en review todas las veces.

---

## Trampas conocidas, resumidas

| Trampa                               | Sintoma exacto                                                                                                          | Que hacer                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `openspec archive` en Windows        | Imprime `Specs updated successfully` y hace rollback: `git status --short` no muestra ni un cambio en `openspec/specs/` | No usar el CLI para archivar en Windows. Usar esta skill                                           |
| Script de archive que no aplica nada | "deltas aplicados" con cero operaciones y exit 0                                                                        | El script de esta skill sale 1 en ese caso. Si ves un verde con 0 operaciones, el script esta roto |
| MODIFIED que omite escenarios        | `validate --strict` en **verde** y aun asi el spec vivo pierde escenarios al archivar                                   | Comparar titulo por titulo antes de aplicar + conteo de escenarios antes/despues                   |
| Retitulado sin declarar              | El guardrail **no avisa** cuando el titulo del delta no existe en el spec vivo                                          | Declarar el par FROM/TO en `## RENAMED Requirements`                                               |
| Capability nueva                     | Nace con `Purpose: TBD` y nadie lo nota                                                                                 | `git grep -n "Purpose: TBD" -- openspec/specs/` y completarlo en el mismo PR                       |

## Estado de verificacion del script

`aplicar-deltas.mjs` vive junto a esta skill, asi que **ningun banco de pruebas lo
cubre**: no es una composite action del marco ni un paquete de este repo, y su
unica verificacion es la de abajo. Se verifico a mano el 2026-08-19 sobre fixtures
sinteticas, en estos casos:

| Caso                                                   | Resultado esperado                                                                                                 | Verificado |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------- |
| RENAMED + MODIFIED + REMOVED + ADDED en una capability | 4 operaciones, requirement reemplazado completo, escenario nuevo presente                                          | ✔          |
| Capability nueva (solo ADDED, sin spec vivo)           | Se crea el spec con `Purpose: TBD` y `::warning::` nombrandolo                                                     | ✔          |
| Delta sin ninguna seccion de operaciones               | exit 1 por la guarda de cero operaciones; el spec vivo intacto                                                     | ✔          |
| MODIFIED contra un requirement inexistente             | exit 1 al planificar, **sin escribir ni un archivo** (md5 del spec vivo sin cambio)                                | ✔          |
| Change que existe pero sin carpeta `specs/`            | exit 1 diciendo que el change EXISTE y no lleva deltas                                                             | ✔          |
| Corrido fuera de la raiz del repo                      | exit **2** nombrando la causa real (no estas en la raiz), sin concluir nada sobre el change                        | ✔          |
| Nombre del change con typo                             | exit **2** listando los changes activos, sin concluir que el change no tenga deltas                                | ✔          |
| Archivos con CRLF (Windows)                            | Aplica igual: el lector normaliza los saltos de linea                                                              | ✔          |
| Dependencia EJECUTABLE de fuera del change (`.mjs`)    | exit **1** en los tres caminos —deltas, `--mover` (incluso en simulacro) y `--acople`—, sin mover ni escribir nada | ✔          |
| Mencion en PROSA de fuera del change (`.md`)           | `::warning::` con la linea y exit **0**: una frase vieja no rompe nada y no frena el archive                       | ✔          |
| `--acople` sobre un nombre de change que no existe     | exit **2** diciendo que no se pudo mirar, no que nadie dependa                                                     | ✔          |
| `git` fuera del PATH, en cualquier camino              | exit **1** en la guarda: lo no verificable es rojo, nunca verde mudo                                               | ✔          |

Los tres codigos de salida son distintos a proposito: **0** aplico, **1** el
change esta mal (o el script esta roto), **2** el que se equivoco fue quien lo
invoco. Confundir el 2 con el 1 era el fallo que tenia este script hasta el
2026-08-19: corrido desde el directorio equivocado imprimia "este change no
tiene deltas" — el mismo mensaje del caso legitimo — y ese mensaje **invita a
archivar con `git mv` a secas**, o sea a mover el change sin fundir sus deltas.
Verde por el camino equivocado, contrato perdido en silencio.

Si cambias el script, repeti esos doce casos antes de usarlo sobre specs
reales.

## Checklist

- [ ] `validate --all --strict` en verde ANTES de empezar
- [ ] Inventario de operaciones del delta, hecho a mano
- [ ] Cada MODIFIED comparado contra el spec vivo (el guardrail no cubre el retitulado no declarado)
- [ ] `--simulacro` contrastado con el inventario
- [ ] Deltas aplicados, con diff real en `openspec/specs/`
- [ ] Conteo de escenarios antes/despues: ninguna baja sin `REMOVED` declarado
- [ ] Change movido con `git mv`, carpeta original vacia
- [ ] `validate --all --strict` + `list` sin changes activos + guardrail de deltas: los tres verdes
- [ ] Sin `Purpose: TBD` pendientes
- [ ] PR con `Closes #<sub-issue>` desde la creacion
