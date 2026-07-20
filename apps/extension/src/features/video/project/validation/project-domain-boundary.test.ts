import { expect, it } from 'vitest';

import {
  createActionEvent,
  createAsset,
  createProject,
  createShapeProject,
  createTextProject,
} from './project-domain-boundary.test-support.ts';
import { isExportReadyVideoProject, isHydratableVideoProject } from './root';

it('rejects out-of-range asset metadata and audio peaks', () => {
  const project = createProject();

  expect(
    isHydratableVideoProject({
      ...project,
      assets: [
        {
          ...project.assets[0]!,
          metadata: { ...project.assets[0]!.metadata, audioPeaks: [0.5, 1.01] },
        },
      ],
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      assets: [
        {
          ...project.assets[0]!,
          metadata: { ...project.assets[0]!.metadata, size: 2 * 1024 * 1024 * 1024 + 1 },
        },
      ],
    })
  ).toBe(false);
});

it('rejects out-of-range clip transform, volume, playback, and fit fields', () => {
  const project = createProject();
  const clip = project.clips[0]!;

  expect(
    isHydratableVideoProject({
      ...project,
      clips: [{ ...clip, transform: { ...clip.transform, opacity: 2 } }],
    })
  ).toBe(false);
  expect(isHydratableVideoProject({ ...project, clips: [{ ...clip, volume: 4.1 }] })).toBe(false);
  expect(isHydratableVideoProject({ ...project, clips: [{ ...clip, playbackRate: 17 }] })).toBe(
    false
  );
  expect(isHydratableVideoProject({ ...project, clips: [{ ...clip, startTime: 86_401 }] })).toBe(
    false
  );
  expect(isHydratableVideoProject({ ...project, clips: [{ ...clip, sourceStart: 86_401 }] })).toBe(
    false
  );
  expect(isHydratableVideoProject({ ...project, clips: [{ ...clip, sourceStart: 42 }] })).toBe(
    true
  );
  expect(
    isHydratableVideoProject({ ...project, clips: [{ ...clip, fitScalePercent: 1001 }] })
  ).toBe(false);
});

it('rejects out-of-range text and shape style fields', () => {
  const textProject = createTextProject();
  const shapeProject = createShapeProject();
  const textClip = textProject.clips[0]!;
  const shapeClip = shapeProject.clips[0]!;

  expect(
    isHydratableVideoProject({
      ...textProject,
      clips: [{ ...textClip, style: { ...textClip.style, fontSize: 2049 } }],
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...shapeProject,
      clips: [{ ...shapeClip, style: { ...shapeClip.style, fillColor: '' } }],
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...shapeProject,
      clips: [{ ...shapeClip, embeddedAsset: { assetId: createAsset().id, opacity: 2 } }],
    })
  ).toBe(false);
});

it('rejects out-of-range annotation style and leader line fields', () => {
  const project = createProject();
  const annotationClip = project.clips.find((clip) => clip.type === 'ANNOTATION')!;

  expect(
    isHydratableVideoProject({
      ...project,
      clips: [
        {
          ...annotationClip,
          style: { ...annotationClip.style, shimmerAmount: 2 },
        },
      ],
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      clips: [
        {
          ...annotationClip,
          leaderLine: { ...annotationClip.leaderLine, length: -1 },
        },
      ],
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      clips: [
        {
          ...annotationClip,
          leaderLine: { ...annotationClip.leaderLine, length: 2049 },
        },
      ],
    })
  ).toBe(false);
  expect(
    isExportReadyVideoProject({
      ...project,
      clips: [
        {
          ...annotationClip,
          leaderLine: { ...annotationClip.leaderLine, length: 0 },
        },
      ],
    })
  ).toBe(true);
});

it('rejects out-of-range cursor, action, and motion values', () => {
  const project = createProject();

  expect(
    isHydratableVideoProject({
      ...project,
      cursorTrack: {
        ...project.cursorTrack!,
        skin: { ...project.cursorTrack!.skin, scale: 10 },
      },
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      actionEvents: [{ ...createActionEvent(), point: { x: 65_537, y: 10 }, time: 86_401 }],
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      motionRegions: [{ ...project.motionRegions![0]!, motionBlurAmount: 2, scale: 8 }],
    })
  ).toBe(false);
});

it('rejects out-of-range scene background and transition values', () => {
  const project = createProject();

  expect(isHydratableVideoProject({ ...project, backgroundColor: '' })).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      sceneBackground: { angle: 3601, from: '#000', kind: 'gradient', to: '#fff' },
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      transitions: [
        {
          duration: 86_401,
          easing: 'LINEAR',
          id: 'transition-1',
          kind: 'crossfade',
          leadingClipId: project.clips[0]!.id,
          trailingClipId: project.clips[0]!.id,
        },
      ],
    })
  ).toBe(false);
});
