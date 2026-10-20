import { expect, it } from 'vitest';
import {
  createQuickEditAdvancedContent,
  createQuickEditAdvancedState,
} from '../../../features/video/review/advanced/defaults';
import type { VideoWorkspace } from './contracts';
import { collectReviewAssetReferences } from './asset-refs';
import { stripReviewAssetReference } from './strip-asset';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
import { parseVideoWorkspace } from './parser';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import { createSolidPaint } from '@sniptale/foundation/paint';

it('purges baseline resources and preserves authored content', () => {
  const workspace = makeWorkspace();
  const operation = workspace.history[0]!;
  if (operation.target !== 'advancedContent') throw new Error('Invalid fixture');
  workspace.advanced = { ...workspace.advanced, ...operation.after };
  workspace.formatVersion = 2;
  workspace.baseline = replayReviewHistory(
    [],
    0,
    workspace.source,
    reviewAdvancedContentBaseline(workspace.advanced)
  );
  workspace.baseline.edits = [
    { id: 'cut', kind: 'cut', start: 2, end: 3, requestedStart: 2, requestedEnd: 3 },
  ];
  workspace.baseline.annotations = [
    { id: 'note', text: 'Keep note', anchor: { kind: 'point', time: 6 } },
  ];
  workspace.baseline.canvasComments = [
    {
      id: 'comment',
      text: 'Keep overlay',
      visible: true,
      renderToVideo: true,
      attachment: 'content',
      position: { x: 0.5, y: 0.5 },
      style: { fillPaint: createSolidPaint('#123456ff'), textColor: '#ffffffff', radius: 8 },
    },
  ];
  const before = structuredClone(workspace.baseline.advancedContent);
  const after = structuredClone(before);
  after.audio.music[0]!.volume = 0.5;
  workspace.history = [{ id: 'retained-gain', at: 1, target: 'advancedContent', before, after }];
  expect(parseVideoWorkspace(workspace)).not.toBeNull();
  const untouched = structuredClone(workspace);
  const stripped = stripReviewAssetReference(workspace, removed, 2);
  expect(parseVideoWorkspace(stripped)).not.toBeNull();
  expect(collectReviewAssetReferences(stripped)).toEqual(new Set([retained]));
  expect(stripped.baseline).toMatchObject({
    edits: untouched.baseline!.edits,
    annotations: untouched.baseline!.annotations,
    canvasComments: untouched.baseline!.canvasComments,
  });
  expect(stripped.baseline!.advancedContent.audio.voiceover).toEqual([]);
  expect(stripped.history).toHaveLength(1);
  expect(workspace).toEqual(untouched);
});

it.each([
  [true, 0],
  [true, 1],
  [false, 0],
  [false, 1],
] as const)(
  'strips linked take mutes from baseline=%s and history cursor=%i',
  (baseline, cursor) => {
    const workspace = makeWorkspace();
    const operation = workspace.history[0]!;
    if (operation.target !== 'advancedContent') throw new Error('Invalid fixture target');
    const audio = structuredClone(operation.after.audio);
    audio.voiceoverSegments = buildReviewTimeMap(10, []);
    audio.voiceover.push({ ...audio.voiceover[0]!, id: 'kept', assetId: retained });
    audio.original.ranges = [{ id: 'gain', start: 2, end: 3, volume: 1.5 }];
    audio.original.mutes = [
      { id: 'removed-mute', kind: 'take', clipId: 'voice' },
      { id: 'retained-mute', kind: 'take', clipId: 'kept' },
      { id: 'detached', kind: 'range', start: 4, end: 5, volume: 0.5 },
    ];
    const before = { ...createQuickEditAdvancedContent(), audio: structuredClone(audio) };
    if (!baseline) {
      before.audio.voiceover = before.audio.voiceover.filter((clip) => clip.id !== 'voice');
      before.audio.original.mutes = before.audio.original.mutes!.filter(
        (mute) => mute.id !== 'removed-mute'
      );
    }
    const after = { ...before, audio: structuredClone(audio) };
    after.audio.voiceover.find((clip) => clip.id === 'kept')!.volume = 1.25;
    workspace.advanced = {
      ...createQuickEditAdvancedState(),
      ...before,
      recoveryV1: JSON.stringify({ audio, unrelated: 'preserve' }),
    };
    workspace.history = [{ id: 'mute', at: 1, target: 'advancedContent', before, after }];
    workspace.cursor = cursor;
    expect(parseVideoWorkspace(workspace)).not.toBeNull();
    const untouched = structuredClone(workspace);
    const stripped = stripReviewAssetReference(workspace, removed, 2);
    const expected = audio.original.mutes.filter((mute) => mute.id !== 'removed-mute');
    const contents = [
      stripped.advanced,
      ...stripped.history.flatMap((op) =>
        op.target === 'advancedContent' ? [op.before, op.after] : []
      ),
    ];
    for (const content of contents) {
      expect(content.audio.original.mutes).toEqual(expected);
      expect(content.audio.original.ranges).toEqual(audio.original.ranges);
      expect(content.audio.voiceover.map((clip) => clip.id)).toEqual(['kept']);
    }
    expect(stripped.cursor).toBe(cursor);
    expect(stripped.history).toHaveLength(1);
    expect(collectReviewAssetReferences(stripped)).toEqual(new Set([retained]));
    const recovery = JSON.parse(stripped.advanced.recoveryV1!);
    expect(recovery.audio.original.mutes).toEqual(expected);
    expect(recovery.audio.voiceover.map((clip: { id: string }) => clip.id)).toEqual(['kept']);
    expect(recovery.unrelated).toBe('preserve');
    expect(workspace).toEqual(untouched);
  }
);

