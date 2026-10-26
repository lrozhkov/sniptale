import type { DrawingDocumentV1 } from '../../../../features/drawing/model';
import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import type {
  AppliedBorderSettings,
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
  borderSettings?: AppliedBorderSettings | BorderPreset;
  blurSettings?: BlurSettings;
  focusSettings?: FocusSettings;
}

export interface FrameSessionSnapshot {
  frames: SerializableFrameData[];
  globalEffectMode: EffectMode;
  globalStepBadgeSettings: GlobalStepBadgeSettings;
  sessionBorderPreset: AppliedBorderSettings | BorderPreset;
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
  /** Stable source position captured before a later rich-text edit can detach this target. */
  recoveryLocator?: string;
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
export interface DrawingRecoveryEffect {
  before: DrawingDocumentV1;
  after: DrawingDocumentV1;
}

/** Exact declaration endpoints; the style owner validates and applies these values. */
export interface PageStyleRecoveryEffect {
  selector: string;
  declarations: Array<{
    property: PageStyleProperty;
    order: number;
    before: { value: string; priority: '' | 'important' };
    after: { value: string; priority: '' | 'important' };
    beforePolicy: { source: 'inspector' };
    afterPolicy: { source: 'inspector' };
  }>;
}

export interface PagePreparationHistoryDomEffect {
  /** Data-only drawing versions for an explicit reload recovery; never executable code. */
  recovery?: DrawingRecoveryEffect;
  styleRecovery?: PageStyleRecoveryEffect;
  /** Exact live targets whose identity must survive foreign HTML replacement. */
  targets?: readonly PagePreparationDomElement[];
  apply: (direction: 'undo' | 'redo') => PagePreparationHistoryDomEffectResult;
  hasChanges: boolean;
  /** Optional factual availability probe for a document owned outside the session snapshot. */
  hasCurrentChanges?: () => boolean;
  recoveryOnly?: boolean;
}

/** Producer-owned changes within the in-memory preparation session. */
export type PagePreparationChangeScope =
  | 'annotation'
  | 'content-editing'
  | 'design-review'
  | 'drawing';

/** Independent navigation domains; page text and design share exact DOM targets. */
export type PagePreparationHistoryDomain = 'annotation' | 'drawing' | 'page-editing';

export type PagePreparationResetScope = PagePreparationChangeScope | 'all';

export interface PagePreparationHistoryEntry {
  scope: PagePreparationChangeScope;
  after: PagePreparationSessionSnapshot;
  before: PagePreparationSessionSnapshot;
  domBatch: PageDomMutationBatch | null;
  domEffect: PagePreparationHistoryDomEffect | null;
}

export interface PagePreparationHistoryBridge {
  applySnapshot: (snapshot: PagePreparationSessionSnapshot) => void;
  captureSnapshot: () => PagePreparationSessionSnapshot;
  resolveRecoveryAnnotationTarget?: (annotationId: number) => Element | null;
  resolveRecoveryFrameTarget?: (frameId: string) => Element | null;
  onRecoveryApplied?: () => void;
  createRecoveryStyleEffect?: (
    selector: string,
    value: PageStyleRecoveryEffect
  ) => PagePreparationHistoryDomEffect | null;
  onHistoryCleared?: () => void;
  onHistoryReachabilityChanged?: (frameIds: readonly string[]) => void;
}

export interface PagePreparationHistoryState {
  canRedo: boolean;
  canUndo: boolean;
  revision: number;
}

/** Data-only versions retain producer scopes without copying live DOM targets or callbacks. */
export interface PagePreparationRecovery {
  version: 1;
  entries: Array<{
    scope: PagePreparationChangeScope;
    before: PagePreparationSessionSnapshot;
    after: PagePreparationSessionSnapshot;
    patches: Array<{ selector: string; before: PageDomElementState; after: PageDomElementState }>;
    drawing: DrawingRecoveryEffect | null;
    /** Absent in packets produced before declaration recovery was supported. */
    style?: PageStyleRecoveryEffect | null;
  }>;
}
