# Adaptadores de plataforma — mi-proyecto

El marco **no elige la nube**. Lo que fija son **cuatro capacidades**; quién se las da a
este proyecto es una decisión de este proyecto, y se escribe acá.

**De dónde arranca este repositorio: `aws`.** No porque sea la mejor opción —no lo es si el
objetivo es coste cero— sino porque es la única que el andamio reparte ya escrita, en
`infra/` e `infra-prod/`. La clave `plataforma` de `.projects-valores.json` nace diciendo
`aws` para que diga la verdad sobre lo que hay en el disco. Elegir otra cosa es un cambio
que hoy **se hace a mano**, y los pasos están en cada adaptador.

Este archivo se lee entero **una vez**, al elegir plataforma, y después se borran los
adaptadores que no se eligieron. Lo que queda es la declaración de qué cubre lo elegido y
qué falta decidir.

> **Este archivo vive en `infra/` pero no es Terraform.** Si la plataforma elegida no usa
> Terraform —o es `ninguna`— las raíces `infra/` e `infra-prod/` se borran y **este
> archivo se mueve a la raíz del repositorio**: es lo único de este directorio que sigue
> valiendo cuando no hay Terraform.

## Las cuatro capacidades — el contrato

Un adaptador no se juzga por su producto sino por si contesta las cuatro:

| #   | Capacidad                 | La pregunta que contesta                                            |
| --- | ------------------------- | ------------------------------------------------------------------- |
| a   | Cómputo de la API         | ¿Dónde corre el proceso que atiende las peticiones?                 |
| b   | Base de datos             | ¿Dónde viven los datos, y quién los respalda?                       |
| c   | Secretos                  | ¿Cómo llega un secreto al proceso **en el arranque de cada tarea**? |
| d   | Despliegue y verificación | ¿Cómo sube una versión, y cómo se comprueba que quedó sana?         |

**(c) es la que no se negocia y es la más cara de aprender.** Un secreto se resuelve en el
arranque, por la identidad del runtime. **Nunca se copia al build**: una credencial
rotativa capturada como variable de entorno del deploy caduca sola y tira la aplicación
sin que nadie haya tocado nada. Un secreto copiado al build es una caída con fecha. Y su
valor no entra al estado de la IaC: los secretos se crean por fuera.

**(d) tiene dos mitades y la segunda se olvida.** Desplegar no es terminar: hace falta una
comprobación automática de que lo desplegado responde, y un camino de vuelta cuando no.

## Cómo se lee un adaptador

Cada uno declara lo mismo, en el mismo orden:

- **CUBRE** — qué capacidades de las cuatro resuelve, y con qué.
- **COSTO** — qué se paga cuando se paga.
- **PLAN GRATUITO** — el límite real, **medido contra la página del proveedor y con la
  fecha de la medición**. Los planes gratuitos cambian sin aviso: una cifra sin fecha es
  una cifra que ya no se puede verificar.
- **PENDIENTES** — lo que falta decidir, con la misma forma de tres partes que usa
  `pendientes.tf`: **QUÉ FALTA**, **CÓMO SE DECIDE** y **SI NO SE HACE**. El del medio es
  el que importa: sin criterio, un pendiente lo resuelve sólo quien ya sabía la respuesta.

Los pendientes de acá llevan el token `PENDIENTE-PLATAFORMA` y **no** `PENDIENTE-INFRA`, a
propósito: son dos listas distintas y el grep de una no debe traer la otra.

    grep -rn PENDIENTE-PLATAFORMA .

Como los de infraestructura, **hoy no tienen compuerta** —ninguna comprobación bloquea el
merge por esto—: el pipeline no se pone rojo por
ellos. Es disciplina declarada y se revisa a mano.

### PENDIENTE-PLATAFORMA · el marco · la clave todavía no la lee nadie

**QUÉ FALTA** — Que una herramienta del marco lea `plataforma` y actúe: que `projects init`
reparta `infra/` e `infra-prod/` sólo cuando la plataforma elegida use Terraform, y que el
valor se valide contra la lista de cinco.

**CÓMO SE DECIDE** — No lo decide este proyecto: es trabajo del marco y se pide ahí.
Mientras tanto la clave es **declarativa** —dice qué eligió el proyecto y no cambia lo que
la herramienta copia—, así que escribir `azure` o borrarla no produce ningún aviso. Lo que
sí muerde hoy es el disco: el job de Terraform del CI mira si los directorios existen.

