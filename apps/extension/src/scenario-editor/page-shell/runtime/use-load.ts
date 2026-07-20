import { useCallback, type MutableRefObject } from 'react';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { replaceScenarioEditorSelectionInUrl } from '../../platform/browser-driver';
import { loadScenarioV3EditorProject } from './load';
import { getScenarioV3RuntimeErrorMessage } from './save';
import type { ScenarioV3PageSaveState } from './types';

interface ScenarioV3LoadController {
  loadProject: () => Promise<void>;
}

type ScenarioV3ProjectLoaderArgs = {
  createProjectName: string;
  loadRevisionRef: MutableRefObject<number>;
  requestedProjectIdRef: MutableRefObject<string | null>;
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setProject: (project: ScenarioProjectV3) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
};

async function runScenarioV3ProjectLoad(args: ScenarioV3ProjectLoaderArgs) {
  const revision = startScenarioV3ProjectLoad(args);

  try {
    const loadedProject = await loadScenarioV3EditorProject(
      args.requestedProjectIdRef.current,
      args.createProjectName
    );
    finishScenarioV3ProjectLoadSuccess({ ...args, loadedProject, revision });
  } catch (nextError) {
    finishScenarioV3ProjectLoadFailure({ ...args, nextError, revision });
  } finally {
    finishScenarioV3ProjectLoad({ ...args, revision });
  }
}

export function useScenarioV3ProjectLoader(
  args: ScenarioV3ProjectLoaderArgs
): ScenarioV3LoadController {
  const {
    createProjectName,
    loadRevisionRef,
    requestedProjectIdRef,
    savedProjectRef,
    setError,
    setLoading,
    setProject,
    setSaveState,
  } = args;
  const loadProject = useCallback(async () => {
    await runScenarioV3ProjectLoad({
      createProjectName,
      loadRevisionRef,
      requestedProjectIdRef,
      savedProjectRef,
      setError,
      setLoading,
      setProject,
      setSaveState,
    });
  }, [
    createProjectName,
    loadRevisionRef,
    requestedProjectIdRef,
    savedProjectRef,
    setError,
    setLoading,
    setProject,
    setSaveState,
  ]);

  return { loadProject };
}

function startScenarioV3ProjectLoad(args: {
  loadRevisionRef: MutableRefObject<number>;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}) {
  const revision = args.loadRevisionRef.current + 1;
  args.loadRevisionRef.current = revision;
  args.setLoading(true);
  args.setError(null);
  return revision;
}

function finishScenarioV3ProjectLoadSuccess(args: {
  loadRevisionRef: MutableRefObject<number>;
  loadedProject: ScenarioProjectV3;
  requestedProjectIdRef: MutableRefObject<string | null>;
  revision: number;
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  setProject: (project: ScenarioProjectV3) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
}) {
  if (args.loadRevisionRef.current !== args.revision) {
    return;
  }
  args.requestedProjectIdRef.current = args.loadedProject.id;
  args.savedProjectRef.current = args.loadedProject;
  replaceScenarioEditorSelectionInUrl({ projectId: args.loadedProject.id });
  args.setProject(args.loadedProject);
  args.setSaveState('saved');
}

function finishScenarioV3ProjectLoadFailure(args: {
  loadRevisionRef: MutableRefObject<number>;
  nextError: unknown;
  revision: number;
  setError: (error: string | null) => void;
}) {
  if (args.loadRevisionRef.current === args.revision) {
    args.setError(getScenarioV3RuntimeErrorMessage(args.nextError));
  }
}

function finishScenarioV3ProjectLoad(args: {
  loadRevisionRef: MutableRefObject<number>;
  revision: number;
  setLoading: (loading: boolean) => void;
}) {
  if (args.loadRevisionRef.current === args.revision) {
    args.setLoading(false);
  }
}
