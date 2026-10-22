import { reviewSpeechTextSignature } from '../review/speech-transcript';
import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from './factories/creation';
import { createAudioClipFromAsset, createVideoClipFromAsset } from './factories/clip';
import { createShapeClip } from './factories/overlay-clip';
import { VideoProjectAssetType, VideoProjectShapeType } from './types';
import { getProjectAssetUseCounts, getProjectAssetUses } from './media-usage';

it('protects hidden media, linked audio, scene backgrounds, embedded images and analysis sources', () => {
  const project = createEmptyVideoProject();
  const asset = createVideoProjectAsset(
    'Screen',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'media' },
    {
      width: 1280,
      height: 720,
      duration: 5,
      mimeType: 'video/webm',
      size: 10,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const track = project.tracks[0]!;
  track.visible = false;
  track.locked = true;
  const shape = createShapeClip(track.id, 1280, 720, 0, VideoProjectShapeType.RECTANGLE);
  shape.embeddedAsset = { assetId: 'embedded', placement: { x: 0, y: 0, width: 10, height: 10 } };
  project.clips = [
    createVideoClipFromAsset(track.id, asset, 1280, 720, 0),
    createAudioClipFromAsset(track.id, asset, 0),
    shape,
  ];
  project.sceneBackground = { kind: 'image', assetId: 'background' };
  project.objectTracks = [
    {
      id: 'object',
      kind: 'object',
      source: 'visualDetection',
      samples: [],
      analysis: {
        sourceAssetId: 'analysis',
        sourceClipId: 'clip',
        projectStartTime: 0,
        projectEndTime: 5,
        sampleFps: 1,
      },
    },
  ];
  expect([...getProjectAssetUseCounts(project)]).toEqual([
    [asset.id, 2],
    ['embedded', 1],
    ['background', 1],
    ['analysis', 1],
  ]);
});

it('retains distinct clip targets for repeated use and a separate scene reference', async () => {
  const { getProjectAssetUses } = await import('./media-usage');
  const project = createEmptyVideoProject();
  const asset = createVideoProjectAsset(
    'Shared',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'shared' },
    {
      width: 1280,
      height: 720,
      duration: 5,
      mimeType: 'video/webm',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.clips = [
    createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720, 0),
    createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720, 10),
  ];
  project.sceneBackground = { kind: 'image', assetId: asset.id };
  expect(getProjectAssetUses(project)).toEqual([
    { assetId: asset.id, kind: 'clip', clipId: project.clips[0]!.id },
    { assetId: asset.id, kind: 'clip', clipId: project.clips[1]!.id },
    { assetId: asset.id, kind: 'scene' },
  ]);
  expect(getProjectAssetUseCounts(project).get(asset.id)).toBe(3);
});

it('counts dormant source-bound documents without treating provenance as an asset lease', async () => {
  const { getProjectAssetUses } = await import('./media-usage');
  const project = createEmptyVideoProject();
  project.version = 5;
  project.textDocuments = [
    {
      id: 'retained',
      binding: { kind: 'source', assetId: 'source', sourceInstanceId: 'hidden' },
      document: { version: 1, fragments: [] },
    },
    {
      id: 'project-time',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'phrase',
            text: 'Unlinked text',
            originalText: '',
            revision: 0,
            timingRevision: 0,
            start: 0,
            end: 1,
            alignment: 'manual',
            timeDomain: 'result',
            showInVideo: false,
            origin: { kind: 'voiceover', clipId: 'descriptive-only', start: 1, end: 2 },
          },
        ],
      },
    },
  ];
  expect(getProjectAssetUses(project)).toEqual([
    { assetId: 'source', kind: 'text', documentId: 'retained' },
  ]);
  expect([...getProjectAssetUseCounts(project)]).toEqual([['source', 1]]);
});

it('protects dormant scene images without counting the same active image twice', () => {
  const project = createEmptyVideoProject();
  project.sceneBackground = {
    kind: 'solid',
    color: '#123456',
    remembered: { image: { kind: 'image', assetId: 'retained', imageFit: 'contain' } },
  };
  expect([...getProjectAssetUseCounts(project)]).toEqual([['retained', 1]]);
  project.sceneBackground = { ...project.sceneBackground, kind: 'image', assetId: 'retained' };
  expect([...getProjectAssetUseCounts(project)]).toEqual([['retained', 1]]);
  project.sceneBackground = { ...project.sceneBackground, assetId: 'other' };
  expect([...getProjectAssetUseCounts(project)]).toEqual([
    ['other', 1],
    ['retained', 1],
  ]);
});

it.each(['none', 'text', 'image'] as const)(
  'retains a %s watermark material by logical identity',
  async (mode) => {
    const { createQuickEditWatermark } = await import('./scene/watermark');
    const asset = createVideoProjectAsset(
      'Logo',
      'IMAGE',
      { kind: 'project-asset', projectAssetId: 'bytes' },
      {
        width: 400,
        height: 200,
        duration: null,
        mimeType: 'image/png',
        size: 10,
        hasAudio: false,
        audioPeaks: null,
      }
    );
    const project = createEmptyVideoProject('Watermark');
    project.version = 20;
    project.assets = [asset];
    project.watermark = {
      ...createQuickEditWatermark('Saved'),
      mode,
      image: {
        assetId: `project-asset:${asset.id}`,
        width: 400,
        height: 200,
        size: 0.2,
        opacity: 1,
      },
    };
    const before = structuredClone(project);
    expect(getProjectAssetUses(project)).toEqual([{ assetId: asset.id, kind: 'watermark' }]);
    expect([...getProjectAssetUseCounts(project)]).toEqual([[asset.id, 1]]);
    expect(project).toEqual(before);
  }
);