**SI NO SE HACE** — La clave y el repositorio divergen en silencio, que es exactamente el
defecto que este archivo existe para evitar. Hasta que el marco lo cierre, **la coherencia
se sostiene a mano**: si se cambia la clave, los pasos del adaptador van en el mismo commit.

---

## `ninguna` — sin infraestructura

**Es una respuesta, no un hueco.** Un proyecto que todavía no despliega no tiene que
mentir eligiendo una nube: elegirla antes de necesitarla fija decisiones caras con la
información del primer día, que es la peor que va a haber.

- **CUBRE** — (a) y (b) las cubre la máquina de quien desarrolla: el API corre con
  `pnpm dev` y la base es el contenedor de `docker-compose.yml`. (c) se cumple igual, con
  `.env` fuera del control de versiones y sin un solo secreto en el repositorio. (d) **no
  aplica**: no hay nada desplegado que verificar.
- **COSTO** — cero, y es cero de verdad y no cero hasta que caduque una promoción.
- **PLAN GRATUITO** — no aplica.
- **Qué hay que hacer en el repositorio** — cuatro pasos, y **hasta que estén hechos el CI
  sigue exigiendo Terraform**, porque el job decide mirando si los directorios existen y no
  la clave: (1) mover este archivo a la raíz y borrar `infra/` e `infra-prod/` enteros; (2)
  borrar las dos entradas del ecosistema `terraform` de `.github/dependabot.yml`; (3)
  opcionalmente borrar el paso «Formato y validez de las raíces de Terraform» del
  `ci.yml` —sin raíces ya sale verde solo, y dejarlo puesto abarata volver a Terraform—; y
  (4) poner `"plataforma": "ninguna"` en `.projects-valores.json`. Con el paso 1 hecho, ese
  job dice `::notice::` y sale verde para siempre: no queda ninguna ventana que pueda
  vencer.

### PENDIENTE-PLATAFORMA · ninguna · cuándo deja de alcanzar

**QUÉ FALTA** — Nada, mientras el proyecto no tenga que estar disponible para alguien que
no sea quien lo desarrolla.

**CÓMO SE DECIDE** — La pregunta es de negocio y tiene una sola forma: ¿hay alguien fuera
del equipo que necesite entrar? El día que la respuesta sea sí, se vuelve a este archivo y
se elige adaptador. Antes de ese día, elegir es adivinar.

**SI NO SE HACE** — Nada. Ésta es la salida legítima, y por eso es de primera clase.

---

## `supabase` — base administrada con plan gratuito permanente

Es el adaptador que más capacidades cubre con un plan gratuito **permanente**.
Lo que sigue es lo que cubre y lo que cuesta; si es la opción correcta para
este proyecto lo dice el proyecto, no este archivo.

- **CUBRE** — (b) de fábrica: PostgreSQL administrado, con respaldos y con auth incluida.
  (c) con las variables de entorno del proyecto, resueltas por el runtime. (a) sólo si el
  API es liviana y cabe como función; si el API es un proceso Express de verdad, **(a) se
  cubre con otro adaptador** —lo natural es `cloudflare` o `gcp`— y Supabase se queda con
  la base. Combinar dos adaptadores es legítimo y frecuente: lo que no es legítimo es
  dejar una capacidad sin dueño escrito.
- **COSTO** — cero en el plan Free. El escalón siguiente se paga por proyecto y por mes.
- **PLAN GRATUITO** _(medido en supabase.com/pricing el 2026-08-24)_:
  - 500 MB de base de datos, CPU compartida y 500 MB de RAM
  - 5 GB de egreso, más 5 GB de egreso cacheado
  - 50 000 usuarios activos por mes
  - 1 GB de almacenamiento de archivos
  - peticiones de API sin límite declarado
  - **el límite que sorprende**: los proyectos gratuitos **se pausan tras una semana sin
    actividad**, y hay un máximo de **2 proyectos activos** por cuenta

### PENDIENTE-PLATAFORMA · supabase · la pausa por inactividad

**QUÉ FALTA** — Decidir qué pasa cuando el proyecto de dev se pausa, y quién lo despierta.

**CÓMO SE DECIDE** — Un ambiente de dev que se usa a diario no se pausa nunca y el límite
es teórico. Uno que se toca cada dos semanas se va a pausar, y el síntoma es una suite de
pruebas que falla con un error de conexión que no dice «pausado». Si el proyecto va a tener
rachas, el arreglo es un ping periódico o asumir la espera del despertar y escribirlo.

