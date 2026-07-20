import type { EditorCustomShapeDefinition } from '../../../features/editor/document/rich-shape';

type CustomShapeImportDiagnosticCode =
  | 'empty-file'
  | 'invalid-excalidraw'
  | 'invalid-json'
  | 'invalid-svg'
  | 'resource-budget'
  | 'unsafe-svg'
  | 'unsupported-element'
  | 'unsupported-geometry'
  | 'skipped-element';

type CustomShapeImportDiagnosticSeverity = 'error' | 'warning';

export interface CustomShapeImportDiagnostic {
  code: CustomShapeImportDiagnosticCode;
  message: string;
  severity: CustomShapeImportDiagnosticSeverity;
  detail?: string;
}

export type CustomShapeImportResult =
  | {
      ok: true;
      definition: EditorCustomShapeDefinition;
      definitions: readonly EditorCustomShapeDefinition[];
      diagnostics: CustomShapeImportDiagnostic[];
      sourceName?: string | null;
    }
  | {
      ok: false;
      diagnostics: CustomShapeImportDiagnostic[];
      sourceName?: string | null;
    };

export interface CustomShapeImportFileInput {
  fileName: string;
  mimeType?: string;
  text: string;
}
