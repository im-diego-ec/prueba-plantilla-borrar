# Imagen del API. SE CONSTRUYE DESDE LA RAIZ DEL MONOREPO, no desde api/:
#
#   docker build -f api/Dockerfile -t mi-proyecto-api .
#
# Por que la raiz: en un workspace de pnpm el UNICO lockfile valido es el de la
# raiz (uno dentro de un paquete hace que local y CI resuelvan distinto, y el
# .gitignore lo prohibe). Con contexto api/ no habria lockfile que copiar y el
# install dejaria de ser reproducible. La version anterior de este archivo
# copiaba un pnpm-workspace.yaml SUELTO dentro de api/ para tapar eso; el
# workspace se declara una sola vez, arriba, y ese archivo ya no existe.
#
# LA ARQUITECTURA SE DECLARA, no se hereda de quien construye. Sin --platform,
# la imagen sale con la arquitectura de la maquina del build, y el comando de
# arriba lo corre una persona en su maquina: en un Mac con Apple Silicon eso es
# linux/arm64. Corre perfecto en local y el dia del primer despliegue la tarea
# muere al arrancar con "exec format error" — un mensaje que no nombra la
# arquitectura y que se termina buscando en el codigo, no aca.
#
# ESTE VALOR Y EL DE LA DEFINICION DE TAREA SON UNO SOLO: si el dimensionamiento
# del computo (PENDIENTE-INFRA 4, en infra/pendientes.tf) declara un
# runtime_platform ARM64, esta linea pasa a linux/arm64 EN EL MISMO COMMIT.
#
# DOS COSAS QUE QUIEN CONSTRUYA VA A VER, y ninguna es sintoma de algo roto.
# (1) Un aviso en cada build: el frontend por defecto de BuildKit desaconseja el
# --platform con valor CONSTANTE y pide `docker build --platform linux/amd64` o
# un ARG. La forma que pide mueve la decision a la linea de comandos, o sea a
# que alguien se acuerde de escribirla, que es exactamente lo que este archivo
# no quiere; el aviso se acepta a cambio. (2) En un Mac con Apple Silicon —el
# caso que motiva todo el parrafo de arriba— el build entero corre emulado: el
# `pnpm install` y el `prisma generate` de mas abajo pasan por qemu y tardan
# bastante mas que sin --platform. Es el precio de que la imagen salga igual
# desde cualquier maquina.
#
# LA MAYOR DE NODE ES LA LTS VIGENTE, y el andamio la declara en CUATRO lugares
# que son UNA SOLA decision: esta linea y los tres `node-version` de
# .github/workflows/ (dos en ci.yml, uno en actualizar-marco.yml). Hoy la LTS es
# la 24 (Krypton). Cuando entre la siguiente, los cuatro se mueven en el MISMO
# commit — una imagen que corre en otra mayor que el CI convierte un rojo del PR
# en una sorpresa del despliegue, y un workflow que se queda atras corre en una
# mayor que ningun otro ejercita.
#
# EL PISO DE herramientas/projects-init.mjs NO ES EL QUINTO, y confundirlo sale
# caro en las dos direcciones. Ese numero es el minimo que necesita la
# herramienta que COPIA el andamio para no perder archivos, corriendo en la
# laptop de quien adopta el marco: es bajo a proposito y no sube con la LTS.
# Subirlo con estos cuatro haria que la copia se niegue a correr en maquinas
# donde copiar funciona perfectamente.
FROM --platform=linux/amd64 node:26-slim
WORKDIR /app

# openssl: el motor de consultas de Prisma lo usa para detectar libssl; sin el
# paquete cae a un default con warning. ca-certificates: trust store del
# sistema, necesario para verificar el certificado TLS de la base.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Defensa en profundidad: el control real del bypass de auth es el fail-closed
# del codigo (ver src/middleware/auth.ts). ALLOW_DEV_AUTH se deja SIN setear a
# proposito, para que en produccion el bypass no exista.
ENV NODE_ENV=production

# COREPACK_HOME explicito, y FUERA de $HOME a proposito. Corepack baja el pnpm
# que fija "packageManager" del package.json de la raiz la primera vez que se lo
# invoca —o sea en el install de mas abajo, que corre como root— y lo cachea en
# $HOME/.cache/node/corepack. El proceso NO corre como root (ver el USER del
# final): con el default, el cache quedaria en /root/.cache, el arranque no lo
# veria y corepack intentaria bajar pnpm otra vez, desde una tarea que no tiene
# salida al registry. Un directorio comun, chowneado junto con /app, deja el
# pnpm ya resuelto para el usuario que arranca.
#
# El `mkdir -p` no es decorativo: lo crea ACA en vez de confiar en que lo
# materialicen `corepack enable` o el install de mas abajo. Si /opt/corepack no
# existiera al llegar al `chown -R` del final, ese chown falla con "cannot
# access" y el build entero muere — una precondicion que ningun paso comprueba
# y que se pagaria en el primer build, no aca.
ENV COREPACK_HOME=/opt/corepack
RUN mkdir -p /opt/corepack && corepack enable

# Se copia el arbol entero y despues se instala SOLO este paquete. La version
# "copiar manifiestos primero para cachear dependencias" es mas rapida, pero
# necesita que TODOS los manifiestos del workspace esten presentes o el install
# con lockfile congelado se queja de estar fuera de sincronia — y ese arreglo
# obligaria a este Dockerfile a nombrar paquetes que no son suyos.
#
# DEPENDE DE UN .dockerignore EN LA RAIZ que excluya node_modules, coverage,
# dist y .git. Sin el, este COPY se trae los node_modules de la maquina que
# construye: la imagen engorda cientos de megas y, peor, los binarios nativos
# resueltos para otra plataforma le ganan a los que instala el paso siguiente.
COPY . .
# --prod=false: NODE_ENV=production haria saltear las devDependencies, y el
# arranque las necesita (tsx) igual que la generacion del cliente (prisma).
RUN pnpm install --frozen-lockfile --prod=false --filter api...

