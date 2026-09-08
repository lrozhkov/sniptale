import { expect, it } from 'vitest';
import { resolveVideoProjectActionOccurrences } from './action-occurrences';
import { resolveVideoProjectActionPresentations } from './action-presentation';
import { createProject, createVideoClip } from './timeline/project-meta.test.helpers';
import type { VideoProjectActionEvent } from './types';

function fact(id: string, sourceTime: number): VideoProjectActionEvent {
  return {
    id,
    kind: 'CLICK',
    label: 'Click',
    data: {},
    point: { x: 0.4, y: 0.5 },
    anchor: {
      kind: 'recording-source',
      recordingId: 'rec-asset-video',
      sourceInstanceId: 'instance',
      sourceEventId: id,
      sourceTime,
    },
    capturedDuration: 0,
  };
}

function fragment(id: string, sourceStart: number, startTime: number, duration = 1) {
  return createVideoClip({
    id,
    sourceInstanceId: 'instance',
    sourceStart,
    startTime,
    duration,
    sourceDuration: duration,
  });
}

it('projects zero, one and repeated occurrences without changing the retained source fact', () => {
  const captured = fact('a', 2.5);
  const project = createProject([fragment('first', 0, 0)]);
  project.actionEvents = [captured];
  expect(resolveVideoProjectActionOccurrences(project)).toEqual([]);
  project.clips = [fragment('first', 2, 4)];
  expect(resolveVideoProjectActionOccurrences(project)).toMatchObject([
    { eventId: 'a', clipId: 'first', time: 4.5 },
  ]);
  project.clips.push(fragment('replay', 2, 8));
  const occurrences = resolveVideoProjectActionOccurrences(project);
  expect(occurrences.map(({ eventId, clipId, time }) => ({ eventId, clipId, time }))).toEqual([
    { eventId: 'a', clipId: 'first', time: 4.5 },
    { eventId: 'a', clipId: 'replay', time: 8.5 },
  ]);
  expect(occurrences.every(({ event }) => event === captured)).toBe(true);
  expect(captured.anchor).toMatchObject({ sourceTime: 2.5 });
});

it('uses a half-open source boundary and joins unique continuous split fragments', () => {
  const project = createProject([fragment('left', 0, 0), fragment('right', 1, 1)]);
  project.actionEvents = [fact('before', 0.9), fact('cut', 1)];
  const occurrences = resolveVideoProjectActionOccurrences(project);
  expect(occurrences.map(({ eventId, clipId }) => ({ eventId, clipId }))).toEqual([
    { eventId: 'before', clipId: 'left' },
    { eventId: 'cut', clipId: 'right' },
  ]);
  expect(occurrences[0]?.playbackRun).toEqual(occurrences[1]?.playbackRun);
  expect(occurrences[0]?.playbackRun?.clipIds).toEqual(['left', 'right']);
  const presentations = resolveVideoProjectActionPresentations(project);
  expect(presentations[1]).toMatchObject({
    enabled: false,
    reason: 'suppressed',
    suppressedByOccurrence: { eventId: 'before', clipId: 'left' },
  });
  expect(presentations[0]?.renderIntervals).toEqual([
    { clipId: 'left', start: 0.9, end: 1 },
    { clipId: 'right', start: 1, end: 1.6 },
  ]);
});

it('stops run joining at ambiguous successors instead of choosing an arbitrary fragment', () => {
  const project = createProject([
    fragment('left', 0, 0),
    fragment('right-a', 1, 1),
    fragment('right-b', 1, 1),
  ]);
  project.actionEvents = [fact('before', 0.9), fact('after', 1.1)];
  const occurrences = resolveVideoProjectActionOccurrences(project);
  expect(occurrences.find(({ eventId }) => eventId === 'before')?.playbackRun?.clipIds).toEqual([
    'left',
  ]);
  expect(resolveVideoProjectActionPresentations(project).every(({ enabled }) => enabled)).toBe(
    true
  );
});

it('preserves continuous run membership at a rate boundary and separates fresh instances', () => {
  const right = { ...fragment('right', 1, 1, 0.5), sourceDuration: 1, playbackRate: 2 };
  const project = createProject([
    fragment('left', 0, 0),
    right,
    { ...fragment('repeat', 1, 4), sourceInstanceId: 'fresh' },
  ]);
  project.actionEvents = [
    fact('before', 0.9),
    fact('after', 1.2),
    {
      ...fact('repeat-fact', 1.2),
      anchor: {
        kind: 'recording-source',
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'fresh',
        sourceEventId: 'after',
        sourceTime: 1.2,
      },
    },
  ];
  const occurrences = resolveVideoProjectActionOccurrences(project);
  expect(occurrences[1]).toMatchObject({ time: 1.1, playbackRun: { clipIds: ['left', 'right'] } });
  expect(occurrences[2]).toMatchObject({ clipId: 'repeat', playbackRun: { clipIds: ['repeat'] } });
  expect(resolveVideoProjectActionPresentations(project).map(({ enabled }) => enabled)).toEqual([
    true,
    false,
    true,
  ]);
});
