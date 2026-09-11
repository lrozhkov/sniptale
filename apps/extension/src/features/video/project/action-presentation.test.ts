import { getActionClickStyle, getActionKeyStyle } from './action-style';
import { expect, it } from 'vitest';
import { createEmptyVideoProject } from './factories/creation';
import type { VideoProjectActionEvent } from './types';
import { createProject, createVideoClip } from './timeline/project-meta.test.helpers';
import {
  getVideoProjectActionPresentation,
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
