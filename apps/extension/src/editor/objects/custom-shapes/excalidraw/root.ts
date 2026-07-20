import type { EditorRichShapeArrowhead } from '../../../../features/editor/document/rich-shape';
import { createCustomShapeImportDiagnostic } from '../diagnostics';
import type { CustomShapeImportDiagnostic } from '../types';
import type {
  ExcalidrawElementModel,
  ExcalidrawImportDocumentModel,
  ExcalidrawImportItemModel,
} from './types';

interface ExcalidrawDocumentRootParseResult {
  handled: boolean;
  model?: ExcalidrawImportDocumentModel;
  diagnostic?: CustomShapeImportDiagnostic;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function parsePoints(value: unknown): readonly (readonly [number, number])[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (point): point is readonly [number, number] =>
      Array.isArray(point) &&
      point.length === 2 &&
      typeof point[0] === 'number' &&
      Number.isFinite(point[0]) &&
      typeof point[1] === 'number' &&
      Number.isFinite(point[1])
  );
}

function mapArrowhead(value: unknown): EditorRichShapeArrowhead | null {
  switch (value) {
    case 'arrow':
    case 'triangle':
      return 'triangle';
    case 'bar':
      return 'open';
    case 'dot':
    case 'circle':
      return 'oval';
    default:
      return value === null ? 'none' : null;
  }
}

function parseElement(value: unknown): ExcalidrawElementModel | null {
  if (!isRecord(value) || typeof value['type'] !== 'string') {
    return null;
  }

  return {
    id: typeof value['id'] === 'string' ? value['id'] : '',
    type: value['type'],
    x: finiteNumberOr(value['x'], 0),
    y: finiteNumberOr(value['y'], 0),
    width: finiteNumberOr(value['width'], 1),
    height: finiteNumberOr(value['height'], 1),
    angle: finiteNumberOr(value['angle'], 0),
    strokeColor: stringOrNull(value['strokeColor']),
    backgroundColor: stringOrNull(value['backgroundColor']),
    fillStyle: stringOrNull(value['fillStyle']),
    strokeWidth: nullableNumber(value['strokeWidth']),
    strokeStyle: stringOrNull(value['strokeStyle']),
    roughness: nullableNumber(value['roughness']),
    opacity: nullableNumber(value['opacity']),
    seed: nullableNumber(value['seed']),
    groupIds: stringArray(value['groupIds']),
    points: parsePoints(value['points']),
    startArrowhead: mapArrowhead(value['startArrowhead']),
    endArrowhead: mapArrowhead(value['endArrowhead']),
    text: stringOrNull(value['text']) ?? stringOrNull(value['originalText']),
    fontSize: nullableNumber(value['fontSize']),
    textAlign: stringOrNull(value['textAlign']),
    verticalAlign: stringOrNull(value['verticalAlign']),
    containerId: stringOrNull(value['containerId']),
  };
}

function parseElements(value: unknown): readonly ExcalidrawElementModel[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .map(parseElement)
    .filter((element): element is ExcalidrawElementModel => element !== null);
}

function primaryTextLabel(elements: readonly ExcalidrawElementModel[]): string | null {
  const textElements = elements
    .filter((element) => element.type === 'text' && element.text?.trim())
    .sort((left, right) => right.width * right.height - left.width * left.height);
  return textElements[0]?.text?.trim() ?? null;
}

function libraryItemName(
  value: Record<string, unknown>,
  elements: readonly ExcalidrawElementModel[],
  fallback: string
): string {
  const explicitName = stringOrNull(value['name']) ?? stringOrNull(value['title']);
  const inferredName = primaryTextLabel(elements);
  return (
    explicitName ??
    (inferredName ? `${inferredName} ${fallback.replace(/^Library item /, '')}` : fallback)
  );
}

function parseLibraryItems(value: unknown): readonly ExcalidrawImportItemModel[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((item, index): ExcalidrawImportItemModel[] => {
    const record = Array.isArray(item) ? { elements: item } : isRecord(item) ? item : null;
    if (!record) {
      return [];
    }
    const elements = parseElements(record['elements']);
    if (!elements) {
      return [];
    }
    return [
      {
        id: stringOrNull(record['id']),
        name: libraryItemName(record, elements, `Library item ${index + 1}`),
        category: stringOrNull(record['category']),
        tags: stringArray(record['tags']).concat(stringArray(record['keywords'])),
        elements,
      },
    ];
  });
}

function parseLibraryRoot(
  value: Record<string, unknown>,
  fileName: string
): ExcalidrawDocumentRootParseResult {
  const rawItems = Array.isArray(value['libraryItems']) ? value['libraryItems'] : value['library'];
  const items = parseLibraryItems(rawItems);
  return items
    ? {
        handled: true,
        model: {
          kind: 'library',
          fileName,
          libraryId: stringOrNull(value['id']),
          libraryName: stringOrNull(value['name']),
          version: stringOrNull(value['version']),
          items,
        },
      }
    : {
        handled: true,
        diagnostic: createCustomShapeImportDiagnostic(
          'invalid-excalidraw',
          'Excalidraw library requires a libraryItems or library array.'
        ),
      };
}

function parseExportRoot(
  value: Record<string, unknown>,
  fileName: string
): ExcalidrawDocumentRootParseResult {
  const elements = parseElements(value['elements']);
  return elements
    ? {
        handled: true,
        model: {
          kind: 'export',
          fileName,
          libraryId: null,
          libraryName: stringOrNull(value['name']),
          version: stringOrNull(value['version']),
          items: [
            {
              id: null,
              name: fileName.replace(/\.[^.]+$/, ''),
              category: null,
              tags: [],
              elements,
            },
          ],
        },
      }
    : {
        handled: true,
        diagnostic: createCustomShapeImportDiagnostic(
          'invalid-excalidraw',
          'Excalidraw export requires an elements array.'
        ),
      };
}

export function parseExcalidrawDocumentRoot(
  value: unknown,
  fileName: string
): ExcalidrawDocumentRootParseResult {
  if (!isRecord(value)) {
    return {
      handled: false,
      diagnostic: createCustomShapeImportDiagnostic(
        'invalid-excalidraw',
        'Excalidraw import root must be an object.'
      ),
    };
  }

  if (
    value['type'] === 'excalidrawlib' ||
    Array.isArray(value['libraryItems']) ||
    Array.isArray(value['library'])
  ) {
    return parseLibraryRoot(value, fileName);
  }
  if (value['type'] === 'excalidraw' || Array.isArray(value['elements'])) {
    return parseExportRoot(value, fileName);
  }

  return { handled: false };
}
