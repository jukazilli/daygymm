import { domainEventV1JsonSchema } from "./events.js";
import {
  apiMetaV1JsonSchema,
  apiVersion,
  idempotencyKeyJsonSchema,
  paginationRequestJsonSchema,
  paginationResponseJsonSchema,
  problemDetailsJsonSchema,
} from "./http.js";

export const dayGymOpenApiV1 = Object.freeze({
  openapi: "3.1.0",
  info: {
    title: "DayGym API",
    version: "1.0.0",
  },
  paths: {
    "/v1": {
      get: {
        operationId: "getApiMetaV1",
        responses: {
          "200": {
            description: "Versioned API boundary is available.",
            content: {
              "application/json": { schema: apiMetaV1JsonSchema },
            },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/v1/openapi.json": {
      get: {
        operationId: "getOpenApiV1",
        responses: {
          "200": { description: "OpenAPI contract for the v1 boundary." },
        },
      },
    },
  },
  components: {
    schemas: {
      ApiMetaV1: apiMetaV1JsonSchema,
      DomainEventV1: domainEventV1JsonSchema,
      IdempotencyKey: idempotencyKeyJsonSchema,
      PaginationRequest: paginationRequestJsonSchema,
      PaginationResponse: paginationResponseJsonSchema,
      ProblemDetails: problemDetailsJsonSchema,
    },
    responses: {
      InternalError: {
        description: "The request could not be completed.",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ProblemDetails" },
          },
        },
      },
    },
  },
  "x-daygym-api-version": apiVersion,
} as const);
