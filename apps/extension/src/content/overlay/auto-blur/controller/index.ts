import { countSelectedAutoBlurMatches } from '../../../selection/auto-blur-runtime';
import {
  useApplyAction,
  useApplyOnceAction,
  useClearAutoBlurAction,
  useToggleAutoApplyAction,
} from './actions';
import {
  useAutoBlurAutoApplyEffect,
  useAutoBlurScanEffect,
  useAutoBlurSettingsBootstrapEffect,
  useHighlighterModeCloseEffect,
} from './effects';
import type { AutoBlurFrameManager } from './operations';
import { useAutoBlurSession } from './state';
import type { AppliedBorderSettings } from '../../../../features/highlighter/contracts';

type UseAutoBlurControllerParams = {
  autoApplyAllowed: boolean;
  frameManager: AutoBlurFrameManager;
  highlighterMode: boolean;
};

type AutoBlurSession = ReturnType<typeof useAutoBlurSession>;

function createControllerResult(args: {
  apply: (borderSettings: AppliedBorderSettings) => Promise<void>;
  applyOnce: () => Promise<void>;
  autoApplyAllowed: boolean;
  clear: () => void;
  session: AutoBlurSession;
  toggleAutoApply: () => Promise<void>;
}) {
  const { state, transitions } = args.session;
  return {
    apply: args.apply,
    applyOnce: args.applyOnce,
    autoApplyAllowed: args.autoApplyAllowed,
    autoApplyEnabled: state.autoApplyEnabled,
    blurSettings: state.blurSettings,
    close: transitions.close,
    errorMessage: state.errorMessage,
    isApplying: state.isApplying,
    isOpen: state.isOpen,
    matches: state.matches,
    open: transitions.open,
    reset: args.clear,
    selectedCategories: state.selectedCategories,
    selectedTargetCount: countSelectedAutoBlurMatches({
      matches: state.matches,
      selectedCategories: state.selectedCategories,
      selectedMatchIds: state.selectedMatchIds,
    }),
    selectedMatchIds: state.selectedMatchIds,
    setBlurSettings: transitions.setBlurSettings,
    status: state.status,
    toggleAllSelection: transitions.toggleAll,
    toggleAutoApply: args.toggleAutoApply,
    toggleCategory: transitions.toggleCategory,
    toggleMatch: transitions.toggleMatch,
  };
}

export function useAutoBlurController(params: UseAutoBlurControllerParams) {
  const session = useAutoBlurSession();
  const actions = useAutoBlurControllerActions({ params, session });
  useAutoBlurControllerEffects({ params, session });

  return createControllerResult({
    ...actions,
    autoApplyAllowed: params.autoApplyAllowed,
    session,
  });
}

function useAutoBlurControllerEffects(args: {
  params: UseAutoBlurControllerParams;
  session: AutoBlurSession;
}) {
  const { params, session } = args;
  const { scanVersionRef, state, transitions } = session;

  useAutoBlurSettingsBootstrapEffect({ resetSelection: transitions.reset });
  useAutoBlurScanEffect({
    completeScan: transitions.completeScan,
    failScan: transitions.failScan,
    frames: params.frameManager.frames,
    isOpen: state.isOpen,
    scanVersionRef,
    startScan: transitions.startScan,
  });
  useHighlighterModeCloseEffect({
    closeForMode: transitions.closeForMode,
    highlighterMode: params.highlighterMode,
    isOpen: state.isOpen,
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
  params: UseAutoBlurControllerParams;
  session: AutoBlurSession;
}) {
  const { params, session } = args;
  const { state, transitions } = session;
  const clear = useClearAutoBlurAction({
    frameManager: params.frameManager,
    matches: state.matches,
    reportError: transitions.reportError,
  });
  const apply = useApplyAction({
    autoApplyEnabled: state.autoApplyEnabled,
    beginApplying: transitions.beginApplying,
    blurSettings: state.blurSettings,
    close: transitions.close,
    failApplying: transitions.failApplying,
    frameManager: params.frameManager,
    matches: state.matches,
    selectedCategories: state.selectedCategories,
    selectedMatchIds: state.selectedMatchIds,
  });
  const applyOnce = useApplyOnceAction({
    beginApplying: transitions.beginApplying,
    failApplying: transitions.failApplying,
    finishApplying: transitions.finishApplying,
    frameManager: params.frameManager,
  });
  const toggleAutoApply = useToggleAutoApplyAction({
    autoApplyAllowed: params.autoApplyAllowed,
    beginApplying: transitions.beginApplying,
    failApplying: transitions.failApplying,
    finishApplying: transitions.finishApplying,
    setAutoApplyEnabled: transitions.setAutoApplyEnabled,
  });

  return {
    apply,
    applyOnce,
    clear,
    toggleAutoApply,
  };
}

export type AutoBlurController = ReturnType<typeof useAutoBlurController>;
