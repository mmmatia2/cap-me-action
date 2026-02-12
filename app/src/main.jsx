import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Purpose: bootstrap the React app root. Inputs: browser DOM with #root. Outputs: rendered App UI.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
