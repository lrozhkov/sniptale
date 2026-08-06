import type {
  AutoBlurCategory,
  AutoBlurDetection,
} from '../../../features/highlighter/contracts/auto-blur';
import type {
  AppliedBorderSettings,
  BlurSettings,
  FrameData,
} from '../../../features/highlighter/contracts';

export interface AutoBlurTextRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface AutoBlurTextSource {
  element: HTMLElement;
  rootOffset: { x: number; y: number };
  rects: AutoBlurTextRect[];
  text: string;
  textNode: Text;
}

export interface AutoBlurMatch {
  alreadyBlurred: boolean;
  category: AutoBlurCategory;
  confidence: number;
  element: HTMLElement;
  id: string;
  rect: AutoBlurTextRect;
  value: string;
}

export interface AutoBlurScanResult {
  matches: AutoBlurMatch[];
}

export interface AutoBlurApplyTarget {
  element: HTMLElement;
  id: string;
  rect: AutoBlurTextRect;
}

export interface AutoBlurApplyResult {
  addedCount: number;
  skippedCount: number;
}

export interface AutoBlurClearInput {
  targets: AutoBlurApplyTarget[];
}

export interface AutoBlurClearResult {
  removedCount: number;
}

export interface AutoBlurSyncResult extends AutoBlurApplyResult {
  removedCount: number;
}

export interface AutoBlurScanInput {
  frames: FrameData[];
  mode?: 'current-view' | 'full-page';
}

export interface AutoBlurApplyInput {
  /** Keeps geometry measured during full-page traversal after the viewport is restored. */
  allowDeferredInitialPlacement?: boolean;
  /** Immutable appearance snapshot resolved by the initiating UI or background action. */
  borderSettings: AppliedBorderSettings;
  blurSettings: BlurSettings;
  targets: AutoBlurApplyTarget[];
}

export type AutoBlurSyncInput = AutoBlurApplyInput;

export type AutoBlurDetectionCandidate = AutoBlurDetection & {
  rect: AutoBlurTextRect;
};
