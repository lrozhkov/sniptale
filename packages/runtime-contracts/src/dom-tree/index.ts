// DOM Tree Parser Types - для семантического парсинга страницы

export type PageVendor = 'naumen-sd-gwt' | 'naumen-portal' | 'generic' | 'unknown';
export type PageSignalStrength = 'hard' | 'soft';
export type PageSignalSource = 'url' | 'dom' | 'payload' | 'script';
export type TargetAnchorStrategy = 'sniptale' | 'selector-chain' | 'payload-only';
export type EvidenceRefSource = 'dom' | 'virtual-dom' | 'payload' | 'schema';
export type SectionKind = 'record' | 'narrative' | 'thread' | 'results' | 'attachments';
export type DocumentBlockKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'callout'
  | 'code'
  | 'record-field'
  | 'data-table'
  | 'thread-message'
  | 'attachment';
export type ExtractionClass = 'record' | 'narrative' | 'thread' | 'results' | 'mixed' | 'unknown';
export type QualitySignalKind =
  | 'weak-root-selection'
  | 'schema-dom-mismatch'
  | 'duplicate-property-labels'
  | 'boolean-noise'
  | 'fallback-pipeline-used';

export interface PageProfileSignal {
  id: string;
  source: PageSignalSource;
  strength: PageSignalStrength;
}

export interface PageProfile {
  vendor: PageVendor;
  appFamily: string;
  pageKind: string;
  pipelineId: string;
  confidence: number;
  matchedSignals: PageProfileSignal[];
  preferredRoots: string[];
}

export interface TargetRef {
  realmId: string;
  sniptaleId?: string;
  selectors: string[];
  anchorStrategy: TargetAnchorStrategy;
  editable: boolean;
}

export interface EvidenceRef {
  source: EvidenceRefSource;
  locator: string;
  excerpt?: string;
  confidence: number;
}

export interface NodeProvenance {
  extractorId: string;
  pipelineId: string;
  profileId: string;
}

export interface PipelineTrace {
  parserNames: string[];
  registryId: string;
  rootStrategy: 'live-root' | 'preferred-root' | 'virtual-root';
}

export interface RootSelectionTrace {
  candidateSelectors: string[];
  selectedSelector?: string;
  selectedTagName?: string;
  candidateEvaluations?: RootSelectionCandidateEvaluation[];
}

export type RootSelectionCandidateSource =
  | 'preferred-root'
  | 'semantic-root'
  | 'hidden-subtree'
  | 'schema-text'
  | 'fallback-body';

export interface RootSelectionCandidateEvaluation {
  source: RootSelectionCandidateSource;
  selector?: string;
  score: number;
  textLength: number;
  linkDensity: number;
  reasons: string[];
  selected: boolean;
}

export interface PayloadTraceEntry {
  id: string;
  kind: 'json' | 'json-ld' | 'script';
  textLength: number;
  locator?: string;
  schemaTextHint?: boolean;
  source?: 'script-tag';
}

export interface TreeNode {
  type: 'section' | 'field' | 'table';
  id: string;
  selected?: boolean;
  confidence?: number;
  editable?: boolean;
  provenance?: NodeProvenance;
  targetRef?: TargetRef;
  evidence?: EvidenceRef[];
}

export interface SectionNode extends TreeNode {
  type: 'section';
  title: string;
  children: Array<FieldNode | TableNode>;
  kind?: SectionKind;
}

export type FieldContentRole = 'property' | 'paragraph' | 'list-item';

export interface FieldNode extends TreeNode {
  type: 'field';
  label: string;
  value: string;
  valueType: 'string' | 'link' | 'number' | 'boolean' | 'image' | 'status';
  contentRole?: FieldContentRole;
  linkRef?: string;
  selector?: string; // CSS селектор для применения изменений
}

export interface TableNode extends TreeNode {
  type: 'table';
  headers: string[];
  rows: TableRow[];
  excludedColumns?: string[]; // Список исключенных столбцов
}

export interface TableRow {
  id: string;
  selected: boolean;
  data: Record<string, string>;
  cellTypes?: Record<string, 'string' | 'link' | 'number' | 'boolean' | 'image' | 'status'>; // Типы значений в ячейках
  selector: string;
  confidence?: number;
  editable?: boolean;
  targetRef?: TargetRef;
  provenance?: NodeProvenance;
  evidence?: EvidenceRef[];
  attachments?: Array<{ uuid: string; src: string }>; // Вложения из Froala iframe
  // Примечание: cellRefs удален - HTMLElement в state вызывает бесконечные re-renders
  // Поиск ячеек осуществляется через data-sniptale-id атрибуты
}

export interface DocumentBlock {
  id: string;
  sectionId: string;
  kind: DocumentBlockKind;
  text?: string;
  items?: string[];
  tableRef?: string;
  targetRef?: TargetRef;
  evidence?: EvidenceRef[];
  provenance?: NodeProvenance;
}

export interface QualitySignal {
  kind: QualitySignalKind;
  severity: 'info' | 'warning';
  summary: string;
  relatedLocators?: string[];
}

// Типы для редактирования через AI
export interface FieldEdit {
  type: 'field';
  fieldId: string;
  newValue: string;
  fieldName: string;
}

export interface TableRowEdit {
  type: 'tableRow';
  rowId: string;
  columnEdits: Record<string, string>; // { "Название": "Рабочий ПК" }
}

export type AIEditChange = FieldEdit | TableRowEdit;

export interface ParsedDocumentMeta {
  detectorTrace?: PageProfileSignal[];
  payloadTrace?: PayloadTraceEntry[];
  pipelineTrace?: PipelineTrace;
  profile: PageProfile;
  rootSelection?: RootSelectionTrace;
  title: string;
  url: string;
  extractionClass?: ExtractionClass;
  qualitySignals?: QualitySignal[];
  warnings: string[];
}

// Корневой объект канонического документа
export interface ParsedDocument {
  context: string;
  title: string;
  sections?: SectionNode[];
  structure: SectionNode[];
  blocks?: DocumentBlock[];
  meta?: ParsedDocumentMeta;
}

export type ParsedDOMTree = ParsedDocument;

// Выбранные данные для отправки в AI
export interface SelectedDataForAI {
  sections: {
    title: string;
    fields: Array<{ name: string; value: string }>;
    tables?: Array<{
      headers: string[];
      rows: Array<Record<string, string>>;
    }>;
  }[];
}
