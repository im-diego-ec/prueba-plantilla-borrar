import type { Request, RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { log } from "../lib/log.js";

/**
 * Autorizacion: el backend es la autoridad. El token se verifica contra las
 * claves PUBLICAS del proyecto de Supabase y la identidad sale SIEMPRE de los
 * claims firmados, jamas del body ni de un header que el cliente controle.
 *
 * POR QUE SUPABASE Y NO EL SDK DE UN PROVEEDOR DE IDENTIDAD APARTE. El proyecto
 * ya usa Supabase para la base, asi que usar tambien su login es UNA cuenta en
 * vez de dos y UN juego de llaves en vez de dos. Los dos planes gratuitos que se
 * compararon dan 50.000 usuarios activos al mes, o sea el cambio no cuesta
 * capacidad. Clerk sigue siendo una alternativa valida y esta documentada en
 * .env.example; lo que NO conviene es tener las dos a medias.
 *
 * POR QUE `jose` Y NO @supabase/supabase-js EN EL BACKEND. La forma de
 * comprobar un token con el cliente de Supabase es `auth.getUser(token)`, que
 * es una llamada HTTP al servidor de Auth POR CADA REQUEST — y ese servidor
 * corre en UNA sola region, asi que el API paga la latencia de ida y vuelta en
 * cada peticion protegida y se cae cuando ese servicio se cae. La propia
 * documentacion de Supabase recomienda, para claves de firma asimetricas,
 * verificar con una libreria de JWT contra el JWKS del proyecto, y desaconseja
 * explicitamente verificar con el secreto compartido HS256. `jose` no tiene ni
 * una dependencia.
 *
 * QUE NO CAMBIO AL CAMBIAR DE PROVEEDOR — son invariantes del marco, no de
 * quien firma el token:
 *   1. la identidad sale de los claims firmados;
 *   2. el bypass de desarrollo NO depende de NODE_ENV;
 *   3. un fallo de verificacion es 401 y el detalle va al log, no al llamante.
 */

/**
 * La URL del proyecto de Supabase, sin barra final: `https://<ref>.supabase.co`.
 *
 * Se lee en cada llamada y no como const de import: los tests la alternan, y un
 * valor congelado en la primera importacion haria que la mitad de los casos
 * midieran la configuracion de la otra mitad.
 */
export function urlDelProyecto(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env.SUPABASE_URL?.trim();
  if (!url) return undefined;
  // La barra final es el tipeo mas comun al copiar la URL del panel, y sin
  // recortarla el emisor esperado queda con doble barra y NINGUN token valida.
  return url.replace(/\/+$/, "");
}

/** Hay proveedor de identidad configurado. */
export function supabaseConfigurado(env: NodeJS.ProcessEnv = process.env): boolean {
  return urlDelProyecto(env) !== undefined;
}

/**
 * De donde salen las claves publicas con las que se comprueba la firma. Es un
 * endpoint PUBLICO: el API no necesita ningun secreto de Supabase para
 * verificar tokens, solo la URL del proyecto. Ese es, ademas, el motivo por el
 * que este archivo no tiene una variable equivalente a una "clave secreta".
 */
export function urlJwks(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const base = urlDelProyecto(env);
  return base === undefined ? undefined : `${base}/auth/v1/.well-known/jwks.json`;
}

/**
 * El emisor que el token tiene que declarar. Fijarlo no es cosmetica: sin `iss`
 * esperado, un token firmado por OTRO proyecto de Supabase —uno que cualquiera
 * puede crear gratis— pasaria la comprobacion de firma contra su propio JWKS si
 * alguna vez se resolviera la clave por el token en vez de por la configuracion.
 */
export function emisorEsperado(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const base = urlDelProyecto(env);
  return base === undefined ? undefined : `${base}/auth/v1`;
}

/**
 * La audiencia de un token de USUARIO. Supabase emite tambien tokens con
 * `aud: "anon"` —la clave publicable que el navegador lleva puesta ES un JWT— y
 * sin exigir esta audiencia esa clave, que es publica y esta en el bundle del
 * front, entraria como si fuera una sesion.
 */
export const AUDIENCIA_DE_USUARIO = "authenticated";

/**
 * El JWKS del proyecto, UNO POR URL y memorizado.
 *
 * ESTA MEMORIZACION ES LA QUE HACE QUE NO HAYA RED POR REQUEST. El objeto que
 * devuelve createRemoteJWKSet ES la cache: baja el JWKS la primera vez y lo
 * reusa (solo vuelve a bajarlo cuando aparece un `kid` que no conoce, con su
 * propio enfriamiento). Construir uno nuevo dentro del handler compila igual,
 * pasa las pruebas igual, y convierte cada peticion protegida en una llamada
 * HTTP a Supabase — un fallo que no se ve hasta que hay trafico.
 */
const jwksPorUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function conjuntoDeClaves(url: string): ReturnType<typeof createRemoteJWKSet> {
  const memorizado = jwksPorUrl.get(url);
  if (memorizado) return memorizado;
  const conjunto = createRemoteJWKSet(new URL(url));
  jwksPorUrl.set(url, conjunto);
  return conjunto;
}

/**
 * El bypass de desarrollo exige el opt-in EXPLICITO ALLOW_DEV_AUTH=true.
 * Nunca se activa "porque falta la configuracion de Supabase", y menos por
 * NODE_ENV. Un guard escrito como `NODE_ENV !== "production"` falla ABIERTO:
 * basta con que la variable no llegue al contenedor —y no llega sola: la pone
 * quien escribe la definicion de tarea— para que el bypass quede activo en
 * produccion y el API acepte la identidad que le mande el cliente. Una
 * condicion de seguridad se apoya en una variable que hay que PONER para abrir,
 * nunca en una que hay que poner para cerrar.
 */
export function devAuthPermitido(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ALLOW_DEV_AUTH === "true";
}

/**
 * Fail-closed: sin Supabase y sin el opt-in de dev, el API esta en
 * configuracion insegura. server.ts lo consulta para NEGARSE a arrancar, en vez
 * de servir peticiones sin verificar a nadie.
 */
export function authConfigInsegura(env: NodeJS.ProcessEnv = process.env): boolean {
  return !supabaseConfigurado(env) && !devAuthPermitido(env);
}

function tokenBearer(req: Request): string | null {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/** El valor si es texto no vacio; si no, undefined. El typeof es el guard real. */
function textoDe(valor: unknown): string | undefined {
  return typeof valor === "string" && valor !== "" ? valor : undefined;
}

/**
 * Los claims que este API lee y que NO estan en el tipo generico de jwtVerify.
 * Vista estructural en vez de `any`: el compilador sigue obligando a los typeof
 * de abajo antes de usarlos.
 */
interface ClaimsDeSupabase {
  email?: unknown;
  is_anonymous?: unknown;
  user_metadata?: unknown;
}

/**
 * El nombre del usuario vive en `user_metadata.name`, NO en un claim de primer
 * nivel: es lo que la referencia de claims de Supabase documenta, y leerlo de
 * `name` da undefined siempre sin que nada falle.
 */
function nombreDe(claims: ClaimsDeSupabase): string | undefined {
  const meta: unknown = claims.user_metadata;
  if (typeof meta !== "object" || meta === null) return undefined;
  return textoDe((meta as { name?: unknown }).name);
}

/** Exige un usuario autenticado. Sin claim valido: 401, sin excepciones.
 *
 *  Va `async` y SIN envoltorio: Express 5 reenvia al manejador de errores la
 *  promesa rechazada que devuelve un handler, asi que el `asyncHandler` que el
 *  andamio traia para Express 4 dejo de tener motivo y ya no existe. Lo que el
 *  try/catch de abajo atrapa NO es eso: es el rechazo de jwtVerify, que aca no
 *  es una falla del sistema sino un 401. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const jwks = urlJwks();
  if (jwks !== undefined) {
    const token = tokenBearer(req);
    if (token) {
      try {
        // jwtVerify LANZA ante cualquier token invalido, vencido, firmado por
        // otro emisor o dirigido a otra audiencia (no devuelve un resultado que
        // se pueda ignorar). El try/catch no es opcional, y no por el
        // transporte: sin el, Express 5 mandaria el token vencido al manejador
        // de errores y el cliente veria un 500 donde corresponde 401 — y con el
        // detalle del fallo adentro.
        //
        // requiredClaims: ["exp"] TAPA EL HUECO DE ESA LISTA. "Vencido" solo se
        // comprueba cuando el claim ESTA: un token sin `exp` no tiene nada que
        // vencer, asi que pasaba entero y valia para siempre. Acuñarlo exige la
        // clave de firma del proyecto y Supabase siempre emite `exp`, o sea no
        // es un agujero abierto — es la diferencia entre "no se puede explotar
        // hoy" y "el codigo hace lo que su comentario dice".
        const { payload } = await jwtVerify(token, conjuntoDeClaves(jwks), {
          issuer: emisorEsperado(),
          audience: AUDIENCIA_DE_USUARIO,
          requiredClaims: ["exp"],
        });
        const claims = payload as ClaimsDeSupabase;
        const userId = textoDe(payload.sub);
        // is_anonymous: los "anonymous sign-ins" de Supabase SI traen
        // aud=authenticated y un sub propio, o sea pasan todo lo de arriba. Son
        // usuarios sin identidad comprobada, asi que para este API no son un
        // usuario. Un proyecto que los quiera aceptar borra esta condicion — es
        // una decision de producto y tiene que verse en el diff.
        if (userId !== undefined && claims.is_anonymous !== true) {
          req.auth = {
            userId,
            email: textoDe(claims.email),
            name: nombreDe(claims),
          };
          next();
          return;
        }
      } catch (err) {
        // Auth fallida es RUTINA (un token vencido no es una falla del
        // sistema): warn, no error — la semantica de niveles la leen las
        // alarmas. El detalle va ACA y no al cuerpo de la respuesta: decirle al
        // llamante si fallo la firma, el emisor o la expiracion es decirle como
        // acercarse.
        log.warn("token rechazado", { error: err });
      }
    }
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  if (devAuthPermitido()) {
    // Solo con el opt-in explicito, y jamas en produccion: el id lo puede
    // elegir quien llama, que es exactamente por que esto no puede existir
    // fuera de una maquina de desarrollo.
    req.auth = { userId: req.header("x-dev-user-id") ?? "dev-user" };
    next();
    return;
  }

  log.warn("peticion rechazada: el API corre sin SUPABASE_URL y sin ALLOW_DEV_AUTH");
  res.status(401).json({ error: "No autenticado" });
};
