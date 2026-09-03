/// <reference types="vite/client" />

// Las variables VITE_* del navegador, DECLARADAS. Vite las tipa con una firma
// de indice `any`, asi que sin este bloque `import.meta.env.VITE_API_URL` entra
// como `any` y las reglas type-checked del linter (no-unsafe-assignment y
// familia, en ERROR sobre codigo de producto) obligan a un cast que el
// compilador no verifica. Declararlas cuesta dos lineas y hace que un typo en
// el nombre sea un error de tipos en vez de un `undefined` en tiempo de
// ejecucion.
//
// Al agregar una variable aca, agregala tambien a .env.example: ese archivo es
// el contrato con quien clona el repo.
interface ImportMetaEnv {
  /** Base del API. Sin ella, el front asume el API local. */
  readonly VITE_API_URL?: string;
  /** URL del proyecto de Supabase. Sin ella la app corre sin auth (solo dev). */
  readonly VITE_SUPABASE_URL?: string;
  /** Clave ANONIMA de Supabase: publica a proposito, viaja en el bundle. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
