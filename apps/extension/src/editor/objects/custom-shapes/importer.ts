import {
  createCustomShapeImportBudgetFailureForText,
  enforceCustomShapeImportBudget,
} from './budget';
import { parseExcalidrawCustomShapeImport } from './excalidraw/parser';
import { parseCustomShapeJson } from './json';
import { parseCustomShapeSvg } from './svg';
import type { CustomShapeImportFileInput, CustomShapeImportResult } from './types';

function extensionOf(fileName: string): string {
  return fileName.toLowerCase().split('.').pop() ?? '';
}

function emptyResult(): CustomShapeImportResult {
  return {
    ok: false,
    diagnostics: [{ code: 'empty-file', message: 'Import file is empty.', severity: 'error' }],
  };
}

export function parseCustomShapeImport(input: CustomShapeImportFileInput): CustomShapeImportResult {
  const budgetFailure = createCustomShapeImportBudgetFailureForText(input.text);
  if (budgetFailure) {
    return budgetFailure;
  }

  if (!input.text.trim()) {
    return emptyResult();
  }

  const extension = extensionOf(input.fileName);
  const mimeType = input.mimeType?.toLowerCase() ?? '';
  if (extension === 'excalidrawlib') {
    const result = parseExcalidrawCustomShapeImport({ ...input, required: true });
    return enforceCustomShapeImportBudget(input, result.result ?? emptyResult());
  }

  if (extension === 'svg' || mimeType.includes('svg')) {
    return enforceCustomShapeImportBudget(input, parseCustomShapeSvg(input));
  }

  if (extension === 'json' || mimeType.includes('json')) {
    const result = parseExcalidrawCustomShapeImport({ ...input, required: false });
    if (result.handled && result.result) {
      return enforceCustomShapeImportBudget(input, result.result);
    }
    return enforceCustomShapeImportBudget(input, parseCustomShapeJson(input));
  }

  if (input.text.trimStart().startsWith('<')) {
    return enforceCustomShapeImportBudget(input, parseCustomShapeSvg(input));
  }

  const result = parseExcalidrawCustomShapeImport({ ...input, required: false });
  return enforceCustomShapeImportBudget(
    input,
    result.handled && result.result ? result.result : parseCustomShapeJson(input)
  );
}
