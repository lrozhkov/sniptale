import { initDB } from '../infrastructure/indexed-db/core';
import { EDITOR_VECTOR_LIBRARY_STORE } from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import { SupersededAssetPublicationError } from '../assets/publication';
import type { EditorVectorLibrary } from './library';
import {
  isEditorVectorCollection,
  isEditorVectorDownload,
  type EditorVectorDownload,
  type EditorVectorDownloadToken,
} from './contracts';

import {
  editorVectorDownloadToken,
  prepareEditorVectorManifest,
  beginEditorVectorDownload,
  matchesEditorVectorDownload,
  failEditorVectorDownload,
  type EditorVectorDownloadInput,
} from './download-transitions';
import { admitsEditorVectorSource, admitsEditorVectorCollection } from './publication-admission';

async function mutate<T>(
  operation: (store: {
    get(key: string): Promise<unknown>;
    put(value: unknown): Promise<unknown>;
  }) => Promise<T>
): Promise<T> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([EDITOR_VECTOR_LIBRARY_STORE], 'readwrite');
    try {
      const result = await operation(tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE));
      await tx.done;
      return result;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}
async function inspect(collectionId: string): Promise<EditorVectorDownload | null> {
  const db = await initDB();
  const tx = db.transaction([EDITOR_VECTOR_LIBRARY_STORE], 'readonly');
  const collection: unknown = await tx
    .objectStore(EDITOR_VECTOR_LIBRARY_STORE)
    .get(`collection:${collectionId}`);
  const row: unknown = await tx
    .objectStore(EDITOR_VECTOR_LIBRARY_STORE)
    .get(`download:${collectionId}`);
  await tx.done;
  if (!isEditorVectorCollection(collection) || collection.deleted) return null;
  if (row === undefined) return null;
  if (!isEditorVectorDownload(row) || row.collectionIncarnation !== collection.incarnation)
    throw new Error('Invalid vector download state.');
  return row;
}
/** Download state retains complete manifests and accepted chunks independently of a UI/network job. */
export function createEditorVectorDownloads(library: Pick<EditorVectorLibrary, 'publish'>) {
  async function begin(input: EditorVectorDownloadInput): Promise<EditorVectorDownloadToken> {
    const manifest = prepareEditorVectorManifest(input);
    return mutate(async (store) => {
      const collection: unknown = await store.get(`collection:${input.collection.id}`);
      if (!admitsEditorVectorCollection(collection, input.collection))
        throw new SupersededAssetPublicationError();
      if (input.source && !admitsEditorVectorSource(await store.get('settings'), input.source))
        throw new SupersededAssetPublicationError();
      const row = beginEditorVectorDownload(
        await store.get(`download:${input.collection.id}`),
        input,
        manifest,
        crypto.randomUUID()
      );
      await store.put(row);
      return editorVectorDownloadToken(row);
    });
  }
  async function current(token: EditorVectorDownloadToken): Promise<EditorVectorDownload> {
    const row = await inspect(token.collection.id);
    if (
      !matchesEditorVectorDownload(row, token) ||
      JSON.stringify(row.source) !== JSON.stringify(token.source)
    )
      throw new SupersededAssetPublicationError();
    return row;
  }
  async function fail(
    token: EditorVectorDownloadToken,
    code: string,
    cancel = false
  ): Promise<void> {
    if (!/^[a-z][a-z0-9-]{0,63}$/u.test(code))
      throw new Error('Invalid vector download failure code.');
    await mutate(async (store) => {
      const row: unknown = await store.get(`download:${token.collection.id}`);
      if (!matchesEditorVectorDownload(row, token)) throw new SupersededAssetPublicationError();
      await store.put(failEditorVectorDownload(row, code, cancel));
    });
  }
  async function acceptBatch(
    token: EditorVectorDownloadToken,
    entries: readonly { name: string; definition: unknown }[]
  ) {
    const manifest = (await current(token)).manifest;
    if (
      entries.length > 32 ||
      new Set(entries.map((entry) => entry.name)).size !== entries.length ||
      entries.some((entry) => !manifest.includes(entry.name))
    )
      throw new Error('Invalid vector download batch.');
    const accepted: string[] = [];
    const rejected: { name: string; code: string }[] = [];
    for (const entry of entries) {
      try {
        await library.publish(entry.definition, {
          kind: 'download',
          collection: token.collection,
          ...(token.source ? { source: token.source } : {}),
          download: token,
          name: entry.name,
        });
        accepted.push(entry.name);
      } catch (error) {
        if (error instanceof SupersededAssetPublicationError) throw error;
        rejected.push({ name: entry.name, code: 'definition-refused' });
      }
    }
    if (rejected.length) await fail(token, 'definition-refused');
    return { accepted, rejected, state: await inspect(token.collection.id) };
  }
  async function resume(token: EditorVectorDownloadToken): Promise<EditorVectorDownloadToken> {
    const row = await current(token);
    return begin({
      collection: token.collection,
      ...(token.source ? { source: token.source } : {}),
      manifest: row.manifest,
      ...(row.prefix === undefined ? {} : { prefix: row.prefix }),
    });
  }
  return {
    begin,
    inspect,
    acceptBatch,
    fail,
    cancel: (token: EditorVectorDownloadToken) => fail(token, 'cancelled', true),
    resume,
  };
}
