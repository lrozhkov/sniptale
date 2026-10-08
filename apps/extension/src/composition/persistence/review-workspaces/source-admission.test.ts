import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetReadyJournal } from '../assets/contracts';
import { createMediaLibraryEntry } from '../projects/index.storage.test-support';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import { createVideoReviewSession } from '../../../workflows/video-review/session';
import { updateQuickEditBackground } from '../../../features/video/review/advanced/background';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';

const harness = vi.hoisted(() => ({ database: vi.fn(), journals: vi.fn() }));
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
}));
import { openVideoWorkspace, readVideoWorkspace, saveVideoWorkspaceAdvanced } from './store';

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
beforeEach(() => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  rows = fixture.rows;
  harness.database.mockResolvedValue(fixture.database);
  journals = [];
  harness.journals.mockImplementation(async () => journals);
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
      await import('../../../features/video/review/advanced/watermark');
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
