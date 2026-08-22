import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const serviceWorker = readFileSync(
  resolve(process.cwd(), "public/sw.js"),
  "utf8",
);
const pwaRegistration = readFileSync(
  resolve(process.cwd(), "app/pwa-registration.tsx"),
  "utf8",
);

describe("PWA offline app shell", () => {
  it("prepares critical routes and retires obsolete runtime caches", () => {
    expect(serviceWorker).toContain("daygym-runtime-v3");
    expect(serviceWorker).toContain("CACHE_APP_SHELL");
    expect(serviceWorker).toContain("caches.delete(name)");
    expect(serviceWorker).toContain('"/hoje/"');
    expect(serviceWorker).toContain('"/treinos/"');
    expect(serviceWorker).toContain('"/treinos/meus/"');
    expect(serviceWorker).toContain('"/treinos/sessao/"');
    expect(pwaRegistration).toContain('"/treinos/meus/"');
  });

  it("keeps an uncached training route inside the training area", () => {
    expect(serviceWorker).toContain('requestedPath.startsWith("/treinos/")');
  });
});
