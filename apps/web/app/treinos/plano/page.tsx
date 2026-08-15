import { Suspense } from "react";

import {
  AppLoadingSkeleton,
  AppShell,
  FocusedBackAction,
} from "../../ui/app-shell";
import { TrainingPlanEditorRoute } from "../../ui/training-plan-editor-route";

function TrainingPlanFallback() {
  return (
    <AppShell active="workouts" variant="focused">
      <FocusedBackAction href="/treinos/planos/" />
      <AppLoadingSkeleton label="Carregando plano" />
    </AppShell>
  );
}

export default function TrainingPlanPage() {
  return (
    <Suspense fallback={<TrainingPlanFallback />}>
      <TrainingPlanEditorRoute />
    </Suspense>
  );
}
