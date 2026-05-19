"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const hadController = Boolean(navigator.serviceWorker.controller);
      let refreshing = false;

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || refreshing) return;
        refreshing = true;
        window.location.reload();
      });

      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          registration.active?.postMessage({ type: "CLEAR_STALE_CACHES" });
          registration.waiting?.postMessage({ type: "SKIP_WAITING" });

          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) return;

            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                worker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });

          return registration.update();
        })
        .catch(() => undefined);
    }
  }, []);
  return null;
}
