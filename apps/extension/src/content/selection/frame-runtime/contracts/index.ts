import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Root } from 'react-dom/client';
import type {
  BlurSettings,
  EffectMode,
  FocusSettings,
  FrameData,
  FrameState,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type {
  GlobalStepBadgeSettings,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import type {
  AutoBlurApplyInput,
  AutoBlurClearInput,
  AutoBlurSyncInput,
} from '../../auto-blur-runtime';

export type FrameSetter = Dispatch<SetStateAction<FrameData[]>>;
export type FrameStateSetter = Dispatch<SetStateAction<Map<string, FrameState>>>;
export type FrameMutableRef<T> = MutableRefObject<T>;

export interface FrameManagerRefs {
  containerRef: FrameMutableRef<HTMLDivElement | null>;
  frameStatesRef: FrameMutableRef<Map<string, FrameState>>;
  framesRef: FrameMutableRef<FrameData[]>;
  globalEffectModeRef: FrameMutableRef<EffectMode>;
  globalStepBadgeAutoModeRef: FrameMutableRef<boolean>;
  globalStepBadgeSettingsRef: FrameMutableRef<GlobalStepBadgeSettings>;
  highlighterSettingsCacheRef: FrameMutableRef<HighlighterSettings | null>;
  isClearingRef: FrameMutableRef<boolean>;
  linkedElementsRef: FrameMutableRef<Map<string, HTMLElement>>;
  prevFrameStatesRef: FrameMutableRef<Map<string, FrameState>>;
  prevFramesRef: FrameMutableRef<FrameData[]>;
  rootsRef: FrameMutableRef<Map<string, Root>>;
  sessionBlurSettingsRef: FrameMutableRef<BlurSettings>;
  sessionCalloutStyleRef: FrameMutableRef<Partial<CalloutSettings> | null>;
  sessionFocusSettingsRef: FrameMutableRef<FocusSettings>;
  sessionStepBadgeTemplateRef: FrameMutableRef<StepBadgeSettings | null>;
  stepBadgeOrderRef: FrameMutableRef<Map<string, number>>;
}

export interface FrameMutations {
  addAutoBlurFrames: (input: AutoBlurApplyInput) => {
    addedCount: number;
    skippedCount: number;
  };
  addFrame: (element: HTMLElement) => FrameData;
  clearAutoBlurFrames: (input: AutoBlurClearInput) => { removedCount: number };
  clearFrames: () => void;
  removeFrame: (frameId: string) => void;
  syncAutoBlurFrames: (input: AutoBlurSyncInput) => {
    addedCount: number;
    removedCount: number;
    skippedCount: number;
  };
  syncFocusOpacity: (sourceFrameId: string, newOpacity: number) => void;
  updateFrame: (frameId: string, newFrame: FrameData) => void;
  updateFrameEffect: (frameId: string, mode: EffectMode) => void;
}

export type UpdateFrameStepBadge = (frameId: string, settings: Partial<StepBadgeSettings>) => void;
export type RecalculateStepBadges = (excludeFrameId?: string) => void;
export type RecalculateStepBadgesRef = MutableRefObject<RecalculateStepBadges>;
export type WithHistoryCommit = <T extends (...args: never[]) => unknown>(action: T) => T;
