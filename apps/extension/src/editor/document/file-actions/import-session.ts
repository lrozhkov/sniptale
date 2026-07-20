import { isEditorDocument } from '../../../features/editor/document/guards';
import { type EditorDocument } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';

const MAX_SESSION_FILE_BYTES = 40 * 1024 * 1024;
const MAX_SESSION_TEXT_LENGTH = 50 * 1024 * 1024;
const MAX_CANVAS_SIDE = 32_768;
const MAX_CANVAS_AREA = 100_000_000;
const MAX_COORDINATE_ABS = MAX_CANVAS_SIDE * 4;
const MAX_CANVAS_JSON_DEPTH = 40;
const MAX_CANVAS_JSON_NODES = 20_000;
const MAX_FABRIC_OBJECTS = 5_000;
const MAX_RICH_SHAPES = 500;
const MAX_RICH_SHAPE_NODES = 20_000;
const MAX_ARRAY_ITEMS = 5_000;
const MAX_GENERIC_STRING_LENGTH = 200_000;
const RESOURCE_SOURCE_KEYS = new Set([
  'src',
  'source',
  'href',
  'xlink:href',
  'backgroundImageData',
]);
const POSITIVE_DIMENSION_KEYS = new Set(['fontSize', 'height', 'width']);
const NON_NEGATIVE_DIMENSION_KEYS = new Set([
  'blur',
  'cornerRadius',
  'distance',
  'radius',
  'strokeWidth',
]);
const POSITIVE_SCALE_KEYS = new Set(['scale', 'scaleX', 'scaleY']);
const UNIT_OR_PERCENT_KEYS = new Set([
  'fillOpacity',
  'fillTransparency',
  'opacity',
  'strokeOpacity',
  'transparency',
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwInvalidSession(): never {
  throw new Error(translate('editor.runtime.sessionImportInvalid'));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(translate('editor.runtime.sessionImportParseFailed'));
  }
}

function isPositiveBoundedDimension(value: number): boolean {
  return value > 0 && value <= MAX_CANVAS_SIDE;
}

function hasBoundedArea(width: number, height: number): boolean {
  return width * height <= MAX_CANVAS_AREA;
}

function isBoundedCoordinate(value: number): boolean {
  return Math.abs(value) <= MAX_COORDINATE_ABS;
}

function assertDocumentGeometry(document: EditorDocument): void {
  const dimensionPairs: Array<[number, number]> = [
    [document.canvasWidth, document.canvasHeight],
    [document.sourceWidth, document.sourceHeight],
    [document.sourceDisplayWidth, document.sourceDisplayHeight],
  ];
  if (
    !dimensionPairs.every(
      ([width, height]) =>
        isPositiveBoundedDimension(width) &&
        isPositiveBoundedDimension(height) &&
        hasBoundedArea(width, height)
    )
  ) {
    throwInvalidSession();
  }

  if (!isBoundedCoordinate(document.sourceLeft) || !isBoundedCoordinate(document.sourceTop)) {
    throwInvalidSession();
  }
}

function assertSafeImageDataUrl(value: string | null): void {
  if (value !== null && !isImageDataUrl(value)) {
    throwInvalidSession();
  }
}

function assertSafeResourceSource(key: string, value: string): void {
  if (RESOURCE_SOURCE_KEYS.has(key) && !isImageDataUrl(value)) {
    throwInvalidSession();
  }

  if (!RESOURCE_SOURCE_KEYS.has(key) && value.length > MAX_GENERIC_STRING_LENGTH) {
    throwInvalidSession();
  }
}

function isRichShapeLineWidthPath(path: readonly string[]): boolean {
  return path.slice(-3).join('.') === 'style.line.width';
}

function assertSafeNumber(key: string, value: number, path: readonly string[]): void {
  if (!Number.isFinite(value)) {
    throwInvalidSession();
  }

  if (
    POSITIVE_DIMENSION_KEYS.has(key) &&
    !isRichShapeLineWidthPath(path) &&
    !isPositiveBoundedDimension(value)
  ) {
    throwInvalidSession();
  }
  if (
    (NON_NEGATIVE_DIMENSION_KEYS.has(key) || isRichShapeLineWidthPath(path)) &&
    (value < 0 || value > MAX_CANVAS_SIDE)
  ) {
    throwInvalidSession();
  }
  if (POSITIVE_SCALE_KEYS.has(key) && (value <= 0 || value > 100)) {
    throwInvalidSession();
  }
  if (UNIT_OR_PERCENT_KEYS.has(key) && (value < 0 || value > 100)) {
    throwInvalidSession();
  }
  if (!isBoundedCoordinate(value)) {
    throwInvalidSession();
  }
}

function assertSafeImportedValue(
  value: unknown,
  depth: number,
  counter: { nodes: number },
  key = '',
  path: readonly string[] = []
): void {
  counter.nodes += 1;
  if (counter.nodes > MAX_CANVAS_JSON_NODES || depth > MAX_CANVAS_JSON_DEPTH) {
    throwInvalidSession();
  }

  if (typeof value === 'string') {
    assertSafeResourceSource(key, value);
    return;
  }
  if (typeof value === 'number') {
    assertSafeNumber(key, value, path);
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      throwInvalidSession();
    }
    value.forEach((item) => assertSafeImportedValue(item, depth + 1, counter, key, path));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  Object.entries(value).forEach(([key, child]) => {
    assertSafeImportedValue(child, depth + 1, counter, key, [...path, key]);
  });
}

function assertSafeCanvasJson(canvasJson: string): void {
  const parsedCanvas = parseJson(canvasJson);
  if (!isRecord(parsedCanvas)) {
    throwInvalidSession();
  }

  const objects = parsedCanvas['objects'];
  if (Array.isArray(objects) && objects.length > MAX_FABRIC_OBJECTS) {
    throwInvalidSession();
  }

  assertSafeImportedValue(parsedCanvas, 0, { nodes: 0 });
}

function assertSafeRichShapes(richShapes: EditorDocument['richShapes']): void {
  if (richShapes === undefined) {
    return;
  }
  if (richShapes.length > MAX_RICH_SHAPES) {
    throwInvalidSession();
  }

  const counter = { nodes: 0 };
  richShapes.forEach((shape) => {
    assertSafeImportedValue(shape, 0, counter);
    if (counter.nodes > MAX_RICH_SHAPE_NODES) {
      throwInvalidSession();
    }
  });
}

export function assertEditorSessionFileCanBeRead(file: File): void {
  if (file.size > MAX_SESSION_FILE_BYTES) {
    throwInvalidSession();
  }
}

export function parseImportedEditorDocument(text: string): EditorDocument {
  if (text.length > MAX_SESSION_TEXT_LENGTH) {
    throwInvalidSession();
  }

  const parsedDocument = parseJson(text);
  if (!isEditorDocument(parsedDocument)) {
    throwInvalidSession();
  }

  assertDocumentGeometry(parsedDocument);
  assertSafeImageDataUrl(parsedDocument.frame.backgroundImageData);
  assertSafeCanvasJson(parsedDocument.canvasJson);
  assertSafeRichShapes(parsedDocument.richShapes);
  return parsedDocument;
}
