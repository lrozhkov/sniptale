import { type EditorCustomShapeDefinition } from '../../../features/editor/document/rich-shape';
import {
  normalizeEditorCustomShapeDefinition,
  parseEditorCustomShapeGeometry,
} from '../../../features/editor/document/rich-shape/custom';
import { createStableCustomShapeId } from './ids';
import type { CustomShapeImportDiagnostic, CustomShapeImportResult } from './types';

function diagnostic(
  code: CustomShapeImportDiagnostic['code'],
  message: string,
  detail?: string
): CustomShapeImportDiagnostic {
  return { code, message, severity: 'error', ...(detail ? { detail } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLooseDefinition(
  value: unknown,
  fileName: string
): EditorCustomShapeDefinition | null {
  if (!isRecord(value)) {
    return null;
  }

  const label =
    typeof value['label'] === 'string' ? value['label'] : fileName.replace(/\.[^.]+$/, '');
  const geometry = parseEditorCustomShapeGeometry(
    value['geometry'] ?? {
      type: 'path',
      viewBox: value['viewBox'],
      paths: value['paths'],
    }
  );
  if (!geometry) {
    return null;
  }

  return {
    id:
      typeof value['id'] === 'string'
        ? value['id']
        : createStableCustomShapeId(fileName, label, JSON.stringify(value)),
    label,
    category: typeof value['category'] === 'string' ? value['category'] : 'custom',
    tags: Array.isArray(value['tags'])
      ? value['tags'].filter((item): item is string => typeof item === 'string')
      : ['custom'],
    capabilities: ['fill', 'line', 'effects'],
    geometry,
  };
}

export function parseCustomShapeJson(input: {
  fileName: string;
  text: string;
}): CustomShapeImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.text) as unknown;
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'invalid-json',
          'Invalid JSON shape definition.',
          error instanceof Error ? error.message : undefined
        ),
      ],
    };
  }

  const definition =
    normalizeEditorCustomShapeDefinition(parsed) ??
    normalizeLooseDefinition(parsed, input.fileName);
  return definition
    ? { ok: true, definition, definitions: [definition], diagnostics: [] }
    : {
        ok: false,
        diagnostics: [
          diagnostic(
            'invalid-json',
            'JSON shape definition does not match the custom shape schema.'
          ),
        ],
      };
}
