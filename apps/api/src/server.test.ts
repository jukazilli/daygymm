import { afterEach, describe, expect, it } from "vitest";

import { apiMetaV1Schema, problemDetailsSchema } from "@daygym/contracts";

import {
  buildSafeRequestLog,
  buildServer,
  readRuntimeConfiguration,
} from "./server.js";

describe("DayGym online health boundary", () => {
  const servers: ReturnType<typeof buildServer>[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it("reports a live API process", async () => {
    const server = buildServer({
      environment: "staging",
      processKind: "api",
    });
    servers.push(server);

    const response = await server.inject("/health/live");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      environment: "staging",
      process: "api",
      status: "live",
    });
  });

  it("keeps the worker process explicit", () => {
    expect(
      readRuntimeConfiguration({
        DAYGYM_ENV: "staging",
        DAYGYM_PROCESS: "worker",
      }),
    ).toEqual({
      environment: "staging",
      processKind: "worker",
    });
  });

  it("runs one bounded domain-event cycle only on the worker surface", async () => {
    const runWorkerCycle = async () => ({
      alreadyProcessed: 1,
      dispatched: 2,
      failed: 0,
      processed: 1,
      received: 2,
    });
    const worker = buildServer(
      { environment: "staging", processKind: "worker" },
      { runWorkerCycle },
    );
    const api = buildServer({ environment: "staging", processKind: "api" });
    servers.push(worker, api);

    const workerResponse = await worker.inject({
      method: "POST",
      url: "/internal/jobs/domain-events",
      payload: {},
    });
    const apiResponse = await api.inject({
      method: "POST",
      url: "/internal/jobs/domain-events",
      payload: {},
    });

    expect(workerResponse.statusCode).toBe(200);
    expect(workerResponse.json()).toEqual({
      status: "completed",
      alreadyProcessed: 1,
      dispatched: 2,
      failed: 0,
      processed: 1,
      received: 2,
    });
    expect(apiResponse.statusCode).toBe(404);
  });

  it("reports an incomplete worker cycle without exposing event content", async () => {
    const worker = buildServer(
      { environment: "staging", processKind: "worker" },
      {
        runWorkerCycle: async () => ({
          alreadyProcessed: 0,
          dispatched: 0,
          failed: 1,
          processed: 0,
          received: 1,
        }),
      },
    );
    servers.push(worker);

    const response = await worker.inject({
      method: "POST",
      url: "/internal/jobs/domain-events",
      payload: {},
    });

    expect(response.statusCode).toBe(500);
    expect(problemDetailsSchema.parse(response.json()).code).toBe(
      "server.unavailable",
    );
    expect(response.body).not.toContain("payload");
  });

  it("serves the versioned API contract with a correlation ID", async () => {
    const server = buildServer();
    servers.push(server);

    const response = await server.inject("/v1");

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-correlation-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
    expect(apiMetaV1Schema.parse(response.json())).toEqual({
      api_version: "v1",
      compatibility: "additive",
      status: "available",
    });
  });

  it("publishes an OpenAPI document for the same v1 boundary", async () => {
    const server = buildServer();
    servers.push(server);

    const response = await server.inject("/v1/openapi.json");
    const contract = response.json();

    expect(response.statusCode).toBe(200);
    expect(contract.openapi).toBe("3.1.0");
    expect(contract.paths["/v1"].get.operationId).toBe("getApiMetaV1");
  });

  it("returns safe Problem Details without exposing route internals", async () => {
    const server = buildServer();
    servers.push(server);

    const response = await server.inject("/v1/not-a-real-route?token=secret");
    const problem = problemDetailsSchema.parse(response.json());

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(problem.code).toBe("route.not_found");
    expect(response.body).not.toContain("not-a-real-route");
    expect(response.body).not.toContain("secret");
  });

  it("maps unexpected failures to a stable problem without the error message", async () => {
    const server = buildServer();
    server.get("/v1/test-failure", async () => {
      throw new Error("database password should never escape");
    });
    servers.push(server);

    const response = await server.inject("/v1/test-failure");
    const problem = problemDetailsSchema.parse(response.json());

    expect(response.statusCode).toBe(500);
    expect(problem.code).toBe("server.unavailable");
    expect(response.body).not.toContain("database");
    expect(response.body).not.toContain("password");
  });

  it("maps schema validation failures without reflecting rejected values", async () => {
    const server = buildServer();
    server.get(
      "/v1/test-validation",
      {
        schema: {
          querystring: {
            type: "object",
            additionalProperties: false,
            required: ["operation_id"],
            properties: {
              operation_id: { type: "string", minLength: 16, maxLength: 128 },
            },
          },
        },
      },
      async () => ({ accepted: true }),
    );
    servers.push(server);

    const response = await server.inject(
      "/v1/test-validation?operation_id=private-value&extra=do-not-reflect",
    );
    const problem = problemDetailsSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(problem.code).toBe("request.invalid");
    expect(problem.errors).toEqual([
      { pointer: "/querystring", code: "request.invalid" },
    ]);
    expect(response.body).not.toContain("private-value");
    expect(response.body).not.toContain("do-not-reflect");
  });

  it("logs only the registered route and excludes the raw URL", () => {
    const request = {
      id: "019c6f2a-40fd-7000-8000-000000000001",
      method: "GET",
      routeOptions: { url: "/v1/test-validation" },
      url: "/v1/test-validation?token=secret",
    };

    const log = buildSafeRequestLog(request, {
      elapsedTime: 12.6,
      statusCode: 400,
    });

    expect(log).toEqual({
      correlation_id: request.id,
      method: "GET",
      response_time_ms: 13,
      route: "/v1/test-validation",
      status_code: 400,
    });
    expect(JSON.stringify(log)).not.toContain("secret");
  });
});
