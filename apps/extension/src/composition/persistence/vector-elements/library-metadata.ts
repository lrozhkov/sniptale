import {
  DEFAULT_EDITOR_VECTOR_SOURCE,
  editorVectorItemHasMembership,
  isEditorVectorCollection,
  isEditorVectorItem,
  isEditorVectorLibraryRow,
  isEditorVectorMember,
  isEditorVectorPreset,
  isEditorVectorSettings,
  type EditorVectorCollection,
  type EditorVectorItem,
  type EditorVectorItemToken,
  type EditorVectorPreset,
  type EditorVectorSettings,
} from './contracts';

const defaultEditorVectorSettings = (): EditorVectorSettings => ({
  key: 'settings',
  kind: 'settings',
  incarnation: 'unconfigured',
  revision: 0,
  baseUrl: DEFAULT_EDITOR_VECTOR_SOURCE,
  networkEnabled: true,
  disclosureAccepted: true,
  sourceGeneration: 0,
});

export function parseEditorVectorSettings(value: unknown): EditorVectorSettings {
  if (value === undefined) return defaultEditorVectorSettings();
  if (!isEditorVectorSettings(value)) throw new Error('Invalid vector source settings.');
  return value;
}

export interface EditorVectorSettingsPatch {
  baseUrl?: string;
  networkEnabled?: boolean;
  disclosureAccepted?: boolean;
}

/** Null means that the caller must refuse a superseded revision without writing. */
export function reviseEditorVectorSettings(
  raw: unknown,
  patch: EditorVectorSettingsPatch,
  expected: EditorVectorItemToken,
  incarnation: string
): EditorVectorSettings | null {
  const current = parseEditorVectorSettings(raw);
  if (current.revision !== expected.revision || current.incarnation !== expected.incarnation)
    return null;
  let baseUrl = current.baseUrl;
  if (patch.baseUrl !== undefined) {
    const url = new URL(patch.baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('Vector source requires an HTTPS base URL.');
    baseUrl = url.href.endsWith('/') ? url.href : `${url.href}/`;
  }
  const networkEnabled = patch.networkEnabled ?? current.networkEnabled;
  const disclosureAccepted = patch.disclosureAccepted ?? current.disclosureAccepted;
  if (networkEnabled && !disclosureAccepted)
    throw new Error('Vector source disclosure requires explicit acceptance.');
  const changed =
    baseUrl !== current.baseUrl ||
    networkEnabled !== current.networkEnabled ||
    disclosureAccepted !== current.disclosureAccepted;
  const next: EditorVectorSettings = {
    ...current,
    incarnation: raw === undefined ? incarnation : current.incarnation,
    revision: current.revision + 1,
    baseUrl,
    networkEnabled,
    disclosureAccepted,
    sourceGeneration: current.sourceGeneration + Number(changed),
  };
  if (!isEditorVectorSettings(next)) throw new Error('Invalid vector source settings.');
  return next;
}

export function projectEditorVectorCatalog(rows: unknown[]) {
  if (rows.some((row) => !isEditorVectorLibraryRow(row)))
    throw new Error('Invalid vector library metadata.');
  const collections = rows.filter(isEditorVectorCollection).filter((row) => !row.deleted);
  const members = rows
    .filter(isEditorVectorMember)
    .filter((row) =>
      collections.some(
        (collection) =>
          collection.id === row.collectionId && collection.incarnation === row.collectionIncarnation
      )
    );
  return {
    items: rows
      .filter(isEditorVectorItem)
      .filter(
        (item) =>
          !item.deleted &&
          (editorVectorItemHasMembership(item) ||
            members.some((member) => member.definitionId === item.definitionId))
      ),
    collections,
    members,
    presets: rows.filter(isEditorVectorPreset).filter((row) => !row.deleted),
  };
}

/** A tombstone also fences a pending publication when no backing exists yet. */
export function reviseEditorVectorItemMembership(
  raw: unknown,
  definitionId: string,
  remove: boolean,
  incarnation: string,
  now: number
): EditorVectorItem {
  if (raw !== undefined && !isEditorVectorItem(raw))
    throw new Error('Invalid vector library item.');
  const current = isEditorVectorItem(raw) ? raw : null;
  if (!remove && current) return { ...current, favorite: false, revision: current.revision + 1 };
  const next: EditorVectorItem = {
    key: `item:${definitionId}`,
    kind: 'item',
    definitionId,
    incarnation: current?.incarnation ?? incarnation,
    revision: (current?.revision ?? 0) + 1,
    deleted: true,
    imported: false,
    favorite: false,
    usedAt: null,
    name: current?.name ?? null,
    prefix: current?.prefix ?? null,
    receivedAt: current?.receivedAt ?? now,
  };
  if (!remove && !isEditorVectorItem(next)) throw new Error('Invalid vector library identity.');
  return next;
}

export function createEditorVectorCollectionMetadata(
  raw: unknown,
  input: { id: string; name: string },
  incarnation: string
): EditorVectorCollection {
  if (raw !== undefined && (!isEditorVectorCollection(raw) || !raw.deleted))
    throw new Error('Vector collection identity already exists.');
  const collection: EditorVectorCollection = {
    key: `collection:${input.id}`,
    kind: 'collection',
    id: input.id,
    name: input.name.trim(),
    incarnation,
    revision: isEditorVectorCollection(raw) ? raw.revision + 1 : 1,
    deleted: false,
  };
  if (!isEditorVectorCollection(collection)) throw new Error('Invalid vector collection.');
  return collection;
}

export function renameEditorVectorCollection(
  raw: unknown,
  incarnation: string,
  name: string
): EditorVectorCollection | null {
  if (!isEditorVectorCollection(raw) || raw.deleted || raw.incarnation !== incarnation) return null;
  const next = { ...raw, name: name.trim(), revision: raw.revision + 1 };
  if (!isEditorVectorCollection(next)) throw new Error('Invalid vector collection name.');
  return next;
}

export function reviseEditorVectorPreset(
  raw: unknown,
  input: Pick<EditorVectorPreset, 'id' | 'name' | 'style'>,
  expected: EditorVectorItemToken | null,
  incarnation: string
): EditorVectorPreset | null {
  if (raw !== undefined && !isEditorVectorPreset(raw))
    throw new Error('Invalid vector palette preset.');
  if (
    expected === null
      ? raw !== undefined
      : !isEditorVectorPreset(raw) ||
        raw.incarnation !== expected.incarnation ||
        raw.revision !== expected.revision
  )
    return null;
  const preset: EditorVectorPreset = {
    ...input,
    name: input.name.trim(),
    kind: 'preset',
    key: `preset:${input.id}`,
    incarnation: isEditorVectorPreset(raw) ? raw.incarnation : incarnation,
    revision: (isEditorVectorPreset(raw) ? raw.revision : 0) + 1,
    deleted: false,
  };
  if (!isEditorVectorPreset(preset)) throw new Error('Invalid vector palette preset.');
  return preset;
}
