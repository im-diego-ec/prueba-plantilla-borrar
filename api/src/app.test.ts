import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// La capa de datos se dobla: estas pruebas verifican los endpoints y el
// cableado de middlewares, no a Postgres. La integracion contra una base real
// es otra suite (y otra decision de cuando corre).
const { consultar, obtenerPrisma } = vi.hoisted(() => ({
  consultar: vi.fn(),
  obtenerPrisma: vi.fn(),
}));

vi.mock("./lib/prisma.js", () => ({
  getPrisma: obtenerPrisma,
  desconectarPrisma: vi.fn(async () => {}),
}));

import { createApp } from "./app.js";

describe("app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerPrisma.mockResolvedValue({ $queryRaw: consultar });
    consultar.mockResolvedValue([{ uno: 1 }]);
    // El bypass de dev es la unica forma de ejercitar una ruta protegida sin
    // proveedor de identidad, y exige el opt-in explicito: exactamente lo que
    // hace produccion.
    vi.stubEnv("ALLOW_DEV_AUTH", "true");
    vi.stubEnv("SUPABASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("GET /api/health responde sin tocar base ni auth", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("ok");
    expect(res.body.servicio).toContain("-api");
  });

  it("toda respuesta trae X-Request-Id, y respeta el trace del balanceador", async () => {
    const propio = await request(createApp()).get("/api/health");
    expect(propio.headers["x-request-id"]).toMatch(/^local-/);

    const conTrace = await request(createApp())
      .get("/api/health")
      .set("x-amzn-trace-id", "Root=1-abc");
    expect(conTrace.headers["x-request-id"]).toBe("Root=1-abc");
  });

  it("declara el origen permitido para el frontend", async () => {
    vi.stubEnv("WEB_ORIGIN", "https://app.ejemplo.com");
    const res = await request(createApp()).get("/api/health");
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.ejemplo.com");
  });

  it("GET /api/hello devuelve la identidad que resolvio el middleware", async () => {
    const res = await request(createApp()).get("/api/hello").set("x-dev-user-id", "usuario-7");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("usuario-7");
  });

  it("GET /api/db/health confirma que la base responde", async () => {
    const res = await request(createApp()).get("/api/db/health");
    expect(res.status).toBe(200);
    expect(res.body.db).toBe("ok");
    expect(consultar).toHaveBeenCalled();
  });

  // /api/db/health no lleva requireAuth —tampoco /api/health— pero es la unica
  // de las dos que toca la base, o sea la unica cuyo camino de error puede
  // disparar cualquiera que alcance el dominio. Estos dos casos fijan que la
  // causa del fallo salga por el log y NO por el cuerpo. Hasta el 2026-08-24
  // fijaban lo contrario —`expect(res.body.detalle).toContain(...)`— asi que la
  // fuga estaba protegida por sus propias aserciones: el mensaje de Prisma
  // nombra host, puerto y usuario de la base (P1001, P1000).
  it("base caida: 503 sin el mensaje del driver, con el detalle en el log", async () => {
    const mensajeDelDriver = "Can't reach database server at `db.interna`:`5432`";
    consultar.mockRejectedValue(new Error(mensajeDelDriver));
    const emitidas = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp();
    const res = await request(app).get("/api/db/health");
    expect(res.status).toBe(503);
    // Se afirma sobre el cuerpo ENTERO y no sobre un campo: un `detalle` que
    // vuelva con otro nombre tiene que morder igual.
    expect(res.body).toEqual({ db: "no disponible", requestId: res.headers["x-request-id"] });
    expect(JSON.stringify(res.body)).not.toContain("db.interna");
    // El diagnostico no se pierde, cambia de canal — y viaja con el MISMO
    // requestId que el cuerpo le devolvio al llamante, que es lo que deja
    // correlacionar el curl del runbook con la linea del log.
    const linea = String(emitidas.mock.calls.at(-1)?.[0]);
    expect(linea).toContain(mensajeDelDriver);
    expect(linea).toContain(res.body.requestId);
    expect(JSON.parse(linea).nivel).toBe("error");
    // Lo que mira el balanceador no depende de la base: si dependiera, una base
    // lenta daria de baja tareas sanas y el incidente se multiplicaria.
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  it("un rechazo que no es Error tampoco filtra su texto al cuerpo", async () => {
    obtenerPrisma.mockRejectedValue("sin configuracion de base");
    const emitidas = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(createApp()).get("/api/db/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ db: "no disponible", requestId: res.headers["x-request-id"] });
    expect(String(emitidas.mock.calls.at(-1)?.[0])).toContain("sin configuracion de base");
  });
});
