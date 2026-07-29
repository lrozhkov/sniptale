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
  after: string;
  before: string;
  order: number;
  property: string;
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
  targetKey: string;
  textChange?: BrowserAnnotationTextChange;
}

export interface BrowserFrameAnnotationOrder {
  creationOrder: number;
  frameId: string;
}

export interface BrowserAnnotationSessionSnapshot {
  domRecords: BrowserDomAnnotationRecord[];
  frameOrders: BrowserFrameAnnotationOrder[];
  nextAnnotationId: number;
  nextCommentMarker: number;
  nextCreationOrder: number;
  schemaVersion: typeof BROWSER_ANNOTATION_SCHEMA_VERSION;
}

export interface BrowserAnnotationSessionState extends BrowserAnnotationSessionSnapshot {
  revision: number;
}

export interface BrowserAnnotationPropertyChangeInput {
  after: string;
  before: string;
  evidence: BrowserAnnotationTargetEvidence;
  order: number;
  property: string;
  targetKey: string;
}

export interface BrowserAnnotationTextChangeInput {
  after: string;
  before: string;
  evidence: BrowserAnnotationTargetEvidence;
  targetKey: string;
}

export interface BrowserAnnotationCommentInput {
  comment: string;
  evidence: BrowserAnnotationTargetEvidence;
  targetKey: string;
}
