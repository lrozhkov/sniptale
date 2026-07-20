import { useCallback, useEffect, useRef, useState } from 'react';
import { translate } from '../../../platform/i18n';
import { readScenarioEditorProjectId } from '@sniptale/runtime-contracts/scenario-editor/session';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioV3PageProjectState, ScenarioV3PageSaveState } from './types';
import { useScenarioV3ProjectLoader } from './use-load';
import { useScenarioV3ProjectSaver } from './use-save';

function useScenarioV3ProjectMutations(args: {
  project: ScenarioProjectV3 | null;
  saveProject: (project: ScenarioProjectV3) => Promise<void>;
  setProject: (project: ScenarioProjectV3) => void;
}) {
  const { project, saveProject, setProject } = args;
  const updateProject = useCallback(
    (nextProject: ScenarioProjectV3) => {
      setProject(nextProject);
      void saveProject(nextProject);
    },
    [saveProject, setProject]
  );

  const retrySave = useCallback(() => {
    if (!project) {
      return Promise.resolve();
    }

    return saveProject(project);
  }, [project, saveProject]);

  return { retrySave, updateProject };
}

export function useScenarioV3PageProjectState(): ScenarioV3PageProjectState {
  const requestedProjectIdRef = useRef(readScenarioEditorProjectId(window.location.search));
  const loadRevisionRef = useRef(0);
  const savedProjectRef = useRef<ScenarioProjectV3 | null>(null);
  const saveRevisionRef = useRef(0);
  const [project, setProject] = useState<ScenarioProjectV3 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<ScenarioV3PageSaveState>('idle');
  const { loadProject } = useScenarioV3ProjectLoader({
    createProjectName: translate('scenario.editor.v3UntitledProject'),
    loadRevisionRef,
    requestedProjectIdRef,
    savedProjectRef,
    setError,
    setLoading,
    setProject,
    setSaveState,
  });
  const { saveProject, saveProjectOrThrow } = useScenarioV3ProjectSaver({
    savedProjectRef,
    saveRevisionRef,
    setError,
    setProject,
    setSaveState,
  });

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const { retrySave, updateProject } = useScenarioV3ProjectMutations({
    project,
    saveProject,
    setProject,
  });

  return {
    error,
    loading,
    project,
    retryLoad: loadProject,
    retrySave,
    saveProject: saveProjectOrThrow,
    saveState,
    updateProject,
  };
}
