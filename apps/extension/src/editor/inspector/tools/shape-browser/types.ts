import type {
  EditorBuiltInShapeCategory,
  EditorBuiltInShapeGeometryDefinition,
  EditorCustomShapeDefinition,
} from '../../../../features/editor/document/rich-shape';
import type { TranslationKey } from '../../../../platform/i18n/types';

export type ShapeBrowserSource = 'built-in' | 'custom' | 'imported-library';
export type ShapeBrowserSourceFilter =
  | 'all'
  | 'built-in'
  | 'custom'
  | 'imported-library'
  | 'rough-capable';

export type ShapeBrowserCategory = EditorBuiltInShapeCategory | 'custom' | 'imported';

export interface ShapeBrowserEntry {
  id: string;
  labelKey?: TranslationKey;
  labelFallback: string;
  category: ShapeBrowserCategory;
  source: ShapeBrowserSource;
  searchAliases: readonly string[];
  tags: readonly string[];
  thumbnail: EditorBuiltInShapeGeometryDefinition | null;
  insertKind: string;
  roughCapable: boolean;
  customDefinition?: EditorCustomShapeDefinition;
  disabledReason?: string | null;
}

export interface ShapeBrowserViewState {
  expandedCategories: ReadonlySet<string>;
  query: string;
  selectedEntryId: string | null;
  sourceFilter: ShapeBrowserSourceFilter;
}

export type ShapeBrowserImportDiagnosticCode =
  | 'empty-file'
  | 'invalid-excalidraw'
  | 'invalid-json'
  | 'invalid-svg'
  | 'resource-budget'
  | 'unsafe-svg'
  | 'unsupported-element'
  | 'unsupported-geometry'
  | 'skipped-element';

interface ShapeBrowserImportDiagnostic {
  code: ShapeBrowserImportDiagnosticCode;
  severity: 'error' | 'warning';
}

export interface ShapeBrowserImportSummary {
  diagnostics: readonly ShapeBrowserImportDiagnostic[];
  importedCount: number;
  libraryName: string | null;
  skippedCount: number;
  sourceFileName: string;
  unsupportedCount: number;
  validationErrorCount: number;
}

export interface ShapeBrowserImportState {
  status: 'ready' | 'empty' | 'error';
  message?: string;
  summary?: ShapeBrowserImportSummary;
}

export interface ShapeBrowserCategoryGroup {
  category: ShapeBrowserCategory;
  entries: ShapeBrowserEntry[];
}
