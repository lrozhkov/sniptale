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
