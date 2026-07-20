import type {
  BlurSettings,
  BorderPreset,
  CalloutSettings,
  EffectMode,
  FocusSettings,
  FrameData,
  GlobalStepBadgeSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';

export interface SerializableFrameData extends Omit<
  FrameData,
  'linkedElement' | 'borderSettings' | 'blurSettings' | 'focusSettings'
> {
  borderSettings?: BorderPreset;
  blurSettings?: BlurSettings;
  focusSettings?: FocusSettings;
}

export interface FrameSessionSnapshot {
  frames: SerializableFrameData[];
  globalEffectMode: EffectMode;
  globalStepBadgeSettings: GlobalStepBadgeSettings;
  sessionBlurSettings: BlurSettings;
  sessionCalloutStyle: Partial<CalloutSettings> | null;
  sessionFocusSettings: FocusSettings;
  sessionStepBadgeTemplate: StepBadgeSettings | null;
  stepBadgeOrder: Array<[string, number]>;
}

export interface PageDomElementState {
  attributes: Record<string, string>;
  html: string;
}

export interface PageDomMutationPatch {
  after: PageDomElementState;
  before: PageDomElementState;
  locator: string;
}

export interface PageDomMutationBatch {
  patches: PageDomMutationPatch[];
}

export interface PagePreparationHistoryEntry {
  after: FrameSessionSnapshot;
  before: FrameSessionSnapshot;
  domBatch: PageDomMutationBatch | null;
}

export interface PagePreparationHistoryBridge {
  applySnapshot: (snapshot: FrameSessionSnapshot) => void;
  captureSnapshot: () => FrameSessionSnapshot;
}

export interface PagePreparationHistoryState {
  canRedo: boolean;
  canUndo: boolean;
  revision: number;
}
