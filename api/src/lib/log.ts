import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Logger JSON del API: UNA linea de JSON valido por evento, consultable POR
 * CAMPO en CloudWatch Logs Insights. Es la UNICA salida a consola del paquete
 * (`no-console` es error en el resto de src/, ver eslint.config.mjs de la
 * raiz), y eso no es estetica: un log que no se puede filtrar por campo no
 * sirve para diagnosticar con el equipo despierto a las 3am.
 *
 * CONTRATO del que dependen las alarmas y la verificacion post-deploy:
 * - `nivel` y `msg` son reservados y siempre exactos: el filtro busca la
 *   subcadena "nivel":"fatal" / "nivel":"error" (JSON.stringify jamas mete
 *   espacios), asi que un contexto NO puede pisarlos — se asignan al final.
 * - `fatal` se RESERVA para condiciones que matan el proceso; `error` alerta;
 *   lo rutinario (auth fallida, un servicio externo caido) es `warn`. La
 *   semantica de niveles es un contrato, no una preferencia de quien escribe.
 * - Un `Error` en el contexto serializa a { mensaje, stack }: pasado crudo,
 *   JSON.stringify(new Error()) da {} y la causa se pierde entera.
 * - El logger JAMAS lanza: un contexto inserializable (ciclos, BigInt) degrada
 *   a una linea sin contexto con `contextoDescartado: true`.
 * - Toda linea emitida dentro de `contextoLog.run({ requestId }, ...)` lleva
 *   ese requestId sin que ningun call site tenga que acordarse de pasarlo (lo
 *   abre el middleware requestId.ts por request).
 */
type Nivel = "info" | "warn" | "error" | "fatal";

export const contextoLog = new AsyncLocalStorage<{ requestId: string }>();

function serializar(valor: unknown): unknown {
  if (valor instanceof Error) return { mensaje: valor.message, stack: valor.stack };
  return valor;
}

export function linea(nivel: Nivel, msg: string, contexto?: Record<string, unknown>): string {
  const registro: Record<string, unknown> = {};
  if (contexto) {
    for (const [clave, valor] of Object.entries(contexto)) registro[clave] = serializar(valor);
  }
  const requestId = contextoLog.getStore()?.requestId;
  if (requestId !== undefined) registro.requestId = requestId;
  // Los reservados se asignan DESPUES del contexto: siempre ganan.
  registro.nivel = nivel;
  registro.msg = msg;
  registro.ts = new Date().toISOString();
  try {
    return JSON.stringify(registro);
  } catch {
    return JSON.stringify({
      nivel,
      msg,
      ts: new Date().toISOString(),
      requestId,
      contextoDescartado: true,
    });
  }
}

/* eslint-disable no-console -- este modulo ES la unica salida a consola del API */
export const log = {
  info: (msg: string, contexto?: Record<string, unknown>) =>
    console.log(linea("info", msg, contexto)),
  warn: (msg: string, contexto?: Record<string, unknown>) =>
    console.warn(linea("warn", msg, contexto)),
  error: (msg: string, contexto?: Record<string, unknown>) =>
    console.error(linea("error", msg, contexto)),
  fatal: (msg: string, contexto?: Record<string, unknown>) =>
    console.error(linea("fatal", msg, contexto)),
};
/* eslint-enable no-console */
