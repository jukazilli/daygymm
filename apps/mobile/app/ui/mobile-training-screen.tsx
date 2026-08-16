import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { dayGymTokens } from "@daygym/design-tokens";
import type {
  LocalFirstTrainingSessionGateway,
  PracticalTrainingExercise,
  PracticalTrainingState,
  SetRevisionInput,
  TrainingSessionFailure,
  TrainingSessionSyncState,
} from "@daygym/contracts";

import { getMobileTrainingSessionGateway } from "../../lib/training/mobile-training-session-gateway";
import {
  completionInput,
  draftForExercise,
  elapsedTrainingSeconds,
  formattedDuration,
  pendingExerciseIndex,
  syncStatusLabel,
  type TrainingMeasureDraft,
} from "../../lib/training/mobile-training-view-model";

const { color, radius, space, typography } = dayGymTokens;

const initialSyncState: TrainingSessionSyncState = {
  lastSyncedAt: null,
  pendingCount: 0,
  status: "synced",
};

const failureCopy: Record<TrainingSessionFailure, string> = {
  configuration: "Não foi possível abrir seus treinos agora.",
  conflict: "Há uma alteração que precisa da sua escolha.",
  invalid: "Este registro não pode mais ser alterado.",
  session: "Entre novamente para continuar.",
  unexpected: "Não foi possível concluir agora. Tente novamente.",
};

function useTrainingJourney(
  providedGateway?: LocalFirstTrainingSessionGateway,
) {
  const gatewayRef = useRef(providedGateway);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [sessionExpired, setSessionExpired] = useState(false);
  const [state, setState] = useState<PracticalTrainingState>();
  const [syncState, setSyncState] =
    useState<TrainingSessionSyncState>(initialSyncState);

  const gateway = useCallback(() => {
    gatewayRef.current ??= getMobileTrainingSessionGateway();
    return gatewayRef.current;
  }, []);

  const load = useCallback(
    async (preferredSessionId?: string) => {
      setError(undefined);
      try {
        const result = await gateway().load(preferredSessionId);
        if (!result.ok) {
          if (result.reason === "session") setSessionExpired(true);
          setError(failureCopy[result.reason]);
          return null;
        }
        setState(result.value);
        return result.value;
      } catch {
        setError(failureCopy.configuration);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [gateway],
  );

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = gateway().subscribeSyncState(setSyncState);
      void load();
    } catch {
      setError(failureCopy.configuration);
      setBusy(false);
    }

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") void load();
      },
    );

    return () => {
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [gateway, load]);

  return {
    busy,
    error,
    gateway,
    load,
    sessionExpired,
    setBusy,
    setError,
    setState,
    state,
    syncState,
  };
}

function SyncStatus({
  onPress,
  state,
}: Readonly<{
  onPress: () => void;
  state: TrainingSessionSyncState;
}>) {
  const actionable = state.status === "pending" || state.status === "conflict";
  return (
    <Pressable
      accessibilityRole={actionable ? "button" : "text"}
      disabled={!actionable}
      onPress={onPress}
      style={styles.syncStatus}
    >
      <View
        style={[
          styles.syncDot,
          state.status === "conflict"
            ? styles.syncDanger
            : state.status === "offline" || state.status === "pending"
              ? styles.syncWarning
              : styles.syncSuccess,
        ]}
      />
      <Text style={styles.syncLabel}>{syncStatusLabel[state.status]}</Text>
      {state.pendingCount > 0 ? (
        <Text style={styles.syncCount}>{state.pendingCount}</Text>
      ) : null}
    </Pressable>
  );
}

