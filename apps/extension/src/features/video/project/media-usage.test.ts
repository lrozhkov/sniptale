import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from './factories/creation';
import { createAudioClipFromAsset, createVideoClipFromAsset } from './factories/clip';
import { createShapeClip } from './factories/overlay-clip';
import { VideoProjectAssetType, VideoProjectShapeType } from './types';
import { getProjectAssetUseCounts } from './media-usage';

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
