export const trainingWeekdayNames = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
] as const;

export function trainingWeekdayName(weekday: number) {
  return trainingWeekdayNames[weekday - 1] ?? "Dia sem agenda";
}

export function currentTrainingWeekday(date = new Date()) {
  return date.getDay() === 0 ? 7 : date.getDay();
}

export function trainingSessionHref(sessionId: string) {
  return `/treinos/sessao/?sessao=${encodeURIComponent(sessionId)}`;
}
