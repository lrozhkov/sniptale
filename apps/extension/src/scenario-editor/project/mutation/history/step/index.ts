import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ScenarioProject,
  ScenarioStep,
  ScenarioStepPatch,
} from '../../../../../features/scenario/contracts/types/project';
import {
  canRedoScenarioStep,
  canUndoScenarioStep,
  pruneScenarioStepHistory,
  type ScenarioStepHistoryState,
} from './history';
import {
  applySingleStepPatchToProject,
  applyStepReplacementToProject,
  applyStepPatchBatchToProject,
  restoreScenarioStepHistoryChange,
  type CommitProjectState,
} from './helpers';

function useScenarioEditorStepHistoryRefs(args: {
  project: ScenarioProject | null;
  stepHistoryState: ScenarioStepHistoryState;
  setStepHistoryState: React.Dispatch<React.SetStateAction<ScenarioStepHistoryState>>;
}) {
  const { project, setStepHistoryState, stepHistoryState } = args;
  const projectRef = useRef(project);
  const stepHistoryStateRef = useRef(stepHistoryState);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    stepHistoryStateRef.current = stepHistoryState;
  }, [stepHistoryState]);

  useEffect(() => {
    if (!project) {
      stepHistoryStateRef.current = {};
      setStepHistoryState({});
      return;
    }

    const nextHistoryState = pruneScenarioStepHistory(
      stepHistoryStateRef.current,
      project.steps.map((step) => step.id)
    );
    stepHistoryStateRef.current = nextHistoryState;
    setStepHistoryState(nextHistoryState);
  }, [project, setStepHistoryState]);

  return { projectRef, stepHistoryStateRef };
}

function useScenarioEditorStepHistoryActions(args: {
  commitProjectState: CommitProjectState;
  projectRef: React.MutableRefObject<ScenarioProject | null>;
  stepHistoryStateRef: React.MutableRefObject<ScenarioStepHistoryState>;
}) {
  const { commitProjectState, projectRef, stepHistoryStateRef } = args;

  const applyStepPatch = useScenarioEditorPatchAction({
    commitProjectState,
    projectRef,
    stepHistoryStateRef,
  });
  const applyStepReplacement = useScenarioEditorStepReplacementAction({
    commitProjectState,
    projectRef,
    stepHistoryStateRef,
  });
  const applyStepPatches = useScenarioEditorPatchBatchAction({
    commitProjectState,
    projectRef,
    stepHistoryStateRef,
  });
  const undoStepChange = useScenarioEditorRestoreAction({
    commitProjectState,
    mode: 'undo',
    projectRef,
    stepHistoryStateRef,
  });
  const redoStepChange = useScenarioEditorRestoreAction({
    commitProjectState,
    mode: 'redo',
    projectRef,
    stepHistoryStateRef,
  });
  const { canRedoStep, canUndoStep } = useScenarioEditorHistoryAvailability({
    stepHistoryStateRef,
  });

  return {
    applyStepPatch,
    applyStepReplacement,
    applyStepPatches,
    canRedoStep,
    canUndoStep,
    redoStepChange,
    undoStepChange,
  };
}

function useScenarioEditorPatchAction(args: {
  commitProjectState: CommitProjectState;
  projectRef: React.MutableRefObject<ScenarioProject | null>;
  stepHistoryStateRef: React.MutableRefObject<ScenarioStepHistoryState>;
}) {
  return useCallback(
    (stepId: string, patch: ScenarioStepPatch) => {
      applySingleStepPatchToProject({
        commitProjectState: args.commitProjectState,
        patch,
        project: args.projectRef.current,
        stepHistoryState: args.stepHistoryStateRef.current,
        stepId,
      });
    },
    [args.commitProjectState, args.projectRef, args.stepHistoryStateRef]
  );
}

function useScenarioEditorPatchBatchAction(args: {
  commitProjectState: CommitProjectState;
  projectRef: React.MutableRefObject<ScenarioProject | null>;
  stepHistoryStateRef: React.MutableRefObject<ScenarioStepHistoryState>;
}) {
  return useCallback(
    (patches: Array<{ patch: ScenarioStepPatch; stepId: string }>) => {
      applyStepPatchBatchToProject({
        commitProjectState: args.commitProjectState,
        patches,
        project: args.projectRef.current,
        stepHistoryState: args.stepHistoryStateRef.current,
      });
    },
    [args.commitProjectState, args.projectRef, args.stepHistoryStateRef]
  );
}

function useScenarioEditorStepReplacementAction(args: {
  commitProjectState: CommitProjectState;
  projectRef: React.MutableRefObject<ScenarioProject | null>;
  stepHistoryStateRef: React.MutableRefObject<ScenarioStepHistoryState>;
}) {
  return useCallback(
    (stepId: string, replaceStep: (step: ScenarioStep) => ScenarioStep) => {
      applyStepReplacementToProject({
        commitProjectState: args.commitProjectState,
        project: args.projectRef.current,
        replaceStep,
        stepHistoryState: args.stepHistoryStateRef.current,
        stepId,
      });
    },
    [args.commitProjectState, args.projectRef, args.stepHistoryStateRef]
  );
}

function useScenarioEditorRestoreAction(args: {
  commitProjectState: CommitProjectState;
  mode: 'redo' | 'undo';
  projectRef: React.MutableRefObject<ScenarioProject | null>;
  stepHistoryStateRef: React.MutableRefObject<ScenarioStepHistoryState>;
}) {
  return useCallback(
    (stepId: string) => {
      restoreScenarioStepHistoryChange({
        commitProjectState: args.commitProjectState,
        mode: args.mode,
        project: args.projectRef.current,
        stepHistoryState: args.stepHistoryStateRef.current,
        stepId,
      });
    },
    [args.commitProjectState, args.mode, args.projectRef, args.stepHistoryStateRef]
  );
}

function useScenarioEditorHistoryAvailability(args: {
  stepHistoryStateRef: React.MutableRefObject<ScenarioStepHistoryState>;
}) {
  const canUndoStep = useCallback(
    (stepId: string) => canUndoScenarioStep(args.stepHistoryStateRef.current, stepId),
    [args.stepHistoryStateRef]
  );
  const canRedoStep = useCallback(
    (stepId: string) => canRedoScenarioStep(args.stepHistoryStateRef.current, stepId),
    [args.stepHistoryStateRef]
  );

  return { canRedoStep, canUndoStep };
}

export function useScenarioEditorStepHistory(args: {
  project: ScenarioProject | null;
  setProject: React.Dispatch<React.SetStateAction<ScenarioProject | null>>;
  trackProjectMutation: () => void;
}) {
  const { project, setProject, trackProjectMutation } = args;
  const [stepHistoryState, setStepHistoryState] = useState<ScenarioStepHistoryState>({});
  const { projectRef, stepHistoryStateRef } = useScenarioEditorStepHistoryRefs({
    project,
    stepHistoryState,
    setStepHistoryState,
  });

  const commitProjectState = useCallback(
    (nextProject: ScenarioProject, nextHistoryState: ScenarioStepHistoryState) => {
      trackProjectMutation();
      projectRef.current = nextProject;
      stepHistoryStateRef.current = nextHistoryState;
      setProject(nextProject);
      setStepHistoryState(nextHistoryState);
    },
    [projectRef, setProject, stepHistoryStateRef, trackProjectMutation]
  );
  const actions = useScenarioEditorStepHistoryActions({
    commitProjectState,
    projectRef,
    stepHistoryStateRef,
  });
  return {
    ...actions,
    getCurrentProject: () => projectRef.current,
    stepHistoryState,
  };
}
