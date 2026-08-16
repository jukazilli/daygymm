"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const offlineAppRoutes = [
  "/hoje/",
  "/treinos/",
  "/treinos/meus/",
  "/treinos/sessao/",
  "/comecar/",
  "/entrar/",
];

export function PwaRegistration() {
  const pathname = usePathname();

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const cacheAppShell = (worker?: ServiceWorker | null) => {
      worker?.postMessage({
        pathnames: [...new Set([pathname, ...offlineAppRoutes])],
        type: "CACHE_APP_SHELL",
      });
    };
    const cacheAfterControllerChange = () => {
      cacheAppShell(navigator.serviceWorker.controller);
    };
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const registration = await navigator.serviceWorker.ready;
        cacheAppShell(registration.active);
      } catch {
        // Installation remains best-effort; online usage must keep working.
      }
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      cacheAfterControllerChange,
    );

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        cacheAfterControllerChange,
      );
    };
  }, [pathname]);

  return null;
}
