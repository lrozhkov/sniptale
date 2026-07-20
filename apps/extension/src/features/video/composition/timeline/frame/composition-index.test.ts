import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../project/factories/creation';
import { createVideoClipFromAsset } from '../../../project/factories/clip';
import { getSortedTracks } from '../../../project/timeline';
import { VideoProjectAssetType, VideoTrackKind } from '../../../project/types/index';
import { createVideoCompositionTimelineIndex, resolveVideoCompositionFrame } from './index';

function createImageAsset(id: string) {
  return createVideoProjectAsset(
    `Asset ${id}`,
    VideoProjectAssetType.IMAGE,
    { kind: 'project-asset', projectAssetId: id },
    {
      audioPeaks: null,
      duration: null,
      hasAudio: false,
      height: 720,
      mimeType: 'image/png',
      size: 100,
      width: 1280,
    }
  );
}

it('resolves visual layers from a reusable timeline index without changing layer order', () => {
  const project = createEmptyVideoProject('Indexed layers', 1280, 720);
  const sortedTracks = getSortedTracks(project);
  const primaryTrackId = sortedTracks.find((track) => track.kind === VideoTrackKind.PRIMARY)!.id;
  const overlayTrackId = sortedTracks.find((track) => track.kind === VideoTrackKind.OVERLAY)!.id;
  const imageAsset = createImageAsset('indexed');
  const lowerClip = createVideoClipFromAsset(primaryTrackId, imageAsset, 1280, 720, 0);
  const upperClip = createVideoClipFromAsset(overlayTrackId, imageAsset, 1280, 720, 0);

  lowerClip.id = 'lower-indexed';
  lowerClip.startTime = 0.25;
  upperClip.id = 'upper-indexed';
  upperClip.startTime = 0;
  project.assets = [imageAsset];
  project.clips = [lowerClip, upperClip].toReversed();

  const unindexedFrame = resolveVideoCompositionFrame(project, 1);
  const indexedFrame = resolveVideoCompositionFrame(project, 1, {
    timelineIndex: createVideoCompositionTimelineIndex(project),
  });

  expect(indexedFrame.visualLayers.map((layer) => layer.clipId)).toEqual(
    unindexedFrame.visualLayers.map((layer) => layer.clipId)
  );
  expect(indexedFrame.visualLayers.map((layer) => layer.zIndex)).toEqual(
    unindexedFrame.visualLayers.map((layer) => layer.zIndex)
  );
});
