import { afterEach, describe, expect, it } from "vitest";

import { buildServer, readRuntimeConfiguration } from "./server.js";

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
});
