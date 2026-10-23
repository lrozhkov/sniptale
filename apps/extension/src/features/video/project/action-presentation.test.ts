import { createVideoProjectFromRecording, createVideoProjectTrack } from './factories/creation';
import { evaluateProjectGestureFeedback } from '../review/project-action-audio';
import { REVIEW_CLICK_DEFAULT } from './action-feedback/validation';
import { getActionClickStyle, getActionKeyStyle } from './action-style';
import { expect, it } from 'vitest';
import { createEmptyVideoProject } from './factories/creation';
import type { VideoProjectActionEvent } from './types';
import { createProject, createVideoClip } from './timeline/project-meta.test.helpers';
import {
  getVideoProjectActionPresentation,
  resolveActionKindForPreset,
  resolveVideoProjectActionPresentations,
} from './action-presentation';

function event(id = 'click', time = 1): VideoProjectActionEvent {
  return {
    id,
    anchor: { kind: 'project', time },
    capturedDuration: 2,
    kind: 'CLICK',
    label: 'Click',
    data: {},
    point: { x: 40, y: 50 },
  };
}

it('inherits presentation defaults and resets sparse overrides without rewriting source facts', () => {
  const project = createEmptyVideoProject('History');
  project.duration = 10;
  project.actionEvents = [event()];
  project.actionPresentation = {
    ...getVideoProjectActionPresentation(project),
    duration: 1.2,
    offset: -0.3,
    clickPreset: 'SPOTLIGHT',
  };
  const original = structuredClone(project.actionEvents[0]);
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    duration: 1.2,
    offset: -0.3,
    preset: 'SPOTLIGHT',
    start: 0.7,
    overridden: false,
  });
  project.actionEvents[0]!.presentation = { duration: 0.4, point: { x: 90, y: 80 } };
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    duration: 0.4,
    point: { x: 90, y: 80 },
    overridden: true,
  });
  delete project.actionEvents[0]!.presentation;
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    duration: 1.2,
    point: original?.point,
    overridden: false,
  });
  expect(project.actionEvents[0]).toEqual(original);
});

it('retains suppressed events and admits explicit exceptions without bypassing global disable', () => {
  const project = createEmptyVideoProject('History');
  project.duration = 10;
  project.actionEvents = [event('a', 1), event('b', 1.6), event('c', 2.2)];
  expect(resolveVideoProjectActionPresentations(project).map(({ enabled }) => enabled)).toEqual([
    true,
    false,
    true,
  ]);
  expect(resolveVideoProjectActionPresentations(project)[1]).toMatchObject({
    reason: 'suppressed',
    suppressedByOccurrence: { eventId: 'a', clipId: null },
  });
  project.actionEvents[1]!.presentation = { enabled: true };
  expect(resolveVideoProjectActionPresentations(project)[1]?.enabled).toBe(true);
  project.actionPresentation = { ...getVideoProjectActionPresentation(project), enabled: false };
  expect(resolveVideoProjectActionPresentations(project).every(({ enabled }) => !enabled)).toBe(
    true
  );
});

it('keeps the authored animation clock when a negative offset crosses project start', () => {
  const project = createEmptyVideoProject('History');
  project.duration = 10;
  project.actionEvents = [{ ...event('a', 0.2), presentation: { offset: -0.5, duration: 1 } }];
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    start: 0,
    end: 0.7,
    animationStart: -0.3,
  });
});

it('continues presentation across a unique split run and hides trimmed-away facts', () => {
  const project = createProject([
    createVideoClip({
      id: 'first',
      sourceInstanceId: 'instance',
      startTime: 1,
      duration: 1,
      sourceDuration: 1,
    }),
    createVideoClip({
      id: 'split',
      sourceInstanceId: 'instance',
      sourceStart: 1,
      startTime: 2,
      duration: 1,
      sourceDuration: 1,
    }),
  ]);
  project.duration = 4;
  project.actionEvents = [0.8, 1.1].map((sourceTime, index) => ({
    ...event(String(index)),
    point: { x: 0.4, y: 0.5 },
    anchor: {
      kind: 'recording-source',
      recordingId: 'rec-asset-video',
      sourceInstanceId: 'instance',
      sourceEventId: String(index),
      sourceTime,
    },
  }));
  const rows = resolveVideoProjectActionPresentations(project);
  expect(rows[0]).toMatchObject({ enabled: true, start: 1.8, end: 2.5, animationStart: 1.8 });
  expect(rows[1]).toMatchObject({ enabled: false, reason: 'suppressed' });
  project.clips = project.clips.filter(({ id }) => id !== 'first');
  expect(resolveVideoProjectActionPresentations(project)).toMatchObject([
    { event: { id: '1' }, enabled: true },
  ]);
  expect(project.actionEvents).toHaveLength(2);
});

