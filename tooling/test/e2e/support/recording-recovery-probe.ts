import { createRecordingStagingCoordinator } from '../../../../apps/extension/src/composition/persistence/recordings/staging';
import { createLiveRecordingArtifactSession } from '../../../../apps/extension/src/offscreen/recording/encoding/live-artifact-session';
import { createRecordingArtifactSession } from '../../../../apps/extension/src/offscreen/recording/encoding/artifact-session';
import { readRecoveryRecording } from '../../../../apps/extension/src/composition/persistence/recordings/recovery';
import {
  initDB,
  RECORDING_RECOVERY_SESSIONS_STORE,
  RECORDING_RECOVERY_BLOCKS_STORE,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import {
  parseRecoveryRecording,
  initializeRecoveryEpoch,
  acquireRecoveryLock,
  commitRecoveryBlock,
  readRecoveryHeader,
} from '../../../../apps/extension/src/composition/persistence/recordings/recovery/storage';
import { runWithPersistentDataErasureBarrier } from '../../../../apps/extension/src/composition/persistence/infrastructure/mutation-barrier';
import { eraseSniptaleDatabaseForPrivacyErasure } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import {
  recoverRecording,
  listRecoverableRecordings,
} from '../../../../apps/extension/src/workflows/video/recording-recovery';
import {
  getRecording,
  saveRecordingsBatch,
  deleteRecording,
} from '../../../../apps/extension/src/composition/persistence/recordings';
import { ASSET_ROOT_DIRECTORY_NAME } from '../../../../apps/extension/src/composition/persistence/assets/opfs-store';
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';

let active: {
  id: string;
  session:
    | Awaited<ReturnType<typeof createLiveRecordingArtifactSession>>
    | Awaited<ReturnType<typeof createRecordingArtifactSession>>;
  coordinator: Awaited<ReturnType<typeof createRecordingStagingCoordinator>>;
  timer: ReturnType<typeof setInterval>;
  stream: MediaStream;
  framesProduced(): number;
  startedAt: number;
} | null = null;
let heldIdentity: (() => Promise<void>) | null = null;
let opening: Promise<string> | null = null;
let contendedRecovery: { settled: boolean; error: string | null } | null = null;

/** Runs the production encoder and default durable staging writer on native canvas frames. */
export async function startRecording(
  container: 'mp4' | 'webm',
  engine: 'live' | 'media-recorder' = 'live'
) {
  const id = crypto.randomUUID();
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context is unavailable.');
  let frame = 0;
  const draw = () => {
    context.fillStyle = `hsl(${frame++ % 360} 70% 50%)`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    context.fillText(String(frame), 60, 60);
  };
  draw();
  const timer = setInterval(draw, 33);
  const stream = canvas.captureStream(30);
  const coordinator = await createRecordingStagingCoordinator();
  const mimeType = container === 'mp4' ? 'video/mp4' : 'video/webm';
  const common = {
    artifactId: id,
    coordinator,
    filename: `Recovery ${container}.${container}`,
    mimeType,
    stream,
  };
  const session =
    engine === 'live'
      ? await createLiveRecordingArtifactSession({
          ...common,
          encoding: {
            container,
            audioBitrate: 128000,
            audioCodec: 'opus',
            videoBitrate: 1000000,
            videoCodec: container === 'mp4' ? 'avc' : 'vp8',
            frameRate: 30,
          },
        })
      : await createRecordingArtifactSession({
          ...common,
          recorderOptions: {
            mimeType:
              container === 'mp4' ? 'video/mp4;codecs=avc1.42001e' : 'video/webm;codecs=vp8',
          },
        });
  session.setLifecycleCallbacks({ onFailure: () => undefined });
  active = {
    id,
    session,
    coordinator,
    timer,
    stream,
    framesProduced: () => frame,
    startedAt: performance.now(),
  };
  session.start();
  return id;
}

export function observedFrames() {
  return active?.framesProduced() ?? 0;
}

export function observedRecordingDuration() {
  return active ? (performance.now() - active.startedAt) / 1000 : 0;
}

/** Reads acknowledged progress without waiting for the live session's exclusive identity lock. */
export async function progress(id: string) {
  const db = await initDB();
  const entry = parseRecoveryRecording(await db.get(RECORDING_RECOVERY_SESSIONS_STORE, id));
  return entry ? { size: entry.size, count: entry.blockCount } : { size: 0, count: 0 };
}

/** The fault boundary uses production abort semantics and never requests user discard. */
export async function failRecording() {
  if (!active) throw new Error('No recording is active.');
  clearInterval(active.timer);
  await active.session.abort();
  await active.coordinator.abort();
  active.stream.getTracks().forEach((track) => track.stop());
  active = null;
}

/** Complete native encoding and publish with the same staged asset and guard as recording finalization. */
export async function saveActiveRecording() {
  if (!active) throw new Error('No recording is active.');
  const current = active;
  const artifact = await current.session.stop();
  try {
    await saveRecordingsBatch([
      {
        id: current.id,
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        preparedAsset: artifact.asset,
        recoverySource: artifact.recoverySource,
      },
    ]);
  } finally {
    clearInterval(current.timer);
    current.stream.getTracks().forEach((track) => track.stop());
    await current.coordinator.delete();
    active = null;
  }
  const recording = await getRecording(current.id);
  if (!recording || recording.file.size === 0) throw new Error('Saved recording is unavailable.');
  return { id: current.id, size: recording.file.size };
}

/** Damage only the owned fixture's canonical file, leaving strict recovery blocks intact. */
export async function damageCanonicalRecording(id: string, fault: 'missing' | 'truncated') {
  const recording = await getRecording(id);
  if (!recording) throw new Error('Canonical recording is unavailable before the fault.');
  const root = await navigator.storage.getDirectory();
  const assets = await root.getDirectoryHandle(ASSET_ROOT_DIRECTORY_NAME);
  const objects = await assets.getDirectoryHandle('objects');
  if (fault === 'missing') {
    await objects.removeEntry(recording.assetId);
  } else {
    const handle = await objects.getFileHandle(recording.assetId);
    const writer = await handle.createWritable({ keepExistingData: true });
    await writer.truncate(Math.max(0, recording.size - 1));
    await writer.close();
  }
  return (await getRecording(id)) === undefined;
}

/** Exercise admitted canonical deletion instead of manipulating recovery stores directly. */
export async function deleteSavedRecording(id: string) {
  await deleteRecording(id);
  const db = await initDB();
  return {
    canonicalMissing: (await getRecording(id)) === undefined,
    headerMissing: (await db.get(RECORDING_RECOVERY_SESSIONS_STORE, id)) === undefined,
    remainingBlocks: await db.count(
      RECORDING_RECOVERY_BLOCKS_STORE,
      IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])
    ),
  };
}