const removed = 'project-asset:voice-old';
const retained = 'project-asset:music-new';

it.each([0, 1])(
  'removes a webcam-only operation without corrupting history cursor %i',
  (cursor) => {
    const workspace = makeWorkspace();
    const before = createQuickEditAdvancedContent();
    const after = {
      ...before,
      webcam: createQuickEditWebcam(
        removed,
        { width: 640, height: 480 },
        { width: 640, height: 360 }
      ),
    };
    workspace.advanced = createQuickEditAdvancedState();
    workspace.history = [{ id: 'camera', at: 1, target: 'advancedContent', before, after }];
    workspace.cursor = cursor;
    const result = stripReviewAssetReference(workspace, removed, 2);
    expect(result.history).toEqual([]);
    expect(result.cursor).toBe(0);
    expect(collectReviewAssetReferences(result).size).toBe(0);
  }
);

it('detaches disabled camera from baseline, undo/redo and recovery without resurrection', () => {
  const workspace = makeWorkspace();
  const webcam = {
    ...createQuickEditWebcam(removed, { width: 640, height: 480 }, { width: 640, height: 360 }),
    enabled: false,
  };
  workspace.advanced.webcam = webcam;
  workspace.advanced.recoveryV1 = JSON.stringify({ webcam });
  for (const operation of workspace.history) {
    if (operation.target !== 'advancedContent') continue;
    operation.before.webcam = webcam;
    operation.after.webcam = { ...webcam, offsetSeconds: 1 };
  }
  const result = stripReviewAssetReference(workspace, removed, 2);
  expect(result.advanced).not.toHaveProperty('webcam');
  expect(JSON.parse(result.advanced.recoveryV1!)).not.toHaveProperty('webcam');
  expect(collectReviewAssetReferences(result)).toEqual(new Set([retained]));
  for (const operation of result.history) {
    if (operation.target !== 'advancedContent') continue;
    expect(operation.before).not.toHaveProperty('webcam');
    expect(operation.after).not.toHaveProperty('webcam');
  }
  expect(workspace.advanced.webcam).toEqual(webcam);
});

