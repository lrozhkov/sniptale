import { openDB } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { createHistoryRetentionWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/history-retention.test-support';
import { inspectVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { sameReviewWorkspaceValue } from '../../../../apps/extension/src/composition/persistence/review-workspaces/history-retention';
import {
  commitVideoWorkspace,
  readVideoWorkspace,
  saveVideoWorkspaceTyping,
} from '../../../../apps/extension/src/composition/persistence/review-workspaces/store';
import { editReviewTextFragment } from '../../../../apps/extension/src/features/video/review/text-document';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { readReviewAnnotationEffectDocument } from '../../../../apps/extension/src/features/video/review/annotation-effects/validation';
import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
import type { ReviewAnnotationEffectSnapshot } from '../../../../apps/extension/src/features/video/review/annotation-effects/types';

/** Shared neutral source registry for native history/resource retention proofs. */
export async function historyRetentionEffectSnapshot(
  source: string
): Promise<ReviewAnnotationEffectSnapshot> {
  const document = readReviewAnnotationEffectDocument(source);
  if (!document || document.assets.length !== 1) throw new Error('Invalid neutral scale effect');
  const asset = document.assets[0]!;
  if (asset.kind !== 'svg' || !asset.byteLength || !asset.sha256)
    throw new Error('Invalid neutral asset');
  const sha256 = await sha256EffectV1Bytes(new TextEncoder().encode(source));
  return {
    id: `effect:${sha256}`,
    sha256,
    source,
    schemaVersion: 'sniptale.effect.v1',
    kind: 'standalone',
    documentId: document.id,
    retainedByteLength: new TextEncoder().encode(source).byteLength + asset.byteLength,
    assets: [
      {
        id: asset.id,
        assetId: 'project-asset:retained-effect',
        kind: 'svg',
        mimeType: asset.mimeType,
        sha256: asset.sha256,
        byteLength: asset.byteLength,
      },
    ],
  };
}

/** Real browser IDB baseline; storage proof only, without editor responsiveness or OPFS claims. */
export async function probe(source: string, historyLength = 1190) {
  const wholeFixture = createHistoryRetentionWorkspace({
    effectSnapshot: await historyRetentionEffectSnapshot(source),
  });
  const fixture = {
    ...wholeFixture,
    history: wholeFixture.history.slice(0, historyLength),
    cursor: historyLength,
  };
  const fixtureBytes = new TextEncoder().encode(JSON.stringify(fixture)).byteLength;
  const startAdmission = performance.now();
  const admitted = inspectVideoWorkspace(fixture);
  const initialAdmissionMs = performance.now() - startAdmission;
  if (!admitted.workspace || !admitted.document)
    throw new Error('Invalid synthetic native scale fixture');
  const db = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  const seed = db.transaction(['media_library', 'recordings', 'video_workspaces'], 'readwrite');
  await seed.objectStore('media_library').put(betaV1Fixture.records.media_library[0]);
  await seed.objectStore('recordings').put(betaV1Fixture.records.recordings[0]);
  await seed.objectStore('video_workspaces').put(fixture);
  await seed.done;

  const originalPut = IDBObjectStore.prototype.put;
  const writes: { store: string; bytes: number }[] = [];
  IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
    writes.push({
      store: this.name,
      bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength,
    });
    return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
  };
  const longTasks: number[] = [];
  const observer = new PerformanceObserver((entries) => {
    for (const entry of entries.getEntries()) longTasks.push(entry.duration);
  });
  observer.observe({ type: 'longtask', buffered: false });
  let current = admitted.workspace;
  let original = admitted.document.advancedContent.audio.original;
  const saves: {
    elapsedMs: number;
    historyLength: number;
    writes: { store: string; bytes: number }[];
  }[] = [];
  try {
    for (let index = 0; index < 5; index++) {
      writes.length = 0;
      const start = performance.now();
      const result = await commitVideoWorkspace({
        aggregateId: current.aggregateId,
        expectedRevision: current.revision,
        expectedSourceAssetId: current.sourceAssetId,
        operation: {
          id: `native-warm-${index}`,
          at: 1191 + index,
          target: 'sourceAudio',
          before: { muted: original.muted, volume: original.volume },
          after: { muted: !original.muted, volume: original.volume },
        },
      });
      saves.push({
        elapsedMs: performance.now() - start,
        historyLength: result.workspace.history.length,
        writes: [...writes],
      });
      current = result.workspace;
      original = { muted: !original.muted, volume: original.volume };
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const restored = await readVideoWorkspace(fixture.aggregateId);
    if (!restored) throw new Error('Missing native scale readback');
    const final = inspectVideoWorkspace(restored.workspace);
    if (!final.document) throw new Error('Invalid native scale readback');
    const actionId = crypto.randomUUID();
    const targetId = final.document.advancedContent.text?.fragments[0]?.id;
    let typingSnapshot = restored;
    let retainedRowsUnchanged = true;
    let typedTailPuts = 0;
    for (const [index, value] of (targetId
      ? ['Native field first', 'Native field final']
      : []
    ).entries()) {
      if (!targetId) throw new Error('Missing native text field');
      const document = inspectVideoWorkspace(typingSnapshot.workspace).document;
      if (!document?.advancedContent.text) throw new Error('Missing native typing document');
      const edited = editReviewTextFragment(document.advancedContent.text, targetId, {
        text: value,
      });
      if (!edited.ok) throw new Error('Invalid native typing edit');
      const beforeRows = await db.getAll('video_workspace_history');
      writes.length = 0;
      typingSnapshot = await saveVideoWorkspaceTyping({
        aggregateId: current.aggregateId,
        expectedRevision: typingSnapshot.workspace.revision,
        expectedSourceAssetId: current.sourceAssetId,
        change: {
          actionId,
          target: { kind: 'text', fragmentId: targetId, field: 'text' },
          writeId: crypto.randomUUID(),
          continuation: index > 0,
          at: Date.now(),
          before: document.advancedContent,
          after: { ...document.advancedContent, text: edited.document },
        },
      });
      if (index > 0) {
        typedTailPuts = writes.filter((write) => write.store === 'video_workspace_history').length;
        const afterRows = await db.getAll('video_workspace_history');
        for (const row of beforeRows) {
          if (!isRecord(row) || (isRecord(row['operation']) && row['operation']['id'] === actionId))
            continue;
          const sameOrdinal = afterRows.find(
            (next: unknown) => isRecord(next) && next['ordinal'] === row['ordinal']
          );
          if (JSON.stringify(sameOrdinal) !== JSON.stringify(row)) retainedRowsUnchanged = false;
        }
      }
    }
    const typedReadback = await readVideoWorkspace(current.aggregateId);
    if (!typedReadback) throw new Error('Missing native typed readback');
    const typedDocument = inspectVideoWorkspace(typedReadback.workspace).document;
    return {
      fixtureBytes,
      initialHistoryLength: fixture.history.length,
      initialAdmissionMs,
      currentPreserved: sameReviewWorkspaceValue(final.document, {
        ...admitted.document,
        advancedContent: {
          ...admitted.document.advancedContent,
          audio: {
            ...admitted.document.advancedContent.audio,
            original: { ...admitted.document.advancedContent.audio.original, ...original },
          },
        },
      }),
      saves,
      readback: {
        revision: restored.workspace.revision,
        historyLength: restored.workspace.history.length,
        cursor: restored.workspace.cursor,
        cuts: final.document.edits.filter((edit) => edit.kind === 'cut').length,
        speeds: final.document.edits.filter((edit) => edit.kind === 'speed').length,
        notes: final.document.annotations.length,
        comments: final.document.canvasComments.length,
        fragments: final.document.advancedContent.text?.fragments.length,
        effects: final.document.advancedContent.annotationEffects?.instances.length,
        actionAudio: final.document.advancedContent.actionAudio?.length,
      },
      physicalHistoryRows: await db.count('video_workspace_history'),
      typing: targetId
        ? {
            historyLength: typedReadback.workspace.history.length,
            typedTailPuts,
            retainedRowsUnchanged,
            actionCount: typedReadback.workspace.history.filter(
              (operation) => operation.id === actionId
            ).length,
            finalText: typedDocument?.advancedContent.text?.fragments.find(
              (fragment) => fragment.id === targetId
            )?.text,
          }
        : null,
      longTasks,
      limitation:
        'Native IndexedDB and actual storage owner; synthetic source metadata. No editor UI/input, playback or OPFS availability assertion.',
    };
  } finally {
    observer.disconnect();
    IDBObjectStore.prototype.put = originalPut;
    db.close();
  }
}
