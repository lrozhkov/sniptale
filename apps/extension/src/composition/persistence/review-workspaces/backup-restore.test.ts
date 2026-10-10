import { withReviewWorkspaceUsage } from '../media-library/usage-index-keys';
import { createQuickEditSpotlight } from '../../../features/video/review/advanced/focus';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';
import { createQuickEditZoomRegion } from '../../../features/video/review/advanced/zoom';
import { expect, it, vi } from 'vitest';
import {
  parsePortableVideoReview,
  prepareVideoReviewRestore,
  putVideoReviewRestore,
  readVideoReviewForBackup,
} from './backup-restore';
import type { VideoWorkspace } from './contracts';
import { collectReviewAssetReferences, encodePortableReviewAssetRefs } from './asset-refs';
import {
  createQuickEditAdvancedState,
  createQuickEditAdvancedContent,
} from '../../../features/video/review/advanced/defaults';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';

const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point' as const, time: 1 } };
const workspace: VideoWorkspace = {
  aggregateId: 'recording:one',
  formatVersion: 1,
  sourceAssetId: 'original-local',
  source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
  revision: 4,
  cursor: 0,
  history: [{ id: 'op', at: 2, target: 'annotation', before: null, after: annotation }],
  advanced: createQuickEditAdvancedState(),
  createdAt: 1,
  updatedAt: 3,
};

