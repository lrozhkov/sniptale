import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
import type { ReviewAnnotationEffectSnapshot } from '../../../features/video/review/annotation-effects/types';
import { readReviewAnnotationEffectDocument } from '../../../features/video/review/annotation-effects/validation';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { applyLocalReviewChange } from '../../../workflows/video-review/local-session';
import type { AssetReadyJournal } from '../assets/contracts';
import { createMediaLibraryEntry } from '../projects/index.storage.test-support';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import { createVideoReviewSession } from '../../../workflows/video-review/session';
import { updateQuickEditBackground } from '../../../features/video/review/advanced/background';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';

const harness = vi.hoisted(() => ({ database: vi.fn(), journals: vi.fn(), readFile: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: harness.database,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.database()),
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: harness.journals,
  readAssetFile: harness.readFile,
}));
import {
  openVideoWorkspace,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  commitVideoWorkspace,
  saveVideoWorkspaceSnapshot,
  moveVideoWorkspaceHistory,
} from './store';

const id = 'recording:beta-v1-recording';
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
const entry = {
  id: 'background',
  assetId: 'background-bytes',
  createdAt: 1,
  mimeType: 'image/png',
  size: 5,
};
let rows: Map<string, Map<string, unknown>>;
let journals: AssetReadyJournal[];
let writesStarted: number;
let failWrites: boolean;
beforeEach(() => {
  failWrites = false;
  const fixture = createReviewWorkspaceStoreFixture(() => failWrites);
  rows = fixture.rows;
  writesStarted = 0;
  harness.database.mockResolvedValue({
    ...fixture.database,
    transaction: (stores: string[], mode: string) => {
      if (mode === 'readwrite') writesStarted++;
      return fixture.database.transaction(stores, mode);
    },
  });
  journals = [];
  harness.journals.mockImplementation(async () => journals);
  harness.readFile.mockReset();
});

async function effectSnapshot(imported = false): Promise<ReviewAnnotationEffectSnapshot> {
  const source = readFileSync(
    imported
      ? 'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json'
      : 'apps/extension/public/video-effects/effects/annotations/sniptale-title/effect.sniptale-effect.json',
    'utf8'
  );
  const sha256 = await sha256EffectV1Bytes(new TextEncoder().encode(source));
  const document = readReviewAnnotationEffectDocument(source)!;
  const assets = imported
    ? document.assets.map((asset) => ({
        id: asset.id,
        kind: 'svg' as const,
        mimeType: asset.mimeType,
        sha256: asset.sha256!,
        byteLength: asset.byteLength!,
        assetId: 'project-asset:effect-mark',
      }))
    : [];
  return {
    id: `effect:${sha256}`,
    sha256,
    schemaVersion: 'sniptale.effect.v1',
    kind: 'standalone',
    documentId: document.id,
    source,
    retainedByteLength:
      new TextEncoder().encode(source).byteLength +
      assets.reduce((total, asset) => total + asset.byteLength, 0),
    assets,
  };
}

function effectOperation(
  opened: Awaited<ReturnType<typeof openVideoWorkspace>>,
  snapshot: ReviewAnnotationEffectSnapshot
) {
  const before = reviewAdvancedContentBaseline(opened.workspace.advanced);
  return {
    id: 'apply-effect',
    at: 1,
    target: 'advancedContent' as const,
    before,
    after: {
      ...before,
      annotationEffects: {
        enabled: false,
        instances: [
          {
            id: 'annotation',
            snapshotId: snapshot.id,
            enabled: false,
            start: 1,
            end: 4,
            attachment: 'viewport' as const,
            transform: { x: 0, y: 0, width: 0.5, height: 0.5, rotation: 0 },
            controls: {},
            order: 0,
          },
        ],
      },
    },
  };
}

