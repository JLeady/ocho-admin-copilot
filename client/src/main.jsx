import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary
      title="Ocho AI hit a snag"
      message="Something went wrong loading the app. Your data is safe — try reloading."
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
