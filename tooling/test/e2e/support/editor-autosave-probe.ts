import { openDB } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
import { createHistoryRetentionWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/history-retention.test-support';
import { inspectVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { createAutosaveCoordinator } from '@sniptale/platform/data/autosave';
import {
  readVideoWorkspace,
  commitVideoWorkspace,
} from '../../../../apps/extension/src/composition/persistence/review-workspaces/store';
import { getRecording } from '../../../../apps/extension/src/composition/persistence/recordings';
import { inspectReviewVideo } from '../../../../apps/extension/src/workflows/video-review/source';
import { historyRetentionEffectSnapshot } from './editor-history-retention-probe';
import {
  DB_NAME,
  DB_VERSION,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';

/** Seeds the retained scale fixture with real source, audio and effect bytes before mounting Gallery. */
export async function seedGallery(source: string, fragments = 112) {
  const id = 'recording:beta-v1-recording';
  const recording = await getRecording('beta-v1-recording');
  if (!recording) throw new Error('Missing real source');
  const metadata = await inspectReviewVideo(recording.file, new AbortController().signal);
  const svg = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><circle cx="120" cy="120" r="80" fill="#123456"/></svg>'
  );
  const raw: unknown = JSON.parse(source);
  if (!isRecord(raw) || !Array.isArray(raw['assets'])) throw new Error('Invalid effect fixture');
  const hash = await sha256EffectV1Bytes(svg);
  raw['assets'] = raw['assets'].map((asset: unknown) => {
    if (!isRecord(asset)) throw new Error('Invalid effect asset');
    return { ...asset, byteLength: svg.byteLength, sha256: hash };
  });
  const effectSnapshot = await historyRetentionEffectSnapshot(JSON.stringify(raw));
  const whole = createHistoryRetentionWorkspace({ effectSnapshot, fragments });
  const workspace = { ...whole, source: metadata.source };
  const admitted = inspectVideoWorkspace(workspace);
  if (!admitted.workspace || !admitted.document) throw new Error('Invalid actual-source workspace');
  const db = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  await db.put('recording_telemetry', {
    recordingId: 'beta-v1-recording',
    captureMode: 'TAB',
    createdAt: 1,
    updatedAt: 1,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [
      {
        id: 'retained-typing',
        kind: 'typing',
        startTime: 2,
        endTime: 6,
        point: null,
        data: { targetName: 'Synthetic retained input' },
      },
    ],
  });
  const objects = await (
    await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('sniptale-assets', { create: true })
  ).getDirectoryHandle('objects', { create: true });
  const audio = new Uint8Array(44 + 44100 * 2);
  const header = new DataView(audio.buffer);
  for (const [offset, text] of [
    [0, 'RIFF'],
    [8, 'WAVE'],
    [12, 'fmt '],
    [36, 'data'],
  ] as const)
    for (let index = 0; index < text.length; index++)
      header.setUint8(offset + index, text.charCodeAt(index));
  header.setUint32(4, audio.length - 8, true);
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, 44100, true);
  header.setUint32(28, 88200, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  header.setUint32(40, audio.length - 44, true);
  for (const [projectAssetId, bytes, mimeType] of [
    ['retained-effect', svg, 'image/svg+xml'],
    ['retained-voice', audio, 'audio/wav'],
    ['retained-music', audio, 'audio/wav'],
  ] as const) {
    const assetId = `autosave-${projectAssetId}`;
    const writable = await (
      await objects.getFileHandle(assetId, { create: true })
    ).createWritable();
    await writable.write(bytes);
    await writable.close();
    const digest = await sha256EffectV1Bytes(bytes);
    const tx = db.transaction(['project_assets', 'asset_refs', 'asset_owners'], 'readwrite');
    await tx
      .objectStore('project_assets')
      .put({ id: projectAssetId, assetId, mimeType, size: bytes.byteLength, createdAt: 1 });
    await tx.objectStore('asset_refs').put({
      assetId,
      mimeType,
      size: bytes.byteLength,
      createdAt: 1,
      sha256: digest,
      location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    });
    await tx
      .objectStore('asset_owners')
      .put({ assetId, ownerKind: 'project-asset', ownerId: projectAssetId, role: 'body' });
    await tx.done;
  }
  const seed = db.transaction(['video_workspaces', 'video_workspace_history'], 'readwrite');
  const history = seed.objectStore('video_workspace_history');
  for (const key of await history.index('aggregateId').getAllKeys(id)) await history.delete(key);
  await seed.objectStore('video_workspaces').put(workspace);
  await seed.done;
  db.close();
  const original = admitted.document.advancedContent.audio.original;
  const compact = await commitVideoWorkspace({
    aggregateId: id,
    expectedRevision: workspace.revision,
    expectedSourceAssetId: workspace.sourceAssetId,
    operation: {
      id: 'native-ui-cold',
      at: Date.now(),
      target: 'sourceAudio',
      before: { volume: original.volume, muted: original.muted },
      after: { volume: original.volume, muted: !original.muted },
    },
  });
  return {
    historyLength: compact.workspace.history.length,
    historyBytes: new TextEncoder().encode(JSON.stringify(compact.workspace.history)).byteLength,
    currentBytes: new TextEncoder().encode(JSON.stringify(admitted.document)).byteLength,
    source: metadata.source,
  };
}

/** Bounded native scheduling comparison; product adapters and their policy are never overridden. */
export async function compareTiming(source: string) {
  const results = [];
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  for (const policy of [
    { delay: 500, maxWait: 2000 },
    { delay: 1000, maxWait: 5000 },
    { delay: 1500, maxWait: 5000 },
  ]) {
    const fixture = await seedGallery(source);
    let snapshot = await readVideoWorkspace('recording:beta-v1-recording');
    if (!snapshot) throw new Error('Missing timing fixture');
    let latest = 0;
    let acknowledged = 0;
    let phase = 'burst';
    const authored = new Map<number, number>();
    const initial = inspectVideoWorkspace(snapshot.workspace).document;
    if (!initial) throw new Error('Invalid timing baseline');
    let original = initial.advancedContent.audio.original;
    let active = 0;
    let maxActive = 0;
    let held = false;
    let release: (() => void) | undefined;
    const commits: {
      phase: string;
      version: number;
      firstAgeAtCaptureMs: number;
      firstAgeAtAckMs: number;
      latestAgeAtAckMs: number;
      commitMs: number;
    }[] = [];
    const coordinator = createAutosaveCoordinator<
      'document',
      { version: number; phase: string; firstAt: number; capturedAt: number }
    >({
      now: () => performance.now(),
      schedule: (callback, delay) => {
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      },
      capture: () => ({
        version: latest,
        phase,
        firstAt: authored.get(acknowledged + 1) ?? performance.now(),
        capturedAt: performance.now(),
      }),
      commit: async (capture) => {
        active++;
        maxActive = Math.max(maxActive, active);
        try {
          if (held) {
            held = false;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          const start = performance.now();
          const after = { volume: 0.2 + capture.version / 1000, muted: original.muted };
          if (!snapshot) throw new Error('Missing committed timing snapshot');
          snapshot = await commitVideoWorkspace({
            aggregateId: snapshot.workspace.aggregateId,
            expectedRevision: snapshot.workspace.revision,
            expectedSourceAssetId: snapshot.workspace.sourceAssetId,
            operation: {
              id: `timing-${policy.delay}-${capture.version}`,
              at: Date.now(),
              target: 'sourceAudio',
              before: { volume: original.volume, muted: original.muted },
              after,
            },
          });
          const now = performance.now();
          commits.push({
            phase: capture.phase,
            version: capture.version,
            firstAgeAtCaptureMs: capture.capturedAt - capture.firstAt,
            firstAgeAtAckMs: now - capture.firstAt,
            latestAgeAtAckMs: now - (authored.get(capture.version) ?? now),
            commitMs: now - start,
          });
          acknowledged = capture.version;
          original = after;
          for (const version of authored.keys())
            if (version <= acknowledged) authored.delete(version);
        } finally {
          active--;
        }
      },
      classifyFailure: () => 'stop',
    });
    const request = () => {
      latest++;
      authored.set(latest, performance.now());
      coordinator.request('document', policy);
    };
    try {
      for (let index = 0; index < 4; index++) {
        request();
        await sleep(200);
      }
      await sleep(policy.delay + 50);
      await coordinator.flushCaptured(['document']);
      phase = 'continuous';
      for (let index = 0; index < 50; index++) {
        request();
        await sleep(200);
      }
      await coordinator.flushCaptured(['document']);
      phase = 'held';
      held = true;
      request();
      const heldAck = coordinator.flushCaptured(['document']);
      while (!release) await sleep(0);
      for (let index = 0; index < 4; index++) {
        request();
        await sleep(200);
      }
      release();
      await Promise.all([heldAck, coordinator.flushCaptured(['document'])]);
      const readback = await readVideoWorkspace('recording:beta-v1-recording');
      const document = readback ? inspectVideoWorkspace(readback.workspace).document : null;
      if (!document) throw new Error('Missing latest timing readback');
      results.push({
        policy,
        fixture,
        requests: latest,
        acknowledged,
        maxActive,
        commits,
        finalVolume: document.advancedContent.audio.original.volume,
        expectedVolume: 0.2 + latest / 1000,
      });
    } finally {
      coordinator.dispose();
    }
  }
  return results;
}
