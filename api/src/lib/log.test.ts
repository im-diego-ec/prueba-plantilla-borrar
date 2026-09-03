import { afterEach, describe, expect, it, vi } from "vitest";
import { contextoLog, linea, log } from "./log.js";

describe("log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emite UNA linea de JSON valido con nivel, msg y ts", () => {
    const registro = JSON.parse(linea("info", "hola"));
    expect(registro).toMatchObject({ nivel: "info", msg: "hola" });
    expect(typeof registro.ts).toBe("string");
    expect(linea("info", "hola")).not.toContain("\n");
  });

  it("el contexto NO puede pisar los campos reservados", () => {
    // El filtro de las alarmas busca la subcadena "nivel":"error": si un
    // contexto pudiera sobreescribirla, un error dejaria de alertar.
    const registro = JSON.parse(linea("error", "real", { nivel: "info", msg: "falso" }));
    expect(registro.nivel).toBe("error");
    expect(registro.msg).toBe("real");
  });

  it("serializa un Error con mensaje y stack, en vez del {} de JSON.stringify", () => {
    expect(JSON.stringify({ e: new Error("boom") })).toBe('{"e":{}}');
    const registro = JSON.parse(linea("error", "fallo", { error: new Error("boom") }));
    expect(registro.error.mensaje).toBe("boom");
    expect(typeof registro.error.stack).toBe("string");
  });

  it("un contexto inserializable degrada la linea en vez de lanzar", () => {
    const registro = JSON.parse(linea("warn", "raro", { valor: 1n }));
    expect(registro).toMatchObject({ nivel: "warn", msg: "raro", contextoDescartado: true });
  });

  it("adjunta el requestId del contexto sin que el call site lo pase", () => {
    const registro = contextoLog.run({ requestId: "trace-1" }, () =>
      JSON.parse(linea("info", "dentro"))
    );
    expect(registro.requestId).toBe("trace-1");
    expect(JSON.parse(linea("info", "fuera")).requestId).toBeUndefined();
  });

  it("cada nivel sale por la consola que le corresponde", () => {
    const salida = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
    log.info("i");
    log.warn("w");
    log.error("e");
    log.fatal("f");
    expect(salida.log).toHaveBeenCalledTimes(1);
    expect(salida.warn).toHaveBeenCalledTimes(1);
    expect(salida.error).toHaveBeenCalledTimes(2);
    expect(JSON.parse(salida.error.mock.calls[1][0]).nivel).toBe("fatal");
  });

  it("acepta contexto en los cuatro niveles", () => {
    const espia = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    log.info("i", { a: 1 });
    log.warn("w", { a: 2 });
    log.error("e", { a: 3 });
    log.fatal("f", { a: 4 });
    expect(JSON.parse(espia.mock.calls[0][0]).a).toBe(1);
    expect(JSON.parse(errores.mock.calls[1][0]).a).toBe(4);
  });
});