export async function rawDigest(id: string) {
  const snapshot = await readRecoveryRecording(id);
  try {
    const bytes = await snapshot.file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return {
      size: bytes.byteLength,
      digest: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(
        ''
      ),
    };
  } finally {
    await snapshot.release();
  }
}

/** Hashes the known acknowledged prefix while a writer is still alive. */
export async function committedDigest(id: string, count: number) {
  const db = await initDB();
  const tx = db.transaction(RECORDING_RECOVERY_BLOCKS_STORE, 'readonly');
  const rows: unknown[] = await tx.store.getAll(IDBKeyRange.bound([id, 0], [id, count - 1]));
  await tx.done;
  const parts = rows.map((raw) => {
    if (
      typeof raw !== 'object' ||
      raw === null ||
      !('bytes' in raw) ||
      !(raw.bytes instanceof ArrayBuffer)
    )
      throw new Error('Recovery block bytes are invalid.');
    return raw.bytes;
  });
  const bytes = await new Blob(parts).arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {
    count,
    size: bytes.byteLength,
    digest: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      ''
    ),
  };
}

export { listRecoverableRecordings };

/** Preserve a malformed committed suffix to prove repair never consumes original evidence. */
export async function appendIncompleteSuffix(id: string) {
  const entry = await readRecoveryHeader(id);
  const release = await acquireRecoveryLock(id, true);
  try {
    await commitRecoveryBlock(entry, new Uint8Array([0, 0, 1, 0, 77, 79, 79]).buffer);
  } finally {
    await release();
  }
}

