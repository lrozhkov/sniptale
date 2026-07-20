import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';
import { syncProjectDuration } from '../../../../../features/video/project/timeline';
import {
  VideoProjectAssetType,
  VideoTrackKind,
  VideoTransitionKind,
  VideoTransitionRenderKind,
  VideoTransitionTemplateKind,
} from '../../../../../features/video/project/types';

export function createTimelineZoneProject() {
  const project = createEmptyVideoProject('Track zones', 1280, 720);
  const primaryTrack = project.tracks[0]?.id ?? '';
  const layeredTrack = createVideoProjectTrack(
    'Видео 2',
    project.tracks.length,
    VideoTrackKind.PRIMARY
  );
  const cutTrack = createVideoProjectTrack(
    'Видео cut',
    project.tracks.length + 1,
    VideoTrackKind.OVERLAY
  );
  const secondaryTrack = layeredTrack.id;
  const cutTrackId = cutTrack.id;
  const firstAsset = createAsset('asset-a');
  const secondAsset = createAsset('asset-b');
  const thirdAsset = createAsset('asset-c');
  const cutAsset = createAsset('asset-cut');
  const firstClip = createVideoClipFromAsset(primaryTrack, firstAsset, 1280, 720, 0);
  const secondClip = createVideoClipFromAsset(primaryTrack, secondAsset, 1280, 720, 4);
  const thirdClip = createVideoClipFromAsset(secondaryTrack, thirdAsset, 1280, 720, 2);
  const [cutClipA, cutClipB] = createCutTrackFixture(cutTrackId, cutAsset);

  setClipIdentity(firstClip, 'clip-a', 5);
  setClipIdentity(secondClip, 'clip-b', 4);
  assignSameLogicalLine(firstClip, secondClip);
  thirdClip.id = 'clip-c';
  thirdClip.duration = 4;

  return syncProjectDuration({
    ...project,
    assets: [firstAsset, secondAsset, thirdAsset, cutAsset],
    clips: [firstClip, secondClip, thirdClip, cutClipA, cutClipB],
    tracks: [...project.tracks, layeredTrack, cutTrack],
    transitions: [
      {
        duration: 1,
        easing: 'LINEAR',
        id: 'transition-1',
        kind: VideoTransitionKind.CROSSFADE,
        leadingClipId: 'clip-a',
        renderKind: VideoTransitionRenderKind.COMPOSITE,
        templateKind: VideoTransitionTemplateKind.CROSSFADE,
        trailingClipId: 'clip-b',
      },
    ],
  });
}

function setClipIdentity(
  clip: ReturnType<typeof createVideoClipFromAsset>,
  id: string,
  duration: number
): void {
  clip.id = id;
  clip.duration = duration;
}

function assignSameLogicalLine(...clips: ReturnType<typeof createVideoClipFromAsset>[]): void {
  clips.forEach((clip) => {
    clip.timelineLaneId = 'line-1';
  });
}

export function createTimelineZoneAsset(id: string) {
  return createAsset(id);
}

function createCutTrackFixture(
  cutTrackId: string,
  cutAsset: ReturnType<typeof createAsset>
): [ReturnType<typeof createVideoClipFromAsset>, ReturnType<typeof createVideoClipFromAsset>] {
  const cutClipA = createVideoClipFromAsset(cutTrackId, cutAsset, 1280, 720, 0);
  const cutClipB = createVideoClipFromAsset(cutTrackId, cutAsset, 1280, 720, 3);

  cutClipA.id = 'clip-cut-a';
  cutClipA.duration = 3;
  cutClipB.id = 'clip-cut-b';
  cutClipB.duration = 1;

  return [cutClipA, cutClipB];
}

function createAsset(id: string) {
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
