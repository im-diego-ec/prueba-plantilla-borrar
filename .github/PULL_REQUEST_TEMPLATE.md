<!-- Plantilla de PR — hace cumplir el flujo OpenSpec descrito en AGENTS.md. -->

## Change de OpenSpec

<!-- Un "change" es la carpeta donde queda escrito, ANTES de programar, qué se va a
     cambiar y por qué. Pegá acá su ruta, p.ej. openspec/changes/<nombre>.
     Si es un PR directo (arreglo de un error, subir dependencias, reordenar código
     sin que cambie nada visible, documentación), escribí "PR directo" y por qué no
     necesita uno. -->

openspec/changes/

## Qué resuelve

<!-- 1-2 frases: el problema o la necesidad de negocio.
     Si cierra un sub-issue: "Closes #N" (se cierra solo al mergear).
     "ref #N" NO enlaza nada — tiene que ser Closes. -->

## Cambios

<!-- Bullets de lo que cambió. Marca **BREAKING** lo que rompa contratos. -->

-

## Evidencia de tests

<!-- Obligatorio. Pega la salida relevante o enlaza la corrida de CI verde.
     Si algo no pudo verificarse localmente, dilo explícitamente y por qué. -->

## Checklist

- [ ] El change de OpenSpec está enlazado arriba (o justificado como PR directo)
- [ ] Se cumplen los escenarios de la **spec** —el documento que dice cómo tiene que
      comportarse esto, escrito en ejemplos concretos— y alguien de negocio lo confirmó
- [ ] Tests verdes en LOCAL antes del push (CI es la corrida final, no el banco de pruebas)
- [ ] **Si corrige un defecto**: incluye el test de regresión que lo REPRODUCE (rojo antes del fix), al nivel más bajo suficiente
- [ ] **Si toca `openspec/`**: `openspec validate <change> --strict` en verde, y releídas entre sí las cuatro partes del change para que no se contradigan: **proposal** (por qué y qué cambia) ↔ **design** (cómo) ↔ **specs** (cómo se comporta) ↔ **tasks** (los pasos)
- [ ] **Si toca `infra/` o `infra-prod/`**: el `.tf` del PR es EXACTAMENTE lo aplicado (plan limpio) y se respetó la política de infra (dev primero, con horneado, salvo urgencia)
- [ ] **Si escribe en producción**: OK explícito de im-diego-ec en esta sesión
- [ ] Sin secrets ni credenciales en el diff
- [ ] Revisión cruzada pedida. No hace falta elegir a nadie: la asigna sola
      `.github/CODEOWNERS`, el archivo que dice quién aprueba qué, y le toca a quien no
      escribió el código
