import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';
import {
  VideoTransitionEasing,
  VideoTransitionKind,
  type VideoProject,
} from '../../../../../features/video/project/types';
import { createTimelineZoneAsset } from './test-support';
import { buildTrackGapZones } from './model';

it('derives gap zones from the nearest preceding clip end across logical lanes', () => {
  const project = createLogicalLaneGapProject();
  const trackId = project.tracks[0]!.id;

  expect(buildTrackGapZones(project, trackId)).toEqual([
    {
      end: 8,
      id: `gap:${trackId}:clip-long:clip-trailing`,
      start: 5,
      trackId,
    },
  ]);
});

it('treats transition-connected clips on one logical lane as one gap target', () => {
  const project = createTransitionGroupGapProject();
  const trackId = project.tracks[0]!.id;

  expect(buildTrackGapZones(project, trackId)).toEqual([
    {
      end: 5,
      id: `gap:${trackId}:clip-upper:clip-lower-a+clip-lower-b`,
      start: 4,
      trackId,
    },
  ]);
});

function createLogicalLaneGapProject(): VideoProject {
  const project = createEmptyVideoProject('Logical lane gap');
  const trackId = project.tracks[0]!.id;
  const asset = createTimelineZoneAsset('asset-gap');
  const longClip = createVideoClipFromAsset(trackId, asset, 1280, 720, 0);
  const shortClip = createVideoClipFromAsset(trackId, asset, 1280, 720, 4);
  const trailingClip = createVideoClipFromAsset(trackId, asset, 1280, 720, 8);

  longClip.id = 'clip-long';
  longClip.duration = 5;
  longClip.timelineLaneId = 'line-1';
  shortClip.id = 'clip-short';
  shortClip.duration = 0.5;
  shortClip.timelineLaneId = 'line-2';
  trailingClip.id = 'clip-trailing';
  trailingClip.duration = 1;
  trailingClip.timelineLaneId = 'line-1';

  return {
    ...project,
    assets: [asset],
    clips: [longClip, shortClip, trailingClip],
    tracks: [
      {
        ...project.tracks[0]!,
        logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
      },
      ...project.tracks.slice(1),
    ],
  };
}

function createTransitionGroupGapProject(): VideoProject {
  const project = createEmptyVideoProject('Transition group gap');
  const trackId = project.tracks[0]!.id;
  const asset = createTimelineZoneAsset('asset-transition-gap');
  const upperClip = createVideoClipFromAsset(trackId, asset, 1280, 720, 0);
  const lowerFirstClip = createVideoClipFromAsset(trackId, asset, 1280, 720, 5);
  const lowerSecondClip = createVideoClipFromAsset(trackId, asset, 1280, 720, 8);

  upperClip.id = 'clip-upper';
  upperClip.duration = 4;
  upperClip.timelineLaneId = 'line-1';
  lowerFirstClip.id = 'clip-lower-a';
  lowerFirstClip.duration = 5;
  lowerFirstClip.timelineLaneId = 'line-2';
  lowerSecondClip.id = 'clip-lower-b';
  lowerSecondClip.duration = 4;
  lowerSecondClip.timelineLaneId = 'line-2';

  return {
    ...project,
    assets: [asset],
    clips: [upperClip, lowerFirstClip, lowerSecondClip],
    transitions: [
      {
        duration: 2,
        easing: VideoTransitionEasing.LINEAR,
        id: 'transition-lower',
        kind: VideoTransitionKind.CROSSFADE,
        leadingClipId: lowerFirstClip.id,
        trailingClipId: lowerSecondClip.id,
      },
    ],
    tracks: [
      {
        ...project.tracks[0]!,
        logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
      },
      ...project.tracks.slice(1),
    ],
  };
}
