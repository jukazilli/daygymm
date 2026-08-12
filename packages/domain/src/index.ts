/**
 * The domain layer records module boundaries only. Business rules start in M1.
 * It deliberately has no framework or infrastructure dependencies.
 */
export const domainModules = [
  "training",
  "progress",
  "nutrition",
  "professional",
  "community",
  "rewards",
  "commerce",
] as const;

export type DomainModule = (typeof domainModules)[number];

export function isDomainModule(value: string): value is DomainModule {
  return (domainModules as readonly string[]).includes(value);
}
