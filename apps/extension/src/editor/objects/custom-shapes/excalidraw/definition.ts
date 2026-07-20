import {
  DEFAULT_RICH_SHAPE_TEXT,
  EDITOR_RICH_SHAPE_FAMILY,
  getEditorBuiltInShapeEntry,
  type EditorCustomShapeDefinition,
} from '../../../../features/editor/document/rich-shape';
import { createStableCustomShapeId } from '../ids';
import { combineExcalidrawElementGeometries } from './geometry';
import type {
  ExcalidrawImportDocumentKind,
  ExcalidrawImportDocumentModel,
  ExcalidrawImportItemModel,
  ExcalidrawMappedElement,
} from './types';

function primaryItemText(item: ExcalidrawImportItemModel): string | null {
  const textElement = item.elements
    .filter((element) => element.type === 'text' && element.text?.trim())
    .sort((left, right) => right.width * right.height - left.width * left.height)[0];
  return textElement?.text?.trim() ?? null;
}

export function createExcalidrawDefinitionLabel(
  item: ExcalidrawImportItemModel,
  mapped: ExcalidrawMappedElement,
  index: number,
  kind: ExcalidrawImportDocumentKind
): string {
  if (item.name) {
    return item.elements.length > 1 && kind === 'export' ? `${item.name} ${index + 1}` : item.name;
  }
  return `${mapped.element.type} ${index + 1}`;
}

export function createExcalidrawDefinition(args: {
  document: ExcalidrawImportDocumentModel;
  item: ExcalidrawImportItemModel;
  mappedElements: readonly ExcalidrawMappedElement[];
  label: string;
}): EditorCustomShapeDefinition | null {
  const nativeEntry = resolveNativeLibraryReplacement(args.item, args.label);
  const geometry = nativeEntry?.geometry ?? combineExcalidrawElementGeometries(args.mappedElements);
  const first = args.mappedElements[0];
  if (!geometry || !first) {
    return null;
  }

  const metadata = createExcalidrawImportMetadata(args);
  const source = createExcalidrawDefinitionSource(args, metadata);
  const shapeKind =
    first.shapeKind === 'excalidraw-library-item' && args.document.kind === 'export'
      ? 'excalidraw-export-item'
      : first.shapeKind;
  const richShapeDefaults = createExcalidrawRichShapeDefaults({
    first,
    mappedCount: args.mappedElements.length,
    nativeEntry,
    shapeKind,
    source,
    textContent: metadata.textContent,
  });

  return createExcalidrawDefinitionResult({
    args,
    first,
    geometry,
    metadata,
    nativeEntry,
    richShapeDefaults,
    source,
  });
}

function createExcalidrawDefinitionSource(
  args: {
    document: ExcalidrawImportDocumentModel;
    item: ExcalidrawImportItemModel;
    label: string;
  },
  metadata: ReturnType<typeof createExcalidrawImportMetadata>
) {
  return {
    type: 'manual-excalidraw-import' as const,
    name: args.label,
    libraryId: args.document.libraryId,
    itemId: args.item.id ?? metadata.sourceIds[0] ?? null,
    importedAt: null,
    formatVersion: args.document.version,
  };
}

