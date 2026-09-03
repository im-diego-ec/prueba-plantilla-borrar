import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Raiz } from "./Raiz";
import type { Autenticacion } from "./auth";

// Se dobla el ARMADO del proveedor, no el SDK: lo que hay que verificar aca es
// la DECISION del arranque —con las variables puestas la app corre con auth, sin
// ellas corre sin auth y lo dice—, no como se construye el cliente (eso es
// auth.test.ts).
const { crear } = vi.hoisted(() => ({ crear: vi.fn() }));
vi.mock("./auth", () => ({ crearAutenticacion: crear }));

/** Un proveedor que no hace nada: alcanza para ver la rama "con auth". */
function proveedorInerte(): Autenticacion {
  return {
    sesionActual: vi.fn(() => Promise.resolve(null)),
    token: vi.fn(() => Promise.resolve(null)),
    alCambiar: vi.fn(() => vi.fn()),
    ingresar: vi.fn(() => Promise.resolve()),
    salir: vi.fn(() => Promise.resolve()),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // App consulta el healthcheck al montarse; sin esto la prueba dependeria de
  // que haya un API escuchando, que es la definicion de prueba intermitente.
  //
  // EL DOBLE COPIA LA FORMA QUE DEVUELVE api/src/app.ts (`{ estado }`), no una
  // inventada. Decia `{ status: "ok" }` —el nombre que el API de este andamio no
  // emite— y las dos pruebas de abajo estaban ROJAS por eso: el esquema Zod de
  // App.tsx rechazaba el cuerpo, la portada mostraba "el API respondio algo que
  // no entiendo" y el `findByText("ok")` no encontraba nada. Medido: el mismo
  // safeParse falla igual con zod 3 y con zod 4, o sea el rojo no lo estreno la
  // subida de mayor, estaba ahi desde que se corrigieron los dobles de
  // App.test.tsx y este quedo sin corregir.
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ estado: "ok" }) })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Raiz", () => {
  it("sin las variables del proveedor corre sin auth, y la interfaz lo dice", async () => {
    crear.mockReturnValue(null);

    render(<Raiz />);

    expect(await screen.findByText("ok")).toBeTruthy();
    // Que la app corra sin auth no puede ser silencioso: en dev es comodo y en
    // un ambiente desplegado es un aviso de que faltan las variables.
    expect(screen.getByText(/Supabase no configurado/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar enlace de acceso" })).toBeNull();
  });

  it("con el proveedor armado la app corre con auth y ofrece ingresar", async () => {
    crear.mockReturnValue(proveedorInerte());

    render(<Raiz />);

    expect(await screen.findByText("ok")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar enlace de acceso" })).toBeTruthy();
    expect(screen.queryByText(/Supabase no configurado/)).toBeNull();
  });

  it("el proveedor se arma UNA vez, no en cada render", async () => {
    // Sin el useMemo, cada re-render abre una conexion nueva con el proveedor y
    // reinicia la suscripcion a los cambios de sesion — un fallo que no se ve
    // mirando la pantalla.
    crear.mockReturnValue(proveedorInerte());

    const { rerender } = render(<Raiz />);
    await screen.findByText("ok");
    rerender(<Raiz />);

    expect(crear).toHaveBeenCalledOnce();
  });
});
