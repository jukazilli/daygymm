"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function PwaRegistration() {
  const pathname = usePathname();

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({
          pathname,
          type: "CACHE_ROUTE",
        });
      } catch {
        // Installation remains best-effort; online usage must keep working.
      }
    };

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => window.removeEventListener("load", register);
  }, [pathname]);

  return null;
}
