import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../project/motion';
import {
  bindMotionRegionToClip,
  reconcileMotionSourceBindings,
} from '../../../project/motion/source-binding';
import { createQuickEditSpotlight } from '../../../project/scene/focus-appearance';
import type { CameraTransitionType } from '../../../project/motion/transitions';
import {
  createProject,
  createVideoClip,
} from '../../../project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionSpotlights } from './spotlights';
import { resolveVideoCompositionFrame } from './index';

it.each<{ type: CameraTransitionType; progress: number }>([
  { type: 'none', progress: 1 },
  { type: 'linear', progress: 0.25 },
  { type: 'ease-in-out', progress: 0.15625 },
  { type: 'ease-out', progress: 0.4375 },
  { type: 'instant', progress: 1 },
])('evaluates Native $type entrance and exit on the retained phase clock', ({ type, progress }) => {
  const project = { ...createEmptyVideoProject('Phases'), duration: 6 };
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 4,
    spotlight: createQuickEditSpotlight(),
    spotlightTarget: 'viewport' as const,
    phaseTransitions: { enter: type, exit: type },
    zoomInDuration: 1,
    zoomOutDuration: 1,
  };
  project.motionRegions = [region];
  const sample = (time: number) => resolveVideoCompositionSpotlights(project, time).scene[0]!;
  expect(sample(0.25).progress).toBeCloseTo(progress, 12);
  expect(sample(3.25).progress).toBeCloseTo(type === 'none' ? 1 : 1 - progress, 12);
  expect(sample(2)).toMatchObject({ phase: 'hold', progress: 1 });
  expect(resolveVideoCompositionSpotlights(project, 4).scene).toEqual([]);
});

it('separates canvas, bound scene and isolated window coverage in frame and visual inputs', () => {
  const clip = createVideoClip({ id: 'source' });
  const project = createProject([clip]);
  const region = bindMotionRegionToClip(
    {
      ...createVideoProjectMotionRegion(project, 1),
      duration: 4,
      spotlight: createQuickEditSpotlight(),
      spotlightTarget: 'window',
    },
    clip
  );
  const viewport = { ...region, id: 'viewport', spotlightTarget: 'viewport' as const };
  const scene = { ...region, id: 'scene', spotlightTarget: 'scene' as const };
  project.motionRegions = [region, viewport, scene];
  const frame = resolveVideoCompositionFrame(project, 3);
  expect(frame.sceneSpotlights).toMatchObject([
    { id: 'scene', clipId: clip.id, progress: 1 },
    { id: 'viewport', progress: 1 },
  ]);
  expect(frame.sceneSpotlights?.find((state) => state.id === viewport.id)).not.toHaveProperty(
    'clipId'
  );
  const visual = frame.visualLayers.find((layer) => layer.clipId === clip.id)!;
  expect(visual).toMatchObject({ spotlights: [{ id: region.id, progress: 1 }] });
  const hidden = {
    ...project,
    utilityLanes: {
      actions: { visible: true, locked: false },
      camera: { visible: false, locked: false },
    },
  };
  expect(resolveVideoCompositionFrame(hidden, 3)).not.toHaveProperty('sceneSpotlights');
  expect(resolveVideoCompositionFrame(hidden, 3).visualLayers[0]).not.toHaveProperty('spotlights');
});

it('morphs only compatible explicit gaps and suppresses connected endpoint fades', () => {
  const project = { ...createEmptyVideoProject(), duration: 6 };
  const first = {
    ...createVideoProjectMotionRegion(project, 0),
    id: 'first',
    duration: 1,
    spotlight: createQuickEditSpotlight(),
    spotlightTarget: 'viewport' as const,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.5,
  };
  const second = {
    ...first,
    id: 'second',
    startTime: 3,
    spotlight: { ...first.spotlight, area: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } },
    incomingConnection: { fromRegionId: first.id, easing: 'LINEAR' as const },
  };
  project.motionRegions = [first, createVideoProjectMotionRegion(project, 1.5), second];
  expect(resolveVideoCompositionSpotlights(project, 0.9).scene[0]).toMatchObject({ progress: 1 });
  expect(resolveVideoCompositionSpotlights(project, 2).scene).toMatchObject([
    { id: second.id, from: first.spotlight, spotlight: second.spotlight, progress: 0.5 },
  ]);
  expect(resolveVideoCompositionSpotlights(project, 3).scene[0]).toMatchObject({
    id: second.id,
    progress: 1,
  });
  const incompatible = {
    ...project,
    motionRegions: [first, { ...second, spotlightTarget: 'window' as const }],
  };
  expect(resolveVideoCompositionSpotlights(incompatible, 2).scene).toEqual([]);
});

it('retains spotlight phase progress when a concrete source changes rate and refuses missing sources', () => {
  const clip = createVideoClip({
    id: 'source',
    sourceStart: 10,
    sourceDuration: 8,
    duration: 4,
    playbackRate: 2,
  });
  const project = createProject([clip]);
  const region = bindMotionRegionToClip(
    {
      ...createVideoProjectMotionRegion(project, 1),
      duration: 2,
      zoomInDuration: 1.5,
      zoomOutDuration: 0.5,
      spotlight: createQuickEditSpotlight(),
      spotlightTarget: 'window',
    },
    clip
  );
  project.motionRegions = [region];
  const original = resolveVideoCompositionSpotlights(project, 2).windows.get(clip.id);
  const accelerated = reconcileMotionSourceBindings(project, {
    ...project,
    clips: [{ ...clip, playbackRate: 4, duration: 2 }],
  });
  expect(resolveVideoCompositionSpotlights(accelerated, 1).windows.get(clip.id)).toEqual(original);
  const missing = resolveVideoCompositionSpotlights({ ...project, clips: [] }, 2);
  expect(missing.windows.size).toBe(0);
  expect(missing.scene).toEqual([]);
});
