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
