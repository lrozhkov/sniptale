import { VideoAutoProcessingAction } from '@sniptale/runtime-contracts/video/types/types';
import { expect, it } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { applyAutoProcessingTiming } from './auto-transform.clip-timeline';
import { resolveVideoProjectActionOccurrences } from '../../../features/video/project/action-occurrences';

it('preserves complete instance facts and manual overrides across source cuts', () => {
  const project = createProject([createVideoClip({ sourceInstanceId: 'instance', startTime: 4 })]);
  project.duration = 12;
  project.actionEvents = [
    {
      id: 'captured',
      kind: 'CLICK',
      label: 'Captured',
      data: {},
      point: { x: 0.5, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'instance',
        sourceEventId: 'raw',
        sourceTime: 3,
      },
      presentation: { point: { x: 0.25, y: 0.75 }, enabled: false },
    },
    {
      id: 'manual',
      kind: 'CALLOUT',
      label: 'Manual',
      data: {},
      point: { x: 20, y: 30 },
      anchor: { kind: 'project', time: 1 },
      presentation: { duration: 0.8 },
    },
  ];
  project.cursorTrack = {
    captureMode: 'separate',
    skin: {
      preset: 'RING',
      color: '#ff0000',
      hidden: false,
      shadow: true,
      scale: 2,
      animationPreset: 'NONE',
    },
    samples: [{ id: 'manual-cursor', timeBasis: 'project', time: 1, x: 20, y: 30, visible: true }],
  };
  const before = structuredClone(project);
  const plan = applyAutoProcessingTiming(project, [
    {
      id: 'cut',
      target: {
        clipId: project.clips[0]!.id,
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'instance',
      },
      action: VideoAutoProcessingAction.REMOVE,
      sourceStart: 2,
      sourceEnd: 4,
      playbackRate: 2,
    },
  ])!;
  expect(plan.status).toBe('ready');
  if (plan.status !== 'ready') throw new Error(plan.reason);
  const result = plan.project;
  expect(result.actionEvents).toEqual(before.actionEvents);
  expect(result.cursorTrack).toEqual(before.cursorTrack);
  expect(resolveVideoProjectActionOccurrences(result).map((row) => row.eventId)).toEqual([
    'manual',
  ]);
  expect(project).toEqual(before);
});
