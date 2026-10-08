import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectReviewAssetReferences,
  decodePortableReviewAssetRefs,
  encodePortableReviewAssetRefs,
  remapReviewAssetReferences,
} from './asset-refs';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import type { VideoWorkspace, VideoWorkspaceSnapshot } from './contracts';
import type { QuickEditAdvancedState } from '../../../features/video/review/advanced/types';
import { QUICK_EDIT_ADVANCED_SCHEMA_VERSION } from '../../../features/video/review/advanced/types';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';
import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import { assertPortableReviewAssetRefs } from './asset-refs';

vi.mock('../infrastructure/indexed-db/core', () => ({}));

const advanced = (patch: Partial<QuickEditAdvancedState>): QuickEditAdvancedState => ({
  schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
  ui: {
    mode: 'basic',
    tracks: { actions: true, zoom: false, audio: false },
    overlaysVisible: true,
  },
  zoom: { enabled: false, regions: [] },
  background: { enabled: false },
  audio: { original: { muted: false, volume: 1 }, voiceover: [], music: [] },
  ...patch,
});

afterEach(() => vi.clearAllMocks());

it('retains disabled webcam references in every history and recovery position and remaps portable refs', () => {
  const webcam = (id: string) => ({
    ...createQuickEditWebcam(
      `project-asset:${id}`,
      { width: 640, height: 480 },
      { width: 1920, height: 1080 }
    ),
    enabled: false,
  });
  const baseline = advanced({ webcam: webcam('base') });
  const snapshot: VideoWorkspaceSnapshot = {
    draft: null,
    workspace: {
      formatVersion: 1,
      aggregateId: 'recording:main',
      sourceAssetId: 'main',
      source: { duration: 12, width: 1920, height: 1080, mimeType: 'video/webm', size: 100 },
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      cursor: 0,
      advanced: { ...baseline, recoveryV1: JSON.stringify({ webcam: webcam('recovery') }) },
      history: [
        {
          id: 'attach',
          at: 1,
          target: 'advancedContent',
          before: reviewAdvancedContentBaseline(baseline),
          after: { ...reviewAdvancedContentBaseline(baseline), webcam: webcam('after') },
        },
      ],
    },
  };
  const references = ['base', 'recovery', 'after'];
  expect(collectReviewAssetReferences(snapshot.workspace)).toEqual(
    new Set(references.map((id) => `project-asset:${id}`))
  );
  expect(() => assertPortableReviewAssetRefs(snapshot.workspace)).toThrow('local asset id');
  const portable = encodePortableReviewAssetRefs(snapshot);
  expect(() => assertPortableReviewAssetRefs(portable.workspace)).not.toThrow();
  expect(JSON.stringify(portable.workspace.advanced.webcam)).toContain('assetRef');
  const decoded = decodePortableReviewAssetRefs(portable.workspace);
  expect({ ...decoded, advanced: { ...decoded.advanced, recoveryV1: undefined } }).toEqual({
    ...snapshot.workspace,
    advanced: { ...snapshot.workspace.advanced, recoveryV1: undefined },
  });
  expect(JSON.parse(decoded.advanced.recoveryV1!)).toEqual(
    JSON.parse(snapshot.workspace.advanced.recoveryV1!)
  );
  expect(() => remapReviewAssetReferences(snapshot, new Map())).toThrow('unresolved');
  const restored = remapReviewAssetReferences(
    snapshot,
    new Map(references.map((id) => [id, `${id}-restored`]))
  );
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(
    new Set(references.map((id) => `project-asset:${id}-restored`))
  );
  expect(snapshot.workspace.advanced.webcam?.assetId).toBe('project-asset:base');
});

