import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  BlurSettings,
  CalloutSettings,
  FocusSettings,
  FrameData,
  GlobalStepBadgeSettings,
  HighlighterSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import type { WithHistoryCommit } from '../manager/types';
import {
  createCalloutDeleteHandler,
  createCalloutPopoverSettingsHandler,
  createFrameCalloutChangedHandler,
} from './callout-handlers';
import { createFrameSessionListenerCleanups } from './listeners';
import {
  createFrameStepBadgeHandler,
  createStepBadgeReorderHandler,
  createStepBadgeSettingsHandler,
} from './step-badge-handlers';

export function buildFrameSessionWindowListeners(args: {
  highlighterSettingsCacheRef: MutableRefObject<HighlighterSettings | null>;
  loadSettings: () => void;
  syncFocusOpacity: (sourceFrameId: string, newOpacity: number) => void;
  sessionBlurSettingsRef: MutableRefObject<BlurSettings>;
  sessionFocusSettingsRef: MutableRefObject<FocusSettings>;
  updateGlobalStepBadgeSettings: (settings: Partial<GlobalStepBadgeSettings>) => void;
  updateFrameStepBadge: (frameId: string, settings: Partial<StepBadgeSettings>) => void;
  reorderStepBadge: (frameId: string, direction: 'up' | 'down') => void;
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
  sessionCalloutStyleRef: MutableRefObject<Partial<CalloutSettings> | null>;
  withHistoryCommit: WithHistoryCommit;
}) {
  const frameCalloutHandlers = createFrameCalloutHandlers(args);
  const frameStepBadgeHandlers = createFrameStepBadgeHandlers(args);

  return createFrameSessionListenerCleanups({
    frameCalloutHandlers,
    frameStepBadgeHandlers,
    highlighterSettingsCacheRef: args.highlighterSettingsCacheRef,
    loadSettings: args.loadSettings,
    sessionBlurSettingsRef: args.sessionBlurSettingsRef,
    sessionFocusSettingsRef: args.sessionFocusSettingsRef,
    syncFocusOpacity: args.withHistoryCommit(args.syncFocusOpacity),
  });
}

function createFrameCalloutHandlers(args: {
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
  sessionCalloutStyleRef: MutableRefObject<Partial<CalloutSettings> | null>;
  withHistoryCommit: WithHistoryCommit;
}) {
  return {
    handleCalloutDelete: args.withHistoryCommit(createCalloutDeleteHandler(args.setFrames)),
    handleCalloutPopoverSettingsChanged: args.withHistoryCommit(
      createCalloutPopoverSettingsHandler({
        setFrames: args.setFrames,
        sessionCalloutStyleRef: args.sessionCalloutStyleRef,
      })
    ),
    handleFrameCalloutChanged: args.withHistoryCommit(
      createFrameCalloutChangedHandler({
        setFrames: args.setFrames,
        sessionCalloutStyleRef: args.sessionCalloutStyleRef,
      })
    ),
  };
}

function createFrameStepBadgeHandlers(args: {
  updateGlobalStepBadgeSettings: (settings: Partial<GlobalStepBadgeSettings>) => void;
  updateFrameStepBadge: (frameId: string, settings: Partial<StepBadgeSettings>) => void;
  reorderStepBadge: (frameId: string, direction: 'up' | 'down') => void;
}) {
  return {
    handleFrameStepBadgeChanged: createFrameStepBadgeHandler(args.updateFrameStepBadge),
    handleGlobalStepBadgeSettingsChanged: createStepBadgeSettingsHandler(
      args.updateGlobalStepBadgeSettings
    ),
    handleStepBadgeReorder: createStepBadgeReorderHandler(args.reorderStepBadge),
  };
}
