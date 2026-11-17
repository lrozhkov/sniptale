import { createSha256BytesDigest } from '@sniptale/platform/security/digest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  readAssetFile,
  discardPreparedAsset,
  collectPreparedAssetCleanupFailures,
  type ArchiveRestoreSession,
  type AssetRef,
} from '../../../../composition/persistence/assets';
import { parseVideoProjectEntry } from '../../../../composition/persistence/projects/read-guards';
import {
  hydratePersistedVideoProjectHistory,
  preparePersistedVideoProjectHistory,
} from '../../../../composition/persistence/projects/history-codec';
import {
  videoProjectHistoryAssetBindings,
  videoProjectHistoryChangeRefs,
} from '../../../../composition/persistence/projects/history-contracts';
import {
  createVideoProjectHistoryChange,
  applyVideoProjectHistoryChangeValues,
} from '../../../../features/video/project/history-change';
import {
  collectVideoProjectHistorySources,
  type VideoProjectHistoryCapture,
  type RestoredVideoProjectHistory,
} from '../../../../features/video/project/history-capture';
import { EDITOR_HISTORY_LIMITS } from '../../../../features/editor-history/policy';
import type { VideoProject } from '../../../../features/video/project/types';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../../features/video/project/effect-instance/integrity';
import {
  decodePortableVideoProjectAssetRefs,
  parsePortableVideoProjectMetadata,
  type PortableVideoProjectMetadata,
} from '../root-codecs/projects';
import {
  decodePortableVideoProjectHistory,
  portableVideoProjectHistoryPointers,
} from '../root-codecs/video-project-history';
import type { StagedArchiveObject } from '../staging';
import type { ArchiveRootPublisher } from '../restore';
import { restoredProjectMediaId } from './shared-project-media';
import {
  transformPortableVideoProjectHistorySources,
  transformPortableVideoProjectReferences,
} from './video-project-references';

function required(
  objects: ReadonlyMap<string, StagedArchiveObject>,
  id: string
): StagedArchiveObject {
  const object = objects.get(id);
  if (!object) throw new Error('Video project history object is missing.');
  return object;
}

/** Materialize the existing current snapshot before domain history admission or reference remapping. */
export async function readPortableVideoProjectCurrent(
  metadata: PortableVideoProjectMetadata,
  staged: readonly StagedArchiveObject[]
) {
  const objects = new Map(staged.map((object) => [object.objectId, object]));
  const snapshots = await Promise.all(
    (metadata.entry.project.effectSnapshots ?? []).map(async (snapshot) => ({
      ...snapshot,
      assets: await Promise.all(
        snapshot.assets.map(async ({ objectId, ...asset }) => {
          const file = await readAssetFile(required(objects, objectId).ref, asset.id);
          return { ...asset, blob: new Blob([await file.arrayBuffer()], { type: file.type }) };
        })
      ),
    }))
  );
  const project = decodePortableVideoProjectAssetRefs(metadata.entry.project);
  if (!isRecord(project)) throw new Error('Restored video project metadata is invalid.');
  const entry = parseVideoProjectEntry({
    ...metadata.entry,
    project: { ...project, effectSnapshots: snapshots },
  });
  if (!entry) throw new Error('Restored video project metadata is invalid.');
  await verifyVideoProjectEffectSnapshotIntegrity(entry.project);
  return entry;
}

/** A staged private body supplies one secure identity to both preparation and publication. */
export function restoredHistoryProjectAssetIds(
  metadata: PortableVideoProjectMetadata,
  staged: readonly StagedArchiveObject[],
  session: ArchiveRestoreSession
): ReadonlyMap<string, string> {
  const objects = new Map(staged.map((object) => [object.objectId, object]));
  return new Map(
    metadata.projectAssets.map((asset) => [
      asset.entry.id,
      asset.libraryMediaId
        ? restoredProjectMediaId(asset.libraryMediaId, session.rootIdMap, 'project-asset:')
        : session.strategy === 'duplicate'
          ? required(objects, asset.objectId).ref.assetId
          : asset.entry.id,
    ])
  );
}