function ErrorBanner({ message }: Readonly<{ message: string }>) {
  return (
    <View accessibilityLiveRegion="assertive" style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function EmptyTraining() {
  return (
    <View style={styles.emptyCard}>
      <Text accessibilityRole="header" style={styles.cardTitle}>
        Nenhum treino disponível.
      </Text>
      <Text style={styles.support}>Crie ou importe um plano para começar.</Text>
    </View>
  );
}

export function MobileTrainingHubScreen({
  gateway: providedGateway,
}: Readonly<{ gateway?: LocalFirstTrainingSessionGateway }>) {
  const router = useRouter();
  const journey = useTrainingJourney(providedGateway);

  useEffect(() => {
    if (journey.sessionExpired) router.replace("/entrar");
  }, [journey.sessionExpired, router]);

  async function startTraining(sessionId: string) {
    if (journey.busy) return;
    journey.setBusy(true);
    journey.setError(undefined);
    const result = await journey.gateway().start(sessionId);
    journey.setBusy(false);
    if (!result.ok) {
      if (result.reason === "session") router.replace("/entrar");
      journey.setError(failureCopy[result.reason]);
      return;
    }
    journey.setState((current) =>
      current
        ? {
            ...current,
            activeRun: result.value,
            nextSession: result.value.session,
          }
        : current,
    );
    router.push("/treinos/sessao");
  }

  async function synchronize() {
    await journey.gateway().synchronize();
    await journey.load();
  }

  if (journey.busy && !journey.state) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={color.light.action} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>DayGym</Text>
            <Text accessibilityRole="header" style={styles.pageTitle}>
              Seus treinos
            </Text>
          </View>
          <SyncStatus
            onPress={() => void synchronize()}
            state={journey.syncState}
          />
        </View>

        {journey.error ? <ErrorBanner message={journey.error} /> : null}

        {journey.state?.activeRun ? (
          <View style={styles.highlightCard}>
            <Text style={styles.eyebrow}>Em andamento</Text>
            <Text style={styles.cardTitle}>
              {journey.state.activeRun.session.name}
            </Text>
            <Text style={styles.support}>
              {
                journey.state.activeRun.session.items.filter(
                  (item) => item.completedAt,
                ).length
              }
              {" de "}
              {journey.state.activeRun.session.items.length} exercícios
            </Text>
            <PrimaryButton
              disabled={journey.busy}
              label="Continuar treino"
              onPress={() => router.push("/treinos/sessao")}
            />
          </View>
        ) : journey.state?.sessions.length ? (
          <View style={styles.list}>
            {journey.state.sessions.map((session) => (
              <View key={session.sessionId} style={styles.sessionCard}>
                <View style={styles.sessionCopy}>
                  <Text style={styles.cardTitle}>{session.name}</Text>
                  <Text style={styles.support}>
                    {session.items.length} exercícios
                  </Text>
                </View>
                <PrimaryButton
                  disabled={journey.busy}
                  label="Iniciar"
                  onPress={() => void startTraining(session.sessionId)}
                />
              </View>
            ))}
          </View>
        ) : (
          <EmptyTraining />
        )}

        <SecondaryButton
          label="Minha conta"
          onPress={() => router.push("/conta")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function MeasureField({
  keyboardType = "number-pad",
  label,
  onChangeText,
  suffix,
  value,
}: Readonly<{
  keyboardType?: "decimal-pad" | "number-pad";
  label: string;
  onChangeText: (value: string) => void;
  suffix: string;
  value: string;
}>) {
  return (
    <View style={styles.measureField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={label}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          style={styles.input}
          value={value}
        />
        <Text style={styles.inputSuffix}>{suffix}</Text>
      </View>
    </View>
  );
}

function exerciseDraftFromSet(
  exercise: PracticalTrainingExercise,
): TrainingMeasureDraft {
  const set = exercise.setExecutions.at(-1);
  return {
    distanceMeters: String(set?.actualDistanceMeters ?? ""),
    durationSeconds: String(set?.actualDurationSeconds ?? ""),
    reps: String(set?.actualReps ?? ""),
    weightKg: String(set?.actualWeightKg ?? ""),
  };
}

export function MobileActiveTrainingScreen({
  gateway: providedGateway,
}: Readonly<{ gateway?: LocalFirstTrainingSessionGateway }>) {
  const router = useRouter();
  const journey = useTrainingJourney(providedGateway);
  const [draft, setDraft] = useState<TrainingMeasureDraft>({
    distanceMeters: "",
    durationSeconds: "",
    reps: "",
    weightKg: "",
  });
  const [correcting, setCorrecting] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [clock, setClock] = useState(() => new Date());

  const run = journey.state?.activeRun;
  const exercise = run?.session.items[selectedIndex];

  useEffect(() => {
    if (journey.sessionExpired) router.replace("/entrar");
  }, [journey.sessionExpired, router]);

  useEffect(() => {
    if (journey.state && !journey.state.activeRun && !journey.busy) {
      router.replace("/treinos");
    }
  }, [journey.busy, journey.state, router]);

  useEffect(() => {
    if (!run) return;
    const nextIndex = pendingExerciseIndex(run.session.items);
    if (!run.session.items[selectedIndex]) {
      setSelectedIndex(nextIndex);
    }
  }, [run, selectedIndex]);

  useEffect(() => {
    if (!exercise) return;
    setCorrecting(false);
    setDraft(draftForExercise(exercise));
  }, [exercise?.itemId, exercise?.setExecutions.length]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    const next = await journey.load();
    if (next?.activeRun) {
      setSelectedIndex(pendingExerciseIndex(next.activeRun.session.items));
    }
    return next;
  }, [journey.load]);

  async function startExercise() {
    if (!run || !exercise || journey.busy) return;
    journey.setBusy(true);
    journey.setError(undefined);
    const result = await journey
      .gateway()
      .startExercise(run.runId, exercise.itemId);
    journey.setBusy(false);
    if (!result.ok) {
      journey.setError(failureCopy[result.reason]);
      return;
    }
    await refresh();
  }

  async function completeSet() {
    if (!run || !exercise || journey.busy) return;
    const input = completionInput(run.runId, exercise, draft);
    if (!input) {
      journey.setError("Preencha as medidas desta série.");
      return;
    }
    journey.setBusy(true);
    journey.setError(undefined);
    const result = await journey.gateway().completeSet(input);
    journey.setBusy(false);
    if (!result.ok) {
      journey.setError(failureCopy[result.reason]);
      return;
    }
    await refresh();
  }

  async function reviseLatest(action: "correct" | "undo") {
    if (!run || !exercise || journey.busy) return;
    const set = exercise.setExecutions.at(-1);
    if (!set) return;
    const identity = {
      expectedRevision: set.revision,
      itemId: exercise.itemId,
      runId: run.runId,
      setExecutionId: set.setExecutionId,
      setNumber: set.setNumber,
    };
    let input: SetRevisionInput;
    if (action === "undo") {
      input = { ...identity, action };
    } else {
      const values = completionInput(
        run.runId,
        {
          ...exercise,
          setExecutions: exercise.setExecutions.slice(0, -1),
        },
        draft,
      );
      if (!values) {
        journey.setError("Preencha as medidas desta série.");
        return;
      }
      input = {
        ...identity,
        action,
        actualDistanceMeters: values.actualDistanceMeters,
        actualDurationSeconds: values.actualDurationSeconds,
        actualReps: values.actualReps,
        actualWeightKg: values.actualWeightKg,
      };
    }
    journey.setBusy(true);
    journey.setError(undefined);
    const result = await journey.gateway().reviseSet(input);
    journey.setBusy(false);
    if (!result.ok) {
      journey.setError(failureCopy[result.reason]);
      return;
    }
    setCorrecting(false);
    await refresh();
  }

  async function togglePause() {
    if (!run || journey.busy) return;
    journey.setBusy(true);
    const result = run.pausedAt
      ? await journey.gateway().resume(run.runId)
      : await journey.gateway().pause(run.runId);
    journey.setBusy(false);
    if (!result.ok) {
      journey.setError(failureCopy[result.reason]);
      return;
    }
    await refresh();
  }

  async function finishTraining() {
    if (!run || journey.busy) return;
    journey.setBusy(true);
    const result = await journey.gateway().finish(run.runId);
    journey.setBusy(false);
    if (!result.ok) {
      journey.setError(failureCopy[result.reason]);
      return;
    }
    Alert.alert(
      "Treino concluído",
      `Duração: ${formattedDuration(result.value.durationSeconds)}`,
    );
    router.replace("/treinos");
  }

  function cancelTraining() {
    if (!run || journey.busy) return;
    Alert.alert(
      "Cancelar treino?",
      "Os registros desta execução serão descartados.",
      [
        { text: "Continuar treino", style: "cancel" },
        {
          text: "Cancelar treino",
          style: "destructive",
          onPress: () => {
            journey.setBusy(true);
            void journey
              .gateway()
              .cancel(run.runId)
              .then(async (result) => {
                journey.setBusy(false);
                if (!result.ok) {
                  journey.setError(failureCopy[result.reason]);
                  return;
                }
                await refresh();
                router.replace("/treinos");
              });
          },
        },
      ],
    );
  }

  async function synchronize() {
    if (journey.syncState.status === "conflict") return;
    await journey.gateway().synchronize();
    await refresh();
  }

  async function resolveConflict(resolution: "retry" | "use-server") {
    journey.setBusy(true);
    const result = await journey.gateway().resolveConflict(resolution);
    journey.setBusy(false);
    if (!result.ok) {
      journey.setError(failureCopy[result.reason]);
      return;
    }
    journey.setState(result.value);
  }

  function useOnlineVersion() {
    Alert.alert(
      "Usar versão online?",
      "As alterações que ainda não foram enviadas serão descartadas.",
      [
        { text: "Voltar", style: "cancel" },
        {
          text: "Usar versão online",
          style: "destructive",
          onPress: () => void resolveConflict("use-server"),
        },
      ],
    );
  }

  if (!run || !exercise) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={color.light.action} size="large" />
      </SafeAreaView>
    );
  }

  const completedAll = run.session.items.every((item) => item.completedAt);
  const elapsed = elapsedTrainingSeconds(
    run.startedAt,
    run.pausedAt,
    run.pausedDurationSeconds,
    clock,
  );
  const latestSet = exercise.setExecutions.at(-1);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <View style={styles.trainingHeader}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/treinos")}
          >
            <Text style={styles.backLabel}>‹ Treinos</Text>
          </Pressable>
          <Text style={styles.clock}>{formattedDuration(elapsed)}</Text>
          <SyncStatus
            onPress={() => void synchronize()}
            state={journey.syncState}
          />
        </View>

        {journey.error ? <ErrorBanner message={journey.error} /> : null}

        {journey.syncState.status === "conflict" ? (
          <View style={styles.conflictCard}>
            <Text style={styles.cardTitle}>Escolha como continuar</Text>
            <PrimaryButton
              disabled={journey.busy}
              label="Tentar novamente"
              onPress={() => void resolveConflict("retry")}
            />
            <SecondaryButton
              label="Usar versão online"
              onPress={useOnlineVersion}
            />
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.exerciseTabs}>
            {run.session.items.map((item, index) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: index === selectedIndex }}
                key={item.itemId}
                onPress={() => setSelectedIndex(index)}
                style={[
                  styles.exerciseTab,
                  index === selectedIndex
                    ? styles.exerciseTabSelected
                    : undefined,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.exerciseTabLabel,
                    index === selectedIndex
                      ? styles.exerciseTabLabelSelected
                      : undefined,
                  ]}
                >
                  {index + 1}. {item.exerciseName}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View style={styles.exerciseCard}>
          <View style={styles.exerciseHeading}>
            <View style={styles.sessionCopy}>
              <Text style={styles.eyebrow}>
                Exercício {selectedIndex + 1} de {run.session.items.length}
              </Text>
              <Text accessibilityRole="header" style={styles.exerciseTitle}>
                {exercise.exerciseName}
              </Text>
            </View>
            <Text style={styles.setBadge}>
              {Math.min(exercise.setExecutions.length + 1, exercise.sets)}/
              {exercise.sets}
            </Text>
          </View>

          {run.pausedAt ? (
            <View style={styles.pausedCard}>
              <Text style={styles.cardTitle}>Treino pausado</Text>
              <PrimaryButton
                disabled={journey.busy}
                label="Retomar treino"
                onPress={() => void togglePause()}
              />
            </View>
          ) : exercise.completedAt && !correcting ? (
            <View style={styles.completedCard}>
              <Text style={styles.completedLabel}>Exercício concluído</Text>
              {latestSet ? (
                <SecondaryButton
                  label="Ajustar última série"
                  onPress={() => {
                    setDraft(exerciseDraftFromSet(exercise));
                    setCorrecting(true);
                  }}
                />
              ) : null}
            </View>
          ) : !exercise.startedAt ? (
            <PrimaryButton
              disabled={journey.busy}
              label="Iniciar exercício"
              onPress={() => void startExercise()}
            />
          ) : (
            <View style={styles.form}>
              {exercise.repsMax !== null ? (
                <MeasureField
                  label="Repetições"
                  onChangeText={(reps) =>
                    setDraft((value) => ({ ...value, reps }))
                  }
                  suffix="reps"
                  value={draft.reps}
                />
              ) : null}
              {exercise.plannedWeightKg !== null || draft.weightKg ? (
                <MeasureField
                  keyboardType="decimal-pad"
                  label="Carga"
                  onChangeText={(weightKg) =>
                    setDraft((value) => ({ ...value, weightKg }))
                  }
                  suffix="kg"
                  value={draft.weightKg}
                />
              ) : null}
              {exercise.durationSeconds !== null ? (
                <MeasureField
                  label="Duração"
                  onChangeText={(durationSeconds) =>
                    setDraft((value) => ({ ...value, durationSeconds }))
                  }
                  suffix="s"
                  value={draft.durationSeconds}
                />
              ) : null}
              {exercise.distanceMeters !== null ? (
                <MeasureField
                  label="Distância"
                  onChangeText={(distanceMeters) =>
                    setDraft((value) => ({ ...value, distanceMeters }))
                  }
                  suffix="m"
                  value={draft.distanceMeters}
                />
              ) : null}
              <PrimaryButton
                disabled={journey.busy}
                label={correcting ? "Salvar correção" : "Concluir série"}
                onPress={() =>
                  void (correcting ? reviseLatest("correct") : completeSet())
                }
              />
              {correcting ? (
                <View style={styles.list}>
                  <SecondaryButton
                    label="Voltar"
                    onPress={() => {
                      setCorrecting(false);
                      setDraft(draftForExercise(exercise));
                    }}
                  />
                  <DangerButton
                    label="Desfazer última série"
                    onPress={() => void reviseLatest("undo")}
                  />
                </View>
              ) : latestSet ? (
                <SecondaryButton
                  label="Ajustar última série"
                  onPress={() => {
                    setDraft(exerciseDraftFromSet(exercise));
                    setCorrecting(true);
                  }}
                />
              ) : null}
            </View>
          )}
        </View>

        {completedAll ? (
          <PrimaryButton
            disabled={journey.busy || Boolean(run.pausedAt)}
            label="Concluir treino"
            onPress={() => void finishTraining()}
          />
        ) : !run.pausedAt ? (
          <SecondaryButton
            label="Pausar treino"
            onPress={() => void togglePause()}
          />
        ) : null}
        <DangerButton label="Cancelar treino" onPress={cancelTraining} />
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  disabled,
  label,
  onPress,
}: Readonly<{ disabled?: boolean; label: string; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed ? styles.primaryPressed : undefined,
        disabled ? styles.disabled : undefined,
      ]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: Readonly<{ label: string; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed ? styles.secondaryPressed : undefined,
      ]}
    >
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

function DangerButton({
  label,
  onPress,
}: Readonly<{ label: string; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.dangerButton}
    >
      <Text style={styles.dangerLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.light.canvas },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.light.canvas,
  },
  pageContent: { gap: space[5], padding: space[4], paddingBottom: space[12] },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space[3],
  },
  trainingHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[2],
  },
  pageTitle: {
    color: color.light.textPrimary,
    fontFamily: typography.familyBold,
    fontSize: 32,
    letterSpacing: -0.8,
  },
  eyebrow: {
    color: color.light.textSecondary,
    fontFamily: typography.familySemiBold,
    fontSize: typography.label,
  },
  clock: {
    color: color.light.textPrimary,
    fontFamily: typography.familyBold,
    fontSize: typography.heading,
  },
  backLabel: {
    color: color.light.action,
    fontFamily: typography.familyBold,
    fontSize: typography.label,
  },
  syncStatus: { flexDirection: "row", alignItems: "center", gap: space[1] },
  syncDot: { width: 10, height: 10, borderRadius: radius.pill },
  syncSuccess: { backgroundColor: color.light.success },
  syncWarning: { backgroundColor: color.light.warning },
  syncDanger: { backgroundColor: color.light.danger },
  syncLabel: {
    color: color.light.textSecondary,
    fontFamily: typography.familySemiBold,
    fontSize: 12,
  },
  syncCount: {
    minWidth: 20,
    borderRadius: radius.pill,
    backgroundColor: color.light.actionSoft,
    color: color.light.action,
    fontFamily: typography.familyBold,
    fontSize: 12,
    textAlign: "center",
  },
  highlightCard: {
    gap: space[3],
    borderRadius: radius.card,
    backgroundColor: color.light.actionSoft,
    padding: space[5],
  },
  sessionCard: {
    gap: space[4],
    borderColor: color.light.border,
    borderRadius: radius.card,
    borderWidth: 1,
    backgroundColor: color.light.card,
    padding: space[5],
  },
  sessionCopy: { flex: 1, gap: space[1] },
  list: { gap: space[3] },
  cardTitle: {
    color: color.light.textPrimary,
    fontFamily: typography.familyBold,
    fontSize: typography.heading,
  },
  support: {
    color: color.light.textSecondary,
    fontFamily: typography.family,
    fontSize: typography.body,
    lineHeight: 23,
  },
  emptyCard: {
    gap: space[2],
    borderColor: color.light.border,
    borderRadius: radius.card,
    borderWidth: 1,
    backgroundColor: color.light.card,
    padding: space[5],
  },
  errorBanner: {
    borderLeftColor: color.light.danger,
    borderLeftWidth: 4,
    borderRadius: radius.control,
    backgroundColor: color.light.card,
    padding: space[4],
  },
  errorText: {
    color: color.light.danger,
    fontFamily: typography.familySemiBold,
    fontSize: typography.label,
  },
  conflictCard: {
    gap: space[3],
    borderColor: color.light.danger,
    borderRadius: radius.card,
    borderWidth: 1,
    backgroundColor: color.light.card,
    padding: space[4],
  },
  exerciseTabs: { flexDirection: "row", gap: space[2] },
  exerciseTab: {
    maxWidth: 220,
    borderColor: color.light.border,
    borderRadius: radius.control,
    borderWidth: 1,
    backgroundColor: color.light.card,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  exerciseTabSelected: {
    borderColor: color.light.action,
    backgroundColor: color.light.actionSoft,
  },
  exerciseTabLabel: {
    color: color.light.textSecondary,
    fontFamily: typography.familySemiBold,
    fontSize: typography.label,
  },
  exerciseTabLabelSelected: { color: color.light.action },
  exerciseCard: {
    gap: space[5],
    borderColor: color.light.border,
    borderRadius: radius.card,
    borderWidth: 1,
    backgroundColor: color.light.card,
    padding: space[5],
  },
  exerciseHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space[3],
  },
  exerciseTitle: {
    color: color.light.textPrimary,
    fontFamily: typography.familyBold,
    fontSize: 30,
    letterSpacing: -0.8,
    lineHeight: 35,
  },
  setBadge: {
    borderRadius: radius.pill,
    backgroundColor: color.light.actionSoft,
    color: color.light.action,
    fontFamily: typography.familyBold,
    fontSize: typography.label,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  form: { gap: space[4] },
  measureField: { gap: space[2] },
  fieldLabel: {
    color: color.light.textSecondary,
    fontFamily: typography.familySemiBold,
    fontSize: typography.label,
  },
  inputRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  input: {
    minHeight: 56,
    flex: 1,
    borderColor: color.light.border,
    borderRadius: radius.control,
    borderWidth: 1,
    backgroundColor: color.light.card,
    color: color.light.textPrimary,
    fontFamily: typography.familyBold,
    fontSize: 24,
    paddingHorizontal: space[4],
  },
  inputSuffix: {
    minWidth: 42,
    color: color.light.textSecondary,
    fontFamily: typography.familySemiBold,
    fontSize: typography.label,
  },
  pausedCard: { gap: space[4] },
  completedCard: { gap: space[4] },
  completedLabel: {
    color: color.light.success,
    fontFamily: typography.familyBold,
    fontSize: typography.body,
  },
  primaryButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    backgroundColor: color.light.action,
    paddingHorizontal: space[5],
  },
  primaryPressed: { backgroundColor: color.light.actionPressed },
  primaryLabel: {
    color: color.light.actionContrast,
    fontFamily: typography.familyBold,
    fontSize: typography.body,
  },
  secondaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderColor: color.light.border,
    borderRadius: radius.control,
    borderWidth: 1,
    backgroundColor: color.light.card,
    paddingHorizontal: space[4],
  },
  secondaryPressed: { backgroundColor: color.light.actionSoft },
  secondaryLabel: {
    color: color.light.action,
    fontFamily: typography.familyBold,
    fontSize: typography.label,
  },
  dangerButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[4],
  },
  dangerLabel: {
    color: color.light.danger,
    fontFamily: typography.familyBold,
    fontSize: typography.label,
  },
  disabled: { opacity: 0.55 },
});
