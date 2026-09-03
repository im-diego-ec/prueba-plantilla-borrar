import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import type { Autenticacion, Sesion } from "./auth";

// EL PROVEEDOR DE IDENTIDAD ENTRA COMO UN OBJETO DE CINCO FUNCIONES, no como
// un mock del SDK de un tercero. Es lo que compra el contrato `Autenticacion`
// de auth.ts: estas pruebas verifican la interfaz del andamio —que diga la
// verdad sobre el API y sobre el estado de la sesion— sin depender de la forma
// interna de `supabase.auth`, que la decide otro repositorio y cambia sin
// avisarnos. La que si monta el SDK, y por eso lo dobla, es auth.test.ts.
function authFalsa(sesionInicial: Sesion | null = null, token: string | null = null) {
  let escuchar: ((sesion: Sesion | null) => void) | null = null;
  const desuscribir = vi.fn();
  const auth: Autenticacion = {
    sesionActual: vi.fn(() => Promise.resolve(sesionInicial)),
    // El token es un metodo y no un campo de `Sesion` porque vence: el andamio
    // lo pide justo antes de cada llamada en vez de guardarlo.
    token: vi.fn(() => Promise.resolve(token)),
    alCambiar: vi.fn((cb: (sesion: Sesion | null) => void) => {
      escuchar = cb;
      return desuscribir;
    }),
    ingresar: vi.fn(() => Promise.resolve()),
    salir: vi.fn(() => Promise.resolve()),
  };
  /** Simula lo que hace el proveedor cuando la sesion cambia por fuera. */
  const emitir = async (sesion: Sesion | null) => {
    await act(() => {
      escuchar?.(sesion);
      return Promise.resolve();
    });
  };
  return { auth, desuscribir, emitir };
}

// LOS DOBLES COPIAN LA FORMA QUE DEVUELVE api/src/app.ts, no una inventada.
// Antes decian `status`/`service`/`time` y `message`: campos que el API de este
// mismo andamio no emite. Con eso los seis casos de abajo pasaban en verde
// contra un API que no existe, y el front —que validaba con esos mismos nombres
// inventados— no podia leer al backend real sin que nada mordiera. El acople
// entre estos dobles, los esquemas de App.tsx y los `res.json` de app.ts lo
// vigila pruebas/andamio/acoples-del-andamio.test.mjs.
const SALUD_OK = { estado: "ok", servicio: "mi-proyecto-api", ts: "2026-01-01T00:00:00.000Z" };
const HOLA_OK = { mensaje: "Hola desde el API", userId: "dev-user" };
// El saludo que devuelve el API cuando el token SI viajo: el userId sale de los
// claims firmados, no del "dev-user" que inventa el bypass de desarrollo.
const HOLA_DE_USUARIO = { mensaje: "Hola desde el API", userId: "usuario-real" };

const TOKEN = "token-de-la-sesion";
const SIN_CABECERA = { headers: {} };
const CON_BEARER = { headers: { Authorization: `Bearer ${TOKEN}` } };

/** Una respuesta de fetch con lo unico que el codigo bajo prueba le pide. */
function respuesta(cuerpo: unknown, ok = true) {
  return { ok, status: ok ? 200 : 401, json: () => Promise.resolve(cuerpo) };
}

/**
 * Reemplaza fetch por uno que responde segun la ruta, y lo devuelve para
 * espiarlo. El manejador corre DENTRO de la promesa a proposito: asi un throw
 * suyo llega como rechazo, que es la forma en la que fetch reporta que no hubo
 * respuesta (una caida de red no es una excepcion sincronica).
 *
 * El manejador recibe TAMBIEN el init: sin el, un doble no puede distinguir una
 * peticion con Bearer de una sin el, y todo el banco quedaria modelando el
 * unico escenario que no necesita token (el bypass de desarrollo del API).
 */
function cablearFetch(porRuta: (url: string, init?: RequestInit) => unknown) {
  const falso = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve().then(() => porRuta(url, init))
  );
  vi.stubGlobal("fetch", falso);
  return falso;
}

