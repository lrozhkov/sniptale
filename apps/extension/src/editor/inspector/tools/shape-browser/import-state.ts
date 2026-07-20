import type {
  CustomShapeImportDiagnostic,
  CustomShapeImportResult,
} from '../../../objects/custom-shapes/types';
import type { ShapeBrowserImportDiagnosticCode, ShapeBrowserImportSummary } from './types';

function isShapeBrowserImportDiagnosticCode(
  code: CustomShapeImportDiagnostic['code']
): code is ShapeBrowserImportDiagnosticCode {
  switch (code) {
    case 'empty-file':
    case 'invalid-excalidraw':
    case 'invalid-json':
    case 'invalid-svg':
    case 'resource-budget':
    case 'unsafe-svg':
    case 'unsupported-element':
    case 'unsupported-geometry':
    case 'skipped-element':
      return true;
    default:
      return false;
  }
}

function countDiagnostics(
  diagnostics: readonly CustomShapeImportDiagnostic[],
  predicate: (diagnostic: CustomShapeImportDiagnostic) => boolean
): number {
  return diagnostics.filter(predicate).length;
}

function resolveLibraryName(result: CustomShapeImportResult): string | null {
  if (result.sourceName) {
    return result.sourceName;
  }
  if (!result.ok) {
    return null;
  }

  const importedSource = result.definitions.find(
    (definition) => definition.source?.type === 'manual-excalidraw-import'
  )?.source;
  return importedSource?.libraryId ?? null;
}

export function createShapeBrowserImportSummary(args: {
  fileName: string;
  result: CustomShapeImportResult;
}): ShapeBrowserImportSummary {
  const diagnostics = args.result.diagnostics.filter((diagnostic) =>
    isShapeBrowserImportDiagnosticCode(diagnostic.code)
  );
  return {
    diagnostics: diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
    })),
    importedCount: args.result.ok ? args.result.definitions.length : 0,
    libraryName: resolveLibraryName(args.result),
    skippedCount: countDiagnostics(
      diagnostics,
      (diagnostic) => diagnostic.code === 'skipped-element'
    ),
    sourceFileName: args.fileName,
    unsupportedCount: countDiagnostics(diagnostics, (diagnostic) =>
      diagnostic.code.startsWith('unsupported-')
    ),
    validationErrorCount: countDiagnostics(
      diagnostics,
      (diagnostic) => diagnostic.severity === 'error'
    ),
  };
}