it('admits built-in source atomically, retains Undo and prunes discarded Redo', async () => {
  const opened = await openVideoWorkspace(id, source);
  const snapshot = await effectSnapshot();
  const saved = await commitVideoWorkspace({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    operation: effectOperation(opened, snapshot),
    effectSnapshots: [snapshot],
  });
  expect(saved.workspace.effectSnapshots).toEqual([snapshot]);
  expect(saved.workspace.history).toHaveLength(1);
  expect(rows.get('video_workspaces')!.get(id)).not.toHaveProperty('effectSnapshots');
  expect(rows.get('video_workspace_history')!.get(JSON.stringify([id, 0]))).toHaveProperty(
    'effectSnapshots',
    [snapshot]
  );
  expect(rows.get('video_workspace_history')!.get(JSON.stringify([id, 1]))).not.toHaveProperty(
    'effectSnapshots'
  );
  const undone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedRevision: saved.workspace.revision,
    expectedSourceAssetId: saved.workspace.sourceAssetId,
    direction: 'undo',
  });
  expect(undone.workspace.effectSnapshots).toEqual([snapshot]);
  const before = reviewAdvancedContentBaseline(undone.workspace.advanced);
  const branched = await commitVideoWorkspace({
    aggregateId: id,
    expectedRevision: undone.workspace.revision,
    expectedSourceAssetId: undone.workspace.sourceAssetId,
    operation: {
      id: 'branch',
      at: 2,
      target: 'advancedContent',
      before,
      after: {
        ...before,
        audio: { ...before.audio, original: { ...before.audio.original, volume: 0.3 } },
      },
    },
  });
  expect(branched.workspace.effectSnapshots).toEqual([]);
  expect(branched.workspace.history.map((operation) => operation.id)).toEqual(['branch']);
});

it('rejects structurally valid but changed source bytes before any write transaction', async () => {
  const opened = await openVideoWorkspace(id, source);
  const snapshot = await effectSnapshot();
  const capturedWrites = writesStarted;
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      operation: effectOperation(opened, snapshot),
      effectSnapshots: [
        {
          ...snapshot,
          source: snapshot.source + ' ',
          retainedByteLength: snapshot.retainedByteLength + 1,
        },
      ],
    })
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(writesStarted).toBe(capturedWrites);
  expect(await readVideoWorkspace(id)).toEqual(opened);
});

