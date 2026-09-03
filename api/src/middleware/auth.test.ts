import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  AUDIENCIA_DE_USUARIO,
  authConfigInsegura,
  conjuntoDeClaves,
  devAuthPermitido,
  emisorEsperado,
  requireAuth,
  supabaseConfigurado,
  urlDelProyecto,
  urlJwks,
} from "./auth.js";

// Se dobla la libreria de JWT, no el middleware: lo que estas pruebas tienen
// que fijar es QUE SE ACEPTA y que se rechaza, incluidos los caminos que nadie
// prueba a mano (token vencido, claim ausente, token anonimo, sin
// configuracion). Doblar `jose` y no la red deja ademas visible el CONTRATO con
// el que se la llama —emisor y audiencia—, que es donde vive media seguridad de
// este archivo.
const { verificar, crearJwks } = vi.hoisted(() => ({
  verificar: vi.fn(),
  crearJwks: vi.fn(() => "conjunto-de-claves-falso"),
}));
vi.mock("jose", () => ({ jwtVerify: verificar, createRemoteJWKSet: crearJwks }));

const PROYECTO = "https://proyecto-de-prueba.supabase.co";

function appDePrueba() {
  const app = express();
  app.get("/protegido", requireAuth, (req, res) => {
    res.json({ userId: req.auth?.userId, email: req.auth?.email, name: req.auth?.name });
  });
  return app;
}

describe("configuracion de auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("el bypass de dev exige el opt-in explicito, no la ausencia de Supabase", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("ALLOW_DEV_AUTH", "");
    expect(devAuthPermitido()).toBe(false);
    // El bug que esto cierra: el bypass colgado de NODE_ENV, que en produccion
    // no se seteaba, dejaba el guard muerto y el API abierto.
    vi.stubEnv("NODE_ENV", "development");
    expect(devAuthPermitido()).toBe(false);
    vi.stubEnv("ALLOW_DEV_AUTH", "true");
    expect(devAuthPermitido()).toBe(true);
  });

  it("sin Supabase y sin opt-in, la configuracion es insegura", () => {
    expect(authConfigInsegura({})).toBe(true);
    expect(authConfigInsegura({ SUPABASE_URL: PROYECTO })).toBe(false);
    expect(authConfigInsegura({ ALLOW_DEV_AUTH: "true" })).toBe(false);
    expect(supabaseConfigurado({ SUPABASE_URL: PROYECTO })).toBe(true);
    // Una variable presente pero vacia (el estado en el que nace .env.example)
    // NO es configuracion: si contara, el API arrancaria creyendo que tiene
    // proveedor y rechazaria absolutamente todo con un 401 sin explicacion.
    expect(supabaseConfigurado({ SUPABASE_URL: "   " })).toBe(false);
  });

  it("deriva JWKS y emisor de la URL del proyecto, y le perdona la barra final", () => {
    expect(urlDelProyecto({ SUPABASE_URL: `${PROYECTO}/` })).toBe(PROYECTO);
    expect(urlJwks({ SUPABASE_URL: `${PROYECTO}/` })).toBe(
      `${PROYECTO}/auth/v1/.well-known/jwks.json`
    );
    expect(emisorEsperado({ SUPABASE_URL: PROYECTO })).toBe(`${PROYECTO}/auth/v1`);
    // Sin configuracion no hay valor por defecto que adivinar: los tres dicen
    // undefined y requireAuth cae al carril de fail-closed.
    expect(urlDelProyecto({})).toBeUndefined();
    expect(urlJwks({})).toBeUndefined();
    expect(emisorEsperado({})).toBeUndefined();
  });

  it("el JWKS se construye UNA vez por URL: sin eso habria una llamada de red por request", () => {
    // La URL es propia de este caso a proposito: la memoria vive en el modulo y
    // dura toda la corrida, asi que reusar la de otra prueba mediria una cache
    // ya llena y pasaria en verde sin haber construido nada.
    const url = "https://memoria.supabase.co/auth/v1/.well-known/jwks.json";
    crearJwks.mockClear();
    const primero = conjuntoDeClaves(url);
    const segundo = conjuntoDeClaves(url);
    expect(segundo).toBe(primero);
    expect(crearJwks).toHaveBeenCalledOnce();
    expect(crearJwks).toHaveBeenCalledWith(new URL(url));
  });
});