it('restores mixed text provenance and source mutes while remapping only immutable assets', async () => {
  const advanced = createQuickEditAdvancedState();
  advanced.text = {
    version: 1,
    fragments: [
      {
        id: 'rewritten',
        text: 'New script',
        originalText: 'Old phrases',
        start: 0,
        end: 1,
        timeDomain: 'result',
        revision: 0,
        timingRevision: 0,
        alignment: 'manual',
        showInVideo: false,
        derivedFrom: ['first', 'second'],
        origins: [
          { kind: 'original', start: 0, end: 1, words: [{ text: 'Old', start: 0, end: 1 }] },
          { kind: 'voiceover', clipId: 'take', start: 0, end: 1 },
        ],
      },
    ],
  };
  advanced.audio.voiceoverSegments = buildReviewTimeMap(workspace.source.duration, []);
  advanced.audio.voiceover = [
    {
      id: 'take',
      assetId: 'project-asset:voice',
      timelineStart: 0,
      duration: 1,
      sourceOffset: 0,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  advanced.audio.original.mutes = [
    { id: 'binding', kind: 'take', clipId: 'take' },
    { id: 'detached', kind: 'range', start: 0.5, end: 1.5, volume: 0.25 },
  ];
  const stored = { ...workspace, advanced, history: [], cursor: 0 };
  const exported = await readVideoReviewForBackup({
    db: snapshotDatabase(stored, undefined),
    aggregateId: stored.aggregateId,
    sourceAssetId: stored.sourceAssetId,
  });
  const portable = encodePortableReviewAssetRefs(exported!);
  const parsed = parsePortableVideoReview(JSON.parse(JSON.stringify(portable)), stored.aggregateId);
  const restored = prepareVideoReviewRestore({
    review: parsed,
    sourceAggregateId: stored.aggregateId,
    targetAggregateId: 'recording:copy',
    sourceAssetId: 'new-source',
    assetIdMap: new Map([['voice', 'new-voice']]),
  });
  expect(restored.workspace.advanced.audio.original.mutes).toEqual(advanced.audio.original.mutes);
  expect(restored.workspace.advanced.text).toEqual(advanced.text);
  expect(restored.workspace.advanced.audio.voiceover[0]).toMatchObject({
    id: 'take',
    assetId: 'project-asset:new-voice',
  });
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(
    new Set(['project-asset:new-voice'])
  );
});
const draft = {
  aggregateId: workspace.aggregateId,
  revision: 3,
  annotation: { ...annotation, text: 'Unsaved' },
  before: null,
  updatedAt: 3,
};

it('exports full undo/redo and field recovery, excluding the local source object identity', async () => {
  const review = await readVideoReviewForBackup({
    aggregateId: workspace.aggregateId,
    sourceAssetId: 'original-local',
    db: snapshotDatabase(workspace, draft),
  });
  expect(review?.workspace.history).toEqual(workspace.history);
  expect(review?.workspace.cursor).toBe(0);
  expect(review?.workspace).not.toHaveProperty('sourceAssetId');
  expect(review?.draft).toEqual(draft);
  const restored = prepareVideoReviewRestore({
    review: review!,
    sourceAggregateId: workspace.aggregateId,
    targetAggregateId: 'recording:duplicate',
    sourceAssetId: 'new-local',
  });
  expect(restored.workspace.aggregateId).toBe('recording:duplicate');
  expect(restored.workspace.sourceAssetId).toBe('new-local');
  expect(restored.draft?.aggregateId).toBe('recording:duplicate');
  expect(restored.workspace.history).toEqual(workspace.history);
  const workspaces = { put: vi.fn() };
  const drafts = { put: vi.fn(), delete: vi.fn() };
  await putVideoReviewRestore({ review: restored, workspaces, drafts });
  expect(workspaces.put).toHaveBeenCalledWith(withReviewWorkspaceUsage(restored.workspace));
  expect(drafts.put).toHaveBeenCalledWith(restored.draft);
  expect(drafts.delete).not.toHaveBeenCalled();
});

it('refuses corrupt or stale source state instead of silently dropping it from backup', async () => {
  const db = snapshotDatabase(workspace, undefined);
  await expect(
    readVideoReviewForBackup({
      db,
      aggregateId: workspace.aggregateId,
      sourceAssetId: 'replacement',
    })
  ).rejects.toThrow('source');
  const { sourceAssetId: _local, ...portable } = workspace;
  expect(() => parsePortableVideoReview({ workspace: portable, draft }, 'recording:wrong')).toThrow(
    'association'
  );
  expect(() => parsePortableVideoReview({ workspace, draft }, workspace.aggregateId)).toThrow(
    'invalid'
  );
  expect(() =>
    parsePortableVideoReview(
      { workspace: { ...portable, history: [...portable.history, ...portable.history] }, draft },
      workspace.aggregateId
    )
  ).toThrow();
  expect(() =>
    parsePortableVideoReview(
      { workspace: portable, draft: { ...draft, aggregateId: 'wrong' } },
      workspace.aggregateId
    )
  ).toThrow();
  await expect(
    readVideoReviewForBackup({
      db: snapshotDatabase(undefined, undefined),
      aggregateId: workspace.aggregateId,
      sourceAssetId: 'original-local',
    })
  ).resolves.toBeUndefined();
});

it('keeps recovery text when a draft-consuming Save interleaves with backup reads', async () => {
  const pendingWorkspace: VideoWorkspace = { ...workspace, history: [], cursor: 0 };
  let currentWorkspace = pendingWorkspace;
  let currentDraft: typeof draft | undefined = draft;
  const save = () => {
    currentWorkspace = {
      ...workspace,
      cursor: 1,
      history: [{ id: 'save', at: 4, target: 'annotation', before: null, after: draft.annotation }],
    };
    currentDraft = undefined;
  };
  const db = {
    get: async (store: string) => {
      if (store !== 'video_workspaces') return currentDraft;
      const value = currentWorkspace;
      save();
      return value;
    },
    transaction: () => {
      const capturedWorkspace = currentWorkspace;
      const capturedDraft = currentDraft;
      return {
        objectStore: (store: string) => ({
          get: async () => {
            save();
            return store === 'video_workspaces' ? capturedWorkspace : capturedDraft;
          },
        }),
        done: Promise.resolve(),
      };
    },
  };
  const review = await readVideoReviewForBackup({
    db,
    aggregateId: workspace.aggregateId,
    sourceAssetId: workspace.sourceAssetId,
  });
  expect(review?.draft?.annotation.text).toBe('Unsaved');
  expect(review?.workspace.history).toEqual([]);
});

function snapshotDatabase(raw: unknown, rawDraft: unknown) {
  return {
    transaction: () => ({
      objectStore: (store: string) => ({
        get: async () => (store === 'video_workspaces' ? raw : rawDraft),
      }),
      done: Promise.resolve(),
    }),
  };
}

it('roundtrips disabled webcam settings, redo history and recovery through portable asset remapping', async () => {
  const webcam = {
    ...createQuickEditWebcam('project-asset:camera', workspace.source, workspace.source),
    enabled: false,
    offsetSeconds: -0.25,
    hiddenRanges: [{ id: 'hidden', start: 0.5, end: 1.5 }],
  };
  const before = createQuickEditAdvancedContent();
  const stored: VideoWorkspace = {
    ...workspace,
    advanced: { ...workspace.advanced, webcam, recoveryV1: JSON.stringify({ webcam }) },
    cursor: 0,
    history: [
      {
        id: 'camera-position',
        at: 1,
        target: 'advancedContent',
        before: { ...before, webcam },
        after: { ...before, webcam: { ...webcam, mirrored: true } },
      },
    ],
  };
  const exported = await readVideoReviewForBackup({
    db: snapshotDatabase(stored, undefined),
    aggregateId: stored.aggregateId,
    sourceAssetId: stored.sourceAssetId,
  });
  const portable = encodePortableReviewAssetRefs(exported!);
  expect(JSON.stringify(portable)).not.toContain('assetId');
  const parsed = parsePortableVideoReview(JSON.parse(JSON.stringify(portable)), stored.aggregateId);
  const restored = prepareVideoReviewRestore({
    review: parsed,
    sourceAggregateId: stored.aggregateId,
    targetAggregateId: 'recording:restored',
    sourceAssetId: 'new-source',
    assetIdMap: new Map([['camera', 'new-camera']]),
  });
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(
    new Set(['project-asset:new-camera'])
  );
  expect(restored.workspace.advanced.webcam).toEqual({
    ...webcam,
    assetId: 'project-asset:new-camera',
  });
  expect(restored.workspace.history[0]?.after).toHaveProperty('webcam.mirrored', true);
  expect(restored.workspace.cursor).toBe(0);
  expect(JSON.parse(restored.workspace.advanced.recoveryV1!)).toHaveProperty(
    'webcam.assetId',
    'project-asset:new-camera'
  );
  const workspaces = { put: vi.fn() },
    drafts = { put: vi.fn(), delete: vi.fn() };
  await putVideoReviewRestore({ review: restored, workspaces, drafts });
  expect(workspaces.put).toHaveBeenCalledWith(withReviewWorkspaceUsage(restored.workspace));
});

it('backs up disabled image history and restores it with newly allocated asset references', async () => {
  const initial = createQuickEditAdvancedState();
  const baseline = createQuickEditAdvancedContent();
  const image = {
    ...baseline,
    zoom: {
      enabled: true,
      regions: [
        {
          ...createQuickEditZoomRegion({ id: 'focus', at: 0 }),
          spotlight: createQuickEditSpotlight(),
        },
      ],
    },
    canvas: { width: 1080, height: 1920 },
    audio: { ...baseline.audio, laneVolumes: { voiceover: 0.5, music: 0.3 } },
    background: {
      enabled: true as const,
      type: 'image' as const,
      imageFit: 'cover' as const,
      assetId: 'project-asset:background',
      layout: { padding: 8, cornerRadius: 12 },
    },
  };
  const stored: VideoWorkspace = {
    ...workspace,
    advanced: initial,
    cursor: 0,
    history: [{ id: 'image', at: 2, target: 'advancedContent', before: baseline, after: image }],
  };
  const review = await readVideoReviewForBackup({
    db: snapshotDatabase(stored, undefined),
    aggregateId: stored.aggregateId,
    sourceAssetId: stored.sourceAssetId,
  });
  const portable = encodePortableReviewAssetRefs(review!);
  expect(JSON.stringify(portable)).not.toContain('assetId');
  const parsed = parsePortableVideoReview(JSON.parse(JSON.stringify(portable)), stored.aggregateId);
  const restored = prepareVideoReviewRestore({
    review: parsed,
    sourceAggregateId: stored.aggregateId,
    targetAggregateId: 'recording:restored',
    sourceAssetId: 'new-source',
    assetIdMap: new Map([['background', 'new-background']]),
  });
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(
    new Set(['project-asset:new-background'])
  );
  expect(restored.workspace.cursor).toBe(0);
  expect(restored.workspace.history[0]?.after).toMatchObject({
    zoom: { regions: [{ spotlight: createQuickEditSpotlight() }] },
    canvas: { width: 1080, height: 1920 },
    audio: { laneVolumes: { voiceover: 0.5, music: 0.3 } },
  });
  expect(restored.workspace.advanced.background).toEqual({ enabled: false });
  const workspaces = { put: vi.fn() },
    drafts = { put: vi.fn(), delete: vi.fn() };
  await putVideoReviewRestore({ review: restored, workspaces, drafts });
  expect(workspaces.put).toHaveBeenCalledWith(withReviewWorkspaceUsage(restored.workspace));
});

it.each([false, true])(
  'rejects local asset ids hidden in portable current, history, and recovery state (remembered=%s)',
  (remembered) => {
    const content = createQuickEditAdvancedContent();
    const rawImage = remembered
      ? {
          enabled: false,
          rememberedImage: { assetId: 'project-asset:local-secret', imageFit: 'cover' },
        }
      : {
          enabled: true as const,
          type: 'image' as const,
          imageFit: 'cover' as const,
          assetId: 'project-asset:local-secret',
          layout: { padding: 0, cornerRadius: 0 },
        };
    const cases = [
      { advanced: { ...workspace.advanced, background: rawImage } },
      {
        history: [
          {
            id: 'raw-history',
            at: 1,
            target: 'advancedContent' as const,
            before: content,
            after: { ...content, background: rawImage },
          },
        ],
      },
      {
        advanced: {
          ...workspace.advanced,
          recoveryV1: JSON.stringify({ ...content, background: rawImage }),
        },
      },
    ];
    const { sourceAssetId: _local, ...portableWorkspace } = workspace;
    for (const patch of cases) {
      expect(() =>
        parsePortableVideoReview(
          { workspace: { ...portableWorkspace, ...patch }, draft: null },
          workspace.aggregateId
        )
      ).toThrow('Portable video review contains a local asset id.');
    }
  }
);

it('rejects every portable asset reference that was not restored', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.audio.music = [
    {
      id: 'music',
      assetId: 'project-asset:known-local-id',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  const stored = { ...workspace, advanced };
  const { sourceAssetId: _local, ...portableWorkspace } = stored;
  const portable = encodePortableReviewAssetRefs({ workspace: portableWorkspace, draft: null });
  const parsed = parsePortableVideoReview(portable, stored.aggregateId);
  expect(() =>
    prepareVideoReviewRestore({
      review: parsed,
      sourceAggregateId: stored.aggregateId,
      targetAggregateId: 'recording:restored',
      sourceAssetId: 'new-source',
      assetIdMap: new Map([['unrelated', 'restored-unrelated']]),
    })
  ).toThrow('Portable video review asset reference is unresolved.');
});

it('transfers an inactive image choice even without history', async () => {
  const initial = createQuickEditAdvancedState();
  const baseline = createQuickEditAdvancedContent();
  const image = {
    ...baseline,
    zoom: {
      enabled: true,
      regions: [
        {
          ...createQuickEditZoomRegion({ id: 'focus', at: 0 }),
          spotlight: createQuickEditSpotlight(),
        },
      ],
    },
    canvas: { width: 1080, height: 1920 },
    audio: { ...baseline.audio, laneVolumes: { voiceover: 0.5, music: 0.3 } },
    background: {
      enabled: true as const,
      type: 'image' as const,
      imageFit: 'cover' as const,
      assetId: 'project-asset:background',
      layout: { padding: 8, cornerRadius: 12 },
    },
  };
  const stored: VideoWorkspace = {
    ...workspace,
    advanced: {
      ...initial,
      background: {
        enabled: false,
        rememberedImage: { assetId: image.background.assetId, imageFit: image.background.imageFit },
      },
    },
    cursor: 0,
    history: [],
  };
  const review = await readVideoReviewForBackup({
    db: snapshotDatabase(stored, undefined),
    aggregateId: stored.aggregateId,
    sourceAssetId: stored.sourceAssetId,
  });
  const portable = encodePortableReviewAssetRefs(review!);
  expect(JSON.stringify(portable)).not.toContain('assetId');
  const parsed = parsePortableVideoReview(JSON.parse(JSON.stringify(portable)), stored.aggregateId);
  const restored = prepareVideoReviewRestore({
    review: parsed,
    sourceAggregateId: stored.aggregateId,
    targetAggregateId: 'recording:restored',
    sourceAssetId: 'new-source',
    assetIdMap: new Map([['background', 'new-background']]),
  });
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(
    new Set(['project-asset:new-background'])
  );
  expect(restored.workspace.cursor).toBe(0);
  expect(restored.workspace.advanced.background).toEqual({
    enabled: false,
    rememberedImage: { assetId: 'project-asset:new-background', imageFit: 'cover' },
  });
  const workspaces = { put: vi.fn() },
    drafts = { put: vi.fn(), delete: vi.fn() };
  await putVideoReviewRestore({ review: restored, workspaces, drafts });
  expect(workspaces.put).toHaveBeenCalledWith(withReviewWorkspaceUsage(restored.workspace));
});

it('backs up remembered watermark bytes and remaps the exact slot across a restored aggregate', async () => {
  const { createQuickEditWatermark } =
    await import('../../../features/video/review/advanced/watermark');
  const watermark = {
    ...createQuickEditWatermark('Saved brand'),
    mode: 'none' as const,
    image: { assetId: 'project-asset:logo', width: 80, height: 40, size: 0.2, opacity: 0.8 },
  };
  const before = { ...createQuickEditAdvancedContent(), watermark };
  const stored: VideoWorkspace = {
    ...workspace,
    advanced: { ...workspace.advanced, watermark, recoveryV1: JSON.stringify({ watermark }) },
    cursor: 0,
    history: [
      {
        id: 'logo',
        at: 1,
        target: 'advancedContent',
        before,
        after: { ...before, watermark: { ...watermark, mode: 'text' } },
      },
    ],
  };
  const exported = await readVideoReviewForBackup({
    db: snapshotDatabase(stored, undefined),
    aggregateId: stored.aggregateId,
    sourceAssetId: stored.sourceAssetId,
  });
  const portable = encodePortableReviewAssetRefs(exported!);
  expect(JSON.stringify(portable)).not.toContain('assetId');
  const parsed = parsePortableVideoReview(JSON.parse(JSON.stringify(portable)), stored.aggregateId);
  const restored = prepareVideoReviewRestore({
    review: parsed,
    sourceAggregateId: stored.aggregateId,
    targetAggregateId: 'recording:copy',
    sourceAssetId: 'new-source',
    assetIdMap: new Map([['logo', 'new-logo']]),
  });
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(
    new Set(['project-asset:new-logo'])
  );
  expect(restored.workspace.advanced.watermark).toEqual({
    ...watermark,
    image: { ...watermark.image, assetId: 'project-asset:new-logo' },
  });
  expect(restored.workspace.history[0]?.after).toHaveProperty(
    'watermark.image.assetId',
    'project-asset:new-logo'
  );
  expect(JSON.parse(restored.workspace.advanced.recoveryV1!)).toHaveProperty(
    'watermark.image.assetId',
    'project-asset:new-logo'
  );
  expect(restored.workspace.cursor).toBe(0);
  const workspaces = { put: vi.fn() },
    drafts = { put: vi.fn(), delete: vi.fn() };
  await putVideoReviewRestore({ review: restored, workspaces, drafts });
  expect(workspaces.put).toHaveBeenCalledWith(withReviewWorkspaceUsage(restored.workspace));
});

it('backs up and restores scene variants under none including history and recovery with new identities', async () => {
  const { createNeutralPresentationSettings } =
    await import('../../../features/video/review/advanced/presentation');
  const presentation = createNeutralPresentationSettings();
  const framing = { fit: 'contain' as const, fillColor: '#000000ff', crop: { panX: 0, panY: 0 } };
  presentation.intro = {
    mode: 'none',
    image: { ...framing, assetId: 'project-asset:still', width: 20, height: 10, duration: 3 },
    video: {
      ...framing,
      assetId: 'project-asset:clip',
      source: { width: 20, height: 10, duration: 5, size: 10, mimeType: 'video/webm' },
      trim: { start: 1, end: 4 },
      audio: { muted: true, gain: 0.5 },
    },
  };
  presentation.outro = { mode: 'none', image: presentation.intro.image! };
  const before = { ...createQuickEditAdvancedContent(), presentation };
  const stored: VideoWorkspace = {
    ...workspace,
    advanced: { ...workspace.advanced, presentation, recoveryV1: JSON.stringify({ presentation }) },
    history: [
      {
        id: 'scene',
        at: 1,
        target: 'advancedContent',
        before,
        after: { ...before, presentation: { ...presentation, color: '#ffffffff' } },
      },
    ],
    cursor: 0,
  };
  const exported = await readVideoReviewForBackup({
    db: snapshotDatabase(stored, undefined),
    aggregateId: stored.aggregateId,
    sourceAssetId: stored.sourceAssetId,
  });
  const portable = encodePortableReviewAssetRefs(exported!);
  expect(JSON.stringify(portable)).not.toContain('assetId');
  const parsed = parsePortableVideoReview(JSON.parse(JSON.stringify(portable)), stored.aggregateId);
  const restored = prepareVideoReviewRestore({
    review: parsed,
    sourceAggregateId: stored.aggregateId,
    targetAggregateId: 'recording:copy',
    sourceAssetId: 'new-source',
    assetIdMap: new Map([
      ['still', 'new-still'],
      ['clip', 'new-clip'],
    ]),
  });
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(
    new Set(['project-asset:new-still', 'project-asset:new-clip'])
  );
  expect(restored.workspace.advanced.presentation?.intro.video).toMatchObject({
    assetId: 'project-asset:new-clip',
    trim: { start: 1, end: 4 },
    audio: { muted: true, gain: 0.5 },
  });
  expect(restored.workspace.history[0]?.after).toHaveProperty(
    'presentation.intro.image.assetId',
    'project-asset:new-still'
  );
  expect(JSON.parse(restored.workspace.advanced.recoveryV1!)).toHaveProperty(
    'presentation.intro.video.assetId',
    'project-asset:new-clip'
  );
});
