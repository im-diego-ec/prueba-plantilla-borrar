import express from "express";
import cors from "cors";
import { log } from "./lib/log.js";
import { getPrisma } from "./lib/prisma.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestId } from "./middleware/requestId.js";

/**
 * La app de Express, SIN escuchar en ningun puerto: por eso las pruebas la
 * crean y la ejercitan sin levantar un servidor de verdad. El arranque
 * (puerto, senales, fail-closed de auth) vive en server.ts.
 *
 * El orden de los middlewares no es decorativo: requestId primero, para que
 * toda linea de log de la request lo lleve; errorHandler ultimo, porque
 * Express solo lo alcanza al final de la cadena.
 */
export function createApp() {
  const app = express();

  app.use(requestId);
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  // Publico: no toca base ni auth. Es lo que mira el health check del
  // balanceador, asi que tiene que seguir respondiendo cuando la base no esta.
  app.get("/api/health", (_req, res) => {
    res.json({ estado: "ok", servicio: "mi-proyecto-api", ts: new Date().toISOString() });
  });

  // Protegido: la identidad sale de los claims firmados del token, nunca del
  // body ni de un header que el cliente controle.
  app.get("/api/hello", requireAuth, (req, res) => {
    res.json({ mensaje: "Hola desde el API", userId: req.auth?.userId });
  });

  // Chequeo de la base, SEPARADO de /api/health: si se mezclaran, una base
  // lenta haria que el balanceador diera de baja tareas que estan sanas.
  //
  // NO LLEVA requireAuth —tampoco /api/health, aca arriba— pero es la unica de
  // las dos que TOCA LA BASE, asi que es la unica cuyo camino de error puede
  // disparar cualquiera que alcance el dominio. Es a proposito: el runbook la
  // consulta con curl contra produccion y solo mira el codigo HTTP.
  //
  // Por eso la CAUSA no viaja en el cuerpo. El mensaje del driver nombra
  // internals de la infraestructura: P1001 de Prisma es "Can't reach database
  // server at `<host>`:`<puerto>`" y P1000 nombra el usuario de la base.
  // Devolverlo es regalarle a cualquiera que haga curl el mapa interno.
  //
  // El canal se parte en dos, igual que en errorHandler.ts: al cliente lo
  // minimo mas el requestId, al log el error entero (log.ts serializa el Error
  // con su stack y le pega el mismo requestId via AsyncLocalStorage). Quien
  // esta de guardia lleva el requestId de la respuesta a CloudWatch y ve la
  // causa completa; el diagnostico no se pierde, cambia de canal.
  //
  // EL HANDLER ES `async` Y VA SUELTO, sin envoltorio. Express 5 reenvia al
  // manejador de errores la promesa RECHAZADA que devuelve un handler; en
  // Express 4 no lo hacia, y por eso este andamio traia un `asyncHandler` que
  // envolvia cada uno. Ese archivo ya no existe: mantener un envoltorio cuyo
  // motivo dejo de ser cierto es peor que no tenerlo, porque el proximo que lo
  // lea va a creerle. Lo comprueba middleware/errorHandler.test.ts, que registra
  // un handler async que rechaza SIN envoltorio y exige el 500 con requestId.
  app.get("/api/db/health", async (req, res) => {
    try {
      const prisma = await getPrisma();
      await prisma.$queryRaw`SELECT 1`;
      res.json({ db: "ok" });
    } catch (err) {
      log.error("db health fallo", { error: err });
      res.status(503).json({ db: "no disponible", requestId: req.requestId });
    }
  });

  app.use(errorHandler);

  return app;
}
