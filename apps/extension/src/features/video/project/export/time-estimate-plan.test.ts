import { createProject, createVideoClip } from '../timeline/project-meta.test.helpers';
import { createSubtitleClip } from '../factories/overlay-clip';
import { VideoTrackKind } from '../types';
import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoProjectMotionRegion } from '../motion';
import { createScopeSettings } from './render-scope.test-support';
import { planProjectExportTime } from './time-estimate-plan';

it('plans future blur using the render pass evaluator and exact zoom boundaries', () => {
  const project = { ...createEmptyVideoProject('ETA'), duration: 10 };
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 5),
      duration: 2,
      zoomInDuration: 0.4,
      zoomOutDuration: 0.4,
      scale: 3,
      motionBlurAmount: 1,
    },
  ];
  const plan = planProjectExportTime(project, createScopeSettings({}));
  expect(plan.some((part) => part.start === 5)).toBe(true);
  expect(plan.some((part) => part.start >= 5 && part.start < 5.4 && part.cost > 1)).toBe(true);
  expect(plan.find((part) => part.start === 0)?.cost).toBe(1);
});

it('preserves an explicit export range and bounds work for long movies', () => {
  const project = { ...createEmptyVideoProject('ETA'), duration: 7200 };
  const plan = planProjectExportTime(
    project,
    createScopeSettings({ rangeStartSeconds: 50, rangeEndSeconds: 80 })
  );
  expect(plan[0]?.start).toBe(50);
  expect(plan.at(-1)?.end).toBe(80);
  expect(plan.length).toBeLessThanOrEqual(256);
});

it('uses exact transition and effect boundaries while excluded subtitles add no render cost', () => {
  const first = createVideoClip({ id: 'first', duration: 4, sourceDuration: 4 });
  const second = createVideoClip({ id: 'second', startTime: 3, duration: 4, sourceDuration: 4 });
  const project = createProject([first, second]);
  project.duration = 7;
  project.transitions = [
    {
      id: 'fade',
      leadingClipId: first.id,
      trailingClipId: second.id,
      duration: 1,
      kind: 'CROSSFADE',
      easing: 'LINEAR',
      renderKind: 'CSS_LIKE',
      templateKind: 'CROSSFADE',
    },
  ];
  project.effectInstances = [
    {
      id: 'disabled',
      snapshotId: 'missing',
      kind: 'standalone',
      controls: {},
      target: { kind: 'scene' },
      enabled: false,
      playbackRate: 1,
      startTime: 1.23,
      duration: 0.2,
    },
  ];
  const subtitleTrack = {
    id: 'sub',
    kind: VideoTrackKind.SUBTITLE,
    name: 'Subtitles',
    order: 2,
    visible: true,
    locked: false,
  };
  project.tracks.push(subtitleTrack);
  project.clips.push(createSubtitleClip(subtitleTrack.id, project.width, project.height, 0));
  const without = planProjectExportTime(project, createScopeSettings({ burnInSubtitles: false }));
  const withSubtitles = planProjectExportTime(
    project,
    createScopeSettings({ burnInSubtitles: true })
  );
  expect(without.some((part) => part.start === 1.23)).toBe(true);
  expect(without.some((part) => part.start === 3)).toBe(true);
  expect(without.some((part) => part.end === 4)).toBe(true);
  expect(withSubtitles[0]!.cost).toBeGreaterThan(without[0]!.cost);
  expect(without.find((part) => part.start === 1.23)?.cost).toBe(1);
});
