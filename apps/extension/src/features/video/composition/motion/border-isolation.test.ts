import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  createVideoProjectMotionRegion,
  normalizeVideoProjectMotionRegion,
} from '../../project/motion';
import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../project/scene/focus-appearance';
import { applyVideoProjectMutationPatch } from '../../project/mutation';
import { resolveVideoCompositionFrame } from '../timeline/frame';

function projectWithBorder() {
  const project = { ...createEmptyVideoProject('Border', 1000, 800), duration: 8 };
  const border = {
    ...createVideoProjectMotionRegion(project, 2),
    id: 'border',
    duration: 3,
    scale: 3,
    focusPoint: { x: 150, y: 120 },
    border: createQuickEditBorder(),
    borderTarget: 'viewport' as const,
  };
  return { project, border };
}

it('keeps an independent viewport border out of the camera pose', () => {
  const { project, border } = projectWithBorder();
  const baseline = resolveVideoCompositionFrame(project, 3).camera;
  const actual = resolveVideoCompositionFrame({ ...project, motionRegions: [border] }, 3).camera;
  expect(actual).toEqual(baseline);
});

it('keeps an overlapping border from replacing the active camera interval', () => {
  const { project, border } = projectWithBorder();
  const camera = {
    ...createVideoProjectMotionRegion(project, 0),
    id: 'camera',
    duration: 7,
    scale: 2,
  };
  const baseline = resolveVideoCompositionFrame({ ...project, motionRegions: [camera] }, 3).camera;
  const actual = resolveVideoCompositionFrame(
    { ...project, motionRegions: [camera, border] },
    3
  ).camera;
  expect(actual).toEqual(baseline);
});

it('retains admitted border authoring during interval normalization and schema selection', () => {
  const { project, border } = projectWithBorder();
  const normalized = normalizeVideoProjectMotionRegion(project, border);
  expect(normalized).toMatchObject({ border: border.border, borderTarget: 'viewport' });
  const changed = applyVideoProjectMutationPatch(project, { motionRegions: [normalized] });
  expect(changed.version).toBe(21);
});

it('projects window and viewport borders into separate frame targets on retained source clocks', async () => {
  const { createProject, createVideoClip } =
    await import('../../project/timeline/project-meta.test.helpers');
  const { bindMotionRegionToClip, reconcileMotionSourceBindings } =
    await import('../../project/motion/source-binding');
  const clip = createVideoClip({
    id: 'source',
    sourceStart: 10,
    sourceDuration: 8,
    duration: 4,
    playbackRate: 2,
  });
  const project = createProject([clip]);
  project.assets = project.assets.map((asset) => ({
    ...asset,
    metadata: { ...asset.metadata, duration: 20 },
  }));
  const border = createQuickEditBorder();
  const window = bindMotionRegionToClip(
    {
      ...createVideoProjectMotionRegion(project, 1),
      id: 'window',
      duration: 2,
      border,
      borderTarget: 'window',
    },
    clip
  );
  const viewport = {
    ...createVideoProjectMotionRegion(project, 0),
    id: 'viewport',
    duration: 4,
    border,
    borderTarget: 'viewport' as const,
  };
  project.motionRegions = [window, viewport];
  const frame = resolveVideoCompositionFrame(project, 2);
  expect(frame).toMatchObject({
    viewportBorders: [{ id: 'viewport', clock: { time: 2, duration: 4 } }],
  });
  expect(frame.visualLayers.find((layer) => layer.clipId === clip.id)).toMatchObject({
    borders: [{ id: 'window', clock: { time: 1, duration: 2 }, border }],
  });
  const sped = reconcileMotionSourceBindings(project, {
    ...project,
    clips: [{ ...clip, playbackRate: 4, duration: 2 }],
  });
  const accelerated = resolveVideoCompositionFrame(sped, 1);
  expect(accelerated.visualLayers.find((layer) => layer.clipId === clip.id)).toMatchObject({
    borders: [{ id: 'window', clock: { time: 1, duration: 2 }, border }],
  });
  expect(resolveVideoCompositionFrame(project, 4)).not.toHaveProperty('viewportBorders');
  expect(project.clips[0]).toEqual(clip);
});

it('omits border state when its utility lane is hidden without changing visible media', () => {
  const { project, border } = projectWithBorder();
  const hidden = {
    ...project,
    motionRegions: [border],
    utilityLanes: {
      actions: { visible: true, locked: false },
      camera: { visible: false, locked: false },
    },
  };
  expect(resolveVideoCompositionFrame(hidden, 3)).not.toHaveProperty('viewportBorders');
});

it('keeps connected spotlight openings out of camera pose and camera interpolation', () => {
  const { project } = projectWithBorder();
  const first = {
    ...createVideoProjectMotionRegion(project, 0),
    id: 'camera-first',
    duration: 1,
    scale: 2,
  };
  const last = {
    ...createVideoProjectMotionRegion(project, 5),
    id: 'camera-last',
    duration: 2,
    scale: 1.5,
    incomingConnection: { fromRegionId: first.id, easing: first.easing },
  };
  const opening = {
    ...createVideoProjectMotionRegion(project, 1),
    id: 'opening',
    duration: 1,
    scale: 4,
    focusPoint: { x: 0, y: 0 },
    spotlight: createQuickEditSpotlight(),
    spotlightTarget: 'viewport' as const,
  };
  const destination = {
    ...opening,
    id: 'opening-next',
    startTime: 4,
    incomingConnection: { fromRegionId: opening.id, easing: opening.easing },
  };
  const cameraOnly = { ...project, motionRegions: [first, last] };
  const composed = { ...project, motionRegions: [first, opening, destination, last] };
  for (const time of [0, 1, 1.5, 2, 3, 4, 4.5, 5, 6.5, 7.5]) {
    expect(resolveVideoCompositionFrame(composed, time).camera).toEqual(
      resolveVideoCompositionFrame(cameraOnly, time).camera
    );
  }
});