WORKDIR /app/api
# SIN DATABASE_URL, y no es un olvido. `generate` es codegen puro: no se conecta
# a ninguna base. Y prisma.config.ts declara la datasource CONDICIONAL —lee
# `process.env.DATABASE_URL` y solo la incluye si esta— justamente para que la
# variable no haga falta aca; su propio comentario lleva la medicion al lado
# ("sin DATABASE_URL, `prisma generate` -> EXIT 0"). Este paso llevaba una URL
# de relleno con el motivo "prisma.config.ts exige la variable", que era falso
# contra el archivo hermano: una URL inventada en el build solo sirve para que
# el dia que `generate` SI necesite conectarse el error apunte a un host que no
# existe. La URL real la inyecta la definicion de tarea en tiempo de ejecucion.
RUN pnpm exec prisma generate

# NO ROOT. La imagen base trae el usuario `node` (uid 1000) sin usar, y hasta
# aca todo corrio como uid 0: sin estas dos lineas el proceso que atiende HTTP
# en produccion tambien lo hace, y en ese mismo contexto viven el CLI de Prisma
# —que sabe migrar la base— y el compilador de TypeScript. El resto del andamio
# es cuidadoso justo con esto (el .dockerignore documenta que un .env dentro de
# una imagen es un secreto publicado; auth.ts es fail-closed de verdad), asi que
# la ausencia se leia como olvido y no como criterio.
#
# El chown va DESPUES del install y del generate porque los dos escriben en
# /app como root; /opt/corepack entra por lo explicado arriba. El puerto es
# 3000, arriba de 1024, asi que no hace falta ningun privilegio para escucharlo.
#
# Y NO ES GRATIS: se paga en el tamano de la imagen. En overlayfs cambiarle el
# dueno a un archivo obliga a copiarlo ENTERO a la capa nueva, asi que esta sola
# instruccion deja una segunda copia de todo /app — el arbol del `COPY . .` mas
# los node_modules del install, virtual store .pnpm incluido, cuyos hardlinks
# tambien caen adentro por vivir bajo /app. En la practica, duplicar la imagen.
# NO MEDIDO EN BYTES: la maquina donde se escribio esto no tiene docker (ver el
# bloque del final); el mecanismo es de manual, el numero no.
#
# Las dos alternativas, y por que no estan aca. `COPY --chown=node:node . .`
# arregla la mitad chica: las fuentes llegan con el dueno correcto, pero el
# install y el generate siguen corriendo como root y lo que ellos escriben —que
# es el bulto— necesita el chown igual. La que SI lo elimina es instalar ya como
# `node`: mkdir y chown de /app y /opt/corepack VACIOS (capa minima), USER node
# antes del install, y el apt-get de arriba queda como unico paso de root. Eso
# reordena el archivo entero y toca el camino por el que se resuelve pnpm, y aca
# no se puede ver correr — la misma razon por la que el bloque del final sigue
# sin comprobar. Cuando alguien tenga docker delante: se construyen las dos
# variantes con el comando de ese bloque y se comparan los tamanos.
#
# Sacar el toolchain de la imagen es otro cambio y mas caro —exige que el API
# compile de verdad; hoy `build` es "prisma generate && tsc --noEmit"—
# y no bloquea a este.
RUN chown -R node:node /app /opt/corepack
USER node

EXPOSE 3000
CMD ["pnpm", "start"]

# LO QUE SI ESTA COMPROBADO, Y DONDE. pruebas/andamio/acoples-del-andamio.test.mjs
# lee este archivo y pone en rojo lo que antes salia verde: que falte `USER node`,
# que suba arriba del install o del generate, que se borre el `chown -R`, que
# COREPACK_HOME vuelva al $HOME de root, que falte el `mkdir -p /opt/corepack`
# del que depende ese chown, que el CMD quede arriba del USER, y que el
# --platform desaparezca o deje de coincidir con la arquitectura declarada en
# infra/pendientes.tf. Cada una de esas comprobaciones se vio fallar contra una
# copia mutada; ninguna construye la imagen.
#
# COMO SE COMPRUEBA LO QUE UN ESCANEO DE TEXTO NO PUEDE VER. Que el proceso corra
# de verdad como `node`, que pnpm se resuelva sin salir al registry y que la
# imagen salga con la arquitectura declarada solo se miden construyendo: la
# maquina donde se escribio esto no tiene docker ni salida a red. Queda el
# comando exacto que los cierra, desde la RAIZ del repo, con lo que cada uno
# tiene que contestar:
#
#   docker build -f api/Dockerfile -t mi-proyecto-api .
#   docker run --rm mi-proyecto-api id -un                        # node
#   docker run --rm mi-proyecto-api pnpm --version                # 11.23.0
#   docker image inspect mi-proyecto-api | grep '"Architecture"'  # amd64
#
# Y los dos que cierran lo que este archivo AFIRMA pero no midio:
#
#   docker build --check -f api/Dockerfile .      # el unico aviso esperado es
#                                                 # el del --platform constante
#
# ...y el mismo `docker image inspect` de arriba, pero mirando '"Size"', contra
# un build identico sin el `chown -R`: esa diferencia es lo que cuesta el
# copy-up de /app, la cifra que al bloque del chown le falta.
#
# Si el segundo tarda o falla por red, el que quedo mal es COREPACK_HOME: el
# pnpm que cacheo el build quedo en un $HOME que el usuario `node` no lee.