it('shows KEY events without points only when admitted and respects explicit NONE', () => {
  const project = createEmptyVideoProject('Keys');
  project.duration = 10;
  project.actionEvents = [{ ...event(), kind: 'KEY', label: 'Ctrl + K', point: null }];
  expect(resolveVideoProjectActionPresentations(project)[0]?.reason).toBe('keystrokes-disabled');
  project.actionPresentation = {
    ...getVideoProjectActionPresentation(project),
    showKeystrokes: true,
  };
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    enabled: true,
    renderKind: 'keystroke',
    point: null,
  });
  project.actionEvents[0]!.presentation = { preset: 'NONE' };
  expect(resolveVideoProjectActionPresentations(project)[0]?.reason).toBe('preset-none');
});

it('inherits visual style, admits a per-event style and restores track style without changing captured facts', () => {
  const project = createEmptyVideoProject('Style');
  project.duration = 10;
  project.actionEvents = [event()];
  const clickStyle = { ...getActionClickStyle(), color: '#00aaff', size: 60 };
  const keyStyle = { ...getActionKeyStyle(), fontSize: 40 };
  project.actionPresentation = {
    ...getVideoProjectActionPresentation(project),
    clickStyle,
    keyStyle,
    easing: 'LINEAR',
  };
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    clickStyle,
    keyStyle,
    easing: 'LINEAR',
  });
  project.actionEvents[0]!.presentation = { clickStyle: { ...clickStyle, size: 24 } };
  expect(resolveVideoProjectActionPresentations(project)[0]?.clickStyle.size).toBe(24);
  delete project.actionEvents[0]!.presentation;
  expect(resolveVideoProjectActionPresentations(project)[0]?.clickStyle.size).toBe(60);
});

it('preserves action kind selection for every editor preset', () => {
  expect(resolveActionKindForPreset('SCROLL_EMPHASIS')).toBe('SCROLL');
  expect(resolveActionKindForPreset('DWELL_ZOOM')).toBe('PAUSE');
  expect(resolveActionKindForPreset('SPOTLIGHT')).toBe('CALLOUT');
  expect(resolveActionKindForPreset('NONE')).toBe('CLICK');
  expect(resolveActionKindForPreset('CLICK_PRESS')).toBe('CLICK');
  expect(resolveActionKindForPreset('CLICK_RIPPLE')).toBe('CLICK');
});

it('never lets a sustained gesture suppress a separate captured click', () => {
  const project = createEmptyVideoProject();
  project.duration = 10;
  project.actionEvents = [
    { ...event('hold', 1), data: { gestureType: 'hold', downTime: 1, upTime: 4 } },
    event('click', 1.2),
    { ...event('drag', 1.3), data: { gestureType: 'drag', downTime: 1.3, upTime: 3 } },
  ];
  expect(resolveVideoProjectActionPresentations(project).map(({ enabled }) => enabled)).toEqual([
    true,
    true,
    true,
  ]);
});

it.each([null, 'legacy-unknown'])(
  'keeps ordinary click suppression for unrelated legacy metadata (%s)',
  (gestureType) => {
    const project = createEmptyVideoProject();
    project.duration = 10;
    project.actionEvents = [{ ...event('first', 1), data: { gestureType } }, event('second', 1.2)];
    expect(resolveVideoProjectActionPresentations(project).map(({ enabled }) => enabled)).toEqual([
      true,
      false,
    ]);
  }
);

it('keeps an unresolved observed press out of generic ripple and completed-click suppression', () => {
  const project = createEmptyVideoProject();
  project.duration = 10;
  project.actionEvents = [
    {
      ...event('prefix', 1),
      data: { gestureType: 'click', completion: 'lost', downTime: 1 },
      presentation: { preset: 'CLICK_PRESS' },
    },
    event('released', 1.2),
  ];
  const rows = resolveVideoProjectActionPresentations(project);
  expect(rows[0]).toMatchObject({ enabled: false, reason: 'unsupported', renderKind: null });
  expect(rows[1]).toMatchObject({ enabled: true, suppressedByOccurrence: null });
  project.actionEvents[0]!.data['completion'] = 'released';
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    enabled: true,
    renderKind: 'accent',
  });
});

