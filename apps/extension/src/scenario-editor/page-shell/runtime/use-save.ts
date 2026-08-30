import { useCallback, useRef, type MutableRefObject } from 'react';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { getScenarioV3RuntimeErrorMessage, saveScenarioV3EditorProject } from './save';
import type { ScenarioV3PageSaveState, ScenarioV3SaveOutcome } from './types';

interface ScenarioV3SaveController {
  saveProject: (project: ScenarioProjectV3) => Promise<ScenarioV3SaveOutcome>;
}

interface QueuedScenarioV3Save {
  project: ScenarioProjectV3;
  resolve: (outcome: ScenarioV3SaveOutcome) => void;
}

interface ScenarioV3SaveQueue {
  inFlightSaveRef: MutableRefObject<Promise<void> | null>;
  latestProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  queuedSaveRef: MutableRefObject<QueuedScenarioV3Save | null>;
}

export function useScenarioV3ProjectSaver(args: {
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  saveRevisionRef: MutableRefObject<number>;
  setError: (error: string | null) => void;
  setProject: (project: ScenarioProjectV3) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
}): ScenarioV3SaveController {
  const { savedProjectRef, saveRevisionRef, setError, setProject, setSaveState } = args;
  const inFlightSaveRef = useRef<Promise<void> | null>(null);
  const latestProjectRef = useRef<ScenarioProjectV3 | null>(savedProjectRef.current);
  const queuedSaveRef = useRef<QueuedScenarioV3Save | null>(null);
  const queueRef = useRef<ScenarioV3SaveQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = {
      inFlightSaveRef,
      latestProjectRef,
      queuedSaveRef,
    };
  }
  const saveProject = useCallback(
    (nextProject: ScenarioProjectV3) =>
      enqueueScenarioV3EditorSave({
        nextProject,
        queue: queueRef.current,
        savedProjectRef,
        saveRevisionRef,
        setError,
        setProject,
        setSaveState,
      }),
    [savedProjectRef, saveRevisionRef, setError, setProject, setSaveState]
  );

  return { saveProject };
}

function enqueueScenarioV3EditorSave(args: {
  nextProject: ScenarioProjectV3;
  queue: ScenarioV3SaveQueue | null;
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  saveRevisionRef: MutableRefObject<number>;
  setError: (error: string | null) => void;
  setProject: (project: ScenarioProjectV3) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
}) {
  const queue = args.queue;
  if (!queue) {
    return Promise.resolve({ status: 'failed' } as const);
  }

  queue.latestProjectRef.current = args.nextProject;
  args.saveRevisionRef.current += 1;
  args.setSaveState('saving');
  args.setError(null);

  return new Promise<ScenarioV3SaveOutcome>((resolve) => {
    const queuedSave = {
      project: args.nextProject,
      resolve,
    };
    if (queue.inFlightSaveRef.current) {
      replaceQueuedScenarioV3Save(queue, queuedSave);
      return;
    }

    startScenarioV3EditorSave({ ...args, queue, queuedSave });
  });
}

function replaceQueuedScenarioV3Save(queue: ScenarioV3SaveQueue, nextSave: QueuedScenarioV3Save) {
  settleSupersededScenarioV3Save(queue.queuedSaveRef.current);
  queue.queuedSaveRef.current = nextSave;
}

function settleSupersededScenarioV3Save(queuedSave: QueuedScenarioV3Save | null) {
  if (!queuedSave) {
    return;
  }

  queuedSave.resolve({ status: 'superseded' });
}

function startScenarioV3EditorSave(args: {
  queue: ScenarioV3SaveQueue;
  queuedSave: QueuedScenarioV3Save;
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  setError: (error: string | null) => void;
  setProject: (project: ScenarioProjectV3) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
}) {
  const savePromise = runScenarioV3EditorSave(args).finally(() => {
    if (args.queue.inFlightSaveRef.current !== savePromise) {
      return;
    }

    args.queue.inFlightSaveRef.current = null;
    flushQueuedScenarioV3EditorSave(args);
  });
  args.queue.inFlightSaveRef.current = savePromise;
}

async function runScenarioV3EditorSave(args: {
  queue: ScenarioV3SaveQueue;
  queuedSave: QueuedScenarioV3Save;
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  setError: (error: string | null) => void;
  setProject: (project: ScenarioProjectV3) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
}) {
  const baseUpdatedAt = args.savedProjectRef.current?.updatedAt ?? null;
  try {
    const savedProject = await saveScenarioV3EditorProject(args.queuedSave.project, {
      baseUpdatedAt,
    });
    applyScenarioV3EditorSaveSuccess({ ...args, savedProject });
    args.queuedSave.resolve({ project: savedProject, status: 'saved' });
  } catch (nextError) {
    applyScenarioV3EditorSaveFailure({ ...args, nextError });
    args.queuedSave.resolve({ status: 'failed' });
  }
}

function applyScenarioV3EditorSaveSuccess(args: {
  queue: ScenarioV3SaveQueue;
  queuedSave: QueuedScenarioV3Save;
  savedProject: ScenarioProjectV3;
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  setError: (error: string | null) => void;
  setProject: (project: ScenarioProjectV3) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
}) {
  if (args.queue.latestProjectRef.current?.id === args.queuedSave.project.id) {
    args.savedProjectRef.current = args.savedProject;
  }

  if (args.queue.latestProjectRef.current !== args.queuedSave.project) {
    return;
  }

  args.setProject(args.savedProject);
  args.setError(null);
  args.setSaveState('saved');
}

function applyScenarioV3EditorSaveFailure(args: {
  queue: ScenarioV3SaveQueue;
  queuedSave: QueuedScenarioV3Save;
  nextError: unknown;
  setError: (error: string | null) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
}) {
  if (args.queue.latestProjectRef.current !== args.queuedSave.project) {
    return;
  }

  args.setSaveState('error');
  args.setError(getScenarioV3RuntimeErrorMessage(args.nextError));
}

function flushQueuedScenarioV3EditorSave(args: {
  queue: ScenarioV3SaveQueue;
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  setError: (error: string | null) => void;
  setProject: (project: ScenarioProjectV3) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
}) {
  const queuedSave = args.queue.queuedSaveRef.current;
  args.queue.queuedSaveRef.current = null;
  if (!queuedSave || args.savedProjectRef.current === queuedSave.project) {
    if (queuedSave) {
      queuedSave.resolve({ project: queuedSave.project, status: 'saved' });
    }
    return;
  }

  startScenarioV3EditorSave({ ...args, queuedSave });
}