const respondeTodoBien = (url: string) =>
  url.endsWith("/api/health") ? respuesta(SALUD_OK) : respuesta(HOLA_OK);

/** La cabecera Authorization que llevaba una llamada del doble de fetch. */
function autorizacionDe(init?: RequestInit): string | undefined {
  return ((init?.headers ?? {}) as Record<string, string>).Authorization;
}

/**
 * Un doble que se comporta como el API DE VERDAD: /api/health es publico y
 * /api/hello lleva requireAuth, que responde 401 sin un Bearer valido
 * (api/src/middleware/auth.ts). Es el escenario de cualquier ambiente con
 * SUPABASE_URL puesto, o sea todos los reales.
 */
const comoRequireAuth = (url: string, init?: RequestInit) => {
  if (url.endsWith("/api/health")) return respuesta(SALUD_OK);
  return autorizacionDe(init) === `Bearer ${TOKEN}`
    ? respuesta(HOLA_DE_USUARIO)
    : respuesta({ error: "No autenticado" }, false);
};

afterEach(() => {
  // El DOM lo limpia Testing Library con su afterEach global (por eso
  // globals: true en la config). Lo que hay que devolver a su lugar es lo que
  // estas pruebas pisan: el fetch global, las variables de entorno y el
  // registro de modulos que usa la ultima prueba.
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("App", () => {
  it("muestra el estado que reporta el API y no adelanta el saludo", async () => {
    const fetchFalso = cablearFetch(respondeTodoBien);

    render(<App auth={null} />);

    expect(await screen.findByText("ok")).toBeTruthy();
    // El healthcheck es publico y sale SIN cabecera de autorizacion: no hay
    // proveedor en este caso, asi que tampoco hay token que mandar.
    expect(fetchFalso).toHaveBeenCalledWith("http://localhost:3000/api/health", SIN_CABECERA);
    // El saludo aparece cuando se lo pide, no antes: si esto se rompe, la
    // interfaz esta llamando al endpoint protegido en cada carga.
    expect(screen.queryByText(/dev-user/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Llamar /api/hello" }));

    // OJO CON LO QUE ESTE CASO MODELA: sin proveedor de identidad no hay token,
    // asi que el unico API que puede contestar esto es uno con el bypass de
    // desarrollo encendido (ALLOW_DEV_AUTH=true) — de ahi el "dev-user". El
    // caso de un ambiente real, con Bearer, es el de mas abajo.
    expect(await screen.findByText("Hola desde el API (userId: dev-user)")).toBeTruthy();
    expect(fetchFalso).toHaveBeenCalledWith("http://localhost:3000/api/hello", SIN_CABECERA);
  });

  it("con sesion, la llamada al endpoint protegido lleva el Bearer del proveedor", async () => {
    // EL CASO QUE FALTABA, y el que fija el agujero: el doble responde como
    // requireAuth de verdad (401 sin Bearer), asi que esta prueba solo pasa si
    // la portada PIDE el token y lo manda. Sin esto habia login, sesion y boton
    // de salir sobre un front que nunca podia leer a su propio backend.
    const fetchFalso = cablearFetch(comoRequireAuth);
    const { auth } = authFalsa({ userId: "usuario-real", email: "ana@ejemplo.test" }, TOKEN);

    render(<App auth={auth} />);
    await screen.findByText("ok");

    fireEvent.click(screen.getByRole("button", { name: "Llamar /api/hello" }));

    expect(await screen.findByText("Hola desde el API (userId: usuario-real)")).toBeTruthy();
    expect(fetchFalso).toHaveBeenCalledWith("http://localhost:3000/api/hello", CON_BEARER);
    // El token se PIDE en el momento de llamar, no se toma de la sesion que ya
    // estaba pintada: vence, y una copia guardada envejece sin avisar.
    expect(auth.token).toHaveBeenCalled();
    // Y el healthcheck, que es publico, sigue saliendo sin cabecera.
    expect(fetchFalso).toHaveBeenCalledWith("http://localhost:3000/api/health", SIN_CABECERA);
  });

  it("contra un API que exige token, sin proveedor la portada lo dice en vez de fingir", async () => {
    // El contraste del caso de arriba: MISMO doble de API, sin proveedor. Si
    // esto mostrara un saludo, el doble no estaria exigiendo nada.
    cablearFetch(comoRequireAuth);

    render(<App auth={null} />);
    await screen.findByText("ok");

    fireEvent.click(screen.getByRole("button", { name: "Llamar /api/hello" }));

    expect(await screen.findByText(/no se pudo llamar \/api\/hello/)).toBeTruthy();
  });

  it("si el proveedor no puede dar el token, se avisa en vez de romper el click", async () => {
    // Una promesa rechazada dentro de un onClick no la ve nadie: sin este
    // camino atrapado, un fallo al renovar la sesion deja la portada muda.
    cablearFetch(comoRequireAuth);
    const { auth } = authFalsa({ userId: "usuario-real" }, TOKEN);
    vi.mocked(auth.token).mockRejectedValue(new Error("sesion caida"));

    render(<App auth={auth} />);
    await screen.findByText("ok");

    fireEvent.click(screen.getByRole("button", { name: "Llamar /api/hello" }));

    expect(await screen.findByText(/no se pudo llamar \/api\/hello/)).toBeTruthy();
  });

  it("cuando el API no responde, lo dice en vez de quedarse en blanco", async () => {
    cablearFetch(() => {
      throw new Error("ECONNREFUSED");
    });

    render(<App auth={null} />);

    expect(await screen.findByText("sin conexion con el API")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Llamar /api/hello" }));

    expect(await screen.findByText(/no se pudo llamar \/api\/hello/)).toBeTruthy();
  });

  it("distingue una respuesta con otra forma de una caida del API", async () => {
    // El caso real: una version anterior del API todavia desplegada, o un proxy
    // que devuelve otra cosa. La validacion con Zod tiene que atajarlo ANTES de
    // la interfaz, y el mensaje tiene que mandar a mirar otro lado que "sin
    // conexion".
    //
    // El ejemplo de forma AJENA es `{ status: "ok" }` a proposito: es la forma
    // que este banco doblaba como si fuera la del andamio. Tiene que ser una
    // forma que el API de api/src/app.ts NO emita — si aca se pusiera la que si
    // emite, el caso estaria exigiendo que la respuesta buena y real se muestre
    // como basura, que es exactamente lo que pasaba.
    cablearFetch(() => respuesta({ status: "ok" }));

    render(<App auth={null} />);

    expect(await screen.findByText("el API respondio algo que no entiendo")).toBeTruthy();
    expect(screen.queryByText("sin conexion con el API")).toBeNull();

    // El endpoint protegido corre por el mismo carril: los dos lugares donde el
    // andamio muestra datos del API los validan antes de mostrarlos.
    fireEvent.click(screen.getByRole("button", { name: "Llamar /api/hello" }));

    // waitFor y no findAllByText: findAll* se conforma con UNA coincidencia, y
    // el healthcheck ya puso la primera — la prueba pasaria sin que el click
    // hubiera hecho nada. Lo que se espera es que aparezca la SEGUNDA.
    await waitFor(() =>
      expect(screen.getAllByText("el API respondio algo que no entiendo")).toHaveLength(2)
    );
  });

  it("un endpoint protegido que responde 401 no se lee como si trajera dato", async () => {
    cablearFetch((url) =>
      url.endsWith("/api/health")
        ? respuesta(SALUD_OK)
        : respuesta({ error: "no autenticado" }, false)
    );

    render(<App auth={null} />);
    await screen.findByText("ok");

    fireEvent.click(screen.getByRole("button", { name: "Llamar /api/hello" }));

    expect(await screen.findByText(/no se pudo llamar \/api\/hello/)).toBeTruthy();
  });

  it("sin proveedor de identidad lo dice en pantalla, y no ofrece ingresar", async () => {
    cablearFetch(respondeTodoBien);

    render(<App auth={null} />);
    await screen.findByText("ok");

    // Que la app corra sin auth no puede ser silencioso: en dev es comodo y en
    // un ambiente desplegado es un aviso de que faltan las variables.
    expect(screen.getByText(/Supabase no configurado/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar enlace de acceso" })).toBeNull();
  });

  it("con proveedor y sin sesion ofrece el enlace de acceso, y lo pide con ese correo", async () => {
    cablearFetch(respondeTodoBien);
    const { auth } = authFalsa();

    render(<App auth={auth} />);
    await screen.findByText("ok");
    expect(screen.queryByText(/Supabase no configurado/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "ana@ejemplo.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace de acceso" }));

    expect(await screen.findByText(/Revisa tu correo/)).toBeTruthy();
    expect(auth.ingresar).toHaveBeenCalledWith("ana@ejemplo.test");
  });

  it("si el envio del enlace falla, la interfaz lo dice en vez de fingir que salio", async () => {
    // El fallo real y comun: el limite de envios del plan gratuito. Sin este
    // caso, un rechazo del proveedor se ve EXACTAMENTE igual que un envio
    // exitoso y la persona espera un correo que no va a llegar.
    cablearFetch(respondeTodoBien);
    const { auth } = authFalsa();
    vi.mocked(auth.ingresar).mockRejectedValue(new Error("rate limit"));

    render(<App auth={auth} />);
    await screen.findByText("ok");

    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace de acceso" }));

    expect(await screen.findByText(/No se pudo enviar/)).toBeTruthy();
  });

  it("con sesion muestra quien entro y ofrece cerrarla", async () => {
    cablearFetch(respondeTodoBien);
    const { auth } = authFalsa({ userId: "u1", email: "ana@ejemplo.test" });

    render(<App auth={auth} />);

    expect(await screen.findByText("ana@ejemplo.test")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(auth.salir).toHaveBeenCalled();
  });

  it("una sesion sin correo se identifica igual, con el id", async () => {
    cablearFetch(respondeTodoBien);
    const { auth } = authFalsa({ userId: "u-sin-correo" });

    render(<App auth={auth} />);

    expect(await screen.findByText("u-sin-correo")).toBeTruthy();
  });

  it("la sesion que cambia POR FUERA repinta la portada, y al desmontar se deja de escuchar", async () => {
    // El caso que la sesion inicial sola no cubre: la persona entra por el
    // enlace del correo con la pestana abierta, o cierra sesion en otra. Sin
    // escuchar, la portada se queda diciendo lo de antes para siempre.
    cablearFetch(respondeTodoBien);
    const { auth, desuscribir, emitir } = authFalsa();

    const { unmount } = render(<App auth={auth} />);
    await screen.findByText("ok");
    expect(screen.getByRole("button", { name: "Enviar enlace de acceso" })).toBeTruthy();

    await emitir({ userId: "u2", email: "bruno@ejemplo.test" });
    expect(screen.getByText("bruno@ejemplo.test")).toBeTruthy();

    // Y la baja no es opcional: un listener que sobrevive al componente escribe
    // estado sobre un arbol que ya no existe.
    unmount();
    expect(desuscribir).toHaveBeenCalledOnce();
  });

  it("la base del API sale de la variable de entorno cuando esta puesta", async () => {
    // Se vuelve a importar el modulo porque la base se resuelve UNA vez, al
    // cargarlo: sin resetModules la prueba mediria el valor de la importacion
    // de arriba y pasaria en verde sin haber probado nada.
    vi.stubEnv("VITE_API_URL", "https://api.ejemplo.test");
    vi.resetModules();
    const { default: AppRecargado } = await import("./App");
    const fetchFalso = cablearFetch(respondeTodoBien);

    render(<AppRecargado auth={null} />);

    expect(await screen.findByText("ok")).toBeTruthy();
    expect(fetchFalso).toHaveBeenCalledWith("https://api.ejemplo.test/api/health", SIN_CABECERA);
  });
});