it('refuses rewriting retained immutable source on whole-buffer Save', async () => {
  const opened = await openVideoWorkspace(id, source);
  const snapshot = await effectSnapshot();
  const saved = await commitVideoWorkspace({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    operation: effectOperation(opened, snapshot),
    effectSnapshots: [snapshot],
  });
  await expect(
    saveVideoWorkspaceSnapshot({
      aggregateId: id,
      expectedRevision: saved.workspace.revision,
      expectedDraftRevision: null,
      expectedSourceAssetId: saved.workspace.sourceAssetId,
      workspace: {
        ...saved.workspace,
        effectSnapshots: [
          {
            ...snapshot,
            source: snapshot.source + ' ',
            retainedByteLength: snapshot.retainedByteLength + 1,
          },
        ],
      },
      draft: null,
    })
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(await readVideoWorkspace(id)).toEqual(saved);
});

it('verifies private SVG bytes before the write transaction and admits the exact unpublished source', async () => {
  const opened = await openVideoWorkspace(id, source);
  const snapshot = await effectSnapshot(true);
  const descriptor = snapshot.assets[0]!;
  const bytes = readFileSync('tooling/test/e2e/fixtures/effect-v1/assets/neutral-mark.svg');
  const entry = {
    id: 'effect-mark',
    assetId: 'physical-effect-mark',
    mimeType: descriptor.mimeType,
    size: descriptor.byteLength,
    createdAt: 1,
  };
  const ref = {
    assetId: entry.assetId,
    mimeType: entry.mimeType,
    size: entry.size,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs' as const, objectKey: `objects/${entry.assetId}` },
  };
  journals.push({
    journalId: 'ready-effect',
    domain: 'project-assets',
    createdAt: 1,
    assetRefs: [ref],
    payload: {
      entry,
      filename: 'mark.svg',
      publishToLibrary: false,
      expectedAssetId: null,
      requiredReviewAnnotationEffect: {
        aggregateId: id,
        sourceAssetId: opened.workspace.sourceAssetId,
        snapshotId: snapshot.id,
        resourceId: descriptor.id,
        sha256: descriptor.sha256,
      },
    },
  });
  rows.set('asset_refs', new Map());
  const capturedWrites = writesStarted;
  harness.readFile.mockImplementation(async () => {
    expect(writesStarted).toBe(capturedWrites);
    return new File([Uint8Array.from(bytes)], 'mark.svg', { type: entry.mimeType });
  });
  const args = {
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    operation: effectOperation(opened, snapshot),
    effectSnapshots: [snapshot],
  };
  const saved = await commitVideoWorkspace(args);
  expect(harness.readFile).toHaveBeenCalledExactlyOnceWith(ref, 'effect-mark');
  expect(saved.workspace.history).toHaveLength(1);
  expect(rows.get('project_assets')!.size).toBe(0);
  expect(await readVideoWorkspace(id)).toEqual(saved);
});

it.each(['corrupt-bytes', 'missing', 'physical-replacement', 'revision-conflict'] as const)(
  'refuses %s during verified source admission without inserting annotation history',
  async (failure) => {
    const opened = await openVideoWorkspace(id, source);
    const snapshot = await effectSnapshot(true);
    const descriptor = snapshot.assets[0]!;
    const bytes = Uint8Array.from(
      readFileSync('tooling/test/e2e/fixtures/effect-v1/assets/neutral-mark.svg')
    );
    const entry = {
      id: 'effect-mark',
      assetId: 'physical-mark',
      createdAt: 1,
      mimeType: descriptor.mimeType,
      size: descriptor.byteLength,
    };
    const ref = {
      assetId: entry.assetId,
      createdAt: 1,
      size: entry.size,
      mimeType: entry.mimeType,
      sha256: null,
      location: { kind: 'opfs' as const, objectKey: `objects/${entry.assetId}` },
    };
    rows.get('project_assets')!.set(entry.id, entry);
    rows.set('asset_refs', new Map([[ref.assetId, ref]]));
    harness.readFile.mockImplementation(async () => {
      if (failure === 'missing') throw new Error('Private raw OPFS error');
      if (failure === 'corrupt-bytes') bytes[0] = 0;
      if (failure === 'physical-replacement')
        rows.get('project_assets')!.set(entry.id, { ...entry, assetId: 'replaced-mark' });
      if (failure === 'revision-conflict') {
        const head = rows.get('video_workspaces')!.get(id);
        if (!isRecord(head) || typeof head['revision'] !== 'number')
          throw new Error('Invalid fixture');
        rows.get('video_workspaces')!.set(id, { ...head, revision: head['revision'] + 1 });
      }
      return new File([bytes], 'mark.svg', { type: entry.mimeType });
    });
    await expect(
      commitVideoWorkspace({
        aggregateId: id,
        expectedRevision: opened.workspace.revision,
        expectedSourceAssetId: opened.workspace.sourceAssetId,
        operation: effectOperation(opened, snapshot),
        effectSnapshots: [snapshot],
      })
    ).rejects.toMatchObject({
      code:
        failure === 'revision-conflict'
          ? 'conflict'
          : failure === 'corrupt-bytes'
            ? 'invalid'
            : 'missing-media',
    });
    const retained = await readVideoWorkspace(id);
    expect(retained?.workspace.history).toEqual([]);
    expect(retained?.workspace.effectSnapshots).toBeUndefined();
  }
);

it('Save adopts the verified registry and preserves history and revisions after quota failure', async () => {
  const opened = await openVideoWorkspace(id, source);
  const snapshot = await effectSnapshot();
  const candidate = applyLocalReviewChange(opened, {
    kind: 'commit',
    operation: effectOperation(opened, snapshot),
    consumeDraft: false,
    effectSnapshots: [snapshot],
  });
  const args = {
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedDraftRevision: null,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    workspace: candidate.workspace,
    draft: candidate.draft,
  };
  failWrites = true;
  await expect(saveVideoWorkspaceSnapshot(args)).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(await readVideoWorkspace(id)).toEqual(opened);
  failWrites = false;
  const saved = await saveVideoWorkspaceSnapshot(args);
  expect(saved.workspace.effectSnapshots).toEqual([snapshot]);
  expect(saved.workspace.history).toHaveLength(1);
  expect(saved.workspace.revision).toBe(opened.workspace.revision + 1);
});

it('refuses a buffered initial background reference after its published source was purged', async () => {
  const opened = await openVideoWorkspace(id, source);
  const session = createVideoReviewSession(opened);
  session.setAutosaveEnabled(false);
  rows.get('project_assets')!.set(entry.id, entry);
  const before = session.getSnapshot().document.advancedContent;
  await session.commit({
    id: 'background-import',
    at: 1,
    target: 'advancedContent',
    before,
    after: {
      ...before,
      background: updateQuickEditBackground(before.background, {
        enabled: true,
        type: 'image',
        assetId: 'project-asset:background',
      }),
    },
  });
  expect((await readVideoWorkspace(id))?.workspace.history).toEqual([]);
  rows.get('project_assets')!.delete(entry.id);
  session.setAutosaveEnabled(true);
  await expect(session.flush()).rejects.toThrow();
  expect(await readVideoWorkspace(id)).toEqual(opened);
  expect(session.getSnapshot().dirty).toBe(true);
});

it('refuses new missing auxiliary references in advanced recovery data', async () => {
  const opened = await openVideoWorkspace(id, source);
  await expect(
    saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      advanced: {
        ...opened.workspace.advanced,
        recoveryV1: JSON.stringify({
          background: {
            type: 'image',
            assetId: 'project-asset:missing',
          },
        }),
      },
    })
  ).rejects.toMatchObject({ code: 'missing-media' });
  expect(await readVideoWorkspace(id)).toEqual(opened);
});

