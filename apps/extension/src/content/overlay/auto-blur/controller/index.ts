import type { AutoBlurCategory } from '../../../../features/highlighter/contracts/auto-blur';
import {
  useApplyAction,
  useApplyOnceAction,
  useClearAutoBlurAction,
  useCloseAction,
  useResetSelection,
  useToggleAutoApplyAction,
} from './actions';
import {
  useSetToggle,
  useToggleAllSelection,
  useToggleCategorySelection,
} from './selection-actions';
import { countSelectedAutoBlurMatches } from '../../../selection/auto-blur-runtime';
import {
  useAutoBlurAutoApplyEffect,
  useAutoBlurScanEffect,
  useAutoBlurSettingsBootstrapEffect,
  useHighlighterModeCloseEffect,
} from './effects';
import { useAutoBlurMutableState } from './state';
import type { AutoBlurMutableState, FrameManager } from './types';

type UseAutoBlurControllerParams = {
  autoApplyAllowed: boolean;
  frameManager: FrameManager;
  highlighterMode: boolean;
};
type ResetSelection = ReturnType<typeof useResetSelection>;

function createControllerResult(args: {
  apply: () => Promise<void>;
  applyOnce: () => Promise<void>;
  autoApplyAllowed: boolean;
  close: () => void;
  reset: () => void;
  state: AutoBlurMutableState;
  toggleAutoApply: () => Promise<void>;
  toggleAllSelection: () => void;
  toggleCategory: (category: AutoBlurCategory) => void;
  toggleMatch: (matchId: string) => void;
}) {
  return {
    apply: args.apply,
    applyOnce: args.applyOnce,
    autoApplyAllowed: args.autoApplyAllowed,
    autoApplyEnabled: args.state.autoApplyEnabled,
    blurSettings: args.state.blurSettings,
    close: args.close,
    errorMessage: args.state.errorMessage,
    isApplying: args.state.isApplying,
    isOpen: args.state.isOpen,
    matches: args.state.matches,
    open: () => args.state.setIsOpen(true),
    reset: args.reset,
    selectedCategories: args.state.selectedCategories,
    selectedTargetCount: countSelectedAutoBlurMatches({
      matches: args.state.matches,
      selectedCategories: args.state.selectedCategories,
      selectedMatchIds: args.state.selectedMatchIds,
    }),
    selectedMatchIds: args.state.selectedMatchIds,
    setBlurSettings: args.state.setBlurSettings,
    status: args.state.status,
    toggleCategory: args.toggleCategory,
    toggleAllSelection: args.toggleAllSelection,
    toggleAutoApply: args.toggleAutoApply,
    toggleMatch: args.toggleMatch,
  };
}

export function useAutoBlurController(params: UseAutoBlurControllerParams) {
  const state = useAutoBlurMutableState();
  const resetSelection = useResetSelection(state);
  const close = useCloseAction(state);
  const toggleCategory = useToggleCategorySelection({
    matches: state.matches,
    setSelectedCategories: state.setSelectedCategories,
    setSelectedMatchIds: state.setSelectedMatchIds,
  });
  const toggleMatch = useSetToggle(state.setSelectedMatchIds);
  const toggleAllSelection = useToggleAllSelection({
    selectedCategories: state.selectedCategories,
    selectedMatchIds: state.selectedMatchIds,
    setSelectedCategories: state.setSelectedCategories,
    setSelectedMatchIds: state.setSelectedMatchIds,
  });
  const actions = useAutoBlurControllerActions({ close, params, state });

  useAutoBlurControllerEffects({ params, resetSelection, state });

  return createControllerResult({
    ...actions,
    autoApplyAllowed: params.autoApplyAllowed,
    close,
    state,
    toggleAllSelection,
    toggleCategory,
    toggleMatch,
  });
}

function useAutoBlurControllerEffects(args: {
  params: UseAutoBlurControllerParams;
  resetSelection: ResetSelection;
  state: AutoBlurMutableState;
}) {
  const { params, resetSelection, state } = args;
  useAutoBlurSettingsBootstrapEffect({ resetSelection });
  useAutoBlurScanEffect({
    frames: params.frameManager.frames,
    isOpen: state.isOpen,
    resetSelection,
    scanVersionRef: state.refs.scanVersionRef,
    setErrorMessage: state.setErrorMessage,
    setMatches: state.setMatches,
    setStatus: state.setStatus,
  });
  useHighlighterModeCloseEffect({
    highlighterMode: params.highlighterMode,
    isOpen: state.isOpen,
    scanVersionRef: state.refs.scanVersionRef,
    setIsOpen: state.setIsOpen,
  });
  useAutoBlurAutoApplyEffect({
    autoApplyAllowed: params.autoApplyAllowed,
    autoApplyEnabled: state.autoApplyEnabled,
    frameManager: params.frameManager,
    isApplying: state.isApplying,
    isOpen: state.isOpen,
  });
}

function useAutoBlurControllerActions(args: {
  close: () => void;
  params: UseAutoBlurControllerParams;
  state: AutoBlurMutableState;
}) {
  const { close, params, state } = args;
  const reset = useClearAutoBlurAction({
    frameManager: params.frameManager,
    matches: state.matches,
    setErrorMessage: state.setErrorMessage,
  });
  const apply = useApplyAction({
    autoApplyEnabled: state.autoApplyEnabled,
    blurSettings: state.blurSettings,
    close,
    frameManager: params.frameManager,
    matches: state.matches,
    selectedCategories: state.selectedCategories,
    selectedMatchIds: state.selectedMatchIds,
    setErrorMessage: state.setErrorMessage,
    setIsApplying: state.setIsApplying,
  });
  const applyOnce = useApplyOnceAction({
    frameManager: params.frameManager,
    setErrorMessage: state.setErrorMessage,
    setIsApplying: state.setIsApplying,
  });
  const toggleAutoApply = useToggleAutoApplyAction({
    autoApplyAllowed: params.autoApplyAllowed,
    frameManager: params.frameManager,
    setAutoApplyEnabled: state.setAutoApplyEnabled,
    setErrorMessage: state.setErrorMessage,
    setIsApplying: state.setIsApplying,
  });

  return {
    apply,
    applyOnce,
    reset,
    toggleAutoApply,
  };
}

export type AutoBlurController = ReturnType<typeof useAutoBlurController>;
