import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ToastSaglayici } from "./lib/toast";
import { FlashOverlay } from "./lib/flash";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL })
      .catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ToastSaglayici>
          <AuthProvider>
            <App />
            <FlashOverlay />
          </AuthProvider>
        </ToastSaglayici>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
