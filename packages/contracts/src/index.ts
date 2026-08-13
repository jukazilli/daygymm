declare const opaqueIdBrand: unique symbol;

export * from "./auth.js";
export * from "./events.js";
export * from "./http.js";
export * from "./openapi.js";

/** A transport-safe identifier without binding a future storage implementation. */
export type OpaqueId = string & {
  readonly [opaqueIdBrand]: "DayGymOpaqueId";
};

export function toOpaqueId(value: string): OpaqueId {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("An opaque identifier cannot be empty.");
  }

  return normalized as OpaqueId;
}
