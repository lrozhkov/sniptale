import { useEffect, useRef, useState } from 'react';
import type { ScenarioProjectSnapshot } from '../../../composition/persistence/scenario/contracts';
import type { ScenarioNarrationText } from '../../../features/scenario/project/public';
import type { AISpeechModelParameters } from '../../../contracts/settings/model-operation';
import {
  cleanupScenarioNarrationPreview,
  generateScenarioNarration,
  prepareScenarioNarrationBatch,
  type ScenarioNarrationPreview,
} from '../../../workflows/scenario-narration/generation';

export interface ScenarioNarrationAccess {
  prepareNarration(
    targets: readonly ScenarioNarrationText[],
    signal: AbortSignal
  ): Promise<ScenarioProjectSnapshot>;
  applyNarration(preview: ScenarioNarrationPreview, signal: AbortSignal): Promise<boolean>;
}
export function scenarioNarrationTargetKey(target: { slideId: string; objectId: string }): string {
  return JSON.stringify([target.slideId, target.objectId]);
}
type Ready = { preview: ScenarioNarrationPreview; accepted: boolean };
type State = {
  ready: Ready[];
  errors: Record<string, string>;
  running: boolean;
  applying: boolean;
  completed: number;
  total: number;
  failed: boolean;
};

/** One form owns its sequential attempts and disposable previews through cancellation and explicit Apply. */
export function useScenarioNarrationAI(
  access: ScenarioNarrationAccess,
  targets: readonly ScenarioNarrationText[],
  prepareSelection?: (
    profile: AISpeechModelParameters & { modelId: string },
    providerId: string,
    signal: AbortSignal
  ) => Promise<void>
) {
  const [state, setState] = useState<State>({
    ready: [],
    errors: {},
    running: false,
    applying: false,
    completed: 0,
    total: 0,
    failed: false,
  });
  const owner = useRef({
    mounted: true,
    active: null as AbortController | null,
    ready: [] as Ready[],
    access,
    targets,
    prepareSelection,
  });
  owner.current.access = access;
  owner.current.targets = targets;
  owner.current.prepareSelection = prepareSelection;
  useEffect(() => {
    const lifetime = owner.current;
    lifetime.mounted = true;
    return () => {
      lifetime.mounted = false;
      lifetime.active?.abort();
      for (const entry of lifetime.ready)
        void cleanupScenarioNarrationPreview(entry.preview).catch(() => undefined);
    };
  }, []);
  const update = (patch: Partial<State>) => {
    if (owner.current.mounted) setState((current) => ({ ...current, ...patch }));
  };
  const readyKey = (entry: Ready) => scenarioNarrationTargetKey(entry.preview.scope.target);
  const generate = async (
    profile: AISpeechModelParameters & { modelId: string },
    approvedProviderId: string
  ) => {
    const lifetime = owner.current;
    if (lifetime.active || !lifetime.mounted) return;
    const ready = new Set(lifetime.ready.map(readyKey));
    const selected = structuredClone(
      lifetime.targets.filter((target) => !ready.has(scenarioNarrationTargetKey(target)))
    );
    if (!selected.length) return;
    const signature = JSON.stringify(lifetime.targets);
    const frozenProfile = structuredClone(profile);
    const controller = new AbortController();
    lifetime.active = controller;
    update({ running: true, failed: false, errors: {}, completed: 0, total: selected.length });
    try {
      await lifetime.prepareSelection?.(frozenProfile, approvedProviderId, controller.signal);
      controller.signal.throwIfAborted();
      if (!lifetime.mounted || JSON.stringify(lifetime.targets) !== signature)
        throw new Error('stale');
      const snapshot = await lifetime.access.prepareNarration(selected, controller.signal);
      controller.signal.throwIfAborted();
      if (!lifetime.mounted || JSON.stringify(lifetime.targets) !== signature)
        throw new Error('stale');
      const prepared = await prepareScenarioNarrationBatch(snapshot, selected, controller.signal);
      for (const [index, basis] of prepared.entries()) {
        try {
          controller.signal.throwIfAborted();
          const preview = await generateScenarioNarration(
            basis,
            frozenProfile,
            approvedProviderId,
            controller.signal
          );
          if (!lifetime.mounted || controller.signal.aborted) {
            await cleanupScenarioNarrationPreview(preview);
            break;
          }
          lifetime.ready = [...lifetime.ready, { preview, accepted: false }];
          update({ ready: lifetime.ready });
        } catch (error) {
          if (controller.signal.aborted) break;
          const key = scenarioNarrationTargetKey(basis.scope.target);
          if (lifetime.mounted)
            setState((current) => ({
              ...current,
              errors: {
                ...current.errors,
                [key]: error instanceof Error ? error.message : 'failed',
              },
            }));
        }
        update({ completed: index + 1 });
      }
    } catch {
      if (!controller.signal.aborted) update({ failed: true });
    } finally {
      if (lifetime.active === controller) lifetime.active = null;
      update({ running: false });
    }
  };
  const apply = async (selected: readonly ScenarioNarrationPreview[]) => {
    const lifetime = owner.current;
    if (lifetime.active || !lifetime.mounted) return;
    const controller = new AbortController();
    lifetime.active = controller;
    update({ applying: true, failed: false });
    try {
      for (const preview of selected) {
        if (controller.signal.aborted) break;
        const key = scenarioNarrationTargetKey(preview.scope.target);
        try {
          if (!(await lifetime.access.applyNarration(preview, controller.signal)))
            throw new Error('failed');
          lifetime.ready = lifetime.ready.map((entry) =>
            entry.preview === preview ? { ...entry, accepted: true } : entry
          );
          await cleanupScenarioNarrationPreview(preview).catch(() => undefined);
          if (lifetime.mounted)
            setState((current) => {
              const errors = { ...current.errors };
              delete errors[key];
              return { ...current, ready: lifetime.ready, errors };
            });
        } catch (error) {
          if (controller.signal.aborted) break;
          if (lifetime.mounted)
            setState((current) => ({
              ...current,
              errors: {
                ...current.errors,
                [key]: error instanceof Error ? error.message : 'failed',
              },
            }));
          break;
        }
      }
    } finally {
      if (lifetime.active === controller) lifetime.active = null;
      update({ applying: false });
    }
  };
  return {
    ...state,
    generate,
    apply,
    resetUnacceptedPreviews: () => {
      const lifetime = owner.current;
      if (lifetime.active || !lifetime.mounted) return false;
      const discarded = lifetime.ready.filter((entry) => !entry.accepted);
      lifetime.ready = lifetime.ready.filter((entry) => entry.accepted);
      update({ ready: lifetime.ready, errors: {}, failed: false, completed: 0, total: 0 });
      for (const entry of discarded)
        void cleanupScenarioNarrationPreview(entry.preview).catch(() => undefined);
      return true;
    },
    cancel: () => owner.current.active?.abort(),
    remaining: targets.filter(
      (target) =>
        !owner.current.ready.some((entry) => readyKey(entry) === scenarioNarrationTargetKey(target))
    ).length,
  };
}
