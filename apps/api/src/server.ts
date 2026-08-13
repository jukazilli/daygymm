import { randomUUID } from "node:crypto";

import Fastify, { LogController } from "fastify";
import type { FastifyRequest } from "fastify";

import {
  apiMetaV1JsonSchema,
  apiMetaV1Schema,
  dayGymOpenApiV1,
  problemDetailsJsonSchema,
  problemDetailsSchema,
  problemTypes,
  type ProblemDetails,
} from "@daygym/contracts";

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
  const server = Fastify({
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
    logger: true,
  });

  server.addHook("onSend", async (request, reply) => {
    void reply.header("x-correlation-id", request.id);
  });

  server.addHook("onResponse", async (request, reply) => {
    request.log.info(buildSafeRequestLog(request, reply), "request completed");
  });

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

  server.get(
    "/v1",
    {
      schema: {
        response: {
          200: apiMetaV1JsonSchema,
          500: problemDetailsJsonSchema,
        },
      },
    },
    async () =>
      apiMetaV1Schema.parse({
        api_version: "v1",
        compatibility: "additive",
        status: "available",
      }),
  );

  server.get("/v1/openapi.json", async () => dayGymOpenApiV1);

  server.setNotFoundHandler(async (request, reply) => {
    const problem = buildProblemDetails("not-found", request.id);
    return reply
      .code(problem.status)
      .type("application/problem+json")
      .send(problem);
  });

  server.setErrorHandler(async (error, request, reply) => {
    const problem = problemFromError(error, request);
    if (problem.status >= 500) {
      request.log.error(
        {
          code: errorCode(error),
          correlation_id: request.id,
        },
        "request failed",
      );
    }

    return reply
      .code(problem.status)
      .type("application/problem+json")
      .send(problem);
  });

  return server;
}

type SafeRequestLogInput = {
  id: string;
  method: string;
  routeOptions: { url?: string };
};

type SafeReplyLogInput = {
  elapsedTime: number;
  statusCode: number;
};

export function buildSafeRequestLog(
  request: SafeRequestLogInput,
  reply: SafeReplyLogInput,
) {
  return {
    correlation_id: request.id,
    method: request.method,
    response_time_ms: Math.round(reply.elapsedTime),
    route: request.routeOptions.url ?? "unmatched",
    status_code: reply.statusCode,
  };
}

type ProblemKind = "internal" | "invalid-request" | "not-found";

const problemDefinition: Record<
  ProblemKind,
  Pick<ProblemDetails, "code" | "status" | "title" | "type">
> = {
  internal: {
    type: problemTypes.internal,
    title: "Não foi possível concluir agora.",
    status: 500,
    code: "server.unavailable",
  },
  "invalid-request": {
    type: problemTypes.invalidRequest,
    title: "Solicitação inválida.",
    status: 400,
    code: "request.invalid",
  },
  "not-found": {
    type: problemTypes.notFound,
    title: "Recurso não encontrado.",
    status: 404,
    code: "route.not_found",
  },
};

export function buildProblemDetails(
  kind: ProblemKind,
  correlationId: string,
  errors?: ProblemDetails["errors"],
): ProblemDetails {
  return problemDetailsSchema.parse({
    ...problemDefinition[kind],
    correlation_id: correlationId,
    ...(errors && errors.length > 0 ? { errors } : {}),
  });
}

function problemFromError(
  error: unknown,
  request: FastifyRequest,
): ProblemDetails {
  if (isValidationError(error)) {
    return buildProblemDetails("invalid-request", request.id, [
      {
        pointer: `/${error.validationContext ?? "request"}`,
        code: "request.invalid",
      },
    ]);
  }

  return buildProblemDetails("internal", request.id);
}

function isValidationError(
  error: unknown,
): error is { validation: readonly unknown[]; validationContext?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "validation" in error &&
    Array.isArray(error.validation)
  );
}

function errorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Za-z0-9._-]{1,80}$/.test(error.code)
  ) {
    return error.code;
  }

  return "unexpected";
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