describe('collectReviewAssetReferences', () => {
  it('collects every audio lane reference and recovery copy reference', () => {
    const snapshot = {
      workspace: {
        aggregateId: 'recording:a',
        sourceAssetId: 'asset:1',
        advanced: advanced({
          audio: {
            original: { muted: false, volume: 1 },
            voiceover: [
              {
                id: 'v',
                assetId: 'project-asset:voice',
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
                id: 'm',
                assetId: 'project-asset:music',
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
          recoveryV1: JSON.stringify({
            schemaVersion: 1,
            audio: {
              original: { muted: false, volume: 1 },
              voiceover: [],
              music: [{ assetId: 'project-asset:v1music', timelineStart: 0, duration: 1 }],
            },
          }),
        }),
      },
      draft: null,
    };
    expect(collectReviewAssetReferences(snapshot.workspace as VideoWorkspace)).toEqual(
      new Set(['project-asset:voice', 'project-asset:music', 'project-asset:v1music'])
    );
  });

  it('returns nothing for a workspace without advanced audio', () => {
    const empty = {
      workspace: {
        aggregateId: 'recording:a',
        sourceAssetId: 'asset:1',
        advanced: advanced({}),
      },
      draft: null,
    };
    expect(collectReviewAssetReferences(empty.workspace as VideoWorkspace)).toEqual(new Set());
  });
});

describe('remapReviewAssetReferences', () => {
  it('replaces lane references in the advanced state and the raw recovery copy', () => {
    const withRefs = advanced({
      audio: {
        original: { muted: false, volume: 1 },
        voiceover: [],
        music: [
          {
            id: 'm',
            assetId: 'project-asset:music',
            timelineStart: 1,
            sourceOffset: 0,
            duration: 2,
            volume: 1,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
          },
        ],
      },
      recoveryV1: JSON.stringify({
        schemaVersion: 1,
        audio: {
          original: { muted: false, volume: 1 },
          voiceover: [{ assetId: 'project-asset:old-voice', timelineStart: 0, duration: 1 }],
          music: [{ assetId: 'project-asset:music', timelineStart: 0, duration: 1 }],
        },
      }),
    });
    const snapshot = {
      workspace: {
        aggregateId: 'recording:a',
        sourceAssetId: 'asset:1',
        advanced: withRefs,
      },
      draft: null,
    } as VideoWorkspaceSnapshot;
    expect(() =>
      remapReviewAssetReferences(
        snapshot,
        new Map([['project-asset:unrelated', 'project-asset:x']])
      )
    ).toThrow('Portable video review asset reference is unresolved.');
    const result = remapReviewAssetReferences(
      snapshot,
      new Map([
        ['project-asset:music', 'project-asset:music2'],
        ['project-asset:old-voice', 'project-asset:old-voice2'],
      ])
    );
    expect(result).not.toBe(snapshot);
    expect(result.workspace.advanced.audio.music[0]!.assetId).toBe('project-asset:music2');
    const recovered = JSON.parse(result.workspace.advanced.recoveryV1!) as {
      audio: { music: { assetId: string }[]; voiceover: { assetId: string }[] };
    };
    expect(recovered.audio.music[0]!.assetId).toBe('project-asset:music2');
    expect(recovered.audio.voiceover[0]!.assetId).toBe('project-asset:old-voice2');
    expect(result.workspace.sourceAssetId).toBe(snapshot.workspace.sourceAssetId);
    expect(snapshot.workspace.advanced.audio.music[0]!.assetId).toBe('project-asset:music');
  });

  it('accepts bare stored entry ids in the restored asset map', () => {
    const withRefs = advanced({
      audio: {
        original: { muted: false, volume: 1 },
        voiceover: [],
        music: [
          {
            id: 'm',
            assetId: 'project-asset:music',
            timelineStart: 1,
            sourceOffset: 0,
            duration: 2,
            volume: 1,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
          },
        ],
      },
    });
    const snapshot = {
      workspace: { aggregateId: 'recording:a', sourceAssetId: 'asset:1', advanced: withRefs },
      draft: null,
    } as VideoWorkspaceSnapshot;
    const result = remapReviewAssetReferences(snapshot, new Map([['music', 'restored-music']]));
    expect(result.workspace.advanced.audio.music[0]!.assetId).toBe('project-asset:restored-music');
  });

  it.each(['image', 'audio'] as const)(
    'rejects an unresolved %s reference retained by recovery JSON',
    (kind) => {
      const recovery =
        kind === 'image'
          ? {
              background: {
                enabled: true,
                type: 'image',
                assetId: 'project-asset:missing-image',
                imageFit: 'cover',
                layout: { padding: 0, cornerRadius: 0 },
              },
            }
          : {
              audio: {
                original: { muted: false, volume: 1 },
                voiceover: [],
                music: [{ assetId: 'project-asset:missing-audio' }],
              },
            };
      const snapshot = {
        workspace: {
          aggregateId: 'recording:a',
          sourceAssetId: 'asset:1',
          advanced: advanced({ recoveryV1: JSON.stringify(recovery) }),
        },
        draft: null,
      } as VideoWorkspaceSnapshot;

      expect(() => remapReviewAssetReferences(snapshot, new Map())).toThrow(
        'Portable video review asset reference is unresolved.'
      );
    }
  );
});

it('collects, remaps, and portably encodes audio refs inside advancedContent history ops', () => {
  const audio = (assetId: string) => ({
    original: { muted: false, volume: 1 },
    voiceover: [
      {
        id: 'v1',
        assetId,
        timelineStart: 0,
        sourceOffset: 0,
        duration: 1,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
      },
    ],
    music: [],
  });
  const content = (assetId: string) => ({
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    zoom: { enabled: false, regions: [] },
    background: { enabled: false },
    audio: audio(assetId),
  });
  const snapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 5 },
      revision: 2,
      cursor: 1,
      advanced: { ...createQuickEditAdvancedState(), audio: audio('project-asset:take') },
      history: [
        {
          id: 'op1',
          at: 2,
          target: 'advancedContent' as const,
          before: content('project-asset:take'),
          after: content('project-asset:music'),
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    },
    draft: null,
  } as unknown as VideoWorkspaceSnapshot;
  const references = collectReviewAssetReferences(snapshot.workspace);
  expect([...references]).toEqual(['project-asset:take', 'project-asset:music']);
  const map = new Map([
    ['take', 'restored-take'],
    ['music', 'restored-music'],
  ]);
  const remapped = remapReviewAssetReferences(snapshot, map);
  const op = remapped.workspace.history[0] as {
    target: string;
    before: { audio: { voiceover: { assetId: string }[] } };
    after: { audio: { voiceover: { assetId: string }[] } };
  };
  expect(op.before.audio.voiceover[0]!.assetId).toBe('project-asset:restored-take');
  expect(op.after.audio.voiceover[0]!.assetId).toBe('project-asset:restored-music');
  const portable = encodePortableReviewAssetRefs(remapped) as {
    workspace: {
      history: { before: { audio: { voiceover: { assetRef?: string; assetId?: string }[] } } }[];
    };
  };
  expect(portable.workspace.history[0]!.before.audio.voiceover[0]!.assetRef).toBe(
    'project-asset:restored-take'
  );
  const restoredWorkspace = decodePortableReviewAssetRefs(portable.workspace) as {
    history: { before: { audio: { voiceover: { assetId: string }[] } } }[];
  };
  expect(restoredWorkspace.history[0]!.before.audio.voiceover[0]!.assetId).toBe(
    'project-asset:restored-take'
  );
});

it('retains and portably remaps images in current content, undo history, and recovery', () => {
  const image = (id: string) => ({
    enabled: true as const,
    type: 'image' as const,
    imageFit: 'cover' as const,
    assetId: `project-asset:${id}`,
    layout: { padding: 8, cornerRadius: 12 },
  });
  const content = (id: string) => ({ ...createQuickEditAdvancedState(), background: image(id) });
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 5 },
      revision: 2,
      cursor: 0,
      createdAt: 1,
      updatedAt: 2,
      advanced: {
        ...content('current'),
        recoveryV1: JSON.stringify({ background: image('recovery') }),
      },
      history: [
        {
          id: 'op',
          at: 1,
          target: 'advancedContent',
          before: content('before'),
          after: content('after'),
        },
      ],
    },
    draft: null,
  };
  expect(collectReviewAssetReferences(snapshot.workspace)).toEqual(
    new Set([
      'project-asset:current',
      'project-asset:recovery',
      'project-asset:before',
      'project-asset:after',
    ])
  );
  const portable = encodePortableReviewAssetRefs(snapshot);
  expect(JSON.stringify(portable)).not.toContain('assetId');
  const decoded = decodePortableReviewAssetRefs(portable.workspace);
  expect(JSON.parse(decoded.advanced.recoveryV1!)).toEqual(
    JSON.parse(snapshot.workspace.advanced.recoveryV1!)
  );
  expect({ ...decoded, advanced: { ...decoded.advanced, recoveryV1: undefined } }).toEqual({
    ...snapshot.workspace,
    advanced: { ...snapshot.workspace.advanced, recoveryV1: undefined },
  });
  const map = new Map(
    ['current', 'before', 'after', 'recovery'].map((id) => [id, `restored-${id}`])
  );
  const restored = remapReviewAssetReferences(snapshot, map);
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(
    new Set([
      'project-asset:restored-current',
      'project-asset:restored-recovery',
      'project-asset:restored-before',
      'project-asset:restored-after',
    ])
  );
  expect(collectReviewAssetReferences(snapshot.workspace)).toContain('project-asset:current');
});

