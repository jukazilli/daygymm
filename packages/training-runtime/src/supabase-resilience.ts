interface SupabaseResult<T> {
  readonly data: T;
  readonly error: unknown;
}

interface RetryOptions {
  readonly delaysMs?: readonly number[];
  readonly wait?: (milliseconds: number) => Promise<void>;
}

const defaultDelaysMs = [250, 750] as const;

function errorProperty(error: unknown, property: "code" | "status") {
  if (!error || typeof error !== "object" || !(property in error)) {
    return undefined;
  }
  return (error as Record<string, unknown>)[property];
}

export function isTransientSupabaseError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const status = errorProperty(error, "status");
  if (
    typeof status === "number" &&
    (status === 408 || status === 425 || status === 429 || status >= 500)
  ) {
    return true;
  }
  const code = errorProperty(error, "code");
  return (
    typeof code === "string" &&
    (code.startsWith("08") ||
      code === "PGRST000" ||
      code === "PGRST001" ||
      code === "PGRST002" ||
      code === "PGRST003")
  );
}

function defaultWait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function retryIdempotentSupabaseRequest<T>(
  request: () => PromiseLike<SupabaseResult<T>>,
  options: RetryOptions = {},
): Promise<SupabaseResult<T>> {
  const delaysMs = options.delaysMs ?? defaultDelaysMs;
  const wait = options.wait ?? defaultWait;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await request();
      if (
        !result.error ||
        !isTransientSupabaseError(result.error) ||
        attempt >= delaysMs.length
      ) {
        return result;
      }
    } catch (error) {
      if (!isTransientSupabaseError(error) || attempt >= delaysMs.length) {
        throw error;
      }
    }
    await wait(delaysMs[attempt]!);
  }
}
