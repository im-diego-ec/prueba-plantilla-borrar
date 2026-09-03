// Augmentation del Request de Express: las propiedades que adjuntan NUESTROS
// middlewares, tipadas de verdad. La alternativa era `(req as any).auth` en
// cada handler — el compilador ciego justo en la lectura de la identidad, que
// es lo ultimo que conviene tener sin tipos.
//
// Archivo de ambito global a proposito (sin imports ni exports): asi el
// `namespace Express` se fusiona con el global que declara @types/express sin
// necesitar `declare global`.
declare namespace Express {
  interface Request {
    /** Claims VERIFICADOS del token (middleware auth.ts). Nunca del body. */
    auth?: { userId: string; email?: string; name?: string };
    /** Trace del ALB, o local-<uuid> en dev (middleware requestId.ts). */
    requestId?: string;
  }
}