it('retains inactive background references in every history and recovery position and remaps portable refs', () => {
  const background = (id: string) => ({
    enabled: false as const,
    rememberedImage: { assetId: `project-asset:${id}`, imageFit: 'contain' as const },
  });
  const baseline = advanced({ background: background('base') });
  const snapshot: VideoWorkspaceSnapshot = {
    draft: null,
    workspace: {
      formatVersion: 1,
      aggregateId: 'recording:main',
      sourceAssetId: 'main',
      source: { duration: 12, width: 1920, height: 1080, mimeType: 'video/webm', size: 100 },
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      cursor: 0,
      advanced: { ...baseline, recoveryV1: JSON.stringify({ background: background('recovery') }) },
      history: [
        {
          id: 'attach',
          at: 1,
          target: 'advancedContent',
          before: reviewAdvancedContentBaseline(baseline),
          after: { ...reviewAdvancedContentBaseline(baseline), background: background('after') },
        },
      ],
    },
  };
  const references = ['base', 'recovery', 'after'];
  expect(collectReviewAssetReferences(snapshot.workspace)).toEqual(
    new Set(references.map((id) => `project-asset:${id}`))
  );
  expect(() => assertPortableReviewAssetRefs(snapshot.workspace)).toThrow('local asset id');
  const portable = encodePortableReviewAssetRefs(snapshot);
  expect(() => assertPortableReviewAssetRefs(portable.workspace)).not.toThrow();
  expect(JSON.stringify(portable.workspace.advanced.background)).toContain('assetRef');
  const decoded = decodePortableReviewAssetRefs(portable.workspace);
  expect({ ...decoded, advanced: { ...decoded.advanced, recoveryV1: undefined } }).toEqual({
    ...snapshot.workspace,
    advanced: { ...snapshot.workspace.advanced, recoveryV1: undefined },
  });
  expect(JSON.parse(decoded.advanced.recoveryV1!)).toEqual(
    JSON.parse(snapshot.workspace.advanced.recoveryV1!)
  );
  expect(() => remapReviewAssetReferences(snapshot, new Map())).toThrow('unresolved');
  const restored = remapReviewAssetReferences(
    snapshot,
    new Map(references.map((id) => [id, `${id}-restored`]))
  );
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(
    new Set(references.map((id) => `project-asset:${id}-restored`))
  );
  expect(snapshot.workspace.advanced.background.rememberedImage?.assetId).toBe(
    'project-asset:base'
  );
});

