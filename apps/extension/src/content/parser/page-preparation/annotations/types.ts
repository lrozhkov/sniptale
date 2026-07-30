export const BROWSER_ANNOTATION_SCHEMA_VERSION = 1 as const;

export interface BrowserAnnotationViewport {
  height: number;
  width: number;
}

export interface BrowserAnnotationNodePosition {
  x: number;
  y: number;
}

export type BrowserAnnotationFrameContext =
  | { kind: 'top-document' }
  | {
      kind: 'iframe';
      name?: string;
      selector: string;
      url?: string;
    };

/** Serializable page evidence captured by the content runtime for one DOM target. */
export interface BrowserAnnotationTargetEvidence {
  fileLabel: string;
  frame: BrowserAnnotationFrameContext;
  /** Session-only locator. It may contain temporary identity and is never exported. */
  locator: string;
  nodePosition: BrowserAnnotationNodePosition;
  pageUrl: string;
  targetPath: string;
  targetRole?: string;
  targetSelector: string;
  targetText: string;
  viewport: BrowserAnnotationViewport;
}

export interface BrowserAnnotationPropertyChange {
  after: BrowserAnnotationDeclarationValue;
  before: BrowserAnnotationDeclarationValue;
  order: number;
  property: string;
}

export interface BrowserAnnotationDeclarationValue {
  priority: string;
  value: string;
}

export interface BrowserAnnotationTextChange {
  after: string;
  before: string;
}

export interface BrowserDomAnnotationRecord {
  annotationId: number;
  comment?: string;
  commentMarker?: number;
  creationOrder: number;
  evidence: BrowserAnnotationTargetEvidence;
  propertyChanges: BrowserAnnotationPropertyChange[];
  textChange?: BrowserAnnotationTextChange;
}

export interface BrowserFrameAnnotationRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface BrowserFrameAnnotationInput {
  borderPresetName?: string;
  comment?: string;
  frameId: string;
  kind: 'free' | 'linked';
  linkedElementSelector?: string;
  pageUrl: string;
  /** Visible box captured after the last evidence-relevant user frame command committed. */
  rect: BrowserFrameAnnotationRect;
  /** Viewport observed with `rect`; automatic host-layout reflow does not rewrite either field. */
  viewport: BrowserAnnotationViewport;
}

export interface BrowserFrameAnnotationRecord extends BrowserFrameAnnotationInput {
  creationOrder: number;
  frameName: string;
}

export interface BrowserAnnotationSessionSnapshot {
  domRecords: BrowserDomAnnotationRecord[];
  frameOrders: BrowserFrameAnnotationRecord[];
  nextAnnotationId: number;
  nextCommentMarker: number;
  nextCreationOrder: number;
  schemaVersion: typeof BROWSER_ANNOTATION_SCHEMA_VERSION;
}

export interface BrowserAnnotationSessionState extends BrowserAnnotationSessionSnapshot {
  revision: number;
}

/** Session-local rollback token for one synchronous producer mutation that never committed. */
export interface BrowserAnnotationFailedMutationRollbackPoint {
  readonly authority: symbol;
  readonly revision: number;
  readonly snapshot: BrowserAnnotationSessionSnapshot;
}

export interface BrowserAnnotationPropertyChangesInput {
  changes: BrowserAnnotationPropertyChange[];
  evidence: BrowserAnnotationTargetEvidence;
  target: Element;
}

export interface BrowserAnnotationTextChangeInput {
  after: string;
  before: string;
  evidence: BrowserAnnotationTargetEvidence;
  target: Element;
}

export type BrowserAnnotationTextChangesInput = readonly BrowserAnnotationTextChangeInput[];

export interface BrowserAnnotationCommentInput {
  comment: string;
  evidence: BrowserAnnotationTargetEvidence;
  target: Element;
}
