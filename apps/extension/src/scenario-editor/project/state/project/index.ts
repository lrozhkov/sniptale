import { useCallback, useEffect } from 'react';

import { getScenarioProjectRecord } from '../../../../composition/persistence/scenario/store/public';
import type {
  ScenarioProject,
  ScenarioProjectSummary,
} from '../../../../features/scenario/contracts/types/project';
import {
  resolveSelectedStepId,
  sortProjectSummaries,
  toProjectSummary,
  type ApplyLoadedProjectOptions,
} from '../helpers';
import {
  resolveLoadedProjectPreferredStepId,
  resolveLoadedProjectQuickEditStepId,
  useScenarioEditorInitialProjectLoader,
} from '../runtime';

interface ScenarioEditorBootstrapOptions {
  applyLoadedProject: (
    nextProjectId: string | null,
    nextProject: ScenarioProject | null,
    options?: ApplyLoadedProjectOptions
  ) => void;
  initialProjectIdRef: { current: string | null };
  initialStepIdRef: { current: string | null };
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setProjects: React.Dispatch<React.SetStateAction<ScenarioProjectSummary[]>>;
}

export function useScenarioEditorProjectSummarySync(
  setProjects: React.Dispatch<React.SetStateAction<ScenarioProjectSummary[]>>
) {
  return useCallback(
    (nextProject: ScenarioProject) => {
      setProjects((currentProjects) => {
        const nextSummary = toProjectSummary(nextProject);
        const withoutCurrent = currentProjects.filter((item) => item.id !== nextSummary.id);
        return sortProjectSummaries([nextSummary, ...withoutCurrent]);
      });
    },
    [setProjects]
  );
}

export function useScenarioEditorProjectUpdater(
  setProject: React.Dispatch<React.SetStateAction<ScenarioProject | null>>
) {
  return useCallback(
    (updater: (current: ScenarioProject) => ScenarioProject) => {
      setProject((currentProject) => (currentProject ? updater(currentProject) : currentProject));
    },
    [setProject]
  );
}

export function useScenarioEditorLoadedProjectApplier(args: {
  initialStepIdRef: { current: string | null };
  savedProjectRef: { current: ScenarioProject | null };
  setProject: React.Dispatch<React.SetStateAction<ScenarioProject | null>>;
  setProjectId: (projectId: string | null) => void;
  setQuickEditStepId: React.Dispatch<React.SetStateAction<string | null>>;
  setSaveState: React.Dispatch<React.SetStateAction<'error' | 'saved' | 'saving'>>;
  setSelectedStepId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const {
    initialStepIdRef,
    savedProjectRef,
    setProject,
    setProjectId,
    setQuickEditStepId,
    setSaveState,
    setSelectedStepId,
  } = args;

  return useCallback(
    (
      nextProjectId: string | null,
      nextProject: ScenarioProject | null,
      options?: ApplyLoadedProjectOptions
    ) => {
      setProjectId(nextProjectId);
      setProject(nextProject);
      setSaveState('saved');
      setSelectedStepId((currentSelectedStepId) =>
        resolveSelectedStepId(
          nextProject,
          resolveLoadedProjectPreferredStepId(initialStepIdRef, currentSelectedStepId, options)
        )
      );
      setQuickEditStepId((currentQuickEditStepId) =>
        resolveLoadedProjectQuickEditStepId(currentQuickEditStepId, nextProject, options)
      );
      savedProjectRef.current = nextProject;
    },
    [
      initialStepIdRef,
      savedProjectRef,
      setProject,
      setProjectId,
      setQuickEditStepId,
      setSaveState,
      setSelectedStepId,
    ]
  );
}

export function useScenarioEditorProjectLoader(
  applyLoadedProject: (
    nextProjectId: string | null,
    nextProject: ScenarioProject | null,
    options?: ApplyLoadedProjectOptions
  ) => void
) {
  return useCallback(
    async (nextProjectId: string | null, preferredStepId?: string | null) => {
      if (!nextProjectId) {
        applyLoadedProject(null, null, { preferredStepId: null });
        return;
      }

      const loadedProject = await getScenarioProjectRecord(nextProjectId);
      applyLoadedProject(nextProjectId, loadedProject ?? null, {
        preferredStepId: preferredStepId ?? null,
        preserveQuickEdit: true,
      });
    },
    [applyLoadedProject]
  );
}

async function runScenarioEditorBootstrap(args: {
  loadInitialProject: () => Promise<void>;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}) {
  try {
    args.setLoading(true);
    args.setError(null);
    await args.loadInitialProject();
    args.setLoading(false);
  } catch (loadError) {
    args.setError(loadError instanceof Error ? loadError.message : 'Failed to load scenarios');
    args.setLoading(false);
  }
}

export function useScenarioEditorBootstrap(args: ScenarioEditorBootstrapOptions) {
  const {
    applyLoadedProject,
    initialProjectIdRef,
    initialStepIdRef,
    setError,
    setLoading,
    setProjects,
  } = args;
  const loadInitialProject = useScenarioEditorInitialProjectLoader({
    applyLoadedProject,
    initialProjectIdRef,
    initialStepIdRef,
    setProjects,
  });

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      await runScenarioEditorBootstrap({
        loadInitialProject,
        setError: (error) => {
          if (!cancelled) {
            setError(error);
          }
        },
        setLoading: (loading) => {
          if (!cancelled) {
            setLoading(loading);
          }
        },
      });
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadInitialProject, setError, setLoading]);
}
