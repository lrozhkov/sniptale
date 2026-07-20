import type {
  ScenarioProject,
  ScenarioStep,
  ScenarioStepPatch,
} from '../../../../features/scenario/contracts/types/project';
import { createAcceptSuggestedEventAction, createDismissSuggestedEventAction } from './suggestions';
import {
  createDeleteStepAction,
  createApplyEditedCaptureStepAction,
  createClearTrashAction,
  createDuplicateStepAction,
  createInsertImageStepAction,
  createInsertStepAction,
  createMoveStepByOffsetAction,
  createMoveStepToPositionAction,
  createRestoreStepAction,
  createUpdateStepAction,
} from './steps';
import type { UpdateProject } from './types';

export function createScenarioEditorProjectActions(args: {
  applyStepPatch: (stepId: string, patch: ScenarioStepPatch) => void;
  applyStepReplacement: (stepId: string, replaceStep: (step: ScenarioStep) => ScenarioStep) => void;
  getCurrentProject: () => ScenarioProject | null;
  project: ScenarioProject | null;
  setError: (message: string | null) => void;
  updateProject: UpdateProject;
  setSelectedStepId: (stepId: string | null) => void;
}) {
  return {
    applyEditedCaptureStep: createApplyEditedCaptureStepAction(args),
    clearTrash: createClearTrashAction(args),
    deleteStep: createDeleteStepAction(args),
    duplicateStep: createDuplicateStepAction(args),
    insertImageStep: createInsertImageStepAction(args),
    insertStep: createInsertStepAction(args),
    restoreStep: createRestoreStepAction(args),
    updateStep: createUpdateStepAction(args.applyStepPatch),
    moveStepByOffset: createMoveStepByOffsetAction(args.updateProject),
    moveStepToPosition: createMoveStepToPositionAction(args.updateProject),
    acceptSuggestedEvent: createAcceptSuggestedEventAction(args),
    dismissSuggestedEvent: createDismissSuggestedEventAction(args.updateProject),
  };
}
