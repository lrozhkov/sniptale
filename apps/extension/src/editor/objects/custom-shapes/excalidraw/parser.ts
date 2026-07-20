import type { EditorCustomShapeDefinition } from '../../../../features/editor/document/rich-shape';
import { createCustomShapeImportDiagnostic } from '../diagnostics';
import type { CustomShapeImportDiagnostic, CustomShapeImportResult } from '../types';
import { createExcalidrawDefinition, createExcalidrawDefinitionLabel } from './definition';
import { collectExcalidrawContainerText, mapExcalidrawElement } from './elements';
import { parseExcalidrawDocumentRoot } from './root';
import type { ExcalidrawImportDocumentModel, ExcalidrawMappedElement } from './types';

const SUPPORTED_ELEMENT_TYPES = new Set([
  'rectangle',
  'diamond',
  'ellipse',
  'arrow',
  'line',
  'draw',
  'text',
]);

function hasMappableDrawingElement(elements: readonly { type: string }[]): boolean {
  return elements.some(
    (element) => element.type !== 'text' && SUPPORTED_ELEMENT_TYPES.has(element.type)
  );
}

function shouldMapElementGeometry(
  documentKind: ExcalidrawImportDocumentModel['kind'],
  item: { elements: readonly { type: string; containerId?: string | null }[] },
  element: { type: string; containerId?: string | null }
): boolean {
  if (!SUPPORTED_ELEMENT_TYPES.has(element.type)) {
    return false;
  }
  if (element.type !== 'text') {
    return true;
  }
  if (element.containerId) {
    return false;
  }
  return documentKind === 'export' || !hasMappableDrawingElement(item.elements);
}

function mapDocument(model: ExcalidrawImportDocumentModel): CustomShapeImportResult {
  const definitions: EditorCustomShapeDefinition[] = [];
  const diagnostics: CustomShapeImportDiagnostic[] = [];

  for (const item of model.items) {
    const result = mapDocumentItem(model, item);
    definitions.push(...result.definitions);
    diagnostics.push(...result.diagnostics);
  }

  if (definitions.length === 0) {
    return {
      ok: false,
      sourceName: model.libraryName,
      diagnostics: [
        ...diagnostics,
        createCustomShapeImportDiagnostic(
          'unsupported-geometry',
          'No supported Excalidraw elements were found.'
        ),
      ],
    };
  }
  return {
    ok: true,
    definition: definitions[0]!,
    definitions,
    diagnostics,
    sourceName: model.libraryName,
  };
}

function mapDocumentItem(
  model: ExcalidrawImportDocumentModel,
  item: ExcalidrawImportDocumentModel['items'][number]
): {
  definitions: EditorCustomShapeDefinition[];
  diagnostics: CustomShapeImportDiagnostic[];
} {
  const textByContainer = collectExcalidrawContainerText(item.elements);
  const supported = item.elements
    .filter((element) => shouldMapElementGeometry(model.kind, item, element))
    .map((element) => mapExcalidrawElement(element, textByContainer.get(element.id) ?? null))
    .filter((element): element is ExcalidrawMappedElement => element !== null);
  return {
    definitions: createDocumentItemDefinitions(model, item, supported),
    diagnostics: createUnsupportedElementDiagnostics(item.elements),
  };
}

function createDocumentItemDefinitions(
  model: ExcalidrawImportDocumentModel,
  item: ExcalidrawImportDocumentModel['items'][number],
  supported: readonly ExcalidrawMappedElement[]
): EditorCustomShapeDefinition[] {
  if (model.kind === 'library') {
    const definition = createExcalidrawDefinition({
      document: model,
      item,
      mappedElements: supported,
      label: item.name ?? 'Excalidraw item',
    });
    return definition ? [definition] : [];
  }
  return supported.flatMap((mapped, index) => {
    const label = createExcalidrawDefinitionLabel(item, mapped, index, model.kind);
    const definition = createExcalidrawDefinition({
      document: model,
      item,
      mappedElements: [mapped],
      label,
    });
    return definition ? [definition] : [];
  });
}

function createUnsupportedElementDiagnostics(
  elements: ExcalidrawImportDocumentModel['items'][number]['elements']
): CustomShapeImportDiagnostic[] {
  return elements
    .filter((element) => !SUPPORTED_ELEMENT_TYPES.has(element.type))
    .map((element) =>
      createCustomShapeImportDiagnostic(
        'unsupported-element',
        `Unsupported Excalidraw element "${element.type}" was skipped.`,
        element.id || undefined,
        'warning'
      )
    );
}

export function parseExcalidrawCustomShapeImport(input: {
  fileName: string;
  text: string;
  required: boolean;
}): { handled: boolean; result?: CustomShapeImportResult } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.text) as unknown;
  } catch (error) {
    if (!input.required) {
      return { handled: false };
    }
    return {
      handled: true,
      result: {
        ok: false,
        diagnostics: [
          createCustomShapeImportDiagnostic(
            'invalid-json',
            'Invalid Excalidraw JSON.',
            String(error)
          ),
        ],
      },
    };
  }

  const root = parseExcalidrawDocumentRoot(parsed, input.fileName);
  if (!root.handled && !input.required) {
    return { handled: false };
  }
  if (!root.model) {
    return {
      handled: true,
      result: {
        ok: false,
        diagnostics: [
          root.diagnostic ??
            createCustomShapeImportDiagnostic(
              'invalid-excalidraw',
              'JSON does not match a supported Excalidraw library or export shape.'
            ),
        ],
      },
    };
  }

  return { handled: true, result: mapDocument(root.model) };
}
