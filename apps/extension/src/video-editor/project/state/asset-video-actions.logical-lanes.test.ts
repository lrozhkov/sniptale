import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import {
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoTrackKind,
} from '../../../features/video/project/types';
import { addAssetClipToProject } from './asset-actions';

function createVideoAsset(name: string) {
  return createVideoProjectAsset(
    name,
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: `${name}-asset` },
    {
      audioPeaks: [0.1, 0.3, 0.5],
      duration: 4,
      hasAudio: true,
      height: 1080,
      mimeType: 'video/mp4',
      size: 100,
      width: 1920,
    }
  );
}

it('keeps grouped video imports stacked on the requested logical lane', () => {
  const project = createEmptyVideoProject('Grouped video lanes', 1280, 720);
  const primaryTrackId = project.tracks.find((track) => track.kind === VideoTrackKind.PRIMARY)!.id;

  const firstResult = addAssetClipToProject(project, createVideoAsset('upper'), primaryTrackId, 0);
  const existingClipIds = new Set(firstResult.project.clips.map((clip) => clip.id));
  const secondResult = addAssetClipToProject(
    firstResult.project,
    createVideoAsset('lower'),
    primaryTrackId,
    0,
    'line-2'
  );
  const lowerClips = secondResult.project.clips.filter((clip) => !existingClipIds.has(clip.id));

  expect(lowerClips).toHaveLength(2);
  expect(lowerClips).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        startTime: 0,
        timelineLaneId: 'line-2',
        type: VideoProjectClipType.VIDEO,
      }),
      expect.objectContaining({
        startTime: 0,
        timelineLaneId: 'line-2',
        type: VideoProjectClipType.AUDIO,
      }),
    ])
  );
  expect(secondResult.project.transitions ?? []).toEqual([]);
});
