import type { EditorVectorSourceToken } from '../../../features/editor/vector-catalog';
import {
  isEditorVectorDownload,
  isEditorVectorDownloadPrefix,
  type EditorVectorCollectionToken,
  type EditorVectorDownload,
  type EditorVectorDownloadToken,
} from './contracts';

export interface EditorVectorDownloadInput {
  collection: EditorVectorCollectionToken;
  source?: EditorVectorSourceToken;
  manifest: readonly string[];
  prefix?: string;
}

export const editorVectorDownloadToken = (
  row: EditorVectorDownload
): EditorVectorDownloadToken => ({
  collection: { id: row.collectionId, incarnation: row.collectionIncarnation },
  source: row.source,
  incarnation: row.incarnation,
  generation: row.generation,
});

export function prepareEditorVectorManifest(input: EditorVectorDownloadInput): string[] {
  if (input.prefix !== undefined && !isEditorVectorDownloadPrefix(input.prefix))
    throw new Error('Invalid vector download prefix.');
  const manifest = [...new Set(input.manifest)].sort();
  if (
    manifest.some(
      (name) =>
        !name ||
        name.length > 2048 ||
        Array.from(name).some((character) => character.charCodeAt(0) < 32)
    ) ||
    new TextEncoder().encode(JSON.stringify(manifest)).byteLength > 4 * 1024 * 1024
  )
    throw new Error('Vector download manifest exceeds its supported profile.');
  return manifest;
}

export function beginEditorVectorDownload(
  previous: unknown,
  input: EditorVectorDownloadInput,
  manifest: string[],
  incarnation: string
): EditorVectorDownload {
  if (previous !== undefined && !isEditorVectorDownload(previous))
    throw new Error('Invalid vector download state.');
  const prefix = input.prefix ?? (isEditorVectorDownload(previous) ? previous.prefix : undefined);
  const reusable =
    isEditorVectorDownload(previous) &&
    previous.collectionIncarnation === input.collection.incarnation &&
    previous.source?.sourceId === input.source?.sourceId &&
    (previous.prefix === undefined || previous.prefix === prefix) &&
    JSON.stringify(previous.manifest) === JSON.stringify(manifest);
  const accepted = reusable ? previous.accepted : {};
  const row: EditorVectorDownload = {
    key: `download:${input.collection.id}`,
    kind: 'download',
    ...(prefix === undefined ? {} : { prefix }),
    collectionId: input.collection.id,
    collectionIncarnation: input.collection.incarnation,
    incarnation,
    generation: isEditorVectorDownload(previous) ? previous.generation + 1 : 1,
    source: input.source ?? null,
    manifest,
    accepted,
    status: manifest.every((name) => Object.hasOwn(accepted, name)) ? 'ready' : 'downloading',
    error: null,
  };
  if (!isEditorVectorDownload(row)) throw new Error('Invalid vector download manifest.');
  return row;
}

export function matchesEditorVectorDownload(
  row: unknown,
  attempt: EditorVectorDownloadToken
): row is EditorVectorDownload {
  return (
    isEditorVectorDownload(row) &&
    row.collectionIncarnation === attempt.collection.incarnation &&
    row.incarnation === attempt.incarnation &&
    row.generation === attempt.generation
  );
}

/** Only the exact attempt can add a name; the caller commits it with the immutable backing. */
export function acceptEditorVectorDownloadName(
  raw: unknown,
  attempt: EditorVectorDownloadToken,
  name: string,
  definitionId: string
): EditorVectorDownload | null {
  if (
    !matchesEditorVectorDownload(raw, attempt) ||
    JSON.stringify(raw.source) !== JSON.stringify(attempt.source) ||
    !raw.manifest.includes(name)
  )
    return null;
  const previous = Object.hasOwn(raw.accepted, name) ? raw.accepted[name] : undefined;
  if (previous !== undefined && previous !== definitionId) return null;
  const accepted = { ...raw.accepted, [name]: definitionId };
  return {
    ...raw,
    accepted,
    status: raw.manifest.every((entry) => Object.hasOwn(accepted, entry)) ? 'ready' : 'partial',
    error: null,
  };
}

export function failEditorVectorDownload(
  row: EditorVectorDownload,
  code: string,
  cancel: boolean
): EditorVectorDownload {
  const complete = row.manifest.every((name) => Object.hasOwn(row.accepted, name));
  return {
    ...row,
    status: complete ? 'ready' : Object.keys(row.accepted).length ? 'partial' : 'error',
    error: complete ? null : code,
    generation: row.generation + Number(cancel),
  };
}

export function removeEditorVectorDownloadDefinition(
  row: EditorVectorDownload,
  definitionId: string
): EditorVectorDownload {
  return {
    ...row,
    accepted: Object.fromEntries(
      Object.entries(row.accepted).filter(([, id]) => id !== definitionId)
    ),
    status: 'partial',
    generation: row.generation + 1,
  };
}
