import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const serviceWorker = readFileSync(
  resolve(process.cwd(), "public/sw.js"),
  "utf8",
);

describe("PWA offline app shell", () => {
  it("prepares critical routes and retires obsolete runtime caches", () => {
    expect(serviceWorker).toContain("daygym-runtime-v2");
    expect(serviceWorker).toContain("CACHE_APP_SHELL");
    expect(serviceWorker).toContain("caches.delete(name)");
    expect(serviceWorker).toContain('"/hoje/"');
    expect(serviceWorker).toContain('"/treinos/"');
    expect(serviceWorker).toContain('"/treinos/sessao/"');
  });
});
