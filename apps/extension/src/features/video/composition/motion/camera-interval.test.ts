import { expect, it } from 'vitest';
import type { VideoProjectMotionRegion } from '../../project/types';
import { createEmptyVideoProject } from '../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../project/motion';
import {
  resolveActiveMotionRegion,
  resolveConnectingMotionRegions,
  motionBlurSampleBounds,
} from './camera-interval';
import { resolveVideoCompositionCamera } from './index';
import { resolveVideoCompositionRenderPasses } from '../timeline/render';

function fixture() {
  const project = createEmptyVideoProject('Phased exposure', 1280, 720);
  project.duration = 8;
  const first = {
    ...createVideoProjectMotionRegion(project, 1),
    id: 'first',
    duration: 2,
    scale: 3,
    zoomInDuration: 0.5,
    zoomOutDuration: 0.5,
    motionBlurAmount: 0.2,
    motionBlur: {
      enter: { enabled: true, strength: 0.3 },
      exit: { enabled: true, strength: 0.8 },
      link: { enabled: true, strength: 0.7 },
    },
  };
  const second: VideoProjectMotionRegion = {
    ...createVideoProjectMotionRegion(project, 5),
    id: 'second',
    duration: 2,
    scale: 2,
    zoomInDuration: 0.5,
    zoomOutDuration: 0.5,
    motionBlurAmount: 0.9,
    motionBlur: { enter: { enabled: true, strength: 0.4 }, exit: { enabled: true, strength: 0.9 } },
    incomingConnection: { fromRegionId: first.id, easing: 'LINEAR' as const },
  };
  project.motionRegions = [first, second];
  return { project, first, second };
}
const camera = (project: ReturnType<typeof fixture>['project'], time: number) =>
  resolveVideoCompositionCamera({ project, currentTime: time, actions: [], cursorSample: null });

it('uses the outgoing link setting and suppresses connected entrance and exit phases', () => {
  const { project } = fixture();
  for (const [time, strength] of [
    [1.2, 0.3],
    [2, 0],
    [2.9, 0],
    [4, 0.7],
    [5.1, 0],
    [6.8, 0.9],
  ] as const)
    expect(camera(project, time).motionBlurAmount).toBe(strength);
  expect(resolveConnectingMotionRegions(project, 4)?.source.id).toBe('first');
  expect(resolveConnectingMotionRegions(project, 5)).toBeNull();
  project.motionRegions![1] = { ...project.motionRegions![1]!, incomingConnection: null };
  expect(camera(project, 2.8).motionBlurAmount).toBe(0.8);
  expect(camera(project, 5.1).motionBlurAmount).toBe(0.4);
});

it('bounds new phase exposure while legacy link interpolation stays available', () => {
  const { project, first, second } = fixture();
  const enter = motionBlurSampleBounds(project, 1.499, 1);
  expect(enter.end).toBeLessThan(1.5);
  const linkStart = motionBlurSampleBounds(project, 3.001, 1);
  expect(linkStart.start).toBe(3);
  const linkEnd = motionBlurSampleBounds(project, 4.999, 1);
  expect(linkEnd.end).toBeLessThan(5);
  const { motionBlur: _a, ...legacyFirst } = first,
    { motionBlur: _b, ...legacySecond } = second;
  project.motionRegions = [legacyFirst, legacySecond];
  expect(camera(project, 4).motionBlurAmount).toBeCloseTo(0.55);
  expect(motionBlurSampleBounds(project, 3.001, 1).start).toBeLessThan(3);
});

it('keeps disabled strength and zero exposure dormant and hides camera rendering without deletion', () => {
  const { project, first } = fixture();
  first.motionBlur.enter = { enabled: false, strength: 0.731 };
  expect(resolveVideoCompositionRenderPasses(project, 1.2).visualPasses).toHaveLength(1);
  first.motionBlur.enter = { enabled: true, strength: 0 };
  expect(resolveVideoCompositionRenderPasses(project, 1.2).visualPasses).toHaveLength(1);
  first.motionBlur.enter = { enabled: true, strength: 0.731 };
  expect(resolveVideoCompositionRenderPasses(project, 1.2).visualPasses).toHaveLength(5);
  project.utilityLanes = {
    actions: { visible: true, locked: false },
    camera: { visible: false, locked: false },
  };
  expect(resolveVideoCompositionRenderPasses(project, 1.2).visualPasses).toHaveLength(1);
  expect(first.motionBlur.enter.strength).toBe(0.731);
});

it('shares the latest-start winner and stable tie order with camera evaluation', () => {
  const { project, first } = fixture();
  project.motionRegions = [
    first,
    { ...first, id: 'later', startTime: 1.25, duration: 0.5, scale: 1.5 },
    { ...first, id: 'tie', startTime: 1.25, duration: 0.5, scale: 2 },
  ];
  expect(resolveActiveMotionRegion(project, 1.3)?.id).toBe('later');
  expect(camera(project, 1.3).regionId).toBe('later');
  expect(resolveActiveMotionRegion(project, 1.75)?.id).toBe(first.id);
  expect(motionBlurSampleBounds(project, 1.749, 1).end).toBeLessThan(1.75);
  expect(motionBlurSampleBounds(project, 1.751, 1).start).toBe(1.75);
});

it.each(['enter', 'link'] as const)('keeps instantaneous %s changes sharp', (phase) => {
  const { project, first, second } = fixture();
  first.easing = 'INSTANT';
  second.incomingConnection = { fromRegionId: first.id, easing: 'INSTANT' };
  const time = phase === 'enter' ? 1.001 : 3.001;
  expect(camera(project, time).motionBlurAmount).toBe(0);
  expect(resolveVideoCompositionRenderPasses(project, time).visualPasses).toHaveLength(1);
});

it('retains legacy cursor exposure inside an instantaneous region hold', () => {
  const { project, first } = fixture();
  const { motionBlur: _phases, ...legacy } = first;
  project.motionRegions = [
    {
      ...legacy,
      focusMode: 'CURSOR',
      easing: 'INSTANT',
      incomingConnection: null,
    },
  ];
  expect(camera(project, 2).motionBlurAmount).toBe(0.2);
  expect(motionBlurSampleBounds(project, 2, 0.2)).toEqual({
    start: 0,
    end: project.duration - 1e-9,
  });
});
