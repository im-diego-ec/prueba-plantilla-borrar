import type { ErrorRequestHandler } from "express";
import { log } from "../lib/log.js";

/**
 * Ultimo eslabon: convierte cualquier error que llegue por next(err) en un
 * JSON con el requestId, y lo deja en el log con su causa. Sin esto Express
 * responde su pagina HTML con el stack —filtracion de internals al cliente— y
 * el error no queda en un formato consultable.
 *
 * La firma de CUATRO argumentos es lo que hace que Express lo reconozca como
 * manejador de errores; `_next` va con guion bajo porque no se usa y no puede
 * borrarse (de ahi el argsIgnorePattern del linter).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  log.error("error no manejado", { error: err, ruta: req.originalUrl });
  if (res.headersSent) return;
  res.status(500).json({ error: "Error interno", requestId: req.requestId });
};
