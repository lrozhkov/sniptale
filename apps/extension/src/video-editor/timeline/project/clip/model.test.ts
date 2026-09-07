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

it('builds clip timeline view models with crossfade metadata and temporal width', () => {
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

  expect(viewModel.width).toBe(30);
  expect(viewModel.left).toBe(10);
  expect(viewModel.bodyInsetLeft).toBe(5);
  expect(viewModel.bodyInsetRight).toBe(0);
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

  expect(firstModel.bodyInsetRight).toBe(50);
  expect(secondModel.bodyInsetLeft).toBe(50);
  expect(firstModel.labelStyle).toMatchObject({ left: 12, right: 62 });
  expect(secondModel.labelStyle).toMatchObject({ left: 62, right: 12 });
});

it.each([0.1, 0.01])(
  'keeps a %ss clip within its temporal span with only a one-pixel floor',
  (duration) => {
    const project = createEmptyVideoProject('Short edits');
    const clip = { ...createVideoClip(project.tracks[0]!.id), duration };
    const model = buildProjectTimelineClipViewModel({
      clip,
      project,
      pixelsPerSecond: 90,
      isSelected: false,
      isHovered: false,
      trackLocked: false,
    });
    expect(model.width).toBe(Math.max(1, duration * 90));
  }
);

it('gives both almost coincident clips half the overlap for body hit testing', () => {
  const project = createEmptyVideoProject('Reachable overlap');
  const first = { ...createVideoClip(project.tracks[0]!.id), startTime: 0, duration: 10 };
  const second = { ...first, id: 'clip-2', startTime: 0.1 };
  project.clips = [first, second];
  const models = project.clips.map((clip) =>
    buildProjectTimelineClipViewModel({
      clip,
      project,
      pixelsPerSecond: 100,
      isSelected: false,
      isHovered: false,
      trackLocked: false,
    })
  );
  expect(models[0]?.style.clipPath).toBe('inset(0 495px 0 0px)');
  expect(models[1]?.style.clipPath).toBe('inset(0 0px 0 495px)');
  expect(models[0]?.width).toBe(1000);
  expect(models[1]?.left).toBe(10);
});

it('does not divide clip bodies across logical lanes', () => {
  const project = createEmptyVideoProject('Separate lanes');
  const first = {
    ...createVideoClip(project.tracks[0]!.id),
    startTime: 0,
    duration: 10,
    timelineLaneId: 'one',
  };
  project.clips = [first, { ...first, id: 'second', startTime: 0.1, timelineLaneId: 'two' }];
  const model = buildProjectTimelineClipViewModel({
    clip: first,
    project,
    pixelsPerSecond: 100,
    isHovered: false,
    isSelected: false,
    trackLocked: false,
  });
  expect(model.style.clipPath).toBe('inset(0 0px 0 0px)');
});

it('bounds a day-long clip to the visible source interval without invented trim edges', async () => {
  const { createTimelineProjection } = await import('../interaction-state/projection');
  const project = createEmptyVideoProject('Timeline');
  const clip = { ...createVideoClip(project.tracks[0]!.id), startTime: 0, duration: 86400 };
  const projection = createTimelineProjection({
    extentSeconds: 86400,
    pixelsPerSecond: 23040,
    viewportWidth: 1000,
    startTime: 43200,
  });
  const model = buildProjectTimelineClipViewModel({
    clip,
    project,
    projection,
    pixelsPerSecond: 23040,
    isHovered: false,
    isSelected: true,
    trackLocked: false,
  });
  expect(model.width).toBeCloseTo(1240, 5);
  expect(model.left).toBeCloseTo(-120, 5);
  expect(model.offsetSeconds).toBeCloseTo(43200 - 120 / 23040, 10);
  expect(model.includesStart).toBe(false);
  expect(model.includesEnd).toBe(false);
  expect(Number(model.labelStyle.left) + model.left).toBeGreaterThanOrEqual(0);
  expect(Number(model.labelStyle.right)).toBeGreaterThanOrEqual(120);
});

it('retains the visible middle of a fade with bounded geometry', async () => {
  const { createTimelineProjection } = await import('../interaction-state/projection');
  const project = createEmptyVideoProject('Timeline');
  const clip = {
    ...createVideoClip(project.tracks[0]!.id),
    startTime: 0,
    duration: 86400,
    fadeInMs: 43200000,
  };
  const projection = createTimelineProjection({
    extentSeconds: 86400,
    pixelsPerSecond: 23040,
    viewportWidth: 1000,
    startTime: 40000,
  });
  const model = buildProjectTimelineClipViewModel({
    clip,
    project,
    projection,
    pixelsPerSecond: 23040,
    isHovered: false,
    isSelected: true,
    trackLocked: false,
  });
  expect(model.includesStart).toBe(false);
  expect(model.fadeInOverlayWidth).toBeCloseTo(model.width, 5);
  expect(model.fadeOutOverlayWidth).toBe(0);
});

it('keeps a one-frame clip visible at project overview scale', async () => {
  const { createTimelineProjection } = await import('../interaction-state/projection');
  const project = createEmptyVideoProject('Overview');
  const clip = { ...createVideoClip(project.tracks[0]!.id), startTime: 100, duration: 1 / 240 };
  const model = buildProjectTimelineClipViewModel({
    clip,
    project,
    projection: createTimelineProjection({
      extentSeconds: 86400,
      pixelsPerSecond: 0.005,
      viewportWidth: 1000,
      startTime: 0,
    }),
    pixelsPerSecond: 0.005,
    isHovered: false,
    isSelected: false,
    trackLocked: false,
  });
  expect(model.visible).toBe(true);
  expect(model.width).toBeGreaterThanOrEqual(1);
  expect(clip.duration).toBe(1 / 240);
});
