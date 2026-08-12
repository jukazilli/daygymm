import Fastify from "fastify";

export type RuntimeConfiguration = {
  environment: string;
  processKind: "api" | "worker";
};

function readProcessKind(
  value: string | undefined,
): RuntimeConfiguration["processKind"] {
  return value === "worker" ? "worker" : "api";
}

export function readRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfiguration {
  return {
    environment: environment.DAYGYM_ENV ?? "staging",
    processKind: readProcessKind(environment.DAYGYM_PROCESS),
  };
}

export function buildServer(configuration = readRuntimeConfiguration()) {
  const server = Fastify({ logger: true });

  server.get("/health/live", async () => ({
    environment: configuration.environment,
    process: configuration.processKind,
    status: "live",
  }));

  server.get("/health/ready", async () => ({
    environment: configuration.environment,
    process: configuration.processKind,
    status: "ready",
  }));

  return server;
}

async function start() {
  const server = buildServer();
  const port = Number.parseInt(process.env.PORT ?? "8080", 10);

  await server.listen({
    host: "0.0.0.0",
    port: Number.isFinite(port) ? port : 8080,
  });
}

if (process.env.VITEST === undefined) {
  await start();
}
