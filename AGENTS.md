# AGENTS.md — im-diego-ec / mi-proyecto

> Este archivo es la **constitución de ESTE proyecto** para humanos y para agentes de IA
> (Claude Code, Cursor). Se carga en **cada sesión** de codificación, y tiene dos mitades:
>
> - **Lo del marco** — las reglas comunes del área (cómo trabajamos con OpenSpec, git y
>   despliegue, las fronteras de tres niveles, seguridad y observabilidad, AWS, secretos,
>   GitHub). **No están escritas acá**: llegan como artefacto generado en
>   `.projects/AGENTS-marco.md`, que carga la línea de abajo. Ese archivo **no se edita a
>   mano** —lo reescribe el marco y el CI compara su contenido contra el texto publicado—,
>   y por eso una regla común se corrige **una vez para todos** en vez de envejecer copia
>   por copia en cada repo.
> - **Lo del proyecto** — todo lo que sigue en este archivo: su stack, sus decisiones, las
>   reglas que valen acá y en ningún otro repo. Es de este repo: editalo cuando el proyecto
>   lo necesite.

@.projects/AGENTS-marco.md

**Lo que NO va en este archivo**: las reglas comunes del área —están en el artefacto, y ahí
se corrigen una vez para todos— y las excepciones a ellas, que se declaran en
`.projects-desvios.json` con su motivo escrito. El artefacto explica cómo se declara un desvío
y qué manda ante conflicto; una copia divergente de una regla del marco es un defecto del
repo, no un matiz.

---

## 🕳️ Antes del primer commit (borrar esta sección cuando esté hecho)

El scaffold llega con huecos a propósito: lo que solo este proyecto sabe, no lo puede
adivinar una plantilla. Lo que SI llega resuelto es la base técnica — el andamio trae el
esqueleto de aplicación con sus tres paquetes y las compuertas en verde.

Mientras esta sección exista, el CI sale ROJO: el marco cuenta los símbolos de hueco del
scaffold y los lee como bootstrap a medias. Es a propósito, y es la razón por la que el
commit fundacional entra a `main` por push directo y la protección de rama se aplica
después. (Este párrafo no nombra el símbolo con el símbolo, justamente para no sumar uno
más al conteo.)

1. Revisar **Stack fijado** (la sección siguiente): llega LLENA con la base que el andamio
   implementa. Lo que hay que hacer es borrar la fila —y su paquete— de lo que este
   proyecto no vaya a tener, no llenarla.
2. Reemplazar todos los placeholders de doble llave del repo, **incluidos los valores de
   `.projects-valores.json`** (la lista completa, con qué poner en cada uno, está en el README
   del scaffold de Projects). Ese archivo es el que el marco lee para renderizar su porción de
   la constitución con los valores de este proyecto: si queda a medias, el artefacto sale
   con dobles llaves adentro y el CI se pone rojo por marcadores sin resolver.
3. Confirmar los tres roles (PO y dos builders) y que `.github/CODEOWNERS` tenga los
   equipos reales de la organización.
4. **Generar el artefacto del marco**: `gh workflow run actualizar-marco.yml` y mergear el
   PR que abre (o esperar la corrida semanal). Hasta que ese archivo exista, la línea
   `@.projects/AGENTS-marco.md` de arriba no carga nada y el CI lo avisa en cada corrida.
5. Revisar que Dependabot tenga acceso al repo del marco y que el marco esté en **su
   propio grupo** (`.github/dependabot.yml`). Este repo consume el marco por **versión
   exacta**, así que cada versión nueva llega como **PR de Dependabot**: el rojo de un
   check nuevo aparece DENTRO del PR, que es donde se puede leer antes de mergear. Dos
   cosas que hay que hacer bien o el aviso no llega: sin el acceso, Dependabot no ve el
   repo del marco; y si el marco comparte grupo con las demás actions, un PR del grupo
   trabado deja de proponer el bump (medido el 2026-08-21). Qué hacer con cada versión
   está en el artefacto del marco.
6. Borrar esta sección y este párrafo. **Recién ahí** corre la verificación final:
   `grep -rnE "\{\{[A-Z0-9_]+\}\}" --exclude-dir=node_modules --exclude-dir=.git .` no debe
   devolver nada (esta sección es la única que menciona la doble llave a propósito; el
   patrón exige mayúsculas para no marcar las expresiones `${{ ... }}` de GitHub Actions).

---

## `openspec` no está instalado en esta máquina

**Los comandos `/opsx:*` mandan correr `openspec …` a secas, y ese programa no
existe acá.** No está en el sistema, ni en `node_modules/.bin`, ni en las
dependencias de este proyecto. Escrito así devuelve `command not found`.

**La forma que sí corre lleva el paquete completo y la versión exacta:**

```bash
npx --yes @fission-ai/openspec@1.9.0 <subcomando>
```

Es la misma versión que el pipeline de este repositorio usa, así que lo que ves
en tu máquina y lo que ve el CI son el mismo programa. Un `npx` sin versión trae
la última publicada y ahí los dos dejan de coincidir.

**Por qué los archivos de `.claude/commands/opsx/` dicen otra cosa:** los escribe
`openspec init` y son de la herramienta, no de este proyecto. Editarlos sería
mantener un fork ajeno —y `openspec update` los reescribe—, así que la
sustitución se declara acá, que es donde este repositorio habla.