it('retains comment sources even when every placement and bubble is hidden or removed', () => {
  const project = createEmptyVideoProject();
  project.commentDocuments = [
    {
      id: 'bound',
      binding: { kind: 'source', assetId: 'retained', sourceInstanceId: 'hidden' },
      annotations: [],
      canvasComments: [],
    },
    { id: 'independent', binding: { kind: 'project' }, annotations: [], canvasComments: [] },
  ];
  expect(getProjectAssetUses(project)).toEqual([
    { assetId: 'retained', kind: 'comments', documentId: 'bound' },
  ]);
  expect([...getProjectAssetUseCounts(project)]).toEqual([['retained', 1]]);
});

it('retains a dormant source audio document as a material use without a placement', () => {
  const project = createEmptyVideoProject();
  project.sourceAudioDocuments = [
    {
      id: 'envelope',
      binding: { kind: 'source', assetId: 'source', sourceInstanceId: 'instance' },
      ranges: [{ id: 'gain', start: 1, end: 2, volume: 2 }],
      mutes: [],
    },
  ];
  expect(getProjectAssetUses(project)).toEqual([
    { assetId: 'source', kind: 'source-audio', documentId: 'envelope' },
  ]);
  expect(getProjectAssetUseCounts(project).get('source')).toBe(1);
});

it('retains source, whole take and accepted replacements while source voice is dormant and disabled', () => {
  const project = createEmptyVideoProject();
  project.version = 31;
  project.sourceVoiceoverDocuments = [
    {
      id: 'voice',
      trackId: 'voice-track',
      enabled: false,
      binding: { kind: 'source', assetId: 'source', sourceInstanceId: 'instance' },
      reference: [
        { kind: 'keep', rate: 1, sourceStart: 0, sourceEnd: 8, resultStart: 0, resultEnd: 8 },
      ],
      take: {
        id: 'take',
        assetId: 'native-take',
        timelineStart: 0,
        sourceOffset: 0,
        duration: 4,
        volume: 1,
        muted: true,
        dormant: true,
        fadeIn: 0,
        fadeOut: 0,
        transcript: {
          version: 1,
          phrases: [],
          replacements: [
            {
              id: 'replacement',
              assetId: 'project-asset:replacement',
              start: 0,
              end: 1,
              duration: 1,
              phraseId: 'phrase',
              revision: 1,
              text: 'Accepted',
              textSignature: JSON.stringify(['Accepted', 'speech', 'voice', 'wav', 1, '']),
              profile: { modelId: 'speech', voiceId: 'voice', responseFormat: 'wav' },
            },
          ],
        },
      },
    },
  ];
  expect(getProjectAssetUses(project)).toEqual(
    ['source', 'native-take', 'project-asset:replacement'].map((assetId) => ({
      assetId,
      kind: 'source-voiceover',
      documentId: 'voice',
    }))
  );
  expect([...getProjectAssetUseCounts(project)]).toEqual([
    ['source', 1],
    ['native-take', 1],
    ['project-asset:replacement', 1],
  ]);
});

it('holds every passive original speech replacement even without clips or enabled content', () => {
  const project = createEmptyVideoProject();
  project.version = 31;
  const profile = { modelId: 'speech', voiceId: 'voice', responseFormat: 'wav' as const };
  project.sourceAudioDocuments = [
    {
      id: 'speech',
      binding: { kind: 'source', assetId: 'source', sourceInstanceId: 'removed-placement' },
      ranges: [],
      mutes: [],
      speech: {
        enabled: false,
        transcript: {
          version: 1,
          phrases: [],
          replacements: [false, true].map((enabled, index) => ({
            id: `replacement-${index}`,
            start: index,
            end: index + 1,
            duration: 0.5,
            enabled,
            originalVolume: 0.25,
            assetId: `project-asset:history-${index}`,
            phraseId: 'removed-phrase',
            revision: 1,
            text: 'Accepted',
            profile,
            textSignature: reviewSpeechTextSignature('Accepted', profile),
          })),
        },
      },
    },
  ];
  const before = structuredClone(project);
  expect(getProjectAssetUses(project)).toEqual(
    ['source', 'project-asset:history-0', 'project-asset:history-1'].map((assetId) => ({
      assetId,
      kind: 'source-audio',
      documentId: 'speech',
    }))
  );
  expect([...getProjectAssetUseCounts(project)]).toEqual([
    ['source', 1],
    ['project-asset:history-0', 1],
    ['project-asset:history-1', 1],
  ]);
  expect(project).toEqual(before);
});

it('keeps an unplaced cut source in use through its retained recipe', () => {
  const project = createEmptyVideoProject();
  const asset = createVideoProjectAsset(
    'Retained source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'cut-source' },
    {
      width: 160,
      height: 90,
      duration: 6,
      mimeType: 'video/webm',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  project.version = 40;
  project.compositionJoins = [4, 0, 2].map((start) => ({
    id: `retained-cut-${start}`,
    sampling: 'cut',
    sourceRange: { assetId: asset.id, sourceInstanceId: 'original', start, end: start + 1 },
  }));
  const before = structuredClone(project);
  expect(getProjectAssetUses(project)).toEqual(
    [0, 2, 4].map((start) => ({
      assetId: asset.id,
      kind: 'composition-join',
      joinId: `retained-cut-${start}`,
    }))
  );
  expect(getProjectAssetUseCounts(project).get(asset.id)).toBe(3);
  expect(project).toEqual(before);
});