function readyJournal(overrides: Partial<AssetReadyJournal> = {}): AssetReadyJournal {
  return {
    journalId: 'ready-background',
    createdAt: 1,
    domain: 'project-assets',
    assetRefs: [
      {
        assetId: entry.assetId,
        createdAt: 1,
        mimeType: entry.mimeType,
        size: entry.size,
        sha256: null,
        location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
      },
    ],
    payload: { entry, filename: 'background.png', expectedAssetId: null },
    ...overrides,
  };
}

async function saveBackground() {
  const opened = await openVideoWorkspace(id, source);
  return saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    advanced: {
      ...opened.workspace.advanced,
      background: updateQuickEditBackground(opened.workspace.advanced.background, {
        enabled: true,
        type: 'image',
        assetId: 'project-asset:background',
      }),
    },
  });
}

it('admits new sources through durable rows and preserves unchanged missing legacy references', async () => {
  rows.get('project_assets')!.set(entry.id, entry);
  const saved = await saveBackground();
  rows.get('project_assets')!.delete(entry.id);
  await expect(
    saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedRevision: saved.workspace.revision,
      expectedSourceAssetId: saved.workspace.sourceAssetId,
      advanced: saved.workspace.advanced,
    })
  ).resolves.toBeDefined();
});

it('admits a prepared source before publication from its matching standalone ready journal', async () => {
  journals.push(readyJournal());
  const saved = await saveBackground();
  expect(saved.workspace.advanced.background).toMatchObject({
    assetId: 'project-asset:background',
  });
  expect(rows.get('project_assets')!.size).toBe(0);
});

it.each([
  'unrelated-domain',
  'archive',
  'replacement',
  'wrong-object',
  'wrong-review',
  'invalid-payload',
])('refuses %s ready evidence', async (kind) => {
  const journal = readyJournal();
  if (kind === 'unrelated-domain') journal.domain = 'scenario-assets';
  if (kind === 'archive') journal.operationId = 'archive';
  if (kind === 'replacement')
    journal.payload = { entry, filename: 'image', expectedAssetId: 'old' };
  if (kind === 'wrong-object')
    journal.assetRefs[0] = { ...journal.assetRefs[0]!, assetId: 'other' };
  if (kind === 'wrong-review')
    journal.payload = {
      entry,
      filename: 'image',
      expectedAssetId: null,
      requiredReview: { aggregateId: 'other', clipId: 'clip' },
    };
  if (kind === 'invalid-payload') journal.payload = { entry };
  journals.push(journal);
  await expect(saveBackground()).rejects.toMatchObject({ code: 'missing-media' });
  expect((await readVideoWorkspace(id))?.workspace.advanced.background.enabled).toBe(false);
});

it('admits voiceover attach before publication with a ready claim scoped to this review', async () => {
  const { commitVideoWorkspace } = await import('./store');
  const { createQuickEditAudioClip } =
    await import('../../../features/video/review/advanced/audio');
  const audioEntry = { ...entry, mimeType: 'audio/webm' };
  const journal = readyJournal();
  journal.assetRefs[0] = { ...journal.assetRefs[0]!, mimeType: audioEntry.mimeType };
  journal.payload = {
    entry: audioEntry,
    filename: 'voice.webm',
    expectedAssetId: null,
    requiredReview: { aggregateId: id, clipId: 'voiceover' },
  };
  journals.push(journal);
  const opened = await openVideoWorkspace(id, source);
  const before = reviewAdvancedContentBaseline(opened.workspace.advanced);
  const clip = createQuickEditAudioClip({
    id: 'voiceover',
    assetId: 'project-asset:background',
    timelineStart: 0,
    duration: 2,
    endMax: 12,
  });
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      operation: {
        id: 'voiceover-import',
        at: 1,
        target: 'advancedContent',
        before,
        after: { ...before, audio: { ...before.audio, voiceover: [clip] } },
      },
    })
  ).resolves.toBeDefined();
  expect(rows.get('project_assets')!.size).toBe(0);
});