it('roundtrips speech assets across current, history and recovery with portable keys', async () => {
  const { reviewSpeechTextSignature } =
    await import('../../../features/video/review/speech-transcript');
  const { parseVideoWorkspace } = await import('./parser');
  const profile = { modelId: 'speech', voiceId: 'alloy', responseFormat: 'mp3' as const };
  const speech = (id: string) => ({
    version: 1 as const,
    profile,
    phrases: [
      {
        id: 'p',
        start: 0,
        end: 2,
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
        end: 2,
        duration: 1,
        assetId: `project-asset:${id}`,
        phraseId: 'p',
        revision: 1,
        text: 'Edited',
        textSignature: reviewSpeechTextSignature('Edited', profile),
        profile,
      },
    ],
  });
  const state = createQuickEditAdvancedState();
  state.audio.voiceover.push({
    id: 'voice',
    assetId: 'project-asset:original',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 4,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transcript: speech('generated'),
  });
  const before = reviewAdvancedContentBaseline(state);
  const after = structuredClone(before);
  after.audio.voiceover[0]!.transcript = speech('history');
  const snapshot: VideoWorkspaceSnapshot = {
    draft: null,
    workspace: {
      aggregateId: 'recording:speech',
      formatVersion: 1,
      sourceAssetId: 'source',
      source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 100 },
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      cursor: 1,
      advanced: {
        ...state,
        recoveryV1: JSON.stringify({
          audio: {
            voiceover: [{ assetId: 'project-asset:original', transcript: speech('recovery') }],
            music: [],
          },
        }),
      },
      history: [{ id: 'apply', at: 1, target: 'advancedContent', before, after }],
    },
  };
  const expected = ['original', 'generated', 'history', 'recovery'];
  expect(collectReviewAssetReferences(snapshot.workspace)).toEqual(
    new Set(expected.map((id) => `project-asset:${id}`))
  );
  const portable = encodePortableReviewAssetRefs(snapshot);
  expect(JSON.stringify(portable)).not.toContain('"assetId"');
  expect(() => assertPortableReviewAssetRefs(portable.workspace)).not.toThrow();
  const decoded = decodePortableReviewAssetRefs(portable.workspace);
  expect({ ...decoded, advanced: { ...decoded.advanced, recoveryV1: undefined } }).toEqual({
    ...snapshot.workspace,
    advanced: { ...snapshot.workspace.advanced, recoveryV1: undefined },
  });
  expect(JSON.parse(decoded.advanced.recoveryV1!)).toEqual(
    JSON.parse(snapshot.workspace.advanced.recoveryV1!)
  );
  const forged = structuredClone(portable.workspace);
  forged.advanced.audio.voiceover[0]!.transcript!.replacements[0]!.assetId =
    'project-asset:injected';
  expect(() => assertPortableReviewAssetRefs(forged)).toThrow('local asset id');
  expect(() => remapReviewAssetReferences(snapshot, new Map([['original', 'mapped']]))).toThrow(
    'unresolved'
  );
  const remapped = remapReviewAssetReferences(
    snapshot,
    new Map(expected.map((id) => [id, `${id}-restored`]))
  );
  expect(collectReviewAssetReferences(remapped.workspace)).toEqual(
    new Set(expected.map((id) => `project-asset:${id}-restored`))
  );
  const parsed = parseVideoWorkspace(snapshot.workspace);
  expect(parsed?.history).toEqual(snapshot.workspace.history);
  expect(parsed?.advanced.audio.voiceover[0]?.transcript).toEqual(speech('generated'));
});

