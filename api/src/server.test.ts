import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import {
  DRENAJE_MAXIMO_MS,
  PUERTO_POR_DEFECTO,
  esEntrypoint,
  iniciar,
  registrarApagado,
  resolverPuerto,
} from "./server.js";

beforeAll(() => {
  // Cada registrarApagado suma dos listeners de senal; el tope por defecto
  // (10) haria aparecer un warning que no dice nada sobre el codigo.
  process.setMaxListeners(40);
});

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("resolverPuerto", () => {
  it("usa el default cuando PORT no esta", () => {
    expect(resolverPuerto({})).toBe(PUERTO_POR_DEFECTO);
  });

  it("acepta un puerto valido en texto", () => {
    expect(resolverPuerto({ PORT: "8080" })).toBe(8080);
  });

  it("rechaza lo que no es un puerto, en vez de escuchar en uno al azar", () => {
    // Number("ocho") es NaN y app.listen(NaN) toma un puerto libre cualquiera:
    // el proceso arranca "bien" y el balanceador nunca lo encuentra.
    for (const valor of ["ocho", "", "0", "70000", "8080.5"]) {
      expect(() => resolverPuerto({ PORT: valor })).toThrow(/PORT invalido/);
    }
  });
});

describe("esEntrypoint", () => {
  it("es cierto solo para el archivo que se ejecuto", () => {
    expect(esEntrypoint(undefined)).toBe(false);
    expect(esEntrypoint(fileURLToPath(new URL("./app.ts", import.meta.url)))).toBe(false);
    expect(esEntrypoint(fileURLToPath(new URL("./server.ts", import.meta.url)))).toBe(true);
  });
});

describe("iniciar", () => {
  it("se niega a arrancar sin proveedor de identidad y sin el opt-in de dev", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("ALLOW_DEV_AUTH", "");
    const salir = vi.fn();

    expect(iniciar({ salir })).toBeUndefined();

    expect(salir).toHaveBeenCalledWith(1);
    const registro = JSON.parse(
      (console.error as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
    );
    // fatal, no error: la condicion mata el proceso, y ese nivel es el que la
    // verificacion post-deploy trata como rojo inmediato.
    expect(registro.nivel).toBe("fatal");
  });

  it("arranca y queda escuchando cuando la configuracion es valida", async () => {
    vi.stubEnv("ALLOW_DEV_AUTH", "true");
    const salir = vi.fn();
    const servidor = iniciar({ puerto: 0, salir });
    expect(servidor).toBeDefined();
    // Se espera la linea de log del callback de listen: es la senal de que el
    // socket quedo aceptando, no solo de que listen() volvio.
    await vi.waitFor(() => expect(console.log).toHaveBeenCalled());
    const registro = JSON.parse(
      (console.log as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
    );
    expect(registro.msg).toContain("escuchando");
    expect(servidor?.listening).toBe(true);
    expect(salir).not.toHaveBeenCalled();
    await new Promise<void>((listo) => servidor?.close(() => listo()));
  });

  // El camino "sin puerto explicito" no se prueba levantando un servidor en un
  // puerto fijo: seria la unica prueba de la suite que falla cuando la maquina
  // tiene ese puerto ocupado, y una prueba intermitente termina ignorada.
  // resolverPuerto, que es la parte con logica, se prueba arriba y sola.
});

describe("registrarApagado", () => {
  function servidorFalso(cierra = true) {
    return {
      cerrado: false,
      close(alCerrar: () => void) {
        this.cerrado = true;
        if (cierra) alCerrar();
      },
    };
  }

  it("drena, cierra la base y sale 0", async () => {
    const salir = vi.fn();
    const cerrarRecursos = vi.fn(async () => {});
    const servidor = servidorFalso();
    const apagar = registrarApagado(servidor, { salir, cerrarRecursos });

    apagar("SIGTERM");

    expect(servidor.cerrado).toBe(true);
    await vi.waitFor(() => expect(salir).toHaveBeenCalledWith(0));
    expect(cerrarRecursos).toHaveBeenCalledOnce();
  });

  it("una segunda senal no reinicia la secuencia", async () => {
    const salir = vi.fn();
    const cerrarRecursos = vi.fn(async () => {});
    const apagar = registrarApagado(servidorFalso(), { salir, cerrarRecursos });

    apagar("SIGTERM");
    apagar("SIGINT");

    await vi.waitFor(() => expect(salir).toHaveBeenCalledTimes(1));
    expect(cerrarRecursos).toHaveBeenCalledOnce();
  });

  it("si cerrar la base falla, el apagado termina igual", async () => {
    const salir = vi.fn();
    const apagar = registrarApagado(servidorFalso(), {
      salir,
      cerrarRecursos: () => Promise.reject(new Error("pool roto")),
    });

    apagar("SIGTERM");

    await vi.waitFor(() => expect(salir).toHaveBeenCalledWith(0));
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("si el drenaje se pasa del tope, sale 1 en vez de quedar colgado", () => {
    vi.useFakeTimers();
    const salir = vi.fn();
    // Un servidor que nunca termina de cerrar: el caso que deja la tarea
    // colgada hasta que la plataforma la mata sin orden.
    const apagar = registrarApagado(
      { close: () => {} },
      { salir, drenajeMs: 50, cerrarRecursos: async () => {} }
    );

    apagar("SIGTERM");
    expect(salir).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);

    expect(salir).toHaveBeenCalledWith(1);
  });

  it("sin opciones de cierre usa el de la capa de datos y el tope del modulo", async () => {
    // Sin inyectar nada mas que la salida: asi se ejercita el default real
    // (cerrar la conexion de datos), que con la base nunca abierta es inocuo.
    const salir = vi.fn();
    const apagar = registrarApagado(servidorFalso(), { salir });

    apagar("SIGTERM");

    await vi.waitFor(() => expect(salir).toHaveBeenCalledWith(0));
  });

  it("el tope por defecto es menor que el stopTimeout de la plataforma", () => {
    expect(DRENAJE_MAXIMO_MS).toBeLessThan(30_000);
  });
});
