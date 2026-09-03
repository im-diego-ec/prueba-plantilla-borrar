import React from "react";
import ReactDOM from "react-dom/client";
import { Raiz } from "./Raiz";
import "./index.css";

// ENTRYPOINT DEL NAVEGADOR: monta el arbol y nada mas. No decide nada a
// proposito — la unica decision del arranque (armar o no el proveedor de
// identidad) vive en Raiz.tsx, que es un componente y por lo tanto se puede
// renderizar en una prueba. Un entrypoint no se puede probar sin montar el navegador
// entero, asi que la forma de que su falta de pruebas no esconda nada es que no
// tenga nada que esconder. Por eso —y solo por eso— este archivo esta declarado
// en projects.cobertura.excluidos de package.json.
const contenedor = document.getElementById("root");
if (!contenedor) throw new Error("no existe el elemento #root en index.html");

ReactDOM.createRoot(contenedor).render(
  <React.StrictMode>
    <Raiz />
  </React.StrictMode>
);