it('finds the exact audio clip in current, history and recovery without confusing shared assets', async () => {
  const { reviewWorkspaceHasAudioClip } = await import('./asset-refs');
  const { createQuickEditAudioClip } =
    await import('../../../features/video/review/advanced/audio');
  const clip = createQuickEditAudioClip({
    id: 'selected',
    assetId: 'project-asset:shared',
    timelineStart: 0,
    duration: 1,
    endMax: 12,
  });
  const current = advanced({});
  const content = reviewAdvancedContentBaseline(current);
  const withClip = { ...content, audio: { ...content.audio, music: [clip] } };
  const cases: Pick<VideoWorkspace, 'advanced' | 'history'>[] = [
    { advanced: { ...current, audio: withClip.audio }, history: [] },
    {
      advanced: current,
      history: [{ id: 'op', at: 1, target: 'advancedContent', before: content, after: withClip }],
    },
    { advanced: { ...current, recoveryV1: JSON.stringify(withClip) }, history: [] },
  ];
  for (const workspace of cases) {
    expect(reviewWorkspaceHasAudioClip(workspace, 'selected', 'project-asset:shared')).toBe(true);
    expect(reviewWorkspaceHasAudioClip(workspace, 'other', 'project-asset:shared')).toBe(false);
    expect(reviewWorkspaceHasAudioClip(workspace, 'selected', 'project-asset:other')).toBe(false);
  }
});

