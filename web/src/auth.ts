import { createClient } from "@supabase/supabase-js";

/**
 * EL PROVEEDOR DE IDENTIDAD, DETRAS DE UN CONTRATO PROPIO.
 *
 * Este archivo es el UNICO del frontend que importa el SDK del proveedor. La
 * interfaz (App.tsx) habla con `Autenticacion`, que son cinco metodos y nada
 * mas. Eso compra dos cosas concretas, y ninguna es purismo:
 *
 *   1. Las pruebas de la interfaz no montan el SDK de un tercero: le pasan un
 *      objeto de cinco funciones. Sin esto habria que doblar la forma interna
 *      de `supabase.auth` en cada banco, y esa forma la decide otro repositorio.
 *   2. Cambiar de proveedor (a Clerk, por ejemplo) es reescribir ESTE archivo y
 *      su banco. La portada, sus estados y sus pruebas no se enteran.
 *
 * POR QUE SUPABASE. El proyecto ya usa Supabase para la base, asi que su login
 * es UNA cuenta en vez de dos y UN juego de llaves en vez de dos. Los dos planes
 * gratuitos que se compararon dan 50.000 usuarios activos al mes: la eleccion no
 * se paga con capacidad.
 */

/**
 * Lo que la interfaz PINTA de una sesion: quien es.
 *
 * El token NO viaja aca a proposito. Vence y el SDK lo renueva por su cuenta,
 * asi que una copia guardada en el estado de un componente envejece sin avisar
 * y manda un Bearer muerto al API. Quien necesita llamar lo pide en el momento,
 * con `token()`.
 */
export interface Sesion {
  userId: string;
  email?: string;
}

/** El contrato minimo que la interfaz le pide a un proveedor de identidad. */
export interface Autenticacion {
  /** La sesion de este navegador, o null si no hay. */
  sesionActual(): Promise<Sesion | null>;
  /**
   * El access token de la sesion de este navegador, o null si no hay sesion.
   *
   * NO ES UN METODO DECORATIVO. api/src/app.ts protege /api/hello con
   * requireAuth, que exige `Authorization: Bearer <token>` y responde 401 sin
   * el. Mientras el contrato no expuso el token, la interfaz era
   * ESTRUCTURALMENTE incapaz de llamar a su propio API: habia login, sesion y
   * boton de salir, y el hello-world solo respondia con el bypass de
   * desarrollo encendido (ALLOW_DEV_AUTH=true, o sea nunca en un ambiente
   * real). Un proveedor que se cambie por otro tiene que seguir dando esto.
   */
  token(): Promise<string | null>;
  /** Avisa cada vez que la sesion cambia. Devuelve la funcion para dejar de escuchar. */
  alCambiar(escuchar: (sesion: Sesion | null) => void): () => void;
  /** Manda el enlace de acceso al correo. */
  ingresar(email: string): Promise<void>;
  /** Cierra la sesion de este navegador. */
  salir(): Promise<void>;
}

/**
 * La forma de la sesion de Supabase que este archivo lee. Estructural y no
 * importada del SDK: son los dos campos que se usan, y asi el banco puede
 * fabricar una sesion sin arrastrar el tipo entero del proveedor.
 */
interface SesionDelProveedor {
  user: { id: string; email?: string };
}

/** Traduce la sesion del proveedor a la del proyecto. */
export function aSesion(sesion: SesionDelProveedor | null | undefined): Sesion | null {
  if (!sesion?.user.id) return null;
  return { userId: sesion.user.id, email: sesion.user.email };
}

/**
 * Arma el proveedor de identidad, o devuelve null si el proyecto corre sin auth.
 *
 * Corre sin auth cuando falta cualquiera de las dos variables, no cuando faltan
 * las dos: con la mitad puesta, `createClient` arma un cliente que falla en cada
 * llamada con un error del SDK — un modo roto que se parece a uno configurado.
 *
 * LAS DOS VARIABLES SON PUBLICAS. La clave anonima viaja en el bundle y esta
 * pensada para eso; lo que protege los datos del otro lado es Row Level Security
 * en la base, no el secreto de esta clave. La clave de servicio NO va aca ni en
 * ningun archivo del front.
 */
/**
 * Las DOS variables que este archivo lee, y nada mas. Un tipo propio en vez de
 * `ImportMetaEnv` entero para que el banco pueda armar un entorno de dos campos
 * en vez de fabricar el objeto completo que declara vite/client (BASE_URL, MODE,
 * DEV, PROD, SSR) o taparlo con un cast que el compilador no verifica.
 */
export interface VariablesDeAuth {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

export function crearAutenticacion(env: VariablesDeAuth = import.meta.env): Autenticacion | null {
  const url = env.VITE_SUPABASE_URL;
  const claveAnonima = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !claveAnonima) return null;

  const cliente = createClient(url, claveAnonima);

  return {
    async sesionActual() {
      const { data } = await cliente.auth.getSession();
      return aSesion(data.session);
    },
    async token() {
      // Se PREGUNTA en cada llamada, no se guarda: getSession devuelve el token
      // vigente y renueva por su cuenta el que esta por vencer. Un token
      // copiado a una variable de modulo o al estado de un componente
      // sobrevive a su propia expiracion, y el API lo rechaza con 401 sin que
      // la portada tenga forma de saber por que.
      const { data } = await cliente.auth.getSession();
      return data.session?.access_token ?? null;
    },
    alCambiar(escuchar) {
      const { data } = cliente.auth.onAuthStateChange((_evento, sesion) => {
        escuchar(aSesion(sesion));
      });
      // Se DEVUELVE la baja, no se guarda en una variable de modulo: es lo que
      // el useEffect de la interfaz necesita para cancelar al desmontarse. Un
      // listener que sobrevive al componente escribe estado sobre un arbol que
      // ya no existe.
      return () => data.subscription.unsubscribe();
    },
    async ingresar(email) {
      // Enlace magico por correo: es el metodo que un proyecto de Supabase trae
      // habilitado de fabrica, asi que la portada del andamio funciona sin
      // configurar ningun proveedor externo.
      const { error } = await cliente.auth.signInWithOtp({ email });
      // El error NO se traga: sin esto, un correo rechazado o un limite de
      // envios se ve exactamente igual que un envio exitoso.
      if (error) throw error;
    },
    async salir() {
      const { error } = await cliente.auth.signOut();
      if (error) throw error;
    },
  };
}
