import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { contextoLog } from "../lib/log.js";

/**
 * Correlacion entre capas. El ALB ya adjunta X-Amzn-Trace-Id a cada request
 * que nos entrega: este middleware lo APROVECHA en vez de inventar otro id, y
 * hace tres cosas con el:
 *
 * 1. `req.requestId`, para el handler que lo quiera explicito.
 * 2. Header `X-Request-Id` en la respuesta, para que el frontend lo adjunte a
 *    sus reportes de error: del reporte del usuario a la linea exacta del log
 *    con una sola consulta.
 * 3. `contextoLog.run(...)`, para que TODA linea de log de la request lo lleve
 *    via AsyncLocalStorage, sin tocar la firma de ningun call site.
 *
 * En dev local no hay ALB: se genera un id con prefijo "local-" para que
 * ninguna request quede anonima.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const id = req.header("x-amzn-trace-id") ?? `local-${randomUUID()}`;
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  contextoLog.run({ requestId: id }, next);
};
