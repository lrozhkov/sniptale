import {
  createSha256Digest,
  createSha256BytesDigest,
  isSha256Digest,
} from '@sniptale/platform/security/digest';
import {
  collectVideoProjectHistorySources,
  type VideoProjectHistoryCapture,
  type RestoredVideoProjectHistory,
  type RestoredVideoProjectHistoryValue,
  type VideoProjectHistorySourceReference,
} from '../../../features/video/project/history-capture';
import { parseVideoProjectHistoryCheckpoint } from '../../../features/video/project/history-checkpoint';
import {
  applyVideoProjectHistoryChangeValues,
  type VideoProjectHistoryChange,
} from '../../../features/video/project/history-change';
import {
  isHydratableVideoProject,
  type VideoProjectMetadata,
} from '../../../features/video/project/validation';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../features/video/project/effect-instance';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';
import {
  collectPreparedAssetCleanupFailures,
  parseAssetRef,
  readAssetFile,
  writeBlobToAsset,
  type AssetRef,
  type PreparedAssetObject,
} from '../assets';
import { throwAssetPreparationError } from '../assets/opfs-store';
import {
  parsePersistedVideoProjectHistory,
  videoProjectHistoryAssetBindings,
  type PersistedVideoProjectHistory,
  videoProjectHistoryChangeRefs,
  videoProjectHistoryInlineBytes,
} from './history-contracts';

interface PreparedVideoProjectHistory {
  history: PersistedVideoProjectHistory;
  objects: PreparedAssetObject[];
  refs: AssetRef[];
  assetsByValue: ReadonlyMap<string, AssetRef>;
}

/** Stage owner-captured values once. Reusable references grant no native revision authority. */
export async function preparePersistedVideoProjectHistory(
  capture: VideoProjectHistoryCapture,
  reusableAssetsByValue: ReadonlyMap<string, AssetRef> = new Map(),
  formatVersion: 1 | 2 = 2
): Promise<PreparedVideoProjectHistory> {
  if (formatVersion === 2) {
    const sources = new Map<string, VideoProjectHistorySourceReference>();
    const inline = (entry: VideoProjectHistoryCapture['past'][number]) => {
      if (
        !Number.isSafeInteger(entry.bytes) ||
        entry.bytes < 0 ||
        entry.value.length > EDITOR_HISTORY_LIMITS.maxBytes ||
        new TextEncoder().encode(entry.value).byteLength !== entry.bytes
      )
        throw new Error('Captured video history size is inconsistent.');
      for (const source of entry.sources)
        sources.set(JSON.stringify([source.kind, source.id]), source);
      return { value: entry.value };
    };
    if (
      capture.version !== 1 ||
      capture.past.length + capture.future.length + (capture.recovery ? 1 : 0) >
        EDITOR_HISTORY_LIMITS.maxActions
    )
      throw new Error('Video history capture is invalid.');
    const history = parsePersistedVideoProjectHistory({
      version: 2,
      epoch: capture.epoch,
      past: capture.past.map(inline),
      future: capture.future.map(inline),
      ...(capture.recovery ? { recovery: inline(capture.recovery) } : {}),
      sources: [...sources.values()],
    });
    if (!history) throw new Error('Video history capture is invalid.');
    return { history, objects: [], refs: [], assetsByValue: new Map() };
  }
  const objects: PreparedAssetObject[] = [];
  const refs = new Map<string, AssetRef>();
  const assetsByValue = new Map<string, AssetRef>();
  const sources = new Map<string, VideoProjectHistorySourceReference>();
  let bytes = 0;
  const stage = async (entry: VideoProjectHistoryCapture['past'][number]) => {
    if (
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      entry.value.length > entry.bytes ||
      (bytes += entry.bytes) > EDITOR_HISTORY_LIMITS.maxBytes
    )
      throw new Error('Video history exceeds its byte budget.');
    for (const source of entry.sources)
      sources.set(JSON.stringify([source.kind, source.id]), source);
    const known = assetsByValue.get(entry.value) ?? reusableAssetsByValue.get(entry.value);
    let ref: AssetRef;
    if (known) {
      const parsed = parseAssetRef(known);
      if (
        !parsed ||
        parsed.mimeType !== 'application/json' ||
        parsed.size !== entry.bytes ||
        !parsed.sha256 ||
        !isSha256Digest(`sha256:${parsed.sha256}`)
      )
        throw new Error('Reusable video history reference is invalid.');
      ref = parsed;
    } else {
      const prepared = await writeBlobToAsset(
        new Blob([entry.value], { type: 'application/json' })
      );
      objects.push(prepared);
      prepared.ref.sha256 = (await createSha256Digest(entry.value)).slice('sha256:'.length);
      ref = prepared.ref;
      if (ref.size !== entry.bytes) throw new Error('Captured video history size is inconsistent.');
    }
    refs.set(ref.assetId, ref);
    assetsByValue.set(entry.value, ref);
    return { assetId: ref.assetId };
  };
  try {
    if (
      capture.version !== 1 ||
      capture.past.length + capture.future.length + (capture.recovery ? 1 : 0) >
        EDITOR_HISTORY_LIMITS.maxActions
    )
      throw new Error('Video history capture is invalid.');
    const past = [];
    const future = [];
    for (const entry of capture.past) past.push(await stage(entry));
    for (const entry of capture.future) future.push(await stage(entry));
    const recovery = capture.recovery ? await stage(capture.recovery) : undefined;
    const history = parsePersistedVideoProjectHistory({
      version: 1,
      epoch: capture.epoch,
      past,
      future,
      sources: [...sources.values()],
      ...(recovery ? { recovery } : {}),
    });
    if (!history) throw new Error('Video history reference envelope is invalid.');
    return { history, objects, refs: [...refs.values()], assetsByValue };
  } catch (error) {
    const failures = await collectPreparedAssetCleanupFailures(
      objects.map(({ ref }) => ref.assetId)
    );
    throwAssetPreparationError(error, failures, 'Video history preparation cleanup failed.');
  }
}