it('holds ready authority until the consuming transaction commits', async () => {
  const { runWithDurableAssetLifecycleLock } = await import('../infrastructure/mutation-barrier');
  journals.push(readyJournal());
  let cancellation: Promise<void> | undefined;
  harness.journals.mockImplementationOnce(async () => {
    cancellation = runWithDurableAssetLifecycleLock(async () => {
      expect((await readVideoWorkspace(id))?.workspace.advanced.background).toMatchObject({
        assetId: 'project-asset:background',
      });
      journals = [];
    });
    return journals;
  });
  await saveBackground();
  await cancellation;
});

it('rejects a disappeared private origin and malformed source without changing the workspace', async () => {
  for (const row of [
    { ...entry, originMediaId: 'purged' },
    { ...entry, assetId: null },
  ]) {
    rows.get('project_assets')!.set(entry.id, row);
    await expect(saveBackground()).rejects.toMatchObject({ code: 'missing-media' });
    expect((await readVideoWorkspace(id))?.workspace.advanced.background.enabled).toBe(false);
  }
});

it.each([false, true])(
  'checks webcam private origin in the attachment transaction (purged=%s)',
  async (purged) => {
    const { commitVideoWorkspace } = await import('./store');
    const originId = 'recording:webcam';
    const main = rows.get('media_library')!.get(id);
    if (!main || typeof main !== 'object') throw new Error('Missing fixture source');
    rows.get('media_library')!.set(originId, {
      ...main,
      id: originId,
      source: { kind: 'recording', recordingId: 'webcam' },
    });
    const videoEntry = { ...entry, mimeType: 'video/webm', originMediaId: originId };
    const journal = readyJournal();
    journal.assetRefs[0] = { ...journal.assetRefs[0]!, mimeType: 'video/webm' };
    journal.payload = {
      entry: videoEntry,
      filename: 'camera.webm',
      expectedAssetId: null,
      publishToLibrary: false,
      requiredReview: { aggregateId: id, clipId: 'webcam' },
    };
    journals.push(journal);
    const opened = await openVideoWorkspace(id, source);
    if (purged) rows.get('media_library')!.delete(originId);
    const before = reviewAdvancedContentBaseline(opened.workspace.advanced);
    const result = commitVideoWorkspace({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      operation: {
        id: 'attach-webcam',
        at: 1,
        target: 'advancedContent',
        before,
        after: {
          ...before,
          webcam: createQuickEditWebcam('project-asset:background', source, source),
        },
      },
    });
    if (purged) {
      await expect(result).rejects.toMatchObject({ code: 'missing-media' });
      expect(await readVideoWorkspace(id)).toEqual(opened);
    } else {
      const saved = await result;
      expect(saved.workspace.history[0]?.after).toHaveProperty(
        'webcam.assetId',
        'project-asset:background'
      );
      expect(rows.get('project_assets')!.size).toBe(0);
    }
  }
);

it('refuses missing remembered images before saving and preserves the previous workspace', async () => {
  const opened = await openVideoWorkspace(id, source);
  await expect(
    saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      advanced: {
        ...opened.workspace.advanced,
        background: {
          enabled: false,
          rememberedImage: { assetId: 'project-asset:missing', imageFit: 'cover' },
        },
      },
    })
  ).rejects.toMatchObject({ code: 'missing-media' });
  expect(await readVideoWorkspace(id)).toEqual(opened);
});

