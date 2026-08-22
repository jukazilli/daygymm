"use client";

import { useSearchParams } from "next/navigation";

import { TrainingPlanEditorScreen } from "./training-plan-editor-screen";

export function TrainingPlanEditorRoute() {
  const searchParams = useSearchParams();
  return (
    <TrainingPlanEditorScreen
      createNew={searchParams.get("novo") === "1"}
      planId={searchParams.get("plano") ?? undefined}
    />
  );
}
