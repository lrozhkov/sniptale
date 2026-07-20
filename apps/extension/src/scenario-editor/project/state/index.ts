import {
  buildScenarioEditorProjectRuntime,
  useScenarioEditorProjectSideEffects,
  useScenarioEditorProjectUpdaterWithHistory,
} from './effects';
import { useScenarioEditorProjectStateRefs } from './refs';
import { useScenarioEditorProjectHistoryState, useScenarioEditorStateValues } from './values';
import {
  useScenarioEditorLoadedProjectApplier,
  useScenarioEditorProjectLoader,
  useScenarioEditorProjectSummarySync,
  useScenarioEditorProjectUpdater,
} from './project';
import { useScenarioEditorStepHistory } from '../mutation/history/step';
import type {
  ScenarioEditorProjectStateHook,
  ScenarioEditorStepHistoryInternalController,
} from './types';
import type { ScenarioEditorBrowserDriverPort } from '../../application/ports/browser-driver';

export function useScenarioEditorProjectState(
  browserDriver: Pick<ScenarioEditorBrowserDriverPort, 'replaceSelectionInUrl'>
): ScenarioEditorProjectStateHook {
  const { initialProjectIdRef, initialStepIdRef, savedProjectRef } =
    useScenarioEditorProjectStateRefs();
  const state = useScenarioEditorStateValues(initialProjectIdRef.current, initialStepIdRef.current);
  const syncProjectSummary = useScenarioEditorProjectSummarySync(state.setProjects);
  const applyLoadedProject = useScenarioEditorLoadedProjectApplier({
    initialStepIdRef,
    savedProjectRef,
    setProject: state.setProject,
    setProjectId: state.setProjectId,
    setQuickEditStepId: state.setQuickEditStepId,
    setSaveState: state.setSaveState,
    setSelectedStepId: state.setSelectedStepId,
  });
  const loadProjectById = useScenarioEditorProjectLoader(applyLoadedProject);
  const updateProject = useScenarioEditorProjectUpdater(state.setProject);
  const projectHistory = useScenarioEditorProjectHistoryState(state);
  const stepHistory: ScenarioEditorStepHistoryInternalController = useScenarioEditorStepHistory({
    project: state.project,
    setProject: state.setProject,
    trackProjectMutation: projectHistory.trackProjectMutation,
  });
  const runtime = buildScenarioEditorProjectRuntime(
    applyLoadedProject,
    loadProjectById,
    syncProjectSummary,
    useScenarioEditorProjectUpdaterWithHistory(updateProject, projectHistory.trackProjectMutation)
  );

  useScenarioEditorProjectSideEffects({
    applyLoadedProject,
    browserDriver,
    state,
    initialProjectIdRef,
    initialStepIdRef,
    savedProjectRef,
    syncProjectSummary,
  });

  return { projectHistory, runtime, state, stepHistory };
}
