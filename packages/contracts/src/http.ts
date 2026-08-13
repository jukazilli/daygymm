import { z } from "zod";

export const apiVersion = "v1" as const;

const stableCodeSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/);

export const correlationIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const opaqueCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);

export const paginationRequestSchema = z
  .object({
    cursor: opaqueCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const paginationResponseSchema = z
  .object({
    next_cursor: opaqueCursorSchema.nullable(),
  })
  .strict();

export const problemTypes = Object.freeze({
  internal: "urn:daygym:problem:internal-error",
  invalidRequest: "urn:daygym:problem:invalid-request",
  notFound: "urn:daygym:problem:not-found",
});

export const problemIssueSchema = z
  .object({
    pointer: z.string().min(1).max(256).startsWith("/"),
    code: stableCodeSchema,
  })
  .strict();

export const problemDetailsSchema = z
  .object({
    type: z.string().startsWith("urn:daygym:problem:"),
    title: z.string().min(1).max(120),
    status: z.number().int().min(400).max(599),
    code: stableCodeSchema,
    correlation_id: correlationIdSchema,
    errors: z.array(problemIssueSchema).max(20).optional(),
  })
  .strict();

export const apiMetaV1Schema = z
  .object({
    api_version: z.literal(apiVersion),
    compatibility: z.literal("additive"),
    status: z.literal("available"),
  })
  .strict();

export const problemDetailsJsonSchema = z.toJSONSchema(problemDetailsSchema, {
  target: "draft-7",
});

export const apiMetaV1JsonSchema = z.toJSONSchema(apiMetaV1Schema, {
  target: "draft-7",
});

export const idempotencyKeyJsonSchema = z.toJSONSchema(idempotencyKeySchema);

export const paginationRequestJsonSchema = z.toJSONSchema(
  paginationRequestSchema,
);

export const paginationResponseJsonSchema = z.toJSONSchema(
  paginationResponseSchema,
);

export type ApiMetaV1 = z.infer<typeof apiMetaV1Schema>;
export type PaginationRequest = z.infer<typeof paginationRequestSchema>;
export type PaginationResponse = z.infer<typeof paginationResponseSchema>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
