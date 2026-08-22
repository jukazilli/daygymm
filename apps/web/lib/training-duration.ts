export const maximumExerciseDurationSeconds = 7_200;
export const maximumRestDurationSeconds = 1_800;

export function formatTrainingDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.trunc(totalSeconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function parseTrainingDuration(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (/^\d+$/.test(normalized)) {
    const seconds = Number.parseInt(normalized, 10);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }

  const parts = normalized.split(":");
  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }
  if (parts.some((part) => !/^\d{1,2}$/.test(part))) {
    return null;
  }

  const parsed = parts.map((part) => Number.parseInt(part, 10));
  const hours = parts.length === 3 ? parsed[0]! : 0;
  const minutes = parts.length === 3 ? parsed[1]! : parsed[0]!;
  const seconds = parts.length === 3 ? parsed[2]! : parsed[1]!;
  if (minutes > 59 || seconds > 59) {
    return null;
  }
  return hours * 3_600 + minutes * 60 + seconds;
}

export function parseTrainingDurationCell(
  value: string | number | Date | null,
) {
  if (value === null || value === "") {
    return null;
  }
  if (typeof value === "string") {
    return parseTrainingDuration(value);
  }
  if (typeof value === "number") {
    if (Number.isSafeInteger(value)) {
      return value;
    }
    if (Number.isFinite(value) && value > 0 && value < 1) {
      return Math.round(value * 86_400);
    }
    return null;
  }
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return (
    value.getUTCHours() * 3_600 +
    value.getUTCMinutes() * 60 +
    value.getUTCSeconds()
  );
}

export function isTrainingDurationWithinRange(
  value: string,
  minimum: number,
  maximum: number,
) {
  const seconds = parseTrainingDuration(value);
  return seconds !== null && seconds >= minimum && seconds <= maximum;
}
