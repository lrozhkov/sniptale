import { useMemo, useState } from 'react';
import type {
  ScenarioCaptureStep,
  ScenarioProject,
  ScenarioProjectSummary,
} from '../../../features/scenario/contracts/types/project';
import { useScenarioEditorProjectHistory } from '../mutation/history/project';
import type {
  ScenarioEditorProjectHistoryController,
  ScenarioEditorProjectMutableStateController,
} from './types';

export function useScenarioEditorStateValues(
  initialProjectId: string | null,
  initialStepId: string | null
): ScenarioEditorProjectMutableStateController {
  const state = useScenarioEditorMutableProjectState(initialProjectId, initialStepId);
  const selectedStep = useMemo(
    () =>
      state.selectedStepId && state.project
        ? (state.project.steps.find((step) => step.id === state.selectedStepId) ?? null)
        : null,
    [state.project, state.selectedStepId]
  );
  const quickEditStep = useMemo(
    () =>
      state.quickEditStepId && state.project
        ? (state.project.steps.find(
            (step): step is ScenarioCaptureStep =>
              step.id === state.quickEditStepId && step.kind === 'capture'
          ) ?? null)
        : null,
    [state.project, state.quickEditStepId]
  );

  return {
    ...state,
    quickEditStep,
    selectedStep,
  };
}

function useScenarioEditorMutableProjectState(
  initialProjectId: string | null,
  initialStepId: string | null
) {
  const [projects, setProjects] = useState<ScenarioProjectSummary[]>([]);
  const [project, setProject] = useState<ScenarioProject | null>(null);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(initialStepId);
  const [saveState, setSaveState] = useState<'error' | 'saved' | 'saving'>('saved');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [quickEditStepId, setQuickEditStepId] = useState<string | null>(null);

  return {
    createName,
    error,
    loading,
    project,
    projectId,
    projects,
    quickEditStepId,
    saveState,
    selectedStepId,
    setCreateName,
    setError,
    setLoading,
    setProject,
    setProjectId,
    setProjects,
    setQuickEditStepId,
    setSaveState,
    setSelectedStepId,
  };
}

export function useScenarioEditorProjectHistoryState(
  state: ScenarioEditorProjectMutableStateController
): ScenarioEditorProjectHistoryController {
  return useScenarioEditorProjectHistory({
    project: state.project,
    quickEditStepId: state.quickEditStepId,
    selectedStepId: state.selectedStepId,
    setProject: state.setProject,
    setQuickEditStepId: state.setQuickEditStepId,
    setSelectedStepId: state.setSelectedStepId,
  });
}
