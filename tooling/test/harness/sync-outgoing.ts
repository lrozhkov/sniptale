import {
  commitPreparedOutgoingOperation,
  loadPreparedOutgoingOperation,
  preparedOutgoingOperationKey,
  type PreparedOutgoingOperationDraft,
} from '../../../apps/extension/src/composition/persistence/sync-capture/outgoing';
import { parseSyncCaptureRecord } from '../../../apps/extension/src/composition/persistence/sync-capture/guards';
import {
  initDB,
  SYNC_CAPTURE_STORE,
} from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import { readAssetFile } from '../../../apps/extension/src/composition/persistence/assets';
import { saveProjectAsset } from '../../../apps/extension/src/composition/persistence/projects';
import { deleteMediaAssetWithProjectCascade } from '../../../apps/extension/src/composition/persistence/media-library/delete-cascade';
import { digestBackupObject } from '../../../apps/extension/src/workflows/media-hub-backup/v6/shared-objects';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function hash(blob: Blob): Promise<string> {
  return digestBackupObject({
    size: blob.size,
    pipeTo: (sink, signal) => blob.stream().pipeTo(sink, signal ? { signal } : {}),
  });
}

/** Fixture bytes exercise storage identity, not the production remote protocol. */
async function draft(value: unknown, marker: string): Promise<PreparedOutgoingOperationDraft> {
  const capture = parseSyncCaptureRecord(value);
  check(
    capture?.kind === 'sync-operation' && capture.phase === 'native',
    'The native outgoing capture is missing.'
  );
  const refs =
    capture.change.kind === 'media'
      ? [capture.change.rows.ref]
      : capture.change.kind === 'video-project'
        ? capture.change.rows.refs
        : [];
  const objects = [];
  for (const [index, ref] of refs.entries()) {
    const file = await readAssetFile(ref, 'original 100%.bin');
    objects.push({
      objectId: `object-${index}`,
      filename: 'original 100%.bin',
      ref,
      sha256: await hash(file),
    });
  }
  const recordText = JSON.stringify({ operationId: capture.operationId, marker });
  return {
    version: 1,
    key: preparedOutgoingOperationKey(capture.spaceId, capture.operationId),
    createdAt: Date.now(),
    spaceId: capture.spaceId,
    connectionGeneration: capture.connectionGeneration,
    captureKey: capture.key,
    rootKey: capture.rootKey,
    generation: capture.generation,
    operationId: capture.operationId,
    recordText,
    recordSha256: await hash(new Blob([recordText])),
    objects,
  };
}

async function recreate(value: unknown) {
  const capture = parseSyncCaptureRecord(value);
  check(
    capture?.kind === 'sync-operation' &&
      capture.phase === 'native' &&
      capture.change.kind === 'media',
    'The native outgoing source is missing.'
  );
  const { rows } = capture.change;
  check(rows.media.source.kind === 'project-asset', 'The original has no native child.');
  const file = await readAssetFile(rows.ref, rows.media.filename);
  await deleteMediaAssetWithProjectCascade(capture.rootId, []);
  await saveProjectAsset(
    rows.media.source.projectAssetId,
    file,
    file.type,
    'recreated original.png'
  );
  const db = await initDB();
  const captures = (await db.getAll(SYNC_CAPTURE_STORE))
    .flatMap((raw) => {
      const parsed = parseSyncCaptureRecord(raw);
      return parsed?.kind === 'sync-operation' &&
        parsed.phase === 'native' &&
        parsed.rootKey === capture.rootKey
        ? [parsed]
        : [];
    })
    .sort((left, right) => right.generation - left.generation);
  const current = captures[0];
  check(
    current?.phase === 'native' &&
      current.change.kind === 'media' &&
      current.operationId !== capture.operationId &&
      current.generation > capture.generation,
    'Native recreation did not create a new source revision.'
  );
  return current;
}

async function verify(spaceId: string, operationId: string) {
  const record = await loadPreparedOutgoingOperation(spaceId, operationId);
  check(record, 'The prepared outgoing operation disappeared.');
  const files = [];
  for (const object of record.objects) {
    const file = await readAssetFile(object.ref, 'retained original');
    const sha256 = await hash(file);
    check(
      file.size === object.ref.size && sha256 === object.sha256,
      'Prepared outgoing bytes differ from the retained source.'
    );
    files.push({ size: file.size, sha256 });
  }
  return { record, files };
}

export const outgoingHarness = {
  draft,
  commit: commitPreparedOutgoingOperation,
  verify,
  recreate,
};
