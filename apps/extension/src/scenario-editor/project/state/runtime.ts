import { useCallback } from 'react';
import {
  getScenarioProjectRecord,
  listScenarioProjectSummaries,
} from '../../../composition/persistence/scenario/store/public';
import type {
  ScenarioProject,
  ScenarioProjectSummary,
} from '../../../features/scenario/contracts/types/project';
import { sortProjectSummaries, type ApplyLoadedProjectOptions } from './helpers';

export function resolveLoadedProjectPreferredStepId(
  initialStepIdRef: { current: string | null },
  currentSelectedStepId: string | null,
  options?: ApplyLoadedProjectOptions
) {
  return options?.preferredStepId ?? currentSelectedStepId ?? initialStepIdRef.current;
}

export function resolveLoadedProjectQuickEditStepId(
  currentQuickEditStepId: string | null,
  nextProject: ScenarioProject | null,
  options?: ApplyLoadedProjectOptions
) {
  if (!options?.preserveQuickEdit || !nextProject || !currentQuickEditStepId) {
    return null;
  }

  return nextProject.steps.some((step) => step.id === currentQuickEditStepId)
    ? currentQuickEditStepId
    : null;
}

export function useScenarioEditorInitialProjectLoader(args: {
  applyLoadedProject: (
    nextProjectId: string | null,
    nextProject: ScenarioProject | null,
    options?: ApplyLoadedProjectOptions
  ) => void;
  initialProjectIdRef: { current: string | null };
  initialStepIdRef: { current: string | null };
  setProjects: React.Dispatch<React.SetStateAction<ScenarioProjectSummary[]>>;
}) {
  const { applyLoadedProject, initialProjectIdRef, initialStepIdRef, setProjects } = args;

  return useCallback(async () => {
    const summaries = await listScenarioProjectSummaries();
    setProjects(sortProjectSummaries(summaries));

    const preferredProjectId = initialProjectIdRef.current ?? summaries[0]?.id ?? null;
    if (!preferredProjectId) {
      applyLoadedProject(null, null, { preferredStepId: null });
      return;
    }

    const loadedProject = await getScenarioProjectRecord(preferredProjectId);
    applyLoadedProject(preferredProjectId, loadedProject ?? null, {
      preferredStepId: initialStepIdRef.current,
    });
  }, [applyLoadedProject, initialProjectIdRef, initialStepIdRef, setProjects]);
}
