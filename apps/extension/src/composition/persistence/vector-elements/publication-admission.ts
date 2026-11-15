import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import type { EditorVectorSourceToken } from '../../../features/editor/vector-catalog';
import {
  isEditorVectorCollection,
  isEditorVectorItem,
  isEditorVectorSettings,
  type EditorVectorCollectionToken,
  type EditorVectorItem,
  type EditorVectorMember,
  type EditorVectorPublicationIntent,
} from './contracts';

/** Admission checks use evidence read within the caller's publication transaction. */
export function admitsEditorVectorSource(
  settings: unknown,
  source: EditorVectorSourceToken
): boolean {
  return (
    isEditorVectorSettings(settings) &&
    settings.networkEnabled &&
    settings.disclosureAccepted &&
    settings.incarnation === source.incarnation &&
    settings.sourceGeneration === source.generation &&
    settings.baseUrl === source.sourceId
  );
}

export function admitsEditorVectorCollection(
  collection: unknown,
  expected: EditorVectorCollectionToken
): boolean {
  return (
    isEditorVectorCollection(collection) &&
    !collection.deleted &&
    collection.incarnation === expected.incarnation
  );
}

/** A null plan means that an intervening item command superseded this publication. */
export function planEditorVectorPublicationItem(
  raw: unknown,
  definition: EditorVectorDefinition,
  intent: EditorVectorPublicationIntent,
  incarnation: string,
  now: number
): EditorVectorItem | null {
  if (raw !== undefined && !isEditorVectorItem(raw))
    throw new Error('Invalid vector library item.');
  const current = isEditorVectorItem(raw) ? raw : null;
  if (
    intent.expectedItem !== undefined &&
    (intent.expectedItem === null
      ? current !== null
      : current?.incarnation !== intent.expectedItem.incarnation ||
        current.revision !== intent.expectedItem.revision)
  )
    return null;
  const item: EditorVectorItem = current
    ? {
        ...current,
        deleted: false,
        incarnation: current.deleted ? incarnation : current.incarnation,
        revision: current.revision + 1,
      }
    : {
        key: `item:${definition.id}`,
        kind: 'item',
        definitionId: definition.id,
        incarnation,
        revision: 1,
        imported: false,
        favorite: false,
        usedAt: null,
        deleted: false,
        name: intent.name ?? definition.provenance.name,
        prefix: definition.provenance.prefix,
        receivedAt: now,
      };
  if (intent.kind === 'used') item.usedAt = now;
  if (intent.kind === 'favorite') item.favorite = true;
  if (intent.kind === 'import' && !intent.collection) item.imported = true;
  return item;
}

export function planEditorVectorPublicationMember(
  definitionId: string,
  collection: EditorVectorCollectionToken,
  name: string | undefined
): EditorVectorMember {
  return {
    key: `member:${collection.id}:${definitionId}`,
    kind: 'member',
    definitionId,
    collectionId: collection.id,
    collectionIncarnation: collection.incarnation,
    name: name ?? null,
  };
}