**SI NO SE HACE** — El primer CI que corra después de una pausa sale rojo por un motivo que
no está en el mensaje, y se busca en el código de la aplicación.

### PENDIENTE-PLATAFORMA · supabase · quién cubre (a) y (d)

**QUÉ FALTA** — Dónde corre la API, y cómo se despliega y se verifica.

**CÓMO SE DECIDE** — Si la API es un Express con dependencias de Node, no entra como
función: se combina con `cloudflare` o con `gcp` y se escribe cuál. La verificación
post-deploy es la misma en los tres casos —un endpoint de salud que el pipeline consulta
después de publicar— y **no depende de la plataforma**, así que se escribe una vez.

**SI NO SE HACE** — Queda una capacidad sin dueño, que es la forma en que un proyecto
descubre en producción que nadie decidió dónde corría.

---

## `cloudflare` — Workers y Pages

De las cuatro plataformas con plan gratuito, la de límites más amplios para (a) y para el
front.

- **CUBRE** — (a) con Workers, si la API tolera el modelo de ejecución (no es Node
  completo: hay que verificar cada dependencia nativa antes de prometer nada). El front
  con Pages. (d) con el despliegue propio de la plataforma. **(b) no la cubre con una base
  relacional administrada del estilo que el resto del marco asume**: se combina con
  `supabase` o se declara el desvío.
- **COSTO** — cero en el plan Free. El escalón siguiente es una suscripción mensual plana
  más consumo.
- **PLAN GRATUITO** _(medido en developers.cloudflare.com el 2026-08-24)_:
  - Workers: **100 000 peticiones por día**, **10 ms de CPU por petición**, 50
    subpeticiones por invocación, 3 MB de tamaño comprimido del worker
  - Pages: **500 builds por mes**, hasta 20 000 archivos por sitio, 25 MiB por archivo; la
    documentación **no declara** un límite de ancho de banda

### PENDIENTE-PLATAFORMA · cloudflare · los 10 ms de CPU

**QUÉ FALTA** — Verificar que el trabajo por petición de esta API entra en el presupuesto
de CPU del plan gratuito.

**CÓMO SE DECIDE** — Se mide, no se estima: el límite es de **CPU**, no de tiempo de
reloj, así que esperar a la base no cuenta y serializar un JSON grande sí. Una API que
consulta y responde suele entrar; una que hace criptografía, comprime o procesa imágenes,
no. Se prueba con la petición más pesada que el proyecto tenga, antes de comprometerse.

**SI NO SE HACE** — La plataforma corta la petición al superar el presupuesto. El error
aparece bajo carga y no en desarrollo, que es cuando más caro es diagnosticarlo.

---

## `gcp` — Cloud Run

Contenedores de verdad —la misma imagen que corre en local— con un plan gratuito mensual
permanente.

- **CUBRE** — (a) con Cloud Run, que corre la imagen del `Dockerfile` sin reescribir la
  API. (c) con el gestor de secretos de la plataforma, montado en el arranque de cada
  instancia. (d) con el despliegue por revisiones, que además da el camino de vuelta:
  volver a la revisión anterior es una operación, no una reconstrucción. **(b) es la mitad
  cara**: la base relacional administrada del proveedor **no está en el plan siempre
  gratis**, así que o se combina con `supabase` o se paga.
- **COSTO** — el cómputo por encima del plan gratuito, y la base desde el primer día si se
  toma la del proveedor.
- **PLAN GRATUITO** _(medido en cloud.google.com/free/docs/free-cloud-features el
  2026-08-24, para facturación por petición)_:
  - **2 millones de peticiones por mes**
  - 360 000 GB-segundo de memoria y 180 000 vCPU-segundo de cómputo
  - 1 GB de transferencia saliente desde Norteamérica por mes

### PENDIENTE-PLATAFORMA · gcp · dónde vive la base

**QUÉ FALTA** — Elegir quién cubre (b), y escribirlo.

**CÓMO SE DECIDE** — Si el objetivo es coste cero, la base va a `supabase` y Cloud Run se
queda con (a); la conexión sale a internet y eso hay que decidirlo con los ojos abiertos.
Si la base va a ser del mismo proveedor, deja de haber plan gratuito y **el costo se
declara antes de crearla**, no después de la primera factura.

**SI NO SE HACE** — Se crea la base «para probar» y queda encendida. Es la forma más común
de que un proyecto sin presupuesto tenga una factura.

