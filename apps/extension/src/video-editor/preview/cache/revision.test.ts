import { expect, it } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createTextClip } from '../../../features/video/project/factories/overlay-clip';
import {
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../../../features/video/project/types';
import { createVideoPreviewRenderRevision, createVideoPreviewSegmentRevision } from './revision';

it('ignores non-render project labels and timestamps but changes for visual state', async () => {
  const project = createEmptyVideoProject('Original', 1920, 1080);
  const revision = await createVideoPreviewRenderRevision(project);
  await expect(
    createVideoPreviewRenderRevision({
      ...project,
      createdAt: project.createdAt + 10,
      name: 'Renamed',
      updatedAt: project.updatedAt + 20,
    })
  ).resolves.toBe(revision);
  await expect(
    createVideoPreviewRenderRevision({ ...project, backgroundColor: '#ff0000' })
  ).resolves.not.toBe(revision);
});

it('invalidates only the segment influenced by a bounded clip edit', async () => {
  const project = { ...createEmptyVideoProject('Segments', 1920, 1080), duration: 4, fps: 10 };
  const trackId = project.tracks.find((track) => track.kind === 'OVERLAY')!.id;
  const first = { ...createTextClip(trackId, project.width, project.height, 0.2), duration: 1 };
  const second = { ...createTextClip(trackId, project.width, project.height, 2.2), duration: 1 };
  project.clips = [first, second];
  const before = await Promise.all([
    createVideoPreviewSegmentRevision(project, { endFrame: 20, startFrame: 0 }),
    createVideoPreviewSegmentRevision(project, { endFrame: 40, startFrame: 20 }),
  ]);

  project.clips = [first, { ...second, text: 'Changed only in the second segment' }];
  const after = await Promise.all([
    createVideoPreviewSegmentRevision(project, { endFrame: 20, startFrame: 0 }),
    createVideoPreviewSegmentRevision(project, { endFrame: 40, startFrame: 20 }),
  ]);

  expect(after[0]).toBe(before[0]);
  expect(after[1]).not.toBe(before[1]);
});

it('includes preset-driven action duration in the affected segment fingerprint', async () => {
  const project = { ...createEmptyVideoProject('Action segment'), duration: 4, fps: 10 };
  project.actionEvents = [
    {
      data: {},
      duration: 0,
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Click',
      point: { x: 10, y: 20 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      time: 1.8,
    },
  ];
  const range = { endFrame: 20, startFrame: 0 };
  const before = await createVideoPreviewSegmentRevision(project, range);

  project.actionEvents = [{ ...project.actionEvents[0]!, point: { x: 30, y: 40 } }];

  await expect(createVideoPreviewSegmentRevision(project, range)).resolves.not.toBe(before);
});

it('includes an out-of-range action referenced by an active motion region', async () => {
  const project = { ...createEmptyVideoProject('Target action'), duration: 6, fps: 10 };
  project.actionEvents = [
    {
      data: {},
      duration: 0.7,
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Target',
      point: { x: 100, y: 200 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      time: 0.5,
    },
  ];
  project.motionRegions = [
    {
      duration: 1,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.ACTION,
      focusPoint: null,
      id: 'motion-1',
      scale: 2,
      startTime: 4,
      targetActionEventId: 'action-1',
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ];
  const range = { endFrame: 50, startFrame: 40 };
  const before = await createVideoPreviewSegmentRevision(project, range);

  project.actionEvents = [{ ...project.actionEvents[0]!, point: { x: 300, y: 400 } }];

  await expect(createVideoPreviewSegmentRevision(project, range)).resolves.not.toBe(before);
});
