import {
  useScenarioEditorAutosave,
  useScenarioEditorSelectionEffects,
} from './selection-autosave-effects';
import type {
  useScenarioEditorLoadedProjectApplier,
  useScenarioEditorProjectLoader,
  useScenarioEditorProjectSummarySync,
  useScenarioEditorProjectUpdater,
} from './project';
import { useScenarioEditorBootstrap } from './project';
import type {
  ScenarioEditorProjectMutableStateController,
  ScenarioEditorProjectRuntimeController,
} from './types';
import type { ScenarioEditorBrowserDriverPort } from '../../application/ports/browser-driver';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';

export function useScenarioEditorProjectSideEffects(args: {
  applyLoadedProject: ReturnType<typeof useScenarioEditorLoadedProjectApplier>;
  browserDriver: Pick<ScenarioEditorBrowserDriverPort, 'replaceSelectionInUrl'>;
  state: ScenarioEditorProjectMutableStateController;
  initialProjectIdRef: React.MutableRefObject<string | null>;
  initialStepIdRef: React.MutableRefObject<string | null>;
  savedProjectRef: React.MutableRefObject<ScenarioProject | null>;
  syncProjectSummary: ReturnType<typeof useScenarioEditorProjectSummarySync>;
}) {
  useScenarioEditorBootstrap({
    applyLoadedProject: args.applyLoadedProject,
    initialProjectIdRef: args.initialProjectIdRef,
    initialStepIdRef: args.initialStepIdRef,
    setError: args.state.setError,
    setLoading: args.state.setLoading,
    setProjects: args.state.setProjects,
  });
  useScenarioEditorSelectionEffects({
    browserDriver: args.browserDriver,
    project: args.state.project,
    projectId: args.state.projectId,
    selectedStepId: args.state.selectedStepId,
    setSelectedStepId: args.state.setSelectedStepId,
  });
  useScenarioEditorAutosave({
    project: args.state.project,
    savedProjectRef: args.savedProjectRef,
    setError: args.state.setError,
    setSaveState: args.state.setSaveState,
    syncProjectSummary: args.syncProjectSummary,
  });
}

export function useScenarioEditorProjectUpdaterWithHistory(
  updateProject: ReturnType<typeof useScenarioEditorProjectUpdater>,
  trackProjectMutation: () => void
) {
  return (updater: Parameters<typeof updateProject>[0]) => {
    trackProjectMutation();
    updateProject(updater);
  };
}

export function buildScenarioEditorProjectRuntime(
  applyLoadedProject: ReturnType<typeof useScenarioEditorLoadedProjectApplier>,
  loadProjectById: ReturnType<typeof useScenarioEditorProjectLoader>,
  syncProjectSummary: ReturnType<typeof useScenarioEditorProjectSummarySync>,
  updateProject: ReturnType<typeof useScenarioEditorProjectUpdater>
): ScenarioEditorProjectRuntimeController {
  return {
    applyLoadedProject,
    loadProjectById,
    syncProjectSummary,
    updateProject,
  };
}
