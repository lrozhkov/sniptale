import { useEffect, useRef } from 'react';
import { saveScenarioProjectRecord } from '../../../composition/persistence/scenario/store/public';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import type { ScenarioEditorBrowserDriverPort } from '../../application/ports/browser-driver';

export function useScenarioEditorSelectionEffects(args: {
  browserDriver: Pick<ScenarioEditorBrowserDriverPort, 'replaceSelectionInUrl'>;
  project: ScenarioProject | null;
  projectId: string | null;
  selectedStepId: string | null;
  setSelectedStepId: (stepId: string | null) => void;
}) {
  const { browserDriver, project, projectId, selectedStepId, setSelectedStepId } = args;

  useEffect(() => {
    if (!project) {
      setSelectedStepId(null);
      return;
    }

    if (selectedStepId && !project.steps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(project.steps[0]?.id ?? null);
    }
  }, [project, selectedStepId, setSelectedStepId]);

  useEffect(() => {
    browserDriver.replaceSelectionInUrl({
      projectId,
      stepId: selectedStepId,
    });
  }, [browserDriver, projectId, selectedStepId]);
}

function applyScenarioAutosaveSuccess(args: {
  latestProjectRef: { current: ScenarioProject | null };
  projectSnapshot: ScenarioProject;
  persistedProject: ScenarioProject;
  savedProjectRef: { current: ScenarioProject | null };
  setError: (error: string | null) => void;
  setSaveState: (saveState: 'error' | 'saved' | 'saving') => void;
  syncProjectSummary: (project: ScenarioProject) => void;
}) {
  const currentProject = args.latestProjectRef.current;
  if (currentProject?.id === args.projectSnapshot.id) {
    args.savedProjectRef.current = args.persistedProject;
  }

  if (currentProject !== args.projectSnapshot) {
    return;
  }

  args.setError(null);
  args.setSaveState('saved');
  args.syncProjectSummary(args.persistedProject);
}

function applyScenarioAutosaveFailure(args: {
  latestProjectRef: { current: ScenarioProject | null };
  projectSnapshot: ScenarioProject;
  saveError: unknown;
  setError: (error: string | null) => void;
  setSaveState: (saveState: 'error' | 'saved' | 'saving') => void;
}) {
  if (args.latestProjectRef.current !== args.projectSnapshot) {
    return;
  }

  args.setError(
    args.saveError instanceof Error ? args.saveError.message : 'Failed to save scenario'
  );
  args.setSaveState('error');
}

type ScenarioEditorAutosaveArgs = {
  project: ScenarioProject | null;
  savedProjectRef: { current: ScenarioProject | null };
  setError: (error: string | null) => void;
  setSaveState: (saveState: 'error' | 'saved' | 'saving') => void;
  syncProjectSummary: (project: ScenarioProject) => void;
};

type ScenarioEditorAutosaveQueue = {
  inFlightSaveRef: { current: Promise<void> | null };
  queuedProjectRef: { current: ScenarioProject | null };
};

function flushQueuedScenarioAutosave(
  args: ScenarioEditorAutosaveArgs & {
    latestProjectRef: { current: ScenarioProject | null };
    queue: ScenarioEditorAutosaveQueue;
  }
) {
  const queuedProject = args.queue.queuedProjectRef.current;
  args.queue.queuedProjectRef.current = null;
  if (!queuedProject || args.savedProjectRef.current === queuedProject) {
    return;
  }

  startScenarioAutosave({
    ...args,
    projectSnapshot: queuedProject,
  });
}

function startScenarioAutosave(
  args: ScenarioEditorAutosaveArgs & {
    latestProjectRef: { current: ScenarioProject | null };
    projectSnapshot: ScenarioProject;
    queue: ScenarioEditorAutosaveQueue;
  }
) {
  const savePromise = saveScenarioProjectRecord(args.projectSnapshot, {
    baseUpdatedAt: args.savedProjectRef.current?.updatedAt ?? null,
  })
    .then((persistedProject) =>
      applyScenarioAutosaveSuccess({
        latestProjectRef: args.latestProjectRef,
        persistedProject,
        projectSnapshot: args.projectSnapshot,
        savedProjectRef: args.savedProjectRef,
        setError: args.setError,
        setSaveState: args.setSaveState,
        syncProjectSummary: args.syncProjectSummary,
      })
    )
    .catch((saveError) =>
      applyScenarioAutosaveFailure({
        latestProjectRef: args.latestProjectRef,
        projectSnapshot: args.projectSnapshot,
        saveError,
        setError: args.setError,
        setSaveState: args.setSaveState,
      })
    )
    .finally(() => {
      if (args.queue.inFlightSaveRef.current !== savePromise) {
        return;
      }

      args.queue.inFlightSaveRef.current = null;
      flushQueuedScenarioAutosave(args);
    });

  args.queue.inFlightSaveRef.current = savePromise;
}

function enqueueScenarioAutosave(
  args: ScenarioEditorAutosaveArgs & {
    latestProjectRef: { current: ScenarioProject | null };
    projectSnapshot: ScenarioProject;
    queue: ScenarioEditorAutosaveQueue;
  }
) {
  if (args.queue.inFlightSaveRef.current) {
    args.queue.queuedProjectRef.current = args.projectSnapshot;
    return;
  }

  startScenarioAutosave(args);
}

function scheduleScenarioAutosave(
  args: ScenarioEditorAutosaveArgs & {
    latestProjectRef: { current: ScenarioProject | null };
    projectSnapshot: ScenarioProject;
    queue: ScenarioEditorAutosaveQueue;
  }
) {
  return window.setTimeout(() => {
    enqueueScenarioAutosave(args);
  }, 650);
}

function useScenarioEditorAutosaveEffect(
  args: ScenarioEditorAutosaveArgs & {
    latestProjectRef: { current: ScenarioProject | null };
    queue: ScenarioEditorAutosaveQueue;
  }
) {
  const {
    latestProjectRef,
    project,
    queue,
    savedProjectRef,
    setError,
    setSaveState,
    syncProjectSummary,
  } = args;
  useEffect(() => {
    if (!project) {
      return;
    }

    if (savedProjectRef.current === project) {
      setSaveState('saved');
      return;
    }

    setSaveState('saving');
    const saveTimer = scheduleScenarioAutosave({
      latestProjectRef,
      project,
      projectSnapshot: project,
      queue,
      savedProjectRef,
      setError,
      setSaveState,
      syncProjectSummary,
    });

    return () => {
      window.clearTimeout(saveTimer);
    };
  }, [
    latestProjectRef,
    project,
    queue,
    savedProjectRef,
    setError,
    setSaveState,
    syncProjectSummary,
  ]);
}

export function useScenarioEditorAutosave(args: ScenarioEditorAutosaveArgs) {
  const latestProjectRef = useRef(args.project);
  const inFlightSaveRef = useRef<Promise<void> | null>(null);
  const queueRef = useRef<ScenarioEditorAutosaveQueue | null>(null);
  const queuedProjectRef = useRef<ScenarioProject | null>(null);
  if (!queueRef.current) {
    queueRef.current = {
      inFlightSaveRef,
      queuedProjectRef,
    };
  }

  useEffect(() => {
    latestProjectRef.current = args.project;
  }, [args.project]);

  useScenarioEditorAutosaveEffect({
    ...args,
    latestProjectRef,
    queue: queueRef.current,
  });
}
