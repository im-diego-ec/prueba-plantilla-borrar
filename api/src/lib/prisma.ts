import type { PrismaClient } from "@prisma/client";

/**
 * Carga perezosa del cliente de datos, TIPADA con el cliente generado.
 *
 * No se tipa como `any` "para que compile sin generate": eso apagaria el
 * chequeo de tipos de TODOS los accesos a datos del API, que es justo donde un
 * error se paga caro. Generar el cliente es una PRECONDICION del build y del
 * lint (la integracion lo corre antes de los dos, ver .github/workflows/ci.yml).
 */
let prisma: PrismaClient | undefined;

export async function getPrisma(): Promise<PrismaClient> {
  if (prisma) return prisma;

  // Input externo, validado antes de usarlo: sin URL no hay conexion posible y
  // conviene decirlo aca, con el arreglo, y no en un error del driver.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Falta DATABASE_URL. En local: docker compose up -d y copiar .env.example a .env. " +
        "En AWS la inyecta la definicion de tarea de ECS desde Parameter Store."
    );
  }

  // El unico punto donde el tipado cede: el import dinamico de un paquete con
  // doble forma (named vs default.PrismaClient segun el empaquetador). Se
  // declara como vista estructural y no como `any`, asi el constructor -y con
  // el, cada query- sigue tipado.
  type Ctor = new (opciones: { adapter: unknown }) => PrismaClient;
  const mod = (await import("@prisma/client")) as unknown as {
    PrismaClient?: Ctor;
    default?: { PrismaClient?: Ctor };
  };
  const Cliente = mod.PrismaClient ?? mod.default?.PrismaClient;
  if (!Cliente) {
    throw new Error("@prisma/client no expone PrismaClient: corre `prisma generate`");
  }

  const { PrismaPg } = await import("@prisma/adapter-pg");
  prisma = new Cliente({ adapter: new PrismaPg({ connectionString }) });
  return prisma;
}

/**
 * Cierra el pool. La usa el apagado ordenado: sin esto cada deploy deja
 * conexiones colgadas del lado de la base hasta que expiran.
 */
export async function desconectarPrisma(): Promise<void> {
  if (!prisma) return;
  const abierto = prisma;
  prisma = undefined;
  await abierto.$disconnect();
}