/** Hydrated inverse metadata and the existing immutable native backing objects. */
interface HydratedVideoProjectHistory extends RestoredVideoProjectHistory {
  assetsByValue: ReadonlyMap<string, AssetRef>;
}

/** Read each immutable object once and admit both directions before returning any history. */
export async function hydratePersistedVideoProjectHistory(args: {
  history: unknown;
  refs: readonly unknown[];
  current: VideoProjectMetadata;
}): Promise<HydratedVideoProjectHistory> {
  const history = parsePersistedVideoProjectHistory(args.history);
  if (!history) throw new Error('Stored video history reference envelope is invalid.');
  const needed = new Set(videoProjectHistoryAssetBindings(history).map((entry) => entry.assetId));
  const refs = new Map<string, AssetRef>();
  for (const raw of args.refs) {
    const ref = parseAssetRef(raw);
    if (
      !ref ||
      refs.has(ref.assetId) ||
      !needed.has(ref.assetId) ||
      ref.mimeType !== 'application/json' ||
      !ref.sha256 ||
      !isSha256Digest(`sha256:${ref.sha256}`)
    )
      throw new Error('Stored video history references are inconsistent.');
    refs.set(ref.assetId, ref);
  }
  if (refs.size !== needed.size) throw new Error('Stored video history resource is missing.');
  let bytes = videoProjectHistoryInlineBytes(history);
  for (const entry of videoProjectHistoryChangeRefs(history)) {
    bytes += refs.get(entry.assetId)!.size;
    if (bytes > EDITOR_HISTORY_LIMITS.maxBytes)
      throw new Error('Stored video history exceeds its byte budget.');
  }
  const values = new Map<string, string>();
  const changes = new Map<string, unknown>();
  const assetsByValue = new Map<string, AssetRef>();
  for (const [id, ref] of refs) {
    const file = await readAssetFile(ref, `history-${id}.json`);
    if (file.size !== ref.size || file.type !== 'application/json')
      throw new Error('Stored video history bytes are inconsistent.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if ((await createSha256BytesDigest(bytes)) !== `sha256:${ref.sha256}`)
      throw new Error('Stored video history digest does not match.');
    const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    values.set(id, value);
    changes.set(id, JSON.parse(value) as unknown);
    assetsByValue.set(value, ref);
  }
  type Entry = PersistedVideoProjectHistory['past'][number];
  const valueKey = (entry: Entry) => ('value' in entry ? entry.value : entry.assetId);
  const entryValue = (entry: Entry) =>
    'value' in entry ? entry.value : values.get(entry.assetId)!;
  const entryBytes = (entry: Entry) =>
    'value' in entry
      ? new TextEncoder().encode(entry.value).byteLength
      : refs.get(entry.assetId)!.size;
  if (history.version === 2) {
    for (const entry of [
      ...history.past,
      ...history.future,
      ...(history.recovery ? [history.recovery] : []),
    ]) {
      if (!changes.has(entry.value)) changes.set(entry.value, JSON.parse(entry.value) as unknown);
    }
  }
  let anchor = args.current;
  let recovery: RestoredVideoProjectHistoryValue | undefined;
  if (history.recovery) {
    const checkpoint = parseVideoProjectHistoryCheckpoint(
      {
        version: 1,
        projectId: args.current.id,
        past: [changes.get(valueKey(history.recovery))],
        future: [],
      },
      args.current,
      EDITOR_HISTORY_LIMITS
    );
    const change = checkpoint?.past[0];
    if (!change) throw new Error('Stored video history recovery is invalid.');
    anchor = applyVideoProjectHistoryChangeValues(args.current, change);
    if (!isHydratableVideoProject(anchor))
      throw new Error('Stored video history recovery project is invalid.');
    await verifyVideoProjectEffectSnapshotIntegrity(anchor);
    recovery = {
      change,
      value: entryValue(history.recovery),
      bytes: entryBytes(history.recovery),
      sources: collectVideoProjectHistorySources(anchor),
    };
  }
  const checkpoint = parseVideoProjectHistoryCheckpoint(
    {
      version: 1,
      projectId: args.current.id,
      past: history.past.map((entry) => changes.get(valueKey(entry))),
      future: history.future.map((entry) => changes.get(valueKey(entry))),
    },
    anchor,
    EDITOR_HISTORY_LIMITS
  );
  if (!checkpoint) throw new Error('Stored video history metadata is invalid.');
  const expectedSources = new Set<string>();
  for (const source of recovery?.sources ?? [])
    expectedSources.add(JSON.stringify([source.kind, source.id]));
  const restore = async (
    entries: readonly Entry[],
    parsed: readonly VideoProjectHistoryChange[],
    backwards: boolean
  ) => {
    let project = anchor;
    const restored: RestoredVideoProjectHistoryValue[] = [];
    const indices = entries.map((_, index) => index);
    if (backwards) indices.reverse();
    for (const index of indices) {
      const change = parsed[index]!;
      project = applyVideoProjectHistoryChangeValues(project, change);
      if (!isHydratableVideoProject(project))
        throw new Error('Stored video history native project is invalid.');
      await verifyVideoProjectEffectSnapshotIntegrity(project);
      const sources = collectVideoProjectHistorySources(project);
      for (const source of sources) expectedSources.add(JSON.stringify([source.kind, source.id]));
      restored[index] = {
        change,
        value: entryValue(entries[index]!),
        bytes: entryBytes(entries[index]!),
        sources,
      };
    }
    return restored;
  };
  const past = await restore(history.past, checkpoint.past, true);
  const future = await restore(history.future, checkpoint.future, false);
  if (
    history.sources.length !== expectedSources.size ||
    history.sources.some((source) => !expectedSources.has(JSON.stringify([source.kind, source.id])))
  )
    throw new Error('Stored video history source closure is inconsistent.');
  return {
    projectId: args.current.id,
    epoch: history.epoch,
    past,
    future,
    assetsByValue,
    ...(recovery ? { recovery } : {}),
  };
}
