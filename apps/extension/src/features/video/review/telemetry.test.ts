import { expect, it } from 'vitest';
import type { RecordingActionEvent } from '../project/types';
import { projectReviewTelemetry } from './telemetry';

it('distinguishes actual idle ranges from zero-length native backend warnings', () => {
  const result = projectReviewTelemetry(
    {
      actionEvents: [],
      cursorTrack: null,
      signals: [
        {
          id: 'warning',
          kind: 'static-frame',
          startTime: 0,
          endTime: 0,
          point: null,
          data: { code: 'no-signal' },
        },
        {
          id: 'idle',
          kind: 'cursor-idle',
          startTime: 2,
          endTime: 4,
          point: { x: -100, y: 300 },
          data: {},
        },
        {
          id: 'typing',
          kind: 'typing',
          startTime: 8,
          endTime: 12,
          point: null,
          data: { count: 5 },
        },
      ],
    },
    10
  );
  expect(result.warnings).toBe(1);
  expect(result.markers.map(({ ref, start, end }) => ({ ref, start, end }))).toEqual([
    { ref: { kind: 'signal', id: 'idle' }, start: 2, end: 4 },
    { ref: { kind: 'signal', id: 'typing' }, start: 8, end: 10 },
  ]);
});

it('keeps cursor samples opt-in and does not synthesize absent telemetry', () => {
  const input = { actionEvents: [], signals: [], cursorTrack: null };
  expect(projectReviewTelemetry(input, 10)).toEqual({ markers: [], warnings: 0 });
});

it('excludes invalid times and hidden cursor samples while preserving source coordinates and references', () => {
  const input: Parameters<typeof projectReviewTelemetry>[0] = {
    actionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 2,
        duration: 0.2,
        point: { x: -20, y: 40 },
        label: '',
        data: {},
        preset: 'NONE',
      },
    ],
    signals: [-1, Number.NaN, 20].map((startTime, index) => ({
      id: `bad-${index}`,
      kind: 'typing',
      startTime,
      endTime: startTime + 1,
      point: null,
      data: {},
    })),
    cursorTrack: {
      captureMode: 'separate',
      skin: {
        animationPreset: 'NONE',
        color: '#fff',
        hidden: false,
        preset: 'ARROW',
        scale: 1,
        shadow: false,
      },
      samples: [
        { id: 'visible', time: 1, x: -20, y: 40, visible: true },
        { id: 'hidden', time: 3, x: 0, y: 0, visible: false },
      ],
    },
  };
  const result = projectReviewTelemetry(input, 4, true);
  expect(result.markers.map((marker) => marker.ref)).toEqual([
    { kind: 'cursor', id: 'visible' },
    { kind: 'action', id: 'click' },
  ]);
  expect(projectReviewTelemetry(input, 4).markers).toHaveLength(1);
});

it('projects raw capture time even when optional animation and source anchor differ', () => {
  const event: RecordingActionEvent = {
    id: 'raw',
    kind: 'CLICK',
    time: 2,
    duration: 0.25,
    point: null,
    label: 'Click',
    data: {},
    preset: 'NONE',
    animation: { start: 1, end: 3, duration: 2 },
    sourceAnchor: {
      kind: 'recording-source',
      recordingId: 'r',
      sourceClipId: 'raw-source',
      sourceTime: 9,
    },
    timeBasis: 'project',
  };
  const before = structuredClone(event);
  expect(
    projectReviewTelemetry({ actionEvents: [event], signals: [], cursorTrack: null }, 10)
  ).toEqual({
    markers: [{ ref: { kind: 'action', id: 'raw' }, eventType: 'CLICK', start: 2, end: 2.25 }],
    warnings: 0,
  });
  expect(event).toEqual(before);
});
