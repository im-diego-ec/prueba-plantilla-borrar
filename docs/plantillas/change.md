# El esqueleto de un change de OpenSpec

**Todo cambio de este proyecto entra por acá.** Un **change** es la carpeta donde
queda escrito, ANTES de programar, qué se va a cambiar y por qué. Son cuatro
archivos que contestan cuatro preguntas distintas, y el orden en que se escriben
no es estético: cada uno se aprueba antes de que empiece el siguiente.

**Dos palabras, antes de la tabla.** El **PO** es quien decide qué se construye —
el dueño del producto, no del código. El **builder** es quien lo construye. En un
equipo de una sola persona son la misma, y entonces las dos aprobaciones son dos
lecturas distintas del mismo texto, hechas en momentos distintos.

## Los cuatro archivos, y quién aprueba cada uno

| Archivo | Qué contesta | Quién lo aprueba |
| --- | --- | --- |
| `proposal.md` — el **proposal**, o sea el planteo: por qué vale la pena | **por qué**, y qué cambia | el PO |
| `specs/<capacidad>/spec.md` — una **spec**: cómo se comporta el sistema, en escenarios | **cómo se comporta** | el PO |
| `design.md` | **cómo se hace**, y qué se descartó | el otro builder |
| `tasks.md` | **los pasos**, en orden | el otro builder |

**Por qué importa el orden.** Si el `design.md` ya está escrito cuando el PO
aprueba el proposal, su aprobación es un trámite: está decidiendo *qué* cuando el
*cómo* ya está decidido. Ésa es la razón de que esto se escriba de a partes.

## Crear el directorio

```bash
npx --yes @fission-ai/openspec@1.9.0 new change <nombre-con-guiones>
```

Crea la carpeta y **para ahí**: no escribe ningún artefacto. El nombre no puede
llevar espacios, y conviene que nombre **una rebanada** —«recepción de
mercadería»— y no el proyecto entero: un change se propone, se aprueba y se
archiva, así que uno que abarca todo no puede cerrarse nunca.

Para saber qué te falta en cualquier momento:

```bash
npx --yes @fission-ai/openspec@1.9.0 status --change <nombre>
```

---

## 1 · `proposal.md`

```markdown
# <Título en una línea: qué cambia>

## Por qué

<El problema, en dos o tres frases. Qué duele HOY y a quién. Si no se puede
nombrar a quién le duele, probablemente no haya que hacerlo todavía.>

## Qué cambia

<Lo que va a ser distinto cuando esto esté hecho, en viñetas y en lenguaje del
negocio. No cómo se implementa.>

## Qué NO cambia

<El límite. Es la sección que evita que el change crezca hasta no poder cerrarse.>
```

## 2 · `specs/<capacidad>/spec.md`

Acá va **el comportamiento**, en escenarios. Es lo que el PO aprueba y lo que
después se puede verificar.

Un **requirement** es una afirmación sobre lo que el sistema tiene que hacer,
escrita de forma que se pueda comprobar.

> ⚠️ **Los requirements van en inglés y con `SHALL` o `MUST`.** **SHALL** es la
> palabra que el validador de OpenSpec busca **literalmente** para reconocer una
> línea como requerimiento. No es una preferencia de estilo: un requirement
> escrito con «DEBE» **no valida** — medido: sale 1. La prosa alrededor puede
> estar en castellano; la línea del requirement, no.

```markdown
## ADDED Requirements

### Requirement: <Nombre de la capacidad>

The system SHALL <lo que tiene que pasar, en una frase verificable>.

#### Scenario: <El caso, nombrado por lo que ocurre>
- **WHEN** <la condición, concreta>
- **THEN** <lo observable, que alguien pueda comprobar>

#### Scenario: <Y el caso borde, que es el que importa>
- **WHEN** <la condición rara>
- **THEN** <qué pasa — y si es un error, cuál>
```

Comprobalo antes de pedir aprobación:

```bash
npx --yes @fission-ai/openspec@1.9.0 validate --all --strict
```

## 3 · `design.md`

```markdown
# Diseño

## Cómo

<La forma de la solución. Suficiente para que otro builder pueda discutirla sin
leer el código.>

## Qué se descartó, y por qué

<Ésta es la sección que justifica el archivo. Dentro de seis meses alguien va a
proponer exactamente lo que acá se descartó: sin el motivo escrito, no hay forma
de saber si el contexto cambió o si es la misma idea otra vez.>

## Qué se rompe si esto está mal

<Los modos de falla. Si no hay ninguno, probablemente el diseño no se pensó.>
```

## 4 · `tasks.md`

```markdown
# Tareas

- [ ] 1. <El primer paso, con el archivo que toca>
- [ ] 2. <El siguiente>
- [ ] 3. La verificación que prueba que 1 y 2 andan
```

**Cada tarea tiene que poder marcarse.** «Mejorar el rendimiento» no se marca;
«bajar la consulta de N+1 a una sola, medido con el script X» sí.

---

## Cuando está hecho

El change se **archiva** —o sea que se cierra y se guarda como historia
inmutable—: pasa a `openspec/changes/archive/YYYY-MM-DD-<nombre>/`. Este proyecto
trae una skill para eso (`projects-archive-change`), porque el archivado tiene que
dejar también el rastro de qué se aprobó y cuándo.