export async function holdIdentity(id: string) {
  heldIdentity = await acquireRecoveryLock(id);
}

export async function releaseIdentity() {
  await heldIdentity?.();
  heldIdentity = null;
}

/** Capture the opening epoch before a second context releases the identity lock. */
export async function beginDelayedOpening(id: string) {
  const coordinator = await createRecordingStagingCoordinator();
  opening = coordinator
    .openArtifact({ artifactId: id, filename: 'Delayed.webm', mimeType: 'video/webm' })
    .then(async () => {
      await coordinator.abort();
      return 'created';
    })
    .catch((error) => (error instanceof Error ? error.message : 'opening refused'));
}

export async function finishDelayedOpening() {
  if (!opening) throw new Error('No delayed opening exists.');
  return opening;
}

/** Use the product database erasure boundary from a different document context. */
export async function eraseAndReinitialize() {
  await runWithPersistentDataErasureBarrier(eraseSniptaleDatabaseForPrivacyErasure);
  return initializeRecoveryEpoch();
}

/** Queue native cold admission behind the first held transition, before nested acquisitions. */
export async function startContendedRecovery(id: string) {
  const entry = (await listRecoverableRecordings()).find((candidate) => candidate.id === id);
  if (!entry) throw new Error('Recovery entry is unavailable.');
  const request = navigator.locks.request.bind(navigator.locks);
  let queued = false;
  navigator.locks.request = ((
    name: string,
    options: LockOptions,
    callback: LockGrantedCallback
  ) => {
    if (
      name === 'sniptale:persistence:privacy-erasure:transition' &&
      options.mode === 'shared' &&
      !queued
    ) {
      queued = true;
      return request(name, options, (lock) => {
        void request(name, { mode: 'exclusive' }, () => undefined);
        return callback(lock);
      });
    }
    return request(name, options, callback);
  }) as typeof navigator.locks.request;
  const state = { settled: false, error: null as string | null };
  contendedRecovery = state;
  void recoverRecording(entry)
    .catch((error) => {
      state.error = error instanceof Error ? error.message : 'Recovery failed.';
    })
    .finally(() => {
      navigator.locks.request = request;
      state.settled = true;
    });
}

export function contendedRecoveryOutcome() {
  return contendedRecovery;
}

/** Validates real decoded frames after the product recovery workflow publishes its result. */
export async function restoreAndDecode(id: string) {
  const entry = (await listRecoverableRecordings()).find((candidate) => candidate.id === id);
  if (!entry) throw new Error('Recovery entry is unavailable.');
  const attempts = await Promise.allSettled([recoverRecording(entry), recoverRecording(entry)]);
  const restored = attempts.find(
    (attempt): attempt is PromiseFulfilledResult<string> => attempt.status === 'fulfilled'
  );
  if (!restored || attempts.filter((attempt) => attempt.status === 'fulfilled').length !== 1)
    throw new Error('Recovery did not publish exactly one result.');
  const restoredId = restored.value;
  const recording = await getRecording(restoredId);
  if (!recording) throw new Error('Recovered recording is unavailable.');
  const input = new Input({ source: new BlobSource(recording.file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Recovered video track is unavailable.');
    let frames = 0;
    let lastTimestamp = 0;
    for await (const sample of new VideoSampleSink(track).samples()) {
      frames++;
      lastTimestamp = sample.timestamp;
      sample.close();
    }
    return {
      restoredId,
      frames,
      duration: lastTimestamp,
      size: recording.file.size,
      concurrentRejected: true,
    };
  } finally {
    input.dispose();
  }
}
