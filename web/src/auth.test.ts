import { beforeEach, describe, expect, it, vi } from "vitest";
import { aSesion, crearAutenticacion } from "./auth";

// Este ES el archivo que habla con el SDK del proveedor, asi que es el unico
// que lo dobla. Lo que se fija aca es el CABLEADO: con que se construye el
// cliente, que metodo suyo se llama en cada operacion, y que hace el andamio
// con lo que devuelve. La interfaz se prueba en App.test.tsx contra el contrato
// `Autenticacion`, sin SDK de por medio.
const { crearCliente } = vi.hoisted(() => ({ crearCliente: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: crearCliente }));

const VARIABLES = {
  VITE_SUPABASE_URL: "https://proyecto-de-prueba.supabase.co",
  VITE_SUPABASE_ANON_KEY: "clave-anonima-de-prueba",
};

function clienteFalso() {
  const desuscribir = vi.fn();
  const auth = {
    getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    // El parametro va DECLARADO aunque el doble no lo use: es el callback que
    // el andamio le entrega al SDK, y es justo lo que el caso de mas abajo
    // rescata de `mock.calls` para dispararlo a mano.
    onAuthStateChange: vi.fn((_alCambiar: (evento: string, sesion: unknown) => void) => ({
      data: { subscription: { unsubscribe: desuscribir } },
    })),
    signInWithOtp: vi.fn(() => Promise.resolve({ error: null })),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
  };
  crearCliente.mockReturnValue({ auth });
  return { auth, desuscribir };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("crearAutenticacion", () => {
  it("sin las dos variables el proyecto corre SIN auth, y no arma cliente a medias", () => {
    // Con la mitad puesta, createClient devuelve un cliente que falla en cada
    // llamada: un modo roto que se parece a uno configurado. Por eso las dos
    // mitades cuentan como "sin configurar", no solo la ausencia total.
    expect(crearAutenticacion({})).toBeNull();
    expect(crearAutenticacion({ VITE_SUPABASE_URL: VARIABLES.VITE_SUPABASE_URL })).toBeNull();
    expect(
      crearAutenticacion({ VITE_SUPABASE_ANON_KEY: VARIABLES.VITE_SUPABASE_ANON_KEY })
    ).toBeNull();
    expect(crearCliente).not.toHaveBeenCalled();
  });

  it("con las dos variables arma el cliente con esa URL y esa clave publica", () => {
    clienteFalso();

    expect(crearAutenticacion(VARIABLES)).not.toBeNull();

    expect(crearCliente).toHaveBeenCalledWith(
      VARIABLES.VITE_SUPABASE_URL,
      VARIABLES.VITE_SUPABASE_ANON_KEY
    );
  });

  it("lee la sesion que ya existe y la traduce al contrato del proyecto", async () => {
    const { auth } = clienteFalso();
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "u1", email: "ana@ejemplo.test" } } },
    } as never);

    const proveedor = crearAutenticacion(VARIABLES);

    expect(await proveedor?.sesionActual()).toEqual({ userId: "u1", email: "ana@ejemplo.test" });
  });

  it("entrega el access token vigente, y null cuando no hay sesion", async () => {
    // Sin este metodo el front no tiene con que llenar el `Authorization:
    // Bearer` que exige requireAuth, y /api/hello responde 401 aunque la
    // persona haya entrado por el enlace del correo.
    const { auth } = clienteFalso();
    const proveedor = crearAutenticacion(VARIABLES);

    expect(await proveedor?.token()).toBeNull();

    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "u1" }, access_token: "jwt-vigente" } },
    } as never);
    expect(await proveedor?.token()).toBe("jwt-vigente");

    // Se le PREGUNTA al SDK cada vez, no se cachea: getSession renueva el token
    // que esta por vencer, y una copia guardada aca mandaria un Bearer muerto.
    expect(auth.getSession).toHaveBeenCalledTimes(2);
  });

  it("suscribe a los cambios de sesion y devuelve la baja", () => {
    const { auth, desuscribir } = clienteFalso();
    const visto: unknown[] = [];

    const proveedor = crearAutenticacion(VARIABLES);
    const bajar = proveedor?.alCambiar((sesion) => visto.push(sesion));

    // El callback que se le pasa al SDK recibe (evento, sesion): lo que viaja al
    // andamio es la sesion YA traducida, no el objeto del proveedor.
    const alCambiarDelSdk = auth.onAuthStateChange.mock.calls[0][0];
    alCambiarDelSdk("SIGNED_IN", { user: { id: "u2", email: "bruno@ejemplo.test" } });
    expect(visto).toEqual([{ userId: "u2", email: "bruno@ejemplo.test" }]);

    bajar?.();
    expect(desuscribir).toHaveBeenCalledOnce();
  });

  it("ingresar pide el enlace por correo, y un rechazo del proveedor NO se traga", async () => {
    const { auth } = clienteFalso();
    const proveedor = crearAutenticacion(VARIABLES);

    await proveedor?.ingresar("ana@ejemplo.test");
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: "ana@ejemplo.test" });

    // El SDK NO lanza: devuelve { error }. Sin este re-lanzado, un correo
    // rechazado o el limite de envios del plan gratuito se ve exactamente igual
    // que un envio exitoso y la persona espera un correo que no va a llegar.
    auth.signInWithOtp.mockResolvedValue({ error: new Error("rate limit") } as never);
    await expect(proveedor?.ingresar("ana@ejemplo.test")).rejects.toThrow("rate limit");
  });

  it("salir cierra la sesion, y un fallo tampoco se traga", async () => {
    const { auth } = clienteFalso();
    const proveedor = crearAutenticacion(VARIABLES);

    await proveedor?.salir();
    expect(auth.signOut).toHaveBeenCalled();

    // Si esto se tragara, la portada mostraria "sin sesion" con la sesion viva.
    auth.signOut.mockResolvedValue({ error: new Error("network") } as never);
    await expect(proveedor?.salir()).rejects.toThrow("network");
  });
});

describe("aSesion", () => {
  it("solo hay sesion cuando hay un id de usuario", () => {
    expect(aSesion(null)).toBeNull();
    expect(aSesion(undefined)).toBeNull();
    // Un usuario sin id no es una sesion: propagarlo dejaria la portada
    // mostrando una identidad vacia como si alguien hubiera entrado.
    expect(aSesion({ user: { id: "" } })).toBeNull();
    expect(aSesion({ user: { id: "u3" } })).toEqual({ userId: "u3", email: undefined });
  });
});
