import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import {
  VideoTransitionKind,
  VideoTransitionEasing,
  VideoTransitionRenderKind,
  VideoTransitionTemplateKind,
} from '../../../../features/video/project/types';
import { TRACK_ROW_HEIGHT } from '../interaction-state/helpers';
import {
  buildTimelineTrackLayoutModel,
  resolveTrackIdFromClientY,
  resolveTrackPlacementFromClientY,
} from './layout';
import { createTimelineZoneAsset } from './zones/test-support';

it('keeps transition junctions inside clip logical row geometry', () => {
  const project = createOverlappingTransitionProject();
  const trackId = project.tracks[0]!.id;
  const layoutModel = buildTimelineTrackLayoutModel({
    project,
    trackHeightByTrackId: {},
    tracks: project.tracks,
  });
  const primaryLayout = layoutModel.layoutByTrackId.get(trackId);
  const audioLayout = layoutModel.layoutByTrackId.get(project.tracks[1]!.id);

  expect(primaryLayout?.transitionRowCount).toBe(0);
  expect(primaryLayout?.logicalRows).toBe(3);
  expect(primaryLayout?.rowHeight).toBe((TRACK_ROW_HEIGHT + 18) * 3);
  expect(primaryLayout?.junctionZones).toEqual([]);
  expect(audioLayout?.rowHeight).toBe(TRACK_ROW_HEIGHT);
});

it('maps vertical clip drag against mixed track centers', () => {
  const project = createOverlappingTransitionProject();
  const layoutModel = buildTimelineTrackLayoutModel({
    project,
    trackHeightByTrackId: { [project.tracks[0]!.id]: 2 },
    tracks: project.tracks,
  });
  const originalLayout = layoutModel.layoutByTrackId.get(project.tracks[0]!.id)!;
  const targetLayout = layoutModel.layoutByTrackId.get(project.tracks[1]!.id)!;

  expect(
    resolveTrackIdFromClientY({
      currentClientY: 20 + targetLayout.center - originalLayout.center,
      layoutModel,
      originalClientY: 20,
      originalTrackId: project.tracks[0]!.id,
    })
  ).toBe(project.tracks[1]!.id);
});

it('uses quarter-step track height multipliers for row geometry', () => {
  const project = createOverlappingTransitionProject();
  const trackId = project.tracks[1]!.id;
  const layoutModel = buildTimelineTrackLayoutModel({
    project,
    trackHeightByTrackId: { [trackId]: 1.25 },
    tracks: project.tracks,
  });

  expect(layoutModel.layoutByTrackId.get(trackId)?.clipRowHeight).toBe(
    Math.round(TRACK_ROW_HEIGHT * 1.25)
  );
});

it('maps vertical clip drag to a logical line inside the target track', () => {
  const project = createOverlappingTransitionProject();
  const trackId = project.tracks[0]!.id;
  const layoutModel = buildTimelineTrackLayoutModel({
    project,
    trackHeightByTrackId: {},
    tracks: project.tracks,
  });

  expect(
    resolveTrackPlacementFromClientY({
      currentClientY: 60,
      layoutModel,
      originalClientY: 20,
      originalTrackId: trackId,
    })
  ).toEqual({ timelineLaneId: 'line-3', trackId });
});

it('maps vertical clip drag to an empty persisted logical line', () => {
  const project = createOverlappingTransitionProject();
  const trackId = project.tracks[1]!.id;
  project.tracks[1] = {
    ...project.tracks[1]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };
  const layoutModel = buildTimelineTrackLayoutModel({
    project,
    trackHeightByTrackId: {},
    tracks: project.tracks,
  });
  const targetLayout = layoutModel.layoutByTrackId.get(trackId)!;

  expect(
    resolveTrackPlacementFromClientY({
      currentClientY: targetLayout.top + targetLayout.logicalRowHeight - 12,
      layoutModel,
      originalClientY: targetLayout.top + 10,
      originalTrackId: trackId,
    })
  ).toEqual({ timelineLaneId: 'line-2', trackId });
});

it('maps vertical clip drag below existing rows to the next logical line', () => {
  const project = createEmptyVideoProject('Single track lane drag', 1280, 720);
  const trackId = project.tracks[0]!.id;
  const layoutModel = buildTimelineTrackLayoutModel({
    project,
    trackHeightByTrackId: {},
    tracks: [project.tracks[0]!],
  });
  const targetLayout = layoutModel.layoutByTrackId.get(trackId)!;

  expect(
    resolveTrackPlacementFromClientY({
      currentClientY: targetLayout.top + targetLayout.rowHeight + 10,
      layoutModel,
      originalClientY: targetLayout.top + 10,
      originalTrackId: trackId,
    })
  ).toEqual({ timelineLaneId: 'line-2', trackId });
});

it('keeps multi-line drag creation on the original track before falling to the lower track', () => {
  const project = createEmptyVideoProject('Multi-line placement drag', 1280, 720);
  const trackId = project.tracks[0]!.id;
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };
  const layoutModel = buildTimelineTrackLayoutModel({
    project,
    trackHeightByTrackId: {},
    tracks: project.tracks,
  });

  expect(
    resolveTrackPlacementFromClientY({
      currentClientY: 180,
      layoutModel,
      originalClientY: 60,
      originalTimelineLaneId: 'line-2',
      originalTrackId: trackId,
    })
  ).toEqual({ timelineLaneId: 'line-4', trackId });
});

function createOverlappingTransitionProject() {
  const project = createEmptyVideoProject('Stacked transitions', 1280, 720);
  const trackId = project.tracks[0]!.id;
  const asset = createTimelineZoneAsset('asset-layout');
  const clips = [
    createClip(trackId, asset, 'clip-a', 0, 5),
    createClip(trackId, asset, 'clip-b', 4, 3),
    createClip(trackId, asset, 'clip-c', 0, 5.5),
    createClip(trackId, asset, 'clip-d', 4.25, 2),
    createClip(trackId, asset, 'clip-e', 4.8, 2),
    createClip(trackId, asset, 'clip-f', 5.5, 2),
  ];

  return {
    ...project,
    assets: [asset],
    clips,
    transitions: [
      createTransition('transition-a', 'clip-a', 'clip-b'),
      createTransition('transition-b', 'clip-c', 'clip-d'),
      createTransition('transition-c', 'clip-e', 'clip-f'),
    ],
  };
}

function createClip(
  trackId: string,
  asset: ReturnType<typeof createTimelineZoneAsset>,
  id: string,
  startTime: number,
  duration: number
) {
  const clip = createVideoClipFromAsset(trackId, asset, 1280, 720, startTime);

  clip.id = id;
  clip.duration = duration;
  clip.timelineLaneId =
    id === 'clip-a' || id === 'clip-b'
      ? 'line-1'
      : id === 'clip-c' || id === 'clip-d'
        ? 'line-2'
        : 'line-3';
  return clip;
}

function createTransition(id: string, leadingClipId: string, trailingClipId: string) {
  return {
    duration: 1,
    easing: VideoTransitionEasing.LINEAR,
    id,
    kind: VideoTransitionKind.CROSSFADE,
    leadingClipId,
    renderKind: VideoTransitionRenderKind.COMPOSITE,
    templateKind: VideoTransitionTemplateKind.CROSSFADE,
    trailingClipId,
  };
}
