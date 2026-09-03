# Protección de `main` en mi-proyecto — estado real y cómo aplicarla

La protección de la rama de integración es un **acto humano deliberado**: nunca
se aplica desde el pipeline (un workflow con permiso para editar su propia
protección puede quitarla). Este documento es su **estado real** — el marco
exige que exista y que se actualice en el mismo cambio que modifique la
configuración.

### ⚪ No se pudo medir: GitHub no conoce (todavía) a `im-diego-ec/mi-proyecto` — intentado el 2026-09-03

```
$ gh api repos/im-diego-ec/mi-proyecto/rulesets
→ Not Found
```

**«No pude mirar» no es «no hay problema».** Esta herramienta no llegó a ver este
repositorio, así que **no afirma nada** sobre su protección de rama: ni que la tenga, ni
que pueda tenerla. Hasta que la sonda conteste, el estado de la protección de `main` acá es
**desconocido**, y así hay que escribirlo en cualquier informe.

Lo más probable es que el repositorio todavía no exista: `projects init` corre **antes** del
primer push. También puede ser que el nombre no sea ese, o que la cuenta autenticada no lo
vea. Volvé a correr la sonda de arriba después del push fundacional.

Y hay una respuesta concreta que conviene tener leída de antemano, porque el paso a paso no la
contemplaba. Si la sonda contesta
**403 «Upgrade to GitHub Pro or make this repository public»**, no es que este documento esté
desactualizado: es que GitHub no ofrece protección de rama en repositorios privados del plan
gratuito, y hay que elegir entre GitHub Pro, mover el repo a una organización con plan Team, o
hacerlo público.

Esta sección la escribió `projects init` **midiendo**, no copiándola de una plantilla.
Cuando cambie el plan, la visibilidad o el ruleset, volvé a correr la sonda de arriba y
actualizá esto con la fecha: un documento de estado que nadie vuelve a medir es una
afirmación vencida.

## Estado real

**Las cuatro que hay que encender** si este repositorio puede tenerlas — y eso **no se pudo
medir** (está acá arriba, con el motivo). Alcanzan para que nada entre a `main` sin pasar por
un PR verde:

| Regla                                    | Estado       | Nota                                                  |
| ---------------------------------------- | ------------ | ----------------------------------------------------- |
| Requiere pull request para integrar      | 🔴 pendiente | Con **aprobaciones requeridas = 0** (ver abajo)       |
| Check requerido: **`ci-ok`**             | 🔴 pendiente | Nombre exacto. Ver abajo por qué no puede ser otro    |
| Prohibido borrar `main`                  | 🔴 pendiente |                                                       |
| Prohibido force-push                     | 🔴 pendiente |                                                       |
| Sin bypass para nadie (admins incluidos) | 🔴 pendiente | Toda excepción concedida se escribe acá con su motivo |

**Se dejan apagadas a propósito, y el motivo va escrito acá el día que se aplica la
protección** — no en un TODO aparte:

| Regla                          | Estado      | Por qué no todavía                                                                                                                                                       |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 aprobación requerida         | 🔴 diferida | Con una sola persona programando, exigir la aprobación de otra y no dejar a nadie en la lista de excepciones **bloquea todo merge sin salida**. Se enciende cuando haya una segunda persona |
| Review de code owner requerido | 🔴 diferida | Es lo que convierte `CODEOWNERS` —el archivo que dice quién aprueba qué— en una condición real de merge; sin la fila de arriba no agrega nada, y con el equipo vacío no asignaría a nadie |
| Rama al día antes del merge    | 🔴 diferida | Útil con varios PRs en vuelo; con uno solo agrega una vuelta de CI por merge                                                                                             |
| Commits firmados               | 🔴 diferida | Exige que cada quien tenga su clave configurada; se enciende cuando todos la tengan, no antes                                                                            |

⚠️ **Encender las diferidas antes de tiempo es la forma más fácil de auto-encerrarse.**
Se probó: aprobación requerida + code owner + bypass vacía, con un equipo de una
persona, deja el repo sin ninguna vía de integrar. Aplicar este documento «pasando
los 🔴 a 🟢» sin leer esta nota es exactamente ese error.

Lo que el equipo decida **no** activar se declara acá como diferido, con su
motivo y el issue que lo rastrea. Nunca se omite ni se presenta como activo.

## El check requerido es `ci-ok`, y no es un detalle

`ci-ok` no hace trabajo propio: mira el resultado de todo lo demás que corre en
`.github/workflows/ci.yml` y lo resume en un sí o un no. Corre con `if: always()`
y **responde en los dos casos**, el cambio de código y el de solo documentación.

Exigir un trabajo que solo responde en uno de los dos —`build-test`, que en un pull
request de solo documentación queda salteado— deja ese caso bloqueado para siempre esperando
una señal que nunca llega. Un check `skipped` **no reporta**. Es el error más
caro y más silencioso de la configuración inicial.

## Aplicarla desde cero

1. **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.
2. Nombre: `main-protegida`. Enforcement status: **Active**.
3. Target branches: **Include default branch**.
4. Reglas a marcar — **solo estas cuatro**, que son las de la primera tabla:
   - Restrict deletions
   - Block force pushes
   - Require a pull request before merging → **Required approvals: `0`**
   - Require status checks to pass → agregar el check **`ci-ok`** (aparece en la
     lista recién después de la primera corrida de CI: si no está, abrí un PR
     cualquiera primero)
5. **Reglas que NO se marcan todavía**, y son exactamente las de la segunda
   tabla: `Require signed commits`, `Required approvals: 1`,
   `Require review from Code Owners` y `Require branches to be up to date before
merging`. Marcarlas ahora es el auto-encierro que advierte la nota ⚠️ de más
   arriba — no es una omisión de esta lista, es su punto.
6. **Bypass list: vacía.**
7. Actualizar la tabla de estado real en el mismo PR.

## Contrastar lo escrito contra la configuración real

```bash
gh api repos/im-diego-ec/mi-proyecto/rulesets --jq '.[] | "\(.id)  \(.name)  \(.enforcement)"'
gh api repos/im-diego-ec/mi-proyecto/rulesets/<id> --jq '.rules[] | .type'
gh api repos/im-diego-ec/mi-proyecto/rulesets/<id> --jq '.bypass_actors'
```

Si la salida no coincide con la tabla, manda la salida: el documento está
desactualizado y se corrige en el acto.

> **Y si esa sonda contesta 403 «Upgrade to GitHub Pro or make this repository public»**, la
> lectura no es «el documento está desactualizado»: es que este repositorio, con su plan y su
> visibilidad de hoy, no puede tener rulesets. Está medido y explicado arriba, en el bloque que
> escribió `projects init`.
