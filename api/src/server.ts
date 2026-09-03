import "dotenv/config";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createApp } from "./app.js";
import { desconectarPrisma } from "./lib/prisma.js";
import { log } from "./lib/log.js";
import { authConfigInsegura } from "./middleware/auth.js";

export const PUERTO_POR_DEFECTO = 3000;

/**
 * Tope del drenaje. Tiene que ser MENOR que el stopTimeout de la plataforma
 * (30s en ECS por defecto): si lo excede, la plataforma mata el proceso a la
 * mitad del apagado y el orden no sirvio de nada.
 */
export const DRENAJE_MAXIMO_MS = 10_000;

const esquemaDePuerto = z.coerce.number().int().min(1).max(65535);

/**
 * PORT es input externo y se valida con Zod antes de usarlo. Sin validar,
 * Number("ocho") da NaN y app.listen(NaN) escucha en un puerto AL AZAR: el
 * proceso arranca "bien" y el balanceador nunca lo encuentra.
 */
export function resolverPuerto(env: NodeJS.ProcessEnv = process.env): number {
  const resultado = esquemaDePuerto.safeParse(env.PORT ?? PUERTO_POR_DEFECTO);
  if (!resultado.success) {
    throw new Error(
      `PORT invalido (${JSON.stringify(env.PORT)}): tiene que ser un entero entre 1 y 65535`
    );
  }
  return resultado.data;
}

export interface OpcionesDeApagado {
  drenajeMs?: number;
  salir?: (codigo: number) => void;
  cerrarRecursos?: () => Promise<void>;
}

/**
 * Apagado ordenado. En ECS cada deploy y cada scale-in mandan SIGTERM; sin
 * esto Node muere en el acto y las requests en vuelo se cortan: 5xx
 * esporadicos en CADA deploy, de los mas dificiles de atribuir despues.
 *
 * Secuencia: dejar de aceptar conexiones, drenar lo en vuelo, cerrar la base,
 * salir 0. Si el drenaje excede el tope se sale 1: quedarse colgado es peor.
 *
 * Las dependencias del proceso (salir, cerrarRecursos) se inyectan para que
 * las pruebas ejerciten la secuencia completa sin matar al runner.
 */
export function registrarApagado(
  servidor: { close: (alCerrar: () => void) => void },
  opciones: OpcionesDeApagado = {}
): (senal: string) => void {
  const drenajeMs = opciones.drenajeMs ?? DRENAJE_MAXIMO_MS;
  const salir = opciones.salir ?? ((codigo: number) => process.exit(codigo));
  const cerrarRecursos = opciones.cerrarRecursos ?? desconectarPrisma;
  let apagando = false;

  const apagar = (senal: string) => {
    if (apagando) return; // SIGTERM y SIGINT juntos: una sola secuencia
    apagando = true;
    log.info(`${senal} recibido: apagado ordenado`, { drenajeMaximoMs: drenajeMs });
    const tope = setTimeout(() => {
      log.error("el drenaje excedio el tope: saliendo con requests en vuelo");
      salir(1);
    }, drenajeMs);
    // unref: el tope no puede ser la razon de que el proceso siga vivo.
    tope.unref();
    servidor.close(() => {
      void (async () => {
        try {
          await cerrarRecursos();
        } catch (err) {
          log.warn("no se pudo cerrar la conexion de datos", { error: err });
        }
        clearTimeout(tope);
        log.info("apagado ordenado completo");
        salir(0);
      })();
    });
  };

  process.on("SIGTERM", () => apagar("SIGTERM"));
  process.on("SIGINT", () => apagar("SIGINT"));
  return apagar;
}

export interface OpcionesDeArranque {
  puerto?: number;
  salir?: (codigo: number) => void;
}

/**
 * Arranca el API. El guard de auth vive ACA y no en createApp() para que las
 * pruebas puedan armar la app sin dispararlo, y para que la unica via de
 * servir peticiones de verdad pase por el.
 */
export function iniciar(opciones: OpcionesDeArranque = {}): Server | undefined {
  const salir = opciones.salir ?? ((codigo: number) => process.exit(codigo));

  // Fail-closed: sin proveedor de identidad y sin el opt-in de dev, el API NO
  // arranca. La alternativa -arrancar y aceptar identidades del cliente- es peor
  // que estar caido, porque nadie se entera.
  if (authConfigInsegura()) {
    log.fatal(
      "SUPABASE_URL no configurado y ALLOW_DEV_AUTH!=true: el API no arranca " +
        "en modo inseguro. Configura Supabase, o ALLOW_DEV_AUTH=true solo en desarrollo."
    );
    salir(1);
    return undefined;
  }

  const puerto = opciones.puerto ?? resolverPuerto();
  const servidor = createApp().listen(puerto, () => {
    log.info("mi-proyecto-api escuchando", { puerto });
  });
  registrarApagado(servidor, { salir });
  return servidor;
}

/** Si este archivo ES el que se ejecuto, y no uno importado por las pruebas. */
export function esEntrypoint(argv: string | undefined): boolean {
  if (!argv) return false;
  return import.meta.url === pathToFileURL(argv).href;
}

if (esEntrypoint(process.argv[1])) iniciar();
