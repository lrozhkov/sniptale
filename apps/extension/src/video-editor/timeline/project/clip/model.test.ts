import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectClip,
} from '../../../../features/video/project/types';
import { buildProjectTimelineClipViewModel } from './model';

function createVideoClip(trackId: string): VideoProjectClip {
  return {
    id: 'clip-1',
    trackId,
    type: VideoProjectClipType.VIDEO,
    name: 'Clip 1',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 1,
    duration: 3,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.CROSSFADE,
    transitionOut: VideoClipTransitionKind.CROSSFADE,
    transform: { x: 0, y: 0, width: 100, height: 80, rotation: 0, opacity: 1 },
    assetId: 'asset-1',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: 3,
  };
}

it('builds clip timeline view models with crossfade metadata and minimum width', () => {
  const project = createEmptyVideoProject('Timeline');
  const clip = createVideoClip(project.tracks[0]!.id);
  const previousClip = {
    ...createVideoClip(project.tracks[0]!.id),
    id: 'clip-0',
    startTime: 0,
    duration: 2,
    transitionOut: VideoClipTransitionKind.CROSSFADE,
  };

  project.clips = [previousClip, clip];

  const viewModel = buildProjectTimelineClipViewModel({
    clip,
    isHovered: false,
    isSelected: true,
    pixelsPerSecond: 10,
    project,
    trackLocked: true,
  });

  expect(viewModel.width).toBe(52);
  expect(viewModel.left).toBe(10);
  expect(viewModel.hasIncomingCrossfade).toBe(true);
  expect(viewModel.hasOutgoingCrossfade).toBe(false);
  expect(viewModel.incomingCrossfadeTitle).toContain('1000');
  expect(viewModel.clipClassName).toContain('ring-2');
  expect(viewModel.clipClassName).toContain('opacity-55');
});

it('keeps the same emphasis contract for selected and hovered clips', () => {
  const project = createEmptyVideoProject('Timeline');
  const clip = createVideoClip(project.tracks[0]!.id);
  clip.fadeInMs = 500;
  clip.fadeOutMs = 1000;

  const selectedModel = buildProjectTimelineClipViewModel({
    clip,
    isHovered: false,
    isSelected: true,
    pixelsPerSecond: 20,
    project,
    trackLocked: false,
  });
  const hoveredModel = buildProjectTimelineClipViewModel({
    clip,
    isHovered: true,
    isSelected: false,
    pixelsPerSecond: 20,
    project,
    trackLocked: false,
  });

  expect(selectedModel.visualEmphasis).toBe(true);
  expect(hoveredModel.visualEmphasis).toBe(true);
  expect(selectedModel.clipClassName).toContain('brightness-110');
  expect(hoveredModel.clipClassName).toContain('brightness-110');
  expect(selectedModel.fadeInOverlayWidth).toBe(10);
  expect(selectedModel.fadeOutOverlayWidth).toBe(20);
});

it('reserves crossfade overlap space outside readable clip labels', () => {
  const project = createEmptyVideoProject('Timeline');
  const trackId = project.tracks[0]!.id;
  const firstClip = {
    ...createVideoClip(trackId),
    id: 'clip-1',
    startTime: 0,
    duration: 4,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.CROSSFADE,
  };
  const secondClip = {
    ...createVideoClip(trackId),
    id: 'clip-2',
    startTime: 3,
    duration: 4,
    transitionIn: VideoClipTransitionKind.CROSSFADE,
    transitionOut: VideoClipTransitionKind.NONE,
  };
  project.clips = [firstClip, secondClip];

  const firstModel = buildProjectTimelineClipViewModel({
    clip: firstClip,
    isHovered: false,
    isSelected: false,
    pixelsPerSecond: 100,
    project,
    trackLocked: false,
  });
  const secondModel = buildProjectTimelineClipViewModel({
    clip: secondClip,
    isHovered: false,
    isSelected: false,
    pixelsPerSecond: 100,
    project,
    trackLocked: false,
  });

  expect(firstModel.outgoingCrossfadeOverlayWidth).toBe(100);
  expect(secondModel.incomingCrossfadeOverlayWidth).toBe(100);
  expect(firstModel.labelStyle).toMatchObject({ left: 12, right: 112 });
  expect(secondModel.labelStyle).toMatchObject({ left: 112, right: 12 });
});
