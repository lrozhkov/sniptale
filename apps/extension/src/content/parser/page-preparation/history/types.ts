import type {
  BlurSettings,
  BorderPreset,
  EffectMode,
  FocusSettings,
  FrameData,
  GlobalStepBadgeSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import type { BrowserAnnotationSessionSnapshot } from '../annotations';

export type PagePreparationDomElement = HTMLElement | SVGElement;

export interface SerializableFrameData extends Omit<
  FrameData,
  'borderSettings' | 'blurSettings' | 'focusSettings'
> {
  borderSettings?: BorderPreset;
  blurSettings?: BlurSettings;
  focusSettings?: FocusSettings;
}

export interface FrameSessionSnapshot {
  frames: SerializableFrameData[];
  globalEffectMode: EffectMode;
  globalStepBadgeSettings: GlobalStepBadgeSettings;
  sessionBorderPreset: BorderPreset;
  sessionBlurSettings: BlurSettings;
  sessionCalloutStyle: CalloutVisualStyle | null;
  sessionFocusSettings: FocusSettings;
  sessionStepBadgeTemplate: StepBadgeSettings | null;
  stepBadgeOrder: Array<[string, number]>;
}

export interface PagePreparationSessionSnapshot {
  annotations: BrowserAnnotationSessionSnapshot;
  frameSession: FrameSessionSnapshot;
}

export interface PageDomElementState {
  attributes: Record<string, string>;
  html: string;
}

export interface PageDomMutationPatch {
  after: PageDomElementState;
  before: PageDomElementState;
  locator: string;
  target: PagePreparationDomElement;
}

export interface PageDomMutationBatch {
  patches: PageDomMutationPatch[];
}

export interface PagePreparationHistoryDomEffectResult {
  failures: string[];
  recovery?: { effect: PagePreparationHistoryDomEffect };
  success: boolean;
}

/** Reversible owner effect retained by in-memory page-preparation history. */
export interface PagePreparationHistoryDomEffect {
  apply: (direction: 'undo' | 'redo') => PagePreparationHistoryDomEffectResult;
  hasChanges: boolean;
  recoveryOnly?: boolean;
}

export interface PagePreparationHistoryEntry {
  after: PagePreparationSessionSnapshot;
  before: PagePreparationSessionSnapshot;
  domBatch: PageDomMutationBatch | null;
  domEffect: PagePreparationHistoryDomEffect | null;
}

export interface PagePreparationHistoryBridge {
  applySnapshot: (snapshot: PagePreparationSessionSnapshot) => void;
  captureSnapshot: () => PagePreparationSessionSnapshot;
  onHistoryCleared?: () => void;
  onHistoryReachabilityChanged?: (frameIds: readonly string[]) => void;
}

export interface PagePreparationHistoryState {
  canRedo: boolean;
  canUndo: boolean;
  revision: number;
}