it.each(['missing', 'ready', 'durable'] as const)(
  'admits a nested generated asset only with %s source authority',
  async (authority) => {
    const { reviewSpeechTextSignature } =
      await import('../../../features/video/review/speech-transcript');
    const opened = await openVideoWorkspace(id, source);
    const original = {
      ...entry,
      id: 'original',
      assetId: 'original-bytes',
      mimeType: 'audio/mpeg',
    };
    rows.get('project_assets')!.set(original.id, original);
    const profile = { modelId: 'speech', voiceId: 'alloy', responseFormat: 'mp3' as const };
    const advanced = structuredClone(opened.workspace.advanced);
    advanced.audio.voiceover.push({
      id: 'voice',
      assetId: 'project-asset:original',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      transcript: {
        version: 1,
        profile,
        phrases: [
          {
            id: 'p',
            start: 0,
            end: 2,
            text: 'Speech',
            originalText: 'Original',
            revision: 1,
            alignment: 'manual',
          },
        ],
        replacements: [
          {
            id: 'take',
            start: 0,
            end: 2,
            duration: 1,
            phraseId: 'p',
            revision: 1,
            text: 'Speech',
            profile,
            textSignature: reviewSpeechTextSignature('Speech', profile),
            assetId: 'project-asset:background',
          },
        ],
      },
    });
    const generated = { ...entry, mimeType: 'audio/mpeg' };
    if (authority === 'durable') rows.get('project_assets')!.set(generated.id, generated);
    if (authority === 'ready') {
      const journal = readyJournal();
      journal.assetRefs[0] = { ...journal.assetRefs[0]!, mimeType: generated.mimeType };
      journal.payload = {
        entry: generated,
        filename: 'speech.mp3',
        expectedAssetId: null,
        requiredReview: { aggregateId: id, clipId: 'voice' },
        publishToLibrary: false,
      };
      journals.push(journal);
    }
    const saving = saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      advanced,
    });
    if (authority === 'missing') {
      await expect(saving).rejects.toMatchObject({ code: 'missing-media' });
      expect(await readVideoWorkspace(id)).toEqual(opened);
    } else {
      const saved = await saving;
      expect(saved.workspace.advanced.audio.voiceover[0]!.transcript).toEqual(
        advanced.audio.voiceover[0]!.transcript
      );
      expect(rows.get('project_assets')!.has(entry.id)).toBe(authority === 'durable');
    }
  }
);

it('does not lend a watermark ready claim to a background or another aggregate', async () => {
  const journal = readyJournal({
    payload: {
      entry,
      filename: 'logo.png',
      expectedAssetId: null,
      publishToLibrary: false,
      requiredReviewResource: { aggregateId: id, slot: 'watermark' },
    },
  });
  journals.push(journal);
  await expect(saveBackground()).rejects.toMatchObject({ code: 'missing-media' });
  expect((await readVideoWorkspace(id))?.workspace.advanced.background.enabled).toBe(false);
});

it.each(['missing', 'trash', 'active'] as const)(
  'readmits watermark origin in its consuming transaction: %s',
  async (state) => {
    const { createQuickEditWatermark } =
      await import('../../../features/video/project/scene/watermark');
    if (state !== 'missing')
      rows.get('media_library')!.set(
        'origin',
        createMediaLibraryEntry({
          id: 'origin',
          ...(state === 'trash'
            ? { lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 2 } }
            : {}),
        })
      );
    journals.push(
      readyJournal({
        payload: {
          entry: { ...entry, originMediaId: 'origin' },
          filename: 'logo.png',
          expectedAssetId: null,
          publishToLibrary: false,
          requiredReviewResource: { aggregateId: id, slot: 'watermark' },
        },
      })
    );
    const opened = await openVideoWorkspace(id, source);
    const save = saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      advanced: {
        ...opened.workspace.advanced,
        watermark: {
          ...createQuickEditWatermark('Remember'),
          mode: 'none',
          image: {
            assetId: 'project-asset:background',
            width: 80,
            height: 40,
            size: 0.2,
            opacity: 1,
          },
        },
      },
    });
    if (state === 'active') await expect(save).resolves.toBeDefined();
    else {
      await expect(save).rejects.toMatchObject({ code: 'missing-media' });
      expect(await readVideoWorkspace(id)).toEqual(opened);
    }
  }
);

