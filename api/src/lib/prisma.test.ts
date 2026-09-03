import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El modulo memoiza el cliente en una variable de modulo, asi que cada caso lo
 * carga de nuevo con vi.resetModules(). Los dos paquetes de datos se doblan:
 * estas pruebas verifican el CABLEADO (que se resuelva la URL, que se construya
 * el adaptador, que se memoice), no a Prisma.
 */
type Modulo = typeof import("./prisma.js");

const desconectar = vi.fn(async () => {});
const construido = vi.fn();

async function cargar(forma: "named" | "default" | "vacio" = "named"): Promise<Modulo> {
  class ClienteFalso {
    $disconnect = desconectar;
    constructor(opciones: unknown) {
      construido(opciones);
    }
  }
  // Las claves se declaran SIEMPRE, aunque valgan undefined: el doble de un
  // modulo ESM lanza al leer una exportacion que no declaro, y entonces la
  // prueba mediria el error de vitest en vez de la rama del codigo.
  vi.doMock("@prisma/client", () => {
    if (forma === "named") return { PrismaClient: ClienteFalso, default: undefined };
    if (forma === "default")
      return { PrismaClient: undefined, default: { PrismaClient: ClienteFalso } };
    return { PrismaClient: undefined, default: undefined };
  });
  vi.doMock("@prisma/adapter-pg", () => ({
    PrismaPg: class {
      constructor(public opciones: unknown) {}
    },
  }));
  return import("./prisma.js");
}

describe("getPrisma", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/d");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@prisma/client");
    vi.doUnmock("@prisma/adapter-pg");
  });

  it("falla con el arreglo escrito si no hay DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getPrisma } = await cargar();
    await expect(getPrisma()).rejects.toThrow(/Falta DATABASE_URL/);
  });

  it("construye el cliente con el adaptador y lo memoiza", async () => {
    const { getPrisma } = await cargar();
    const primero = await getPrisma();
    const segundo = await getPrisma();
    expect(primero).toBe(segundo);
    expect(construido).toHaveBeenCalledOnce();
    const opciones = construido.mock.calls[0][0] as { adapter: { opciones: unknown } };
    expect(opciones.adapter.opciones).toEqual({
      connectionString: "postgresql://u:p@localhost:5432/d",
    });
  });

  it("tambien encuentra el constructor cuando el paquete lo expone en default", async () => {
    const { getPrisma } = await cargar("default");
    await expect(getPrisma()).resolves.toBeDefined();
  });

  it("si el paquete no expone PrismaClient, dice que falta generar el cliente", async () => {
    const { getPrisma } = await cargar("vacio");
    await expect(getPrisma()).rejects.toThrow(/prisma generate/);
  });
});

describe("desconectarPrisma", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/d");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no hace nada si nunca se abrio una conexion", async () => {
    const { desconectarPrisma } = await cargar();
    await desconectarPrisma();
    expect(desconectar).not.toHaveBeenCalled();
  });

  it("cierra el pool y suelta la memoizacion", async () => {
    const { getPrisma, desconectarPrisma } = await cargar();
    const antes = await getPrisma();
    await desconectarPrisma();
    expect(desconectar).toHaveBeenCalledOnce();
    expect(await getPrisma()).not.toBe(antes);
  });
});