function createExcalidrawDefinitionResult(params: {
  args: {
    document: ExcalidrawImportDocumentModel;
    item: ExcalidrawImportItemModel;
    label: string;
  };
  first: ExcalidrawMappedElement;
  geometry: NonNullable<EditorCustomShapeDefinition['geometry']>;
  metadata: ReturnType<typeof createExcalidrawImportMetadata>;
  nativeEntry: ReturnType<typeof resolveNativeLibraryReplacement>;
  richShapeDefaults: NonNullable<EditorCustomShapeDefinition['richShapeDefaults']>;
  source: NonNullable<EditorCustomShapeDefinition['source']>;
}): EditorCustomShapeDefinition {
  return {
    id: createStableCustomShapeId(
      params.args.document.fileName,
      params.args.label,
      JSON.stringify({
        sourceIds: params.metadata.sourceIds,
        label: params.args.label,
        geometry: params.geometry,
      })
    ),
    label: params.args.label,
    category: params.args.item.category ?? 'imported',
    tags: [
      'excalidraw',
      'manual-import',
      params.args.document.kind,
      ...params.args.item.tags,
      ...params.metadata.elementTypes,
    ],
    geometry: params.geometry,
    capabilities:
      params.nativeEntry?.capabilities ??
      (params.first.element.type === 'line' || params.first.element.type === 'arrow'
        ? ['line', 'connectors']
        : ['fill', 'line', 'text', 'effects']),
    richShapeDefaults: params.richShapeDefaults,
    source: params.source,
    importMetadata: params.metadata,
  };
}

function createExcalidrawImportMetadata(args: {
  item: ExcalidrawImportItemModel;
  mappedElements: readonly ExcalidrawMappedElement[];
}) {
  const sourceIds = args.mappedElements.map((item) => item.element.id).filter(Boolean);
  return {
    sourceIds,
    groupIds: [...new Set(args.mappedElements.flatMap((item) => item.element.groupIds))],
    elementTypes: [...new Set(args.mappedElements.map((item) => item.element.type))],
    textContent:
      args.mappedElements.map((item) => item.text?.content ?? '').find(Boolean) ??
      primaryItemText(args.item),
  };
}

function createExcalidrawRichShapeDefaults(args: {
  first: ExcalidrawMappedElement;
  mappedCount: number;
  nativeEntry: ReturnType<typeof resolveNativeLibraryReplacement>;
  shapeKind: ExcalidrawMappedElement['shapeKind'] | 'excalidraw-export-item';
  source: {
    type: 'manual-excalidraw-import';
    name: string;
    libraryId: string | null;
    itemId: string | null;
    importedAt: null;
    formatVersion: string | null;
  };
  textContent: string | null | undefined;
}) {
  const rough = createExcalidrawRoughDefaults(args.first);
  return {
    shapeFamily:
      args.nativeEntry?.insertDefaults.shapeFamily ??
      (args.mappedCount === 1 ? args.first.shapeFamily : EDITOR_RICH_SHAPE_FAMILY.LIBRARY),
    shapeKind: args.nativeEntry?.insertDefaults.shapeKind ?? args.shapeKind,
    style: args.first.style,
    ...createExcalidrawTextDefaults(args.first, args.textContent),
    ...(rough ? { rough } : {}),
    source: args.source,
  };
}

function createExcalidrawTextDefaults(
  first: ExcalidrawMappedElement,
  textContent: string | null | undefined
) {
  if (first.text) {
    return { text: first.text };
  }
  return textContent ? { text: { ...DEFAULT_RICH_SHAPE_TEXT, content: textContent } } : {};
}

function createExcalidrawRoughDefaults(
  first: ExcalidrawMappedElement
): NonNullable<EditorCustomShapeDefinition['richShapeDefaults']>['rough'] {
  return {
    enabled: (first.element.roughness ?? 0) > 0,
    seed: first.element.seed,
    roughness: first.element.roughness ?? 1,
    bowing: 1,
    fillStyle: first.element.fillStyle === 'cross-hatch' ? 'cross-hatch' : 'hachure',
    hachureGap: 8,
    hachureAngle: -41,
    fillWeight: 1,
    fillRoughness: first.element.roughness ?? 1,
    fillBowing: 1,
    fillTransparency: first.style.fillTransparency,
    preserveVertices: true,
  };
}

function resolveNativeLibraryReplacement(item: ExcalidrawImportItemModel, label: string) {
  const searchText = [label, item.name, ...item.tags].filter(Boolean).join(' ').toLowerCase();
  if (searchText.includes('cloud') || searchText.includes('облак')) {
    return getEditorBuiltInShapeEntry('cloud-callout');
  }
  return undefined;
}