it.each(['intro', 'outro'] as const)(
  'admits a prepared image only for its exact remembered %s slot',
  async (slot) => {
    const { createNeutralPresentationSettings } =
      await import('../../../features/video/review/advanced/presentation');
    const opened = await openVideoWorkspace(id, source);
    const journal = readyJournal();
    journal.payload = {
      entry,
      filename: 'scene.png',
      expectedAssetId: null,
      publishToLibrary: false,
      requiredReviewResource: {
        aggregateId: id,
        slot,
        kind: 'image',
        acquisition: 'private-upload',
      },
    };
    journals.push(journal);
    const presentation = createNeutralPresentationSettings();
    const image = {
      assetId: 'project-asset:background',
      width: 20,
      height: 10,
      duration: 3,
      fit: 'contain' as const,
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    };
    presentation[slot === 'intro' ? 'outro' : 'intro'] = { mode: 'none', image };
    const save = () =>
      saveVideoWorkspaceAdvanced({
        aggregateId: id,
        expectedRevision: opened.workspace.revision,
        expectedSourceAssetId: opened.workspace.sourceAssetId,
        advanced: { ...opened.workspace.advanced, presentation },
      });
    await expect(save()).rejects.toMatchObject({ code: 'missing-media' });
    presentation[slot === 'intro' ? 'outro' : 'intro'] = { mode: 'none' };
    presentation[slot] = { mode: 'none', image };
    await expect(save()).resolves.toBeDefined();
    expect(rows.get('project_assets')!.size).toBe(0);
  }
);

it.each([false, true])(
  'revalidates a new scene slot claim even with bytes already retained (changed=%s)',
  async (changed) => {
    const { createNeutralPresentationSettings } =
      await import('../../../features/video/review/advanced/presentation');
    const opened = await openVideoWorkspace(id, source);
    const presentation = createNeutralPresentationSettings();
    const image = {
      assetId: 'project-asset:background',
      width: 20,
      height: 10,
      duration: 3,
      fit: 'contain' as const,
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    };
    rows.get('project_assets')!.set(entry.id, entry);
    presentation.intro = { mode: 'none', image };
    const initial = await saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      advanced: { ...opened.workspace.advanced, presentation },
    });
    const journal = readyJournal();
    rows.set('asset_refs', new Map([[entry.assetId, journal.assetRefs[0]]]));
    rows.get('media_library')!.set(
      'project-asset:background',
      createMediaLibraryEntry({
        id: 'project-asset:background',
        size: entry.size,
        mimeType: entry.mimeType,
        source: { kind: 'project-asset', projectAssetId: entry.id },
      })
    );
    journal.payload = {
      entry,
      filename: 'scene.png',
      expectedAssetId: entry.assetId,
      librarySourceId: 'project-asset:background',
      requiredReviewResource: {
        aggregateId: id,
        slot: 'outro',
        kind: 'image',
        acquisition: 'library-binding',
      },
    };
    journals.push(journal);
    if (changed) rows.get('media_library')!.delete('project-asset:background');
    presentation.outro = { mode: 'none', image };
    const save = saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedRevision: initial.workspace.revision,
      expectedSourceAssetId: initial.workspace.sourceAssetId,
      advanced: { ...initial.workspace.advanced, presentation },
    });
    if (changed) {
      await expect(save).rejects.toMatchObject({ code: 'missing-media' });
      expect(await readVideoWorkspace(id)).toEqual(initial);
    } else await expect(save).resolves.toBeDefined();
  }
);

it.each([
  'missing',
  'ready',
  'wrong-target',
  'wrong-replacement',
  'wrong-aggregate',
  'durable',
] as const)(
  'admits original speech only with exact %s authority before the durable workspace write',
  async (authority) => {
    const { reviewSpeechTextSignature } =
      await import('../../../features/video/review/speech-transcript');
    const opened = await openVideoWorkspace(id, source);
    const profile = { modelId: 'speech', voiceId: 'alloy', responseFormat: 'mp3' as const };
    const advanced = structuredClone(opened.workspace.advanced);
    advanced.audio.originalSpeech = {
      enabled: false,
      transcript: {
        version: 1,
        profile,
        phrases: [],
        replacements: [
          {
            id: 'accepted',
            assetId: 'project-asset:background',
            phraseId: 'draft-may-be-gone',
            start: 1,
            end: 3,
            duration: 1,
            revision: 1,
            text: 'Speech',
            profile,
            textSignature: reviewSpeechTextSignature('Speech', profile),
            enabled: false,
            originalVolume: 0.25,
          },
        ],
      },
    };
    const generated = { ...entry, mimeType: 'audio/mpeg' };
    if (authority === 'durable') rows.get('project_assets')!.set(generated.id, generated);
    else if (authority !== 'missing') {
      const journal = readyJournal();
      journal.assetRefs[0] = { ...journal.assetRefs[0]!, mimeType: generated.mimeType };
      journal.payload = {
        entry: generated,
        filename: 'speech.mp3',
        expectedAssetId: null,
        publishToLibrary: false,
        requiredReviewSpeech: {
          aggregateId: authority === 'wrong-aggregate' ? 'other' : id,
          target:
            authority === 'wrong-target'
              ? { kind: 'voiceover', clipId: 'voice' }
              : { kind: 'original' },
          replacementId: authority === 'wrong-replacement' ? 'other' : 'accepted',
        },
      };
      journals.push(journal);
    }
    const saving = saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      advanced,
    });
    if (authority === 'ready' || authority === 'durable') {
      expect((await saving).workspace.advanced.audio.originalSpeech).toEqual(
        advanced.audio.originalSpeech
      );
      expect(rows.get('project_assets')!.has(entry.id)).toBe(authority === 'durable');
    } else {
      await expect(saving).rejects.toMatchObject({ code: 'missing-media' });
      expect(await readVideoWorkspace(id)).toEqual(opened);
    }
  }
);