it('retains remembered watermark logos across portable current, history and recovery', async () => {
  const { createQuickEditWatermark } =
    await import('../../../features/video/review/advanced/watermark');
  const { reviewWorkspaceHasWatermarkImage } = await import('./asset-refs');
  const logo = (id: string) => ({
    ...createQuickEditWatermark('Saved text'),
    mode: 'text' as const,
    image: { assetId: `project-asset:${id}`, width: 80, height: 40, size: 0.2, opacity: 0.5 },
  });
  const baseline = advanced({ watermark: logo('base') });
  const snapshot: VideoWorkspaceSnapshot = {
    draft: null,
    workspace: {
      formatVersion: 1,
      aggregateId: 'recording:main',
      sourceAssetId: 'main',
      source: { duration: 12, width: 1920, height: 1080, mimeType: 'video/webm', size: 100 },
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      cursor: 0,
      advanced: {
        ...baseline,
        recoveryV1: JSON.stringify({ watermark: { ...logo('recovery'), mode: 'none' } }),
      },
      history: [
        {
          id: 'logo',
          at: 1,
          target: 'advancedContent',
          before: reviewAdvancedContentBaseline(baseline),
          after: { ...reviewAdvancedContentBaseline(baseline), watermark: logo('after') },
        },
      ],
    },
  };
  const ids = ['base', 'recovery', 'after'];
  expect(collectReviewAssetReferences(snapshot.workspace)).toEqual(
    new Set(ids.map((id) => `project-asset:${id}`))
  );
  for (const id of ids)
    expect(reviewWorkspaceHasWatermarkImage(snapshot.workspace, `project-asset:${id}`)).toBe(true);
  expect(reviewWorkspaceHasWatermarkImage(snapshot.workspace, 'project-asset:other')).toBe(false);
  expect(() => assertPortableReviewAssetRefs(snapshot.workspace)).toThrow('local asset id');
  const portable = encodePortableReviewAssetRefs(snapshot);
  expect(() => assertPortableReviewAssetRefs(portable.workspace)).not.toThrow();
  const decoded = decodePortableReviewAssetRefs(portable.workspace);
  expect({ ...decoded, advanced: { ...decoded.advanced, recoveryV1: undefined } }).toEqual({
    ...snapshot.workspace,
    advanced: { ...snapshot.workspace.advanced, recoveryV1: undefined },
  });
  expect(JSON.parse(decoded.advanced.recoveryV1!)).toEqual(
    JSON.parse(snapshot.workspace.advanced.recoveryV1!)
  );
  expect(() => remapReviewAssetReferences(snapshot, new Map())).toThrow('unresolved');
  const restored = remapReviewAssetReferences(
    snapshot,
    new Map(ids.map((id) => [id, `copy-${id}`]))
  );
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(
    new Set(ids.map((id) => `project-asset:copy-${id}`))
  );
});
