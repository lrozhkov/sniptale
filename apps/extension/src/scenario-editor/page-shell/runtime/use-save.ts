import { useCallback, useRef, type MutableRefObject } from 'react';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { getScenarioV3RuntimeErrorMessage, saveScenarioV3EditorProject } from './save';
import type { ScenarioV3PageSaveState } from './types';

interface ScenarioV3SaveController {
  saveProject: (project: ScenarioProjectV3) => Promise<void>;
  saveProjectOrThrow: (project: ScenarioProjectV3) => Promise<ScenarioProjectV3>;
}

interface QueuedScenarioV3Save {
  project: ScenarioProjectV3;
  reject: (error: unknown) => void;
  resolve: (project: ScenarioProjectV3) => void;
  rethrow: boolean;
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
  const saveProjectWithMode = useCallback(
    (nextProject: ScenarioProjectV3, rethrow: boolean) =>
      enqueueScenarioV3EditorSave({
        nextProject,
        queue: queueRef.current,
        rethrow,
        savedProjectRef,
        saveRevisionRef,
        setError,
        setProject,
        setSaveState,
      }),
    [savedProjectRef, saveRevisionRef, setError, setProject, setSaveState]
  );
  const saveProject = useCallback(
    (nextProject: ScenarioProjectV3) =>
      saveProjectWithMode(nextProject, false).then(() => undefined),
    [saveProjectWithMode]
  );
  const saveProjectOrThrow = useCallback(
    (nextProject: ScenarioProjectV3) => saveProjectWithMode(nextProject, true),
    [saveProjectWithMode]
  );

  return { saveProject, saveProjectOrThrow };
}

function enqueueScenarioV3EditorSave(args: {
  nextProject: ScenarioProjectV3;
  queue: ScenarioV3SaveQueue | null;
  rethrow: boolean;
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  saveRevisionRef: MutableRefObject<number>;
  setError: (error: string | null) => void;
  setProject: (project: ScenarioProjectV3) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
}) {
  const queue = args.queue;
  if (!queue) {
    return Promise.resolve(args.nextProject);
  }

  queue.latestProjectRef.current = args.nextProject;
  args.saveRevisionRef.current += 1;
  args.setSaveState('saving');
  args.setError(null);

  return new Promise<ScenarioProjectV3>((resolve, reject) => {
    const queuedSave = {
      project: args.nextProject,
      reject,
      resolve,
      rethrow: args.rethrow,
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

  if (queuedSave.rethrow) {
    queuedSave.reject(new Error('Scenario project save was superseded by a newer snapshot'));
    return;
  }

  queuedSave.resolve(queuedSave.project);
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
    args.queuedSave.resolve(savedProject);
  } catch (nextError) {
    applyScenarioV3EditorSaveFailure({ ...args, nextError });
    if (args.queuedSave.rethrow) {
      args.queuedSave.reject(nextError);
      return;
    }
    args.queuedSave.resolve(args.queuedSave.project);
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
    queuedSave?.resolve(queuedSave.project);
    return;
  }

  startScenarioV3EditorSave({ ...args, queuedSave });
}