it.each(['published', 'ready'] as const)(
  'promotes a temporary origin atomically when accepting a %s review source',
  async (kind) => {
    const origin = createMediaLibraryEntry({
      id: 'temporary-origin',
      lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
    });
    rows.get('media_library')!.set(origin.id, origin);
    const asset = { ...entry, originMediaId: origin.id };
    if (kind === 'published') rows.get('project_assets')!.set(entry.id, asset);
    else
      journals.push(
        readyJournal({
          payload: {
            entry: asset,
            filename: 'background.png',
            expectedAssetId: null,
            publishToLibrary: false,
          },
        })
      );
    expect(rows.get('media_library')!.get(origin.id)).toEqual(origin);
    await saveBackground();
    expect(rows.get('media_library')!.get(origin.id)).toMatchObject({
      lifecycle: { storageClass: 'library' },
    });
  }
);

it('rolls back origin promotion when the workspace write fails', async () => {
  let writes = 0;
  let failAt = Infinity;
  const fixture = createReviewWorkspaceStoreFixture(() => ++writes === failAt);
  rows = fixture.rows;
  harness.database.mockResolvedValue(fixture.database);
  const origin = createMediaLibraryEntry({
    id: 'temporary-origin',
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
  });
  rows.get('media_library')!.set(origin.id, origin);
  rows.get('project_assets')!.set(entry.id, { ...entry, originMediaId: origin.id });
  await openVideoWorkspace(id, source);
  failAt = writes + 2;
  await expect(saveBackground()).rejects.toThrow('No space');
  expect(rows.get('media_library')!.get(origin.id)).toEqual(origin);
  expect((await readVideoWorkspace(id))?.workspace.advanced.background.enabled).toBe(false);
});

it('promotes the Library audio origin from a ready attachment claim', async () => {
  const { createQuickEditAudioClip } =
    await import('../../../features/video/review/advanced/audio');
  const audio = { ...entry, mimeType: 'audio/webm', originMediaId: 'audio-origin' };
  const journal = readyJournal();
  journal.assetRefs[0] = { ...journal.assetRefs[0]!, mimeType: audio.mimeType };
  journal.payload = {
    entry: audio,
    filename: 'voice.webm',
    expectedAssetId: null,
    publishToLibrary: false,
    librarySourceId: audio.originMediaId,
    requiredReview: { aggregateId: id, clipId: 'voiceover' },
  };
  rows.set('asset_refs', new Map([[audio.assetId, journal.assetRefs[0]]]));
  rows.get('media_library')!.set(
    audio.originMediaId,
    createMediaLibraryEntry({
      id: audio.originMediaId,
      kind: 'audio',
      mimeType: audio.mimeType,
      size: audio.size,
      source: { kind: 'stored-asset', assetId: audio.assetId },
      lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
    })
  );
  journals.push(journal);
  const opened = await openVideoWorkspace(id, source);
  await saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    advanced: {
      ...opened.workspace.advanced,
      audio: {
        ...opened.workspace.advanced.audio,
        voiceover: [
          createQuickEditAudioClip({
            id: 'voiceover',
            assetId: 'project-asset:background',
            timelineStart: 0,
            duration: 2,
            endMax: 12,
          }),
        ],
      },
    },
  });
  expect(rows.get('media_library')!.get(audio.originMediaId)).toMatchObject({
    lifecycle: { storageClass: 'library' },
  });
});