### PENDIENTE-PLATAFORMA · gcp · el techo del escalado

**QUÉ FALTA** — El máximo de instancias.

**CÓMO SE DECIDE** — El máximo **no es opcional**: sin techo, un pico —o un bucle— escala
hasta donde aguante la tarjeta y el presupuesto se entera después. Se arranca por el
escalón más chico que la aplicación tolere y se sube con evidencia; al revés no se puede,
porque un servicio sobredimensionado nunca da señal de estarlo.

**SI NO SE HACE** — Queda sin cumplir la garantía del marco de que el gasto tiene
presupuesto con aviso.

---

## `aws` — de donde arranca el repositorio, y ya no el default

Es la plataforma que el andamio trae desarrollada, en `infra/` e `infra-prod/`, con sus
pendientes escritos, y por eso es la que la clave `plataforma` declara al nacer.
**Sigue siendo válida y ya no es la primera opción**: su plan gratuito
es una promoción con fecha de vencimiento, no un escalón permanente, y un proyecto que
elige AWS para no gastar descubre el gasto cuando la promoción termina.

- **CUBRE** — las cuatro, y es la única de la lista que las cubre sola: cómputo en
  contenedores, base relacional administrada, secretos resueltos por el rol de ejecución en
  el arranque de cada tarea, y despliegue con verificación y vuelta atrás. Es la razón por
  la que estaba fijada.
- **COSTO** — por hora, desde el primer día, y no baja a cero cuando nadie usa el sistema.
  Ésta es la línea que hay que leer dos veces si el objetivo es coste cero.
- **PLAN GRATUITO** _(medido en aws.amazon.com/rds/free el 2026-08-24)_:
  - la base entra al plan gratuito **con fecha de caducidad**: hasta 6 meses para cuentas
    nuevas —más un crédito inicial de hasta 200 USD—, y 12 meses en el plan heredado de las
    cuentas abiertas antes del 2025-07-15
  - las clases cubiertas son `db.t3.micro` y `db.t4g.micro`, con PostgreSQL entre los
    motores; la variante serverless aparece limitada a 4 unidades de capacidad y 1 GiB de
    almacenamiento por clúster
  - **NO MEDIDO**: no se pudo confirmar contra la página de precios del cómputo en
    contenedores que exista un escalón siempre gratis. Se declara la incertidumbre en vez
    de suponerla: si el proyecto elige AWS por costo, **esta cifra hay que medirla antes**.

- **Cómo se concretan acá las tres reglas operativas del marco** —`lectura-de-aws-por-cli`,
  `skills-antes-de-tarea-aws` y `sin-em-dashes-en-recursos-aws`, que la constitución enuncia
  sin proveedor porque valen para todos—:
  - la lectura del estado va por la CLI del proveedor con los perfiles que el repo ya
    permite (`sin-aws`, `sin-aws`): `terraform validate`, `terraform plan`,
    los `describe-*` y las consultas de logs. Un servidor MCP del proveedor es
    configuración personal de cada máquina, no un supuesto del repositorio.
  - antes de una tarea de este proveedor, revisar si hay una skill que aplique y cargarla;
    su guía manda sobre el conocimiento general. Ojo: las skills disponibles cubren CDK,
    CloudFormation y serverless, **no Terraform** — se usan como referencia del SERVICIO,
    jamás como permiso para cambiar de IaC.
  - **sin em dashes en nombres ni descripciones de recursos** (usar guiones). Aplica sólo a
    valores que viajan al proveedor; la prosa de la documentación sigue el estilo normal.

### PENDIENTE-PLATAFORMA · aws · qué pasa cuando la promoción vence

**QUÉ FALTA** — La fecha en que la cuenta deja de estar en plan gratuito, y qué se hace ese
día.

**CÓMO SE DECIDE** — Se anota la fecha al crear la cuenta, no cuando llega. Las dos salidas
son apagar lo que no se use o presupuestar lo que sí; las dos son legítimas y la que no lo
es es enterarse por la factura. Un aviso de presupuesto configurado el primer día cuesta
nada y es lo único que convierte esto en una decisión.

**SI NO SE HACE** — El proyecto llega a la fecha sin haberlo mirado, y la primera señal es
un cargo.

Los pendientes de la infraestructura ya escrita —el bucket del estado, el clúster
compartido, las subredes, el dimensionamiento, el certificado y las alarmas— **no están
acá**: viven en `infra/pendientes.tf` y en `infra-prod/pendientes.tf`, que es donde se
resuelven.
