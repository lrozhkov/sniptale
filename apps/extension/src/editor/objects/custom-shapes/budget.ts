import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorBuiltInShapePathCommand,
  EditorCustomShapeDefinition,
} from '../../../features/editor/document/rich-shape';
import { createCustomShapeImportDiagnostic } from './diagnostics';
import type { CustomShapeImportDiagnostic, CustomShapeImportResult } from './types';

const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_TEXT_LENGTH = 2 * 1024 * 1024;
const MAX_DEFINITIONS_PER_IMPORT = 100;
const MAX_LABEL_LENGTH = 200;
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 80;
const MAX_PATHS_PER_DEFINITION = 500;
const MAX_COMMANDS_PER_DEFINITION = 5_000;
const MAX_POLYLINE_POINTS = 5_000;
const MAX_COORDINATE_ABS = 131_072;
const MAX_VIEWBOX_SIDE = 32_768;
const MAX_VIEWBOX_AREA = 100_000_000;

function resourceBudgetDiagnostic(message: string): CustomShapeImportDiagnostic {
  return createCustomShapeImportDiagnostic('resource-budget', message);
}

export function assertCustomShapeImportFileCanBeRead(file: File): void {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Custom shape import file is too large.');
  }
}

function validateTextBudget(text: string): CustomShapeImportDiagnostic[] {
  return text.length > MAX_IMPORT_TEXT_LENGTH
    ? [resourceBudgetDiagnostic('Custom shape import text is too large.')]
    : [];
}

export function createCustomShapeImportBudgetFailureForText(
  text: string
): CustomShapeImportResult | null {
  const diagnostics = validateTextBudget(text);
  return diagnostics.length === 0 ? null : { ok: false, diagnostics };
}

function isBoundedNumber(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE_ABS;
}

function validateViewBox(
  geometry: EditorBuiltInShapeGeometryDefinition
): CustomShapeImportDiagnostic[] {
  const { viewBox } = geometry;
  const valid =
    isBoundedNumber(viewBox.minX) &&
    isBoundedNumber(viewBox.minY) &&
    viewBox.width > 0 &&
    viewBox.height > 0 &&
    viewBox.width <= MAX_VIEWBOX_SIDE &&
    viewBox.height <= MAX_VIEWBOX_SIDE &&
    viewBox.width * viewBox.height <= MAX_VIEWBOX_AREA;
  return valid ? [] : [resourceBudgetDiagnostic('Custom shape viewBox is outside import limits.')];
}

function countPathCommands(
  paths: Extract<EditorBuiltInShapeGeometryDefinition, { type: 'path' }>['paths']
): number {
  return paths.reduce((count, path) => count + path.commands.length, 0);
}

function validatePathCommand(command: EditorBuiltInShapePathCommand): boolean {
  return command.slice(1).every((value) => typeof value === 'number' && isBoundedNumber(value));
}

function validatePathGeometry(
  geometry: Extract<EditorBuiltInShapeGeometryDefinition, { type: 'path' }>
): CustomShapeImportDiagnostic[] {
  if (
    geometry.paths.length > MAX_PATHS_PER_DEFINITION ||
    countPathCommands(geometry.paths) > MAX_COMMANDS_PER_DEFINITION
  ) {
    return [resourceBudgetDiagnostic('Custom shape path geometry is too large.')];
  }

  return geometry.paths.every((path) => path.commands.every(validatePathCommand))
    ? []
    : [resourceBudgetDiagnostic('Custom shape path coordinates are outside import limits.')];
}

function validatePolylineGeometry(
  geometry: Extract<EditorBuiltInShapeGeometryDefinition, { type: 'polyline' }>
): CustomShapeImportDiagnostic[] {
  if (geometry.points.length > MAX_POLYLINE_POINTS) {
    return [resourceBudgetDiagnostic('Custom shape polyline has too many points.')];
  }

  return geometry.points.every(([x, y]) => isBoundedNumber(x) && isBoundedNumber(y))
    ? []
    : [resourceBudgetDiagnostic('Custom shape point coordinates are outside import limits.')];
}

function validateGeometryBudget(
  geometry: EditorBuiltInShapeGeometryDefinition
): CustomShapeImportDiagnostic[] {
  const viewBoxDiagnostics = validateViewBox(geometry);
  if (viewBoxDiagnostics.length > 0) {
    return viewBoxDiagnostics;
  }

  return geometry.type === 'path'
    ? validatePathGeometry(geometry)
    : validatePolylineGeometry(geometry);
}

function validateDefinitionBudget(
  definition: EditorCustomShapeDefinition
): CustomShapeImportDiagnostic[] {
  if (
    definition.label.length > MAX_LABEL_LENGTH ||
    definition.tags.length > MAX_TAGS ||
    definition.tags.some((tag) => tag.length > MAX_TAG_LENGTH)
  ) {
    return [resourceBudgetDiagnostic('Custom shape metadata is outside import limits.')];
  }

  return validateGeometryBudget(definition.geometry);
}

function validateDefinitionsBudget(
  definitions: readonly EditorCustomShapeDefinition[]
): CustomShapeImportDiagnostic[] {
  if (definitions.length > MAX_DEFINITIONS_PER_IMPORT) {
    return [resourceBudgetDiagnostic('Custom shape import contains too many definitions.')];
  }
  if (new Set(definitions.map((definition) => definition.id)).size !== definitions.length) {
    return [resourceBudgetDiagnostic('Custom shape import contains duplicate definitions.')];
  }

  return definitions.flatMap(validateDefinitionBudget);
}

export function enforceCustomShapeImportBudget(
  input: { text: string },
  result: CustomShapeImportResult
): CustomShapeImportResult {
  const diagnostics = validateTextBudget(input.text);
  if (result.ok) {
    diagnostics.push(...validateDefinitionsBudget(result.definitions));
  }

  return diagnostics.length === 0
    ? result
    : {
        ok: false,
        diagnostics,
        ...('sourceName' in result && result.sourceName ? { sourceName: result.sourceName } : {}),
      };
}