function makeWorkspace(): VideoWorkspace {
  const before = createQuickEditAdvancedContent();
  const after = {
    ...before,
    background: {
      enabled: true as const,
      type: 'image' as const,
      assetId: removed,
      imageFit: 'cover' as const,
      layout: { padding: 0, cornerRadius: 0 },
    },
    audio: {
      ...before.audio,
      voiceover: [
        {
          id: 'voice',
          assetId: removed,
          timelineStart: 0,
          sourceOffset: 0,
          duration: 1,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
      music: [
        {
          id: 'music',
          assetId: retained,
          timelineStart: 0,
          sourceOffset: 0,
          duration: 1,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
    },
  };
  return {
    aggregateId: 'recording:source',
    formatVersion: 1,
    source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 100 },
    sourceAssetId: 'source-object',
    revision: 1,
    history: [{ id: 'op', at: 1, target: 'advancedContent', before, after }],
    cursor: 1,
    advanced: {
      ...createQuickEditAdvancedState(),
      recoveryV1: JSON.stringify({
        audio: { voiceover: [{ assetId: removed }], music: [{ assetId: retained }] },
      }),
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

it('removes auxiliary material from current, undo/redo and recovery without touching other media', () => {
  const workspace = makeWorkspace();
  const result = stripReviewAssetReference(workspace, removed, 2);
  expect([...collectReviewAssetReferences(result)]).toEqual([retained]);
  expect(result.revision).toBe(2);
  expect(result.history[0]).toMatchObject({
    after: {
      background: { enabled: false },
      audio: { voiceover: [], music: [{ assetId: retained }] },
    },
  });
  expect(workspace.history[0]).toMatchObject({
    after: { audio: { voiceover: [{ assetId: removed }] } },
  });
});

it('preserves an unrelated workspace without changing its revision', () => {
  const workspace = makeWorkspace();
  expect(stripReviewAssetReference(workspace, 'project-asset:other', 2)).toBe(workspace);
});

it('rejects deletion when the selected material is the required source', () => {
  const workspace = { ...makeWorkspace(), sourceAssetId: removed };
  expect(() => stripReviewAssetReference(workspace, removed, 2)).toThrow(
    'required quick-edit source'
  );
});

it('preserves unreadable legacy recovery while stripping valid current and history references', () => {
  const workspace = makeWorkspace();
  workspace.advanced.recoveryV1 = '{invalid';
  const result = stripReviewAssetReference(workspace, removed, 2);
  expect(result.advanced.recoveryV1).toBe('{invalid');
  expect([...collectReviewAssetReferences(result)]).toEqual([retained]);
});

it('removes remembered backgrounds from current, history and recovery while keeping visible paint', () => {
  const workspace = makeWorkspace();
  const background = {
    enabled: true as const,
    type: 'solid' as const,
    color: '#000000ff',
    layout: { padding: 40, cornerRadius: 12 },
    rememberedImage: { assetId: removed, imageFit: 'contain' as const },
  };
  workspace.advanced.background = background;
  workspace.advanced.recoveryV1 = JSON.stringify({ background });
  for (const operation of workspace.history) {
    if (operation.target !== 'advancedContent') continue;
    operation.before.background = background;
    operation.after.background = background;
  }
  const result = stripReviewAssetReference(workspace, removed, 2);
  expect(result.advanced.background).toEqual({
    enabled: true,
    type: 'solid',
    color: '#000000ff',
    layout: background.layout,
  });
  expect(collectReviewAssetReferences(result)).toEqual(new Set([retained]));
  expect(JSON.parse(result.advanced.recoveryV1!).background).not.toHaveProperty('rememberedImage');
  expect(workspace.advanced.background).toEqual(background);
});

it('removes generated audio from all snapshots while preserving original audio and text', async () => {
  const { reviewSpeechTextSignature } =
    await import('../../../features/video/review/speech-transcript');
  const profile = { modelId: 'speech', voiceId: 'alloy', responseFormat: 'mp3' as const };
  const transcript = {
    version: 1 as const,
    profile,
    phrases: [
      {
        id: 'p',
        start: 0,
        end: 1,
        originalText: 'Original',
        text: 'Edited',
        revision: 1,
        alignment: 'manual' as const,
      },
    ],
    replacements: [
      {
        id: 'take',
        start: 0,
        end: 1,
        duration: 0.5,
        assetId: removed,
        phraseId: 'p',
        revision: 1,
        text: 'Edited',
        textSignature: reviewSpeechTextSignature('Edited', profile),
        profile,
      },
    ],
  };
  const voice = {
    id: 'voice',
    assetId: retained,
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transcript,
  };
  const originalSpeech = {
    enabled: false,
    transcript: {
      ...transcript,
      replacements: transcript.replacements.map((entry) => ({
        ...entry,
        enabled: false,
        originalVolume: 0.25,
      })),
    },
  };
  const workspace = makeWorkspace();
  workspace.advanced.audio.originalSpeech = originalSpeech;
  workspace.advanced.audio.voiceover = [voice];
  workspace.advanced.recoveryV1 = JSON.stringify({
    audio: { voiceover: [voice], music: [], originalSpeech },
  });
  const before = createQuickEditAdvancedContent();
  before.audio.voiceover = [voice];
  before.audio.originalSpeech = originalSpeech;
  const after = structuredClone(before);
  after.audio.voiceover[0]!.transcript!.replacements = [];
  after.audio.originalSpeech!.transcript.replacements = [];
  workspace.history = [{ id: 'restore', at: 1, target: 'advancedContent', before, after }];
  const result = stripReviewAssetReference(workspace, removed, 2);
  expect(result.advanced.audio.voiceover[0]).toMatchObject({
    assetId: retained,
    transcript: { phrases: transcript.phrases, replacements: [] },
  });
  expect(
    JSON.parse(result.advanced.recoveryV1!).audio.voiceover[0].transcript.replacements
  ).toEqual([]);
  expect(result.advanced.audio.originalSpeech).toEqual({
    ...originalSpeech,
    transcript: { ...originalSpeech.transcript, replacements: [] },
  });
  expect(
    JSON.parse(result.advanced.recoveryV1!).audio.originalSpeech.transcript.replacements
  ).toEqual([]);
  expect(workspace.advanced.audio.originalSpeech!.transcript.replacements).toHaveLength(1);
  expect(result.history).toEqual([]);
  expect(result.cursor).toBe(0);
  expect(collectReviewAssetReferences(result)).toEqual(new Set([retained]));
  expect(workspace.advanced.audio.voiceover[0]!.transcript!.replacements).toHaveLength(1);
});

it.each(['none', 'text', 'image'] as const)(
  'purges a remembered logo in %s without erasing authored text',
  async (mode) => {
    const { createQuickEditWatermark } =
      await import('../../../features/video/project/scene/watermark');
    const watermark = {
      ...createQuickEditWatermark('Keep this text'),
      mode,
      image: { assetId: removed, width: 80, height: 40, size: 0.2, opacity: 1 },
    };
    const workspace = makeWorkspace();
    workspace.advanced.watermark = watermark;
    workspace.advanced.recoveryV1 = JSON.stringify({ watermark });
    for (const operation of workspace.history) {
      if (operation.target !== 'advancedContent') continue;
      operation.before.watermark = watermark;
      operation.after.watermark = watermark;
    }
    const result = stripReviewAssetReference(workspace, removed, 2);
    expect(result.advanced.watermark).not.toHaveProperty('image');
    expect(result.advanced.watermark?.text).toEqual(watermark.text);
    expect(result.advanced.watermark?.mode).toBe(mode === 'image' ? 'none' : mode);
    expect(JSON.parse(result.advanced.recoveryV1!).watermark).not.toHaveProperty('image');
    expect(collectReviewAssetReferences(result)).toEqual(new Set([retained]));
    for (const operation of result.history) {
      if (operation.target !== 'advancedContent') continue;
      expect(operation.before.watermark).not.toHaveProperty('image');
      expect(operation.after.watermark).not.toHaveProperty('image');
    }
    expect(workspace.advanced.watermark.image).toEqual(watermark.image);
  }
);

it('purges an active bookend image but retains its remembered video and unrelated slot', async () => {
  const { createNeutralPresentationSettings } =
    await import('../../../features/video/review/advanced/presentation');
  const workspace = makeWorkspace();
  workspace.history = [];
  workspace.cursor = 0;
  workspace.advanced = createQuickEditAdvancedState();
  const presentation = createNeutralPresentationSettings();
  const framing = { fit: 'contain' as const, fillColor: '#000000ff', crop: { panX: 0, panY: 0 } };
  presentation.intro = {
    mode: 'image',
    image: { ...framing, assetId: removed, width: 20, height: 10, duration: 3 },
    video: {
      ...framing,
      assetId: retained,
      source: { width: 20, height: 10, duration: 5, size: 10, mimeType: 'video/webm' },
      trim: { start: 0, end: 5 },
      audio: { muted: false, gain: 1 },
    },
  };
  presentation.outro = { mode: 'none', image: { ...presentation.intro.image, assetId: retained } };
  workspace.advanced.presentation = presentation;
  workspace.advanced.recoveryV1 = JSON.stringify({ presentation });
  const stripped = stripReviewAssetReference(workspace, removed, 2);
  expect(stripped.advanced.presentation?.intro).toEqual({
    mode: 'none',
    video: presentation.intro.video,
  });
  expect(stripped.advanced.presentation?.outro).toEqual(presentation.outro);
  expect(collectReviewAssetReferences(stripped)).toEqual(new Set([retained]));
  expect(JSON.parse(stripped.advanced.recoveryV1!).presentation.intro).toEqual(
    stripped.advanced.presentation?.intro
  );
});
