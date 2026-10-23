import { resolveVideoCompositionActions } from '../composition/timeline/frame/actions';
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

it('retains one sustained gesture continuation per observed retained run without moving its down anchor', () => {
  const project = createProject([
    fragment('tail', 2, 0),
    fragment('next', 3, 1),
    fragment('repeat', 2, 6, 2),
  ]);
  const held = { ...fact('held', 1), data: { gestureType: 'hold', downTime: 1, upTime: 4 } };
  project.actionEvents = [held, fact('point-only', 1)];
  const occurrences = resolveVideoProjectActionOccurrences(project);
  expect(occurrences.map(({ eventId, clipId, time }) => ({ eventId, clipId, time }))).toEqual([
    { eventId: 'held', clipId: 'tail', time: -1 },
    { eventId: 'held', clipId: 'repeat', time: 5 },
  ]);
  expect(occurrences[0]!.playbackRun?.clipIds).toEqual(['tail', 'next']);
  expect(occurrences.every(({ event }) => event === held)).toBe(true);
  expect(held.anchor).toMatchObject({ sourceTime: 1 });
});

it('does not infer a retained gesture continuation when its observed endpoint is unknown', () => {
  const project = createProject([fragment('tail', 2, 0)]);
  project.actionEvents = [{ ...fact('held', 1), data: { gestureType: 'hold', downTime: 1 } }];
  expect(resolveVideoProjectActionOccurrences(project)).toEqual([]);
  project.actionEvents[0]!.data['lastObservedTime'] = 2.5;
  expect(resolveVideoProjectActionOccurrences(project)).toMatchObject([
    { eventId: 'held', clipId: 'tail', time: -1 },
  ]);
});

it('keeps one source occurrence and its visual phase across a window split and held tail', () => {
  const source = fragment('source', 0, 0, 1.5);
  source.sourceDuration = 0.15;
  source.playbackRate = 0.1;
  const reference = createProject([source]);
  reference.actionEvents = [fact('held-click', 0.12)];
  const expected = resolveVideoCompositionActions(reference, 1.3);
  expect(expected).toHaveLength(1);
  const project = createProject([
    {
      ...source,
      id: 'left',
      duration: 1.1,
      playbackWindow: { offset: 0, extent: 5 / 3, holdAt: 1.3 },
    },
    {
      ...source,
      id: 'right',
      startTime: 1.1,
      duration: 5 / 3 - 1.1,
      playbackWindow: { offset: 1.1, extent: 5 / 3, holdAt: 1.3 },
    },
  ]);
  project.version = 43;
  project.actionEvents = reference.actionEvents;
  const before = structuredClone(project);
  expect(resolveVideoProjectActionOccurrences(project)).toMatchObject([
    { clipId: 'right', time: expect.closeTo(1.2, 12) },
  ]);
  expect(resolveVideoProjectActionOccurrences(project)).toHaveLength(1);
  const held = resolveVideoCompositionActions(project, 1.57);
  expect(held).toHaveLength(1);
  expect(held[0]!.progress).toBeCloseTo(expected[0]!.progress, 12);
  expect(held[0]!.clipId).toBe('right');
  expect(project).toEqual(before);
});