function sourceClickProject() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source-click',
    filename: 'source.webm',
    width: 160,
    height: 90,
    duration: 5,
    mimeType: 'video/webm',
    size: 1024,
    sourceNormalizedActionEvents: [
      {
        id: 'captured-click',
        kind: 'CLICK',
        time: 1.5,
        duration: 0,
        point: { x: 0.5, y: 0.5 },
        label: '',
        preset: 'NONE',
        data: {},
      },
    ],
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  clip.sourceStart = 0.5;
  clip.sourceDuration = 4;
  clip.playbackRate = 2;
  clip.duration = 2;
  project.duration = 2;
  return project;
}
it('keeps source clicks off by default without rewriting legacy settings or captured facts', () => {
  const project = sourceClickProject(),
    event = project.actionEvents[0]!;
  event.presentation = { preset: 'SPOTLIGHT', duration: 2, offset: 1, point: { x: 0.9, y: 0.9 } };
  const before = structuredClone(project);
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    enabled: false,
    reason: 'preset-none',
    preset: 'NONE',
    offset: 0,
    point: { x: 0.5, y: 0.5 },
    overridden: false,
  });
  expect(project).toEqual(before);
});
it('projects source click phases and offsets in result seconds while preserving source coordinates', () => {
  const project = sourceClickProject();
  project.actionEvents[0]!.presentation = {
    preset: 'NONE',
    duration: 2,
    offset: 1,
    point: { x: 0.9, y: 0.9 },
  };
  project.actionFeedback![0]!.gestureStyles = [
    {
      ...REVIEW_CLICK_DEFAULT,
      id: 'captured-click',
      effect: 'ripple',
      before: 0.4,
      after: 0.6,
      offset: 0.1,
      x: 0.1,
      y: -0.2,
      pulses: 2,
      easing: 'linear',
    },
  ];
  const row = resolveVideoProjectActionPresentations(project)[0]!;
  expect(row).toMatchObject({
    enabled: true,
    preset: 'CLICK_RIPPLE',
    easing: 'LINEAR',
    duration: 1,
    offset: 0.1,
    point: { x: 0.6, y: 0.3 },
    overridden: true,
  });
  expect(row.animationStart).toBeCloseTo(0.2, 12);
  expect(row.start).toBeCloseTo(0.2, 12);
  expect(row.end).toBeCloseTo(1.2, 12);
  expect(row.renderIntervals).toHaveLength(1);
  project.actionEvents[0]!.presentation!.enabled = false;
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    enabled: false,
    reason: 'event-disabled',
  });
  expect(project.actionFeedback![0]!.gestureStyles![0]!.before).toBe(0.4);
});
it('retains clipped before phases as metadata without moving the factual source anchor', () => {
  const project = sourceClickProject();
  const event = project.actionEvents[0]!;
  if (event.anchor.kind !== 'recording-source') throw new Error('Expected source anchor.');
  event.anchor = { ...event.anchor, sourceTime: 0.7 };
  project.actionFeedback![0]!.gestureStyles = [
    { ...REVIEW_CLICK_DEFAULT, id: 'captured-click', effect: 'press', before: 0.4 },
  ];
  const row = resolveVideoProjectActionPresentations(project)[0]!;
  expect(row.occurrence.time).toBeCloseTo(0.1, 12);
  expect(row.animationStart).toBeCloseTo(-0.3, 12);
  expect(row.start).toBe(0);
  expect(row.end).toBeCloseTo(0.7, 12);
  expect(event.anchor.sourceTime).toBe(0.7);
});

it('matches rendered click phases across continuous source fragments on different tracks', () => {
  const project = sourceClickProject(),
    base = project.clips[0]!;
  if (base.type !== 'VIDEO') throw new Error('Expected source video.');
  const other = createVideoProjectTrack('Moved fragment', 1, 'PRIMARY');
  project.tracks.push(other);
  project.clips = [
    { ...base, duration: 0.25, sourceDuration: 0.5 },
    {
      ...base,
      id: 'tail',
      trackId: other.id,
      timelineLaneId: other.logicalLanes?.[0]?.id ?? null,
      startTime: 0.25,
      sourceStart: 1,
      sourceDuration: 1,
      duration: 1,
      playbackRate: 1,
    },
  ];
  project.duration = 1.25;
  project.actionFeedback![0]!.gestureStyles = [
    { ...REVIEW_CLICK_DEFAULT, id: 'captured-click', effect: 'ripple', before: 0.6, after: 0.5 },
  ];
  const row = resolveVideoProjectActionPresentations(project)[0]!;
  expect(row.occurrence.time).toBeCloseTo(0.75, 12);
  expect(evaluateProjectGestureFeedback(project, 0.2)).toHaveLength(1);
  expect(row.start).toBeCloseTo(0.15, 12);
  expect(row.renderIntervals.map((interval) => interval.clipId)).toEqual([base.id, 'tail']);
});

it('does not report a source click as visible when its capture has no point', () => {
  const project = sourceClickProject();
  project.actionEvents[0]!.point = null;
  project.actionFeedback![0]!.gestureStyles = [
    { ...REVIEW_CLICK_DEFAULT, id: 'captured-click', effect: 'press' },
  ];
  expect(evaluateProjectGestureFeedback(project, 0.6)).toEqual([]);
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    point: null,
    enabled: false,
    reason: 'unsupported',
    renderKind: null,
  });
});