describe("requireAuth con Supabase configurado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", PROYECTO);
    vi.stubEnv("ALLOW_DEV_AUTH", "true"); // no debe importar: Supabase manda
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("acepta un token valido y toma la identidad de los claims firmados", async () => {
    verificar.mockResolvedValue({
      payload: { sub: "user_1", email: "a@b.co", user_metadata: { name: "Ana" } },
    });
    const res = await request(appDePrueba())
      .get("/protegido")
      .set("authorization", "Bearer tok")
      .set("x-dev-user-id", "impostor");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "user_1", email: "a@b.co", name: "Ana" });
  });

  it("verifica contra el JWKS del proyecto, con emisor, audiencia y exp exigidos", async () => {
    verificar.mockResolvedValue({ payload: { sub: "user_1" } });
    await request(appDePrueba()).get("/protegido").set("authorization", "Bearer tok");
    // Sin `issuer` valdria un token de CUALQUIER proyecto de Supabase (los crea
    // cualquiera, gratis); sin `audience` valdria la clave publicable que el
    // front lleva en el bundle, que tambien es un JWT firmado por el proyecto.
    //
    // Y sin `requiredClaims: ["exp"]` entra un token que NO trae ese claim, y
    // ese no vence nunca: la comprobacion de expiracion solo corre cuando el
    // claim esta. Se fija ACA, en el contrato con la libreria, porque este
    // banco dobla `jose`: que jose respete la opcion lo comprueba jose, y lo
    // que un refactor puede perder sin que nada mas se queje es este argumento.
    expect(verificar).toHaveBeenCalledWith("tok", "conjunto-de-claves-falso", {
      issuer: `${PROYECTO}/auth/v1`,
      audience: AUDIENCIA_DE_USUARIO,
      requiredClaims: ["exp"],
    });
  });

  it("ignora claims que no son texto en vez de propagarlos", async () => {
    verificar.mockResolvedValue({
      payload: { sub: "user_2", email: 42, user_metadata: { name: null } },
    });
    const res = await request(appDePrueba()).get("/protegido").set("authorization", "Bearer tok");
    expect(res.body).toEqual({ userId: "user_2" });
  });

  it("un user_metadata que no es objeto no tumba la peticion", async () => {
    verificar.mockResolvedValue({ payload: { sub: "user_3", user_metadata: "no soy un objeto" } });
    const res = await request(appDePrueba()).get("/protegido").set("authorization", "Bearer tok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "user_3" });
  });

  it("401 si el token no trae sub", async () => {
    verificar.mockResolvedValue({ payload: { sub: "" } });
    const res = await request(appDePrueba()).get("/protegido").set("authorization", "Bearer tok");
    expect(res.status).toBe(401);
  });

  it("401 para una sesion ANONIMA, que trae sub y audiencia de usuario igual", async () => {
    // El caso que la firma sola no ataja: los anonymous sign-ins de Supabase
    // pasan firma, emisor y audiencia. Lo unico que los distingue es el claim.
    verificar.mockResolvedValue({ payload: { sub: "anon_1", is_anonymous: true } });
    const res = await request(appDePrueba()).get("/protegido").set("authorization", "Bearer tok");
    expect(res.status).toBe(401);
  });

  it("401 si la verificacion lanza, sin tumbar el proceso y sin filtrar el motivo", async () => {
    verificar.mockRejectedValue(new Error('"exp" claim timestamp check failed'));
    const res = await request(appDePrueba()).get("/protegido").set("authorization", "Bearer x");
    expect(res.status).toBe(401);
    // El cuerpo no dice SI fallo la firma, el emisor o la expiracion: eso es
    // decirle a quien prueba tokens que tan cerca esta.
    expect(res.body).toEqual({ error: "No autenticado" });
    // Auth fallida es rutina: warn, no error. La semantica la leen las alarmas.
    expect(console.warn).toHaveBeenCalledOnce();
    // Y el motivo NO se pierde: va al log, que es el canal de quien opera.
    const registro = JSON.parse(
      (console.warn as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
    ) as { error?: { mensaje?: string } };
    expect(registro.error?.mensaje).toContain("exp");
  });

  it("401 sin header, y con un header que no es Bearer", async () => {
    expect((await request(appDePrueba()).get("/protegido")).status).toBe(401);
    const basica = await request(appDePrueba()).get("/protegido").set("authorization", "Basic zzz");
    expect(basica.status).toBe(401);
    expect(verificar).not.toHaveBeenCalled();
  });
});

describe("requireAuth sin Supabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("con ALLOW_DEV_AUTH=true acepta el usuario que pida quien llama", async () => {
    vi.stubEnv("ALLOW_DEV_AUTH", "true");
    const conHeader = await request(appDePrueba()).get("/protegido").set("x-dev-user-id", "u9");
    expect(conHeader.body.userId).toBe("u9");
    const sinHeader = await request(appDePrueba()).get("/protegido");
    expect(sinHeader.body.userId).toBe("dev-user");
  });

  it("sin el opt-in, 401: fail-closed", async () => {
    vi.stubEnv("ALLOW_DEV_AUTH", "");
    const res = await request(appDePrueba()).get("/protegido").set("x-dev-user-id", "u9");
    expect(res.status).toBe(401);
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