**`archive` es la excepción, y no por permisos:** para cerrar un change se usa la
skill `projects-archive-change` de este repositorio, no el `archive` del CLI. El
archivado tiene que dejar además el rastro de qué se aprobó y cuándo, y eso el
CLI no lo hace.

---

## Stack fijado

> **ESTA TABLA LLEGA LLENA, y eso es nuevo.** El andamio ya no trae solo la mecánica:
> trae el esqueleto de aplicación que corresponde a cada fila (`web/`, `api/`, `e2e/`),
> con pruebas que pasan y las compuertas del marco en verde. O sea que la tabla no es una
> intención, es la descripción de lo que hay en el repo. Borrá la fila —y su paquete— de lo
> que este proyecto de verdad no vaya a tener.
>
> El valor de esta tabla no es la lista: es que **queda congelada**. Introducir un
> framework, ORM, base de datos o servicio que no esté acá es una decisión y no una
> implementación — las fronteras del marco dicen cómo se pide.

| Capa                        | Herramienta                                                           |
| --------------------------- | --------------------------------------------------------------------- |
| Frontend                    | **React + TypeScript + Vite + Tailwind + shadcn/ui**                  |
| Backend                     | **Node + TypeScript + Express**                                       |
| Datos                       | **PostgreSQL** vía **Prisma**                                         |
| Auth                        | **Supabase Auth** (el SDK vive detrás de un contrato propio en `web/src/auth.ts`; el API verifica el JWT offline con `jose`) |
| Validación de input externo | **Zod**                                                               |
| Plataforma                  | **La elige el proyecto**; la que eligió este está en `.projects-valores.json` |
| CI/CD                       | **GitHub Actions**, con los workflows del marco. La promoción por ambientes que la constitución declara todavía no se reparte: está anotada como desvío |
| Package manager             | **pnpm** con workspaces (monorepo: web, api, e2e)                     |
| Tests                       | **Vitest** (unit/integración) + **Playwright** (E2E contra dev)       |

Salvo la fila **Plataforma**, ninguna de estas filas es elección del proyecto: las fija el
área y el andamio las entrega implementadas. Lo que el proyecto decide es lo que viene
ENCIMA — sus modelos, sus endpoints, sus pantallas.

**La plataforma SÍ la elige el proyecto, y es la decisión de más impacto en el costo.** El
marco fija cuatro capacidades —dónde corre la API, dónde vive la base, cómo se resuelven
los secretos en el arranque de cada tarea, y cómo se despliega y se verifica lo desplegado—
y no fija el producto que las da. Los valores admitidos son `supabase`, `cloudflare`,
`gcp`, `aws` y `ninguna`.


Los nombres de la fila **Package manager** son DIRECTORIOS y están escritos literales a
propósito: `projects init` copia las rutas tal cual y solo sustituye el contenido de los
archivos, así que los tres paquetes se llaman `web/`, `api/` y `e2e/` en todo repo nacido
del andamio. (Hubo acá un marcador del scaffold: una celda de tabla con un marcador no
puede quedar bien alineada de los dos lados de la sustitución, así que `prettier --check`
—que el CI corre sobre todo el árbol— salía rojo en el primer PR del repo nuevo por un
espacio. Medido, no supuesto.)

pnpm está fijado porque el CI que trae el scaffold lo ejecuta directamente (`corepack
enable`, `pnpm install --frozen-lockfile`, y `pnpm list -r` para derivar de pnpm —y no de
una lista escrita a mano— qué paquetes hay que verificar) y porque depende de una propiedad
concreta del workspace: **un único lockfile, en la raíz**. Un lockfile suelto dentro de un
paquete hace que local y CI resuelvan dependencias distinto; por eso el `.gitignore` del
scaffold los bloquea. Cambiar de package manager no es sustituir un comando: es reescribir
el job de build del CI y rehacer esa garantía.

Los **ambientes** de este proyecto —dominios, cuentas, perfiles, región—, el canal de
alertas y el prefijo de sus recursos NO se escriben acá: son valores, viven en
`.projects-valores.json` y el marco los imprime en su tabla de ambientes al renderizar el
artefacto. Así el día que cambie uno se cambia en un solo lugar y no hay dos tablas
diciendo cosas distintas.

---

## Lo propio de este proyecto

> 🕳️ Acá van las reglas que son de **este** repo y de ningún otro: una restricción de su
> dominio, una particularidad de su infraestructura, un acuerdo con otro equipo, una
> herencia que todavía no se terminó de limpiar. Escribilas con la misma forma que las del
> marco: qué se hace, qué no, y por qué.
>
> Ejemplos reales de otros repos del área, para calibrar el tamaño:
>
> - "El `spec/` viejo quedó archivado en `docs/legacy-spec/`, sin autoridad: la fuente de
>   verdad es `openspec/`."
> - "Todavía no existe `infra-prod/`: producción no está aprovisionada, así que la
>   promoción termina en dev."
> - "El enforcement duro del ruleset se activa cuando el segundo builder esté operativo."
>
> **Si al escribir una regla acá pensás "esto le sirve a todos los proyectos", no va acá**:
> se propone como change en el marco y llega por el artefacto. Y si lo que querés es
> apartarte de una regla del marco, eso no se escribe como regla propia — se declara como
> desvío en `.projects-desvios.json`, que es lo único que el marco reconoce como override.

Este proyecto todavía no tiene ninguna regla propia. Borrá esta línea al escribir la
primera.
