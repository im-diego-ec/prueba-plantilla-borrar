# `docs/` — lo que este proyecto deja escrito

La **constitución** —el documento que el marco deja en cada proyecto con las reglas
que no se discuten en cada pull request— manda dejar tres cosas por escrito, cada
una en su carpeta. Está en [`.projects/AGENTS-marco.md`](../.projects/AGENTS-marco.md). Estaban nombradas ahí y **las carpetas no
existían**, así que la primera vez que hacía falta una había que inventar dónde
ponerla.

| Carpeta | Qué va acá | Cuándo se escribe |
| --- | --- | --- |
| [`adr/`](adr/) | **ADR**: una decisión estructural escrita con lo que se descartó | cuando una decisión cambia la forma del sistema |
| [`postmortems/`](postmortems/) | Qué pasó en un incidente, sin culpas | dentro de las 48 h de un incidente |
| [`runbooks/`](runbooks/) | Qué hago cuando suena esta alarma | cuando una alarma existe y alguien la va a atender |
| [`plantillas/`](plantillas/) | Los esqueletos para empezar cada uno | — |

**Ninguna de las tres se llena por adelantado.** Un ADR escrito antes de tomar la
decisión es una suposición; un runbook escrito antes de que exista la alarma es
una adivinanza. Cada carpeta trae un `README.md` con qué va adentro y cómo se
llama el archivo.

## Y la que se usa primero

[`plantillas/change.md`](plantillas/change.md) es el esqueleto de un **change**: la
carpeta donde queda escrito, ANTES de programar, qué se va a cambiar y por qué.
Son cuatro archivos, en el orden en que se escriben y con qué contesta cada uno.
Es lo primero que vas a necesitar, porque todo cambio de este proyecto entra por
ahí.