/** Admit complete staged bytes. Optional maps select the already rebound native history. */
export async function readPortableVideoProjectHistory(args: {
  metadata: PortableVideoProjectMetadata;
  staged: readonly StagedArchiveObject[];
  current: VideoProject;
  restored?: { assetIds: ReadonlyMap<string, string>; session: ArchiveRestoreSession };
}) {
  const portable = args.metadata.history;
  if (!portable) return null;
  const objects = new Map(args.staged.map((object) => [object.objectId, object]));
  const history = decodePortableVideoProjectHistory(
    portable,
    new Map(args.staged.map((object) => [object.objectId, object.ref.assetId])),
    crypto.randomUUID(),
    args.restored
      ? transformPortableVideoProjectHistorySources(
          portable.sources,
          args.restored.assetIds,
          args.restored.session.rootIdMap,
          args.restored.session.childIdMap
        )
      : portable.sources
  );
  let bytes = 0;
  for (const { objectId } of portableVideoProjectHistoryPointers(portable)) {
    const ref = required(objects, objectId).ref;
    bytes += ref.size;
    if (!Number.isSafeInteger(ref.size) || ref.size < 0 || bytes > EDITOR_HISTORY_LIMITS.maxBytes)
      throw new Error('Video project history exceeds its byte budget.');
  }
  const refs: AssetRef[] = [];
  const needed = new Set(videoProjectHistoryAssetBindings(history).map(({ assetId }) => assetId));
  for (const object of args.staged) {
    if (!needed.has(object.ref.assetId)) continue;
    const sha256 =
      object.ref.sha256 ??
      (
        await createSha256BytesDigest(
          new Uint8Array(await (await readAssetFile(object.ref, 'history.json')).arrayBuffer())
        )
      ).slice('sha256:'.length);
    refs.push({ ...object.ref, sha256 });
  }
  const restored = await hydratePersistedVideoProjectHistory({
    current: args.current,
    history,
    refs,
  });
  return { history, refs, restored };
}

function remappedCapture(
  current: VideoProject,
  restored: RestoredVideoProjectHistory,
  assetIds: ReadonlyMap<string, string>,
  session: ArchiveRestoreSession
): VideoProjectHistoryCapture {
  const remap = (project: VideoProject) =>
    transformPortableVideoProjectReferences(
      project,
      assetIds,
      session.rootIdMap,
      session.childIdMap
    );
  const capture = (before: VideoProject, after: VideoProject) => {
    const change = createVideoProjectHistoryChange(remap(before), remap(after));
    if (!change) throw new Error('Video project history became empty during restore.');
    const value = JSON.stringify(change);
    return {
      value,
      bytes: new TextEncoder().encode(value).byteLength,
      sources: collectVideoProjectHistorySources(remap(before)),
    };
  };
  const anchor = restored.recovery
    ? applyVideoProjectHistoryChangeValues(current, restored.recovery.change)
    : current;
  const direction = (entries: RestoredVideoProjectHistory['past'], backwards: boolean) => {
    let project = anchor;
    const indices = entries.map((_, index) => index);
    if (backwards) indices.reverse();
    const result: VideoProjectHistoryCapture['past'][number][] = [];
    for (const index of indices) {
      const previous = applyVideoProjectHistoryChangeValues(project, entries[index]!.change);
      result[index] = capture(previous, project);
      project = previous;
    }
    return result;
  };
  return {
    version: 1,
    epoch: crypto.randomUUID(),
    past: direction(restored.past, true),
    future: direction(restored.future, false),
    ...(restored.recovery ? { recovery: capture(anchor, current) } : {}),
  };
}

/** Rebind immutable inverse JSON before the existing ready journal adopts all staged files. */
export const prepareVideoProjectHistoryStaged: NonNullable<
  ArchiveRootPublisher['prepareStaged']
> = async (args) => {
  const metadata = parsePortableVideoProjectMetadata(args.envelope.metadata);
  if (!metadata.history) return args;
  if (!args.session) throw new Error('Video history restore session is unavailable.');
  const current = await readPortableVideoProjectCurrent(metadata, args.staged);
  const original = await readPortableVideoProjectHistory({
    metadata,
    staged: args.staged,
    current: current.project,
  });
  if (!original) throw new Error('Video project history is missing.');
  const assetIds = restoredHistoryProjectAssetIds(metadata, args.staged, args.session);
  const capture = remappedCapture(current.project, original.restored, assetIds, args.session);
  const prepared = await preparePersistedVideoProjectHistory(capture);
  try {
    const pointers = portableVideoProjectHistoryPointers(metadata.history);
    const refs = new Map(prepared.refs.map((ref) => [ref.assetId, ref]));
    const byObjectId = new Map<string, AssetRef>();
    for (const [index, change] of videoProjectHistoryChangeRefs(prepared.history).entries()) {
      const id = pointers[index]!.objectId;
      const ref = refs.get(change.assetId)!;
      const previous = byObjectId.get(id);
      if (previous && previous.assetId !== ref.assetId)
        throw new Error('Shared history remap is inconsistent.');
      byObjectId.set(id, ref);
    }
    for (const object of args.staged)
      if (byObjectId.has(object.objectId)) await discardPreparedAsset(object.ref.assetId);
    return {
      envelope: args.envelope,
      staged: args.staged.map((object) =>
        byObjectId.has(object.objectId)
          ? { objectId: object.objectId, ref: byObjectId.get(object.objectId)! }
          : object
      ),
    };
  } catch (error) {
    const failures = await collectPreparedAssetCleanupFailures(
      prepared.objects.map(({ ref }) => ref.assetId)
    );
    if (failures.length)
      throw new AggregateError(
        [error, ...failures],
        'Video history restore preparation cleanup failed.',
        { cause: error }
      );
    throw error;
  }
};
