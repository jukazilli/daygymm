const CACHE_NAME = "daygym-runtime-v2";
const CACHE_PREFIX = "daygym-runtime-";
const OFFLINE_ROUTE_FALLBACKS = [
  "/hoje/",
  "/treinos/",
  "/treinos/sessao/",
  "/comecar/",
  "/entrar/",
];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter(
                (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
              )
              .map((name) => caches.delete(name)),
          ),
        ),
    ]),
  );
});

function canCache(request, response) {
  return (
    request.method === "GET" &&
    response.ok &&
    response.type === "basic" &&
    new URL(request.url).origin === self.location.origin
  );
}

async function remember(request, response) {
  if (canCache(request, response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function cachedNavigation(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) {
    return cached;
  }

  for (const route of OFFLINE_ROUTE_FALLBACKS) {
    const fallback = await caches.match(route, { ignoreSearch: true });
    if (fallback) {
      return Response.redirect(new URL(route, self.location.origin), 302);
    }
  }

  return new Response("DayGym está offline e ainda não guardou esta tela.", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: 503,
  });
}

async function networkFirstNavigation(request) {
  try {
    return await remember(request, await fetch(request));
  } catch {
    return cachedNavigation(request);
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  return remember(request, await fetch(request));
}

async function networkFirstResource(request) {
  try {
    return await remember(request, await fetch(request));
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) {
      return cached;
    }
    throw new Error("DAYGYM_RESOURCE_NOT_CACHED");
  }
}

async function cacheRoute(pathname) {
  if (
    typeof pathname !== "string" ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//")
  ) {
    return;
  }

  const routeUrl = new URL(pathname, self.location.origin);
  const routeRequest = new Request(routeUrl, { credentials: "same-origin" });
  const routeResponse = await fetch(routeRequest);
  if (!canCache(routeRequest, routeResponse)) {
    return;
  }

  const markup = await routeResponse.clone().text();
  await remember(routeRequest, routeResponse);
  const assetUrls = new Set(
    [...markup.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], self.location.origin))
      .filter(
        (url) =>
          url.origin === self.location.origin &&
          (url.pathname.startsWith("/_next/static/") ||
            url.pathname.startsWith("/pwa/") ||
            url.pathname.startsWith("/brand/") ||
            url.pathname.endsWith(".webmanifest")),
      )
      .map((url) => url.href),
  );

  await Promise.all(
    [...assetUrls].map(async (assetUrl) => {
      const request = new Request(assetUrl, { credentials: "same-origin" });
      if (!(await caches.match(request))) {
        await remember(request, await fetch(request));
      }
    }),
  );
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_APP_SHELL") {
    const pathnames = Array.isArray(event.data.pathnames)
      ? event.data.pathnames
      : OFFLINE_ROUTE_FALLBACKS;
    event.waitUntil(
      Promise.allSettled(pathnames.map((pathname) => cacheRoute(pathname))),
    );
    return;
  }
  if (event.data?.type === "CACHE_ROUTE") {
    event.waitUntil(cacheRoute(event.data.pathname).catch(() => undefined));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pwa/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.startsWith("/templates/") ||
    url.pathname.endsWith(".webmanifest")
  ) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  if (url.pathname !== "/sw.js") {
    event.respondWith(networkFirstResource(request));
  }
});
