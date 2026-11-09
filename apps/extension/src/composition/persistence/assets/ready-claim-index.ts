import {
  collectReadyJournalMediaKeys,
  readyMediaTargetKeys,
  UNKNOWN_READY_MEDIA,
  type ReadyPublicationTarget,
} from './ready-media-claims';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetReadyJournal } from './contracts';
import { parseAssetReadyJournal } from './guards';
import { collectReadyJournalAssetIds } from './retention-claims';

const INDEX_DIRECTORY = 'ready-claims-v1';
const COMPLETE = 'complete';
interface ClaimManifest {
  version: 1;
  journalId: string;
  assetIds: string[];
  mediaKeys?: string[];
  projectionVersion?: 3;
}

interface ReadyClaimLookup {
  valid: boolean;
  assetIds: Set<string>;
  journals: AssetReadyJournal[];
}

function isMissing(error: unknown): boolean {
  return (
    (isRecord(error) && error['name'] === 'NotFoundError') ||
    (error instanceof DOMException && error.name === 'NotFoundError')
  );
}
async function directory(
  parent: FileSystemDirectoryHandle,
  name: string,
  create = false
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(name, { create });
  } catch (error) {
    if (!create && isMissing(error)) return null;
    throw error;
  }
}
async function text(directory: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    return await (await (await directory.getFileHandle(name)).getFile()).text();
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
async function remove(directory: FileSystemDirectoryHandle, name: string): Promise<void> {
  try {
    await directory.removeEntry(name);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}
async function write(
  directory: FileSystemDirectoryHandle,
  name: string,
  value: string
): Promise<void> {
  let stream: FileSystemWritableFileStream | undefined;
  try {
    stream = await (
      await directory.getFileHandle(name, { create: true })
    ).createWritable({ keepExistingData: false });
    await stream.write(value);
    await stream.close();
  } catch (error) {
    // Do not remove the previous committed manifest when an overwrite fails.
    const failures: unknown[] = [error];
    if (stream) {
      try {
        await stream.abort();
      } catch (cleanup) {
        failures.push(cleanup);
      }
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Ready claim write and abort failed.', { cause: error });
    }
    throw error;
  }
}
async function filename(id: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function uniqueStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    strings.push(item);
  }
  return [...new Set(strings)];
}
function parseManifest(raw: unknown): ClaimManifest | null {
  if (!isRecord(raw) || raw['version'] !== 1 || typeof raw['journalId'] !== 'string') return null;
  const assetIds = uniqueStrings(raw['assetIds']);
  if (!assetIds) return null;
  const projectionVersion = raw['projectionVersion'];
  if (projectionVersion !== undefined && projectionVersion !== 3) return null;
  if (raw['mediaKeys'] === undefined) {
    return projectionVersion === 3 ? null : { version: 1, journalId: raw['journalId'], assetIds };
  }
  const mediaKeys = uniqueStrings(raw['mediaKeys']);
  if (!mediaKeys) return null;
  return {
    version: 1,
    journalId: raw['journalId'],
    assetIds,
    mediaKeys,
    ...(projectionVersion === 3 ? { projectionVersion: 3 } : {}),
  };
}
async function manifestAt(
  manifests: FileSystemDirectoryHandle,
  key: string
): Promise<ClaimManifest | null> {
  const value = await text(manifests, key);
  // A zero-byte handle has not committed metadata, just like an empty ready handle.
  if (value === null || value === '') return null;
  const parsed = parseManifest(JSON.parse(value));
  if (!parsed || (await filename(parsed.journalId)) !== key)
    throw new Error('Invalid ready claim manifest binding.');
  return parsed;
}
async function persist(
  index: FileSystemDirectoryHandle,
  journalId: string,
  ids: readonly string[],
  logicalKeys: readonly string[]
): Promise<void> {
  const manifests = await directory(index, 'journals', true);
  const assets = await directory(index, 'assets', true);
  if (!manifests || !assets) throw new Error('Ready claim directories are unavailable.');
  const key = await filename(journalId);
  const previous = await manifestAt(manifests, key);
  const assetIds = [...new Set([...(previous?.assetIds ?? []), ...ids])];
  const mediaKeys = [...new Set([...(previous?.mediaKeys ?? []), ...logicalKeys])];
  await write(
    manifests,
    key,
    JSON.stringify({ version: 1, projectionVersion: 3, journalId, assetIds, mediaKeys })
  );
  for (const assetId of assetIds) {
    const claims = await directory(assets, await filename(assetId), true);
    if (!claims) throw new Error('Ready asset claim directory is unavailable.');
    await write(claims, key, JSON.stringify({ version: 1, journalId, assetId }));
  }
  const media = await directory(index, 'media', true);
  if (!media) throw new Error('Ready media claim directory is unavailable.');
  for (const mediaKey of mediaKeys) {
    const claims = await directory(media, await filename(mediaKey), true);
    if (!claims) throw new Error('Ready media claim directory is unavailable.');
    await write(claims, key, JSON.stringify({ version: 1, journalId, mediaKey }));
  }
}

/** The caller holds lifecycle admission until the ready journal and completeness marker commit. */
export async function beginReadyClaimPublication(
  root: FileSystemDirectoryHandle,
  journal: AssetReadyJournal,
  readyWasAbsent: boolean
): Promise<boolean> {
  const previousIndex = await directory(root, INDEX_DIRECTORY);
  const index = previousIndex ?? (await directory(root, INDEX_DIRECTORY, true));
  if (!index) throw new Error('Ready claim index is unavailable.');
  const complete = (await text(index, COMPLETE)) === '3';
  await remove(index, COMPLETE);
  await persist(
    index,
    journal.journalId,
    collectReadyJournalAssetIds(journal),
    collectReadyJournalMediaKeys(journal)
  );
  return complete || (readyWasAbsent && previousIndex === null);
}

/** Publish completeness only after every alias and the actual ready journal are durable. */
export async function finishReadyClaimPublication(root: FileSystemDirectoryHandle): Promise<void> {
  const index = await directory(root, INDEX_DIRECTORY, true);
  if (!index) throw new Error('Ready claim index is unavailable.');
  await write(index, COMPLETE, '3');
}

async function repairManifestClaims(
  index: FileSystemDirectoryHandle,
  ready: FileSystemDirectoryHandle | null
): Promise<void> {
  const manifests = await directory(index, 'journals');
  if (!manifests) return;
  for await (const [name, handle] of manifests.entries()) {
    if (handle.kind !== 'file') throw new Error('Unknown ready claim manifest entry.');
    const manifest = await manifestAt(manifests, name);
    if (!manifest) continue;
    const mediaKeys = await repairedMediaKeys(manifest, ready);
    await persist(index, manifest.journalId, manifest.assetIds, mediaKeys);
  }
}
async function repairedMediaKeys(
  manifest: ClaimManifest,
  ready: FileSystemDirectoryHandle | null
): Promise<string[]> {
  if (manifest.projectionVersion === 3) return manifest.mediaKeys ?? [];
  const journal = await readyJournalAt(ready, manifest.journalId);
  return journal ? collectReadyJournalMediaKeys(journal) : [UNKNOWN_READY_MEDIA];
}
async function discoverReadyClaims(
  index: FileSystemDirectoryHandle,
  ready: FileSystemDirectoryHandle | null
): Promise<void> {
  if (!ready) return;
  for await (const [name, handle] of ready.entries()) {
    if (handle.kind !== 'file') throw new Error('Unknown ready journal entry.');
    const journal = await readyJournalAt(ready, name);
    if (!journal) continue;
    await persist(
      index,
      journal.journalId,
      collectReadyJournalAssetIds(journal),
      collectReadyJournalMediaKeys(journal)
    );
  }
}

/** Explicit startup/recovery preparation; candidate lookup never invokes this enumeration. */
export async function prepareReadyClaimIndex(
  root: FileSystemDirectoryHandle,
  ready: FileSystemDirectoryHandle | null
): Promise<void> {
  const index = await directory(root, INDEX_DIRECTORY, true);
  if (!index) throw new Error('Ready claim index is unavailable.');
  if ((await text(index, COMPLETE)) === '3') return;
  await remove(index, COMPLETE);
  await repairManifestClaims(index, ready);
  await discoverReadyClaims(index, ready);
  await write(index, COMPLETE, '3');
}

async function removeClaimAliases(
  aliases: FileSystemDirectoryHandle | null,
  ids: readonly string[],
  journalKey: string
): Promise<void> {
  if (!aliases) return;
  for (const id of ids) {
    const claims = await directory(aliases, await filename(id));
    if (claims) await remove(claims, journalKey);
  }
}

/** Call after journal removal. Preserve the union manifest until all aliases are removed. */
export async function removeReadyJournalClaims(
  root: FileSystemDirectoryHandle,
  journalId: string
): Promise<void> {
  const index = await directory(root, INDEX_DIRECTORY);
  if (!index) return;
  const manifests = await directory(index, 'journals');
  if (!manifests) return;
  const key = await filename(journalId);
  const manifest = await manifestAt(manifests, key);
  if (!manifest) return;
  await removeClaimAliases(await directory(index, 'assets'), manifest.assetIds, key);
  await removeClaimAliases(await directory(index, 'media'), manifest.mediaKeys ?? [], key);
  await remove(manifests, key);
}

type ClaimField = 'assetId' | 'mediaKey';
interface ClaimSelection {
  field: ClaimField;
  id: string;
}
interface SelectedClaims {
  valid: boolean;
  selectedIds: Set<string>;
  journals: Map<string, AssetReadyJournal>;
}

async function aliasJournalId(
  claims: FileSystemDirectoryHandle,
  name: string,
  selection: ClaimSelection
): Promise<string | null> {
  const value = await text(claims, name);
  const alias: unknown = value ? JSON.parse(value) : null;
  if (!isRecord(alias) || alias['version'] !== 1 || alias[selection.field] !== selection.id)
    return null;
  const journalId = alias['journalId'];
  if (typeof journalId !== 'string') return null;
  return (await filename(journalId)) === name ? journalId : null;
}
async function manifestForAlias(
  claims: FileSystemDirectoryHandle,
  manifests: FileSystemDirectoryHandle | null,
  name: string,
  selection: ClaimSelection
): Promise<ClaimManifest | null> {
  const journalId = await aliasJournalId(claims, name, selection);
  if (journalId === null || !manifests) return null;
  const manifest = await manifestAt(manifests, name);
  if (!manifest || manifest.projectionVersion !== 3 || manifest.mediaKeys === undefined)
    return null;
  if (manifest.journalId !== journalId) return null;
  const ids = selection.field === 'assetId' ? manifest.assetIds : manifest.mediaKeys;
  return ids.includes(selection.id) ? manifest : null;
}
function manifestCoversJournal(manifest: ClaimManifest, journal: AssetReadyJournal): boolean {
  if (journal.journalId !== manifest.journalId) return false;
  const assetsCovered = collectReadyJournalAssetIds(journal).every((id) =>
    manifest.assetIds.includes(id)
  );
  const mediaCovered = collectReadyJournalMediaKeys(journal).every((key) =>
    manifest.mediaKeys?.includes(key)
  );
  return assetsCovered && mediaCovered;
}
async function journalForManifest(
  ready: FileSystemDirectoryHandle | null,
  manifest: ClaimManifest
): Promise<{ valid: boolean; journal: AssetReadyJournal | null }> {
  const value = ready ? await text(ready, manifest.journalId) : null;
  if (value === null || value === '') return { valid: true, journal: null };
  const journal = parseAssetReadyJournal(JSON.parse(value));
  if (!journal) return { valid: false, journal: null };
  return { valid: manifestCoversJournal(manifest, journal), journal };
}
async function readClaimDirectory(
  claims: FileSystemDirectoryHandle,
  manifests: FileSystemDirectoryHandle | null,
  ready: FileSystemDirectoryHandle | null,
  selection: ClaimSelection
): Promise<SelectedClaims> {
  const result: SelectedClaims = { valid: true, selectedIds: new Set(), journals: new Map() };
  for await (const [name, handle] of claims.entries()) {
    result.selectedIds.add(selection.id);
    const manifest =
      handle.kind === 'file' ? await manifestForAlias(claims, manifests, name, selection) : null;
    if (!manifest) {
      result.valid = false;
      continue;
    }
    const publication = await journalForManifest(ready, manifest);
    if (!publication.valid) {
      result.valid = false;
      continue;
    }
    const journal = publication.journal;
    if (journal) result.journals.set(journal.journalId, journal);
  }
  return result;
}

/** This protocol reads only the selected aliases and their bound manifests and journals. */
async function readSelectedReadyClaims(
  root: FileSystemDirectoryHandle,
  ready: FileSystemDirectoryHandle | null,
  ids: Iterable<string>,
  field: ClaimField
): Promise<SelectedClaims> {
  const result: SelectedClaims = { valid: false, selectedIds: new Set(), journals: new Map() };
  const index = await directory(root, INDEX_DIRECTORY);
  if (!index || (await text(index, COMPLETE)) !== '3') return result;
  result.valid = true;
  const aliases = await directory(index, field === 'assetId' ? 'assets' : 'media');
  if (!aliases) return result;
  const manifests = await directory(index, 'journals');
  for (const id of new Set(ids)) {
    const claims = await directory(aliases, await filename(id));
    if (!claims) continue;
    const selected = await readClaimDirectory(claims, manifests, ready, { id, field });
    result.valid = result.valid && selected.valid;
    for (const selectedId of selected.selectedIds) result.selectedIds.add(selectedId);
    for (const [journalId, journal] of selected.journals) result.journals.set(journalId, journal);
  }
  return result;
}

/** Read selected physical claims under the caller's lifecycle hold. */
export async function readTargetReadyClaims(
  root: FileSystemDirectoryHandle,
  ready: FileSystemDirectoryHandle | null,
  ids: Iterable<string>
): Promise<ReadyClaimLookup> {
  const result = await readSelectedReadyClaims(root, ready, ids, 'assetId');
  return {
    valid: result.valid,
    assetIds: result.selectedIds,
    journals: [...result.journals.values()],
  };
}

async function readyJournalAt(
  ready: FileSystemDirectoryHandle | null,
  id: string
): Promise<AssetReadyJournal | null> {
  const value = ready ? await text(ready, id) : null;
  if (value === null || value === '') return null;
  const journal = parseAssetReadyJournal(JSON.parse(value));
  if (!journal || journal.journalId !== id)
    throw new Error('Invalid legacy ready journal binding.');
  return journal;
}

/** Combined completeness covers logical roots as well as their immutable physical assets. */
export async function readTargetReadyMediaClaims(
  root: FileSystemDirectoryHandle,
  ready: FileSystemDirectoryHandle | null,
  target: ReadyPublicationTarget
): Promise<{ valid: boolean; pending: boolean; journals: AssetReadyJournal[] }> {
  const result = await readSelectedReadyClaims(
    root,
    ready,
    readyMediaTargetKeys(target),
    'mediaKey'
  );
  return {
    valid: result.valid,
    pending: result.selectedIds.size > 0,
    journals: [...result.journals.values()],
  };
}
