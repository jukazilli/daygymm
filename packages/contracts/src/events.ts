import { z } from "zod";

import { correlationIdSchema } from "./http.js";

const technicalIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const boundedCodeSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/);
const utcTimestampSchema = z.iso.datetime({ offset: false });

const envelopeFields = {
  event_id: z.uuid(),
  event_version: z.literal(1),
  occurred_at: utcTimestampSchema,
  correlation_id: correlationIdSchema,
  producer: boundedCodeSchema,
} as const;

export const trainingSessionCompletedEventSchema = z
  .object({
    ...envelopeFields,
    event_name: z.literal("TrainingSessionCompleted"),
    payload: z
      .object({
        session_id: technicalIdSchema,
        user_id: technicalIdSchema,
        occurred_at: utcTimestampSchema,
        version: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export const trainingSessionPartiallyCompletedEventSchema = z
  .object({
    ...envelopeFields,
    event_name: z.literal("TrainingSessionPartiallyCompleted"),
    payload: z
      .object({
        session_id: technicalIdSchema,
        user_id: technicalIdSchema,
        occurred_at: utcTimestampSchema,
        version: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export const planVersionPublishedEventSchema = z
  .object({
    ...envelopeFields,
    event_name: z.literal("PlanVersionPublished"),
    payload: z
      .object({
        plan_id: technicalIdSchema,
        version_id: technicalIdSchema,
        actor_type: boundedCodeSchema,
      })
      .strict(),
  })
  .strict();

export const professionalAccessRevokedEventSchema = z
  .object({
    ...envelopeFields,
    event_name: z.literal("ProfessionalAccessRevoked"),
    payload: z
      .object({
        link_id: technicalIdSchema,
        effective_at: utcTimestampSchema,
      })
      .strict(),
  })
  .strict();

export const rewardGrantedEventSchema = z
  .object({
    ...envelopeFields,
    event_name: z.literal("RewardGranted"),
    payload: z
      .object({
        ledger_entry_id: technicalIdSchema,
        reason_code: boundedCodeSchema,
      })
      .strict(),
  })
  .strict();

export const moderationCaseOpenedEventSchema = z
  .object({
    ...envelopeFields,
    event_name: z.literal("ModerationCaseOpened"),
    payload: z
      .object({
        case_id: technicalIdSchema,
        severity: boundedCodeSchema,
        content_ref: technicalIdSchema,
      })
      .strict(),
  })
  .strict();

export const partnerOfferChangedEventSchema = z
  .object({
    ...envelopeFields,
    event_name: z.literal("PartnerOfferChanged"),
    payload: z
      .object({
        partner_id: technicalIdSchema,
        offer_id: technicalIdSchema,
        status: boundedCodeSchema,
      })
      .strict(),
  })
  .strict();

export const domainEventV1Schema = z.discriminatedUnion("event_name", [
  trainingSessionCompletedEventSchema,
  trainingSessionPartiallyCompletedEventSchema,
  planVersionPublishedEventSchema,
  professionalAccessRevokedEventSchema,
  rewardGrantedEventSchema,
  moderationCaseOpenedEventSchema,
  partnerOfferChangedEventSchema,
]);

export const domainEventV1JsonSchema = z.toJSONSchema(domainEventV1Schema);

export type DomainEventV1 = z.infer<typeof domainEventV1Schema>;

export function serializeDomainEventV1(event: DomainEventV1): string {
  return JSON.stringify(domainEventV1Schema.parse(event));
}

export function parseDomainEventV1(serialized: string): DomainEventV1 {
  const value: unknown = JSON.parse(serialized);
  return domainEventV1Schema.parse(value);
}
