import "dotenv/config";
import { defineConfig } from "prisma/config";

// Config de la CLI de datos (generate, migrate). La URL sale del ambiente: la
// base guarda UTC y las credenciales viven en Parameter Store, nunca aca.
//
// POR QUE LA URL ES CONDICIONAL Y NO `env("DATABASE_URL")`, que es lo que la
// documentacion muestra. MEDIDO, no supuesto: `env()` resuelve la variable al
// CARGAR el archivo, asi que sin DATABASE_URL en el ambiente la config explota
// con `PrismaConfigEnvError: Cannot resolve environment variable` en CUALQUIER
// comando de prisma, incluido `generate`. Y `generate` es el primer paso del CI
// del marco (el cliente se genera ANTES del lint, porque el codigo de datos esta
// tipado contra el), donde no hay base ni DATABASE_URL ni tiene por que haberla:
// generar el cliente es codegen puro, no toca ninguna base. Con `env()` el repo
// recien creado sale ROJO en su primer PR.
//
// Comprobado con prisma 7.9.1 en este arbol:
//   sin DATABASE_URL, `prisma generate`       -> EXIT 0
//   sin DATABASE_URL, `prisma migrate deploy` -> EXIT 1 y el mensaje nombra la
//     propiedad y el comando: "The datasource.url property is required in your
//     Prisma config file when using prisma migrate deploy".
// O sea: falla cerrado exactamente donde la URL hace falta, y no antes.
//
// Y NO se puede poner `url = env("DATABASE_URL")` en el schema, que seria la
// otra salida obvia: prisma 7 la rechaza con P1012 ("The datasource property
// `url` is no longer supported in schema files"). Tambien medido.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(url ? { datasource: { url } } : {}),
});
