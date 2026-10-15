import { createVideoProjectFromRecording } from '../factories/creation';
import { resolveProjectCursorFocusSamples } from './projection';
import { expect, it } from 'vitest';
import {
  reviewCursorFocusTimelineKeys,
  projectCursorFocusTimelineKeys,
  layoutCursorFocusKeyGroups,
  adjacentCursorFocusKey,
} from './timeline';
import type { CursorFocusPath } from './types';
const path: CursorFocusPath = {
  version: 1,
  mode: 'fixed',
  smoothing: 0.5,
  sensitivity: 0.5,
  gapPolicy: 'hold',
  segments: [
    {
      id: 'run',
      binding: { kind: 'project' },
      start: 0,
      end: 2,
      keys: [
        { id: 'auto', time: 0, x: 0.2, y: 0.2, anchor: 'boundary', interpolation: 'smooth' },
        { id: 'manual', time: 0, x: 0.5, y: 0.5, anchor: 'manual', interpolation: 'smooth' },
        { id: 'end', time: 2, x: 0.8, y: 0.8, anchor: 'boundary', interpolation: 'smooth' },
      ],
    },
  ],
};
it('retains every coincident automatic and authored key through grouping and navigation', () => {
  const keys = reviewCursorFocusTimelineKeys(path);
  const grouped = layoutCursorFocusKeyGroups(keys, 10);
  expect(grouped).toHaveLength(1);
  expect(grouped[0]!.members.map((key) => key.id)).toEqual(['auto', 'manual', 'end']);
  expect(layoutCursorFocusKeyGroups(keys, 100)).toHaveLength(2);
  expect(adjacentCursorFocusKey(keys, 'auto', 0, 1)?.id).toBe('manual');
  expect(adjacentCursorFocusKey(keys, 'manual', 0, -1)?.id).toBe('auto');
  expect(adjacentCursorFocusKey(keys, 'end', 2, 1)).toBeNull();
  expect(path.segments[0]!.keys).toHaveLength(3);
});

it('projects matching source endpoints at playback rate and deduplicates a continuous split', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 100,
    height: 100,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
  });
  const video = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!video || video.type !== 'VIDEO') throw new Error('Missing video fixture');
  const instance = video.sourceInstanceId!;
  project.clips = [
    {
      ...video,
      id: 'first',
      startTime: 5,
      duration: 1,
      sourceStart: 0,
      sourceDuration: 2,
      playbackRate: 2,
    },
    {
      ...video,
      id: 'second',
      startTime: 6,
      duration: 1,
      sourceStart: 2,
      sourceDuration: 2,
      playbackRate: 2,
    },
    { ...video, id: 'other', startTime: 20, sourceInstanceId: 'other-instance' },
  ];
  project.cursorFocusPath = {
    ...path,
    segments: [
      {
        id: 'authored',
        start: -1,
        end: 5,
        binding: { kind: 'recording-source', recordingId: 'recording', sourceInstanceId: instance },
        keys: [-1, 0, 2, 4, 5].map((time) => ({
          id: `key:${time}`,
          time,
          x: 0.5,
          y: 0.5,
          anchor: 'manual',
          interpolation: 'smooth',
        })),
      },
    ],
  };
  expect(projectCursorFocusTimelineKeys(project).map(({ id, time }) => ({ id, time }))).toEqual([
    { id: 'key:0', time: 5 },
    { id: 'key:2', time: 6 },
    { id: 'key:4', time: 7 },
  ]);
  const samples = resolveProjectCursorFocusSamples(project);
  expect(samples.filter((sample) => sample.id === 'key:2').map((sample) => sample.time)).toEqual([
    6, 6,
  ]);
  expect(samples.map((sample) => sample.sourceAnchor?.sourceClipId)).toEqual([
    'first',
    'first',
    'second',
    'second',
  ]);
});
