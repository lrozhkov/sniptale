import { expect, it } from 'vitest';
import type { RecordingActionEvent } from '../project/types';
import { projectReviewTelemetry } from './telemetry';

it('shows one observed gesture range and preserves anonymous keyboard attacks and repeats', () => {
  const rhythm = [
    {
      version: 1 as const,
      id: 'physical-a',
      startTime: 4,
      quantumMs: 1 as const,
      count: 2,
      encoding: 'delta' as const,
      ticks: [0, 120],
    },
  ];
  const input: Parameters<typeof projectReviewTelemetry>[0] = {
    actionEvents: [
      {
        id: 'drag',
        kind: 'CLICK',
        time: 1,
        duration: 99,
        point: { x: 500, y: 400 },
        recordingPoint: { x: 0.2, y: 0.3 },
        label: 'Drag',
        preset: 'NONE',
        data: {
          gestureId: 'gesture',
          gestureType: 'drag',
          button: 0,
          downTime: 1,
          upTime: 3,
          pressDuration: 2,
          completion: 'released',
          downX: 500,
          downY: 400,
          captureSegment: 0,
        },
      },
      {
        id: 'key',
        kind: 'KEY',
        time: 4,
        duration: 0.55,
        point: null,
        label: 'Ctrl+K',
        preset: 'NONE',
        data: { keyboardAttackId: 'command', keyboardOnsetTime: 4, combo: 'Ctrl+K' },
      },
    ],
    signals: [
      {
        id: 'typing',
        kind: 'typing',
        startTime: 4,
        endTime: 4.2,
        point: null,
        data: { activity: 'keyboard' },
        keyboardRhythm: rhythm,
        keyboardRepeats: rhythm,
      },
    ],
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
        {
          id: 'verified',
          time: 2,
          x: 900,
          y: 700,
          recordingPoint: { x: 0.3, y: 0.4 },
          visible: true,
          captureSegment: 0,
        },
        { id: 'unverified', time: 2.1, x: 100, y: 100, visible: true, captureSegment: 0 },
        {
          id: 'other-segment',
          time: 2.2,
          x: 900,
          y: 700,
          recordingPoint: { x: 0.9, y: 0.9 },
          visible: true,
          captureSegment: 1,
        },
      ],
    },
  };
  const original = structuredClone(input);
  const { markers } = projectReviewTelemetry(input, 10);
  expect(markers[0]).toMatchObject({
    eventType: 'DRAG',
    start: 1,
    end: 3,
    gesture: {
      id: 'gesture',
      downTime: 1,
      upTime: 3,
      path: [
        { time: 2, x: 0.3, y: 0.4, captureSegment: 0 },
        { time: 2.2, x: 0.9, y: 0.9, captureSegment: 1 },
      ],
      gaps: [{ start: 2.1, end: 2.2 }],
    },
  });
  expect(markers[1]?.keyboardAttack).toEqual({ id: 'command', time: 4 });
  expect(markers[2]?.keyboardRhythm).toEqual(rhythm);
  expect(markers[2]?.keyboardRepeats).toEqual(rhythm);
  expect(JSON.stringify(markers[0]?.gesture)).not.toMatch(/downX|downY|900|700/);
  expect(input).toEqual(original);
});

it('ignores every legacy static-frame payload without markers or diagnostic influence', () => {
  const result = projectReviewTelemetry(
    {
      actionEvents: [],
      cursorTrack: null,
      signals: [
        { id: 'old-range', kind: 'static-frame', startTime: 1, endTime: 8, point: null, data: {} },
        {
          id: 'old-warning',
          kind: 'static-frame',
          startTime: 0,
          endTime: 0,
          point: null,
          data: { code: 'failed' },
        },
      ],
    },
    10
  );
  expect(result).toEqual({ markers: [], warnings: 0 });
});

it('keeps held-key metadata on the keyboard row without fabricating a second sound attack', () => {
  const result = projectReviewTelemetry(
    {
      actionEvents: [],
      cursorTrack: null,
      signals: [
        {
          id: 'held-key',
          kind: 'typing',
          startTime: 1,
          endTime: 3,
          point: null,
          data: {
            keyboardHold: true,
            activity: 'keyboard',
            eventType: 'held-key',
            downTime: 1,
            upTime: 3,
            completion: 'released',
          },
        },
      ],
    },
    4
  );
  expect(result.markers[0]).toMatchObject({
    eventType: 'KEY_HOLD',
    keyboardHold: true,
    observed: true,
    start: 1,
    end: 3,
  });
  expect(result.markers[0]?.audio).toBeUndefined();
});

it('retains every verified point of a sustained curved drag for preview and export evaluation', () => {
  const samples = Array.from({ length: 600 }, (_, index) => ({
    id: `sample-${index}`,
    time: 1 + index / 1000,
    x: index,
    y: 200,
    visible: true,
    captureSegment: 0,
    recordingPoint: { x: index / 1000, y: index % 2 ? 0.2 : 0.8 },
  }));
  const source: Parameters<typeof projectReviewTelemetry>[0] = {
    actionEvents: [
      {
        id: 'drag',
        kind: 'CLICK',
        time: 1,
        duration: 0.2,
        point: null,
        label: 'Drag',
        preset: 'NONE',
        data: {
          gestureId: 'drag',
          gestureType: 'drag',
          button: 0,
          downTime: 1,
          upTime: 2,
          completion: 'released',
        },
      },
    ],
    signals: [],
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
      samples,
    },
  };
  const path = projectReviewTelemetry(source, 3).markers[0]?.gesture?.path;
  expect(path).toHaveLength(samples.length);
  expect(path?.[257]).toMatchObject({
    time: samples[257]!.time,
    x: samples[257]!.recordingPoint.x,
    y: samples[257]!.recordingPoint.y,
  });
});

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
  expect(result.warnings).toBe(0);
  expect(result.markers.map(({ ref, start, end }) => ({ ref, start, end }))).toEqual([
    { ref: { kind: 'signal', id: 'idle' }, start: 2, end: 4 },
    { ref: { kind: 'signal', id: 'typing' }, start: 8, end: 10 },
  ]);
});

it('keeps cursor samples opt-in and does not synthesize absent telemetry', () => {
  const input = { actionEvents: [], signals: [], cursorTrack: null };
  expect(projectReviewTelemetry(input, 10)).toEqual({ markers: [], warnings: 0 });
});

it('projects only sound families and canonical key counts without copying text or guessing filtered facts', () => {
  const actionEvents: RecordingActionEvent[] = [
    {
      id: 'click',
      kind: 'CLICK',
      time: 0,
      duration: 0.1,
      point: null,
      label: 'Click',
      data: {},
      preset: 'NONE',
    },
    ...['Ctrl+S', 'Ctrl+Shift+S', 'Meta+Ctrl+Alt+Shift+P', 'Ctrl++', 'broken+combo'].map(
      (combo, index): RecordingActionEvent => ({
        id: `key-${index}`,
        kind: 'KEY',
        time: index + 1,
        duration: 0.55,
        point: null,
        label: combo,
        data: { combo, key: 'fixture', text: 'Not an audio descriptor' },
        preset: 'NONE',
      })
    ),
  ];
  const before = structuredClone(actionEvents);
  const result = projectReviewTelemetry(
    {
      actionEvents,
      signals: [
        {
          id: 'typing',
          kind: 'typing',
          startTime: 7,
          endTime: 11,
          point: null,
          data: { text: 'Private', eventCount: 9999 },
        },
        { id: 'filtered', kind: 'typing', startTime: 11.5, endTime: 11.6, point: null, data: {} },
      ],
      cursorTrack: null,
    },
    12
  );
  expect(result.markers.map((marker) => marker.audio)).toEqual([
    { family: 'mouse' },
    { family: 'keyboard', keyCount: 2 },
    { family: 'keyboard', keyCount: 3 },
    { family: 'keyboard', keyCount: 5 },
    { family: 'keyboard', keyCount: 2 },
    { family: 'keyboard', keyCount: 1 },
    { family: 'typing' },
    { family: 'typing' },
  ]);
  expect(JSON.stringify(result.markers.map((marker) => marker.audio))).not.toMatch(
    /Private|fixture|9999|descriptor/u
  );
  expect(actionEvents).toEqual(before);
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
    { kind: 'cursor', id: 'hidden' },
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
    markers: [
      {
        ref: { kind: 'action', id: 'raw' },
        eventType: 'CLICK',
        audio: { family: 'mouse' },
        start: 2,
        end: 2.25,
        target: 'Click',
        targetSemantics: { kind: 'unknown', source: 'unknown' },
      },
    ],
    warnings: 0,
  });
  expect(event).toEqual(before);
});

it('filters positively identified nontext changes without hiding a click followed by real typing', () => {
  const action: RecordingActionEvent = {
    id: 'click',
    kind: 'CLICK',
    time: 1,
    duration: 0.1,
    point: null,
    label: '',
    data: {},
    preset: 'NONE',
  };
  const signals: Parameters<typeof projectReviewTelemetry>[0]['signals'] = [
    {
      id: 'checkbox',
      kind: 'typing',
      startTime: 1,
      endTime: 2,
      point: null,
      data: { targetTag: 'input', targetType: 'checkbox' },
    },
    {
      id: 'select',
      kind: 'typing',
      startTime: 1,
      endTime: 2,
      point: null,
      data: { targetTag: 'select' },
    },
    {
      id: 'text',
      kind: 'typing',
      startTime: 1,
      endTime: 4,
      point: null,
      data: { targetTag: 'input', targetType: 'text' },
    },
  ];
  expect(
    projectReviewTelemetry({ actionEvents: [action], signals, cursorTrack: null }, 4).markers.map(
      (marker) => marker.ref.id
    )
  ).toEqual(['click', 'text']);
});

it('uses immutable recording coordinates and only associates typing with a matching recent field click', () => {
  const click: RecordingActionEvent = {
    id: 'click-field',
    kind: 'CLICK',
    time: 2,
    duration: 0.2,
    point: { x: 900, y: 400 },
    recordingPoint: { x: 0.25, y: 0.75 },
    label: 'Field',
    data: { targetId: 'field' },
    preset: 'NONE',
  };
  const signals = [
    {
      id: 'typing-field',
      kind: 'typing' as const,
      startTime: 2.2,
      endTime: 6,
      point: { x: 900, y: 400 },
      data: { targetId: 'field' },
    },
    {
      id: 'other-field',
      kind: 'typing' as const,
      startTime: 8,
      endTime: 12,
      point: { x: 20, y: 10 },
      data: { targetId: 'other' },
    },
  ];
  const result = projectReviewTelemetry({ actionEvents: [click], signals, cursorTrack: null }, 15);
  expect(result.markers[0]?.focusPoint).toEqual({ x: 0.25, y: 0.75 });
  expect(result.markers[1]?.focusPoint).toEqual({ x: 0.25, y: 0.75 });
  expect(result.markers[2]?.focusPoint).toBeUndefined();
  const unknown = projectReviewTelemetry(
    { actionEvents: [{ ...click, recordingPoint: null }], signals, cursorTrack: null },
    15
  );
  expect(unknown.markers.every((item) => !item.focusPoint)).toBe(true);
});

it('projects legacy control semantics without mutating stored actions or accepting invented metadata', () => {
  const event: RecordingActionEvent = {
    id: 'legacy-input',
    kind: 'CLICK',
    time: 1,
    duration: 0.2,
    point: null,
    label: 'Search',
    preset: 'NONE',
    data: { targetTag: 'input', targetType: 'search', targetKind: 'invalid-type' },
  };
  const original = structuredClone(event);
  const result = projectReviewTelemetry(
    { actionEvents: [event], signals: [], cursorTrack: null },
    5
  );
  expect(result.markers[0]?.targetSemantics).toEqual({ kind: 'text-field', source: 'html' });
  expect(event).toEqual(original);
});

it('labels an onset-only lost press as unresolved without inventing hold time or release', () => {
  const action: RecordingActionEvent = {
    id: 'prefix',
    kind: 'CLICK',
    time: 1,
    duration: 0.18,
    point: null,
    recordingPoint: { x: 0.5, y: 0.5 },
    label: '',
    preset: 'CLICK_PRESS',
    data: { gestureId: 'prefix', gestureType: 'click', button: 0, downTime: 1, completion: 'lost' },
  };
  const before = structuredClone(action);
  const result = projectReviewTelemetry(
    { actionEvents: [action], cursorTrack: null, signals: [] },
    10
  );
  expect(result.markers[0]).toMatchObject({
    eventType: 'PRESS_UNRESOLVED',
    start: 1,
    end: 1,
    gesture: { type: 'click', completion: 'lost', downTime: 1 },
  });
  expect(result.markers[0]!.gesture).not.toHaveProperty('upTime');
  expect(action).toEqual(before);
});

it('distinguishes observed command holds and modifiers without changing raw KEY facts or inventing key-up', () => {
  const base: RecordingActionEvent = {
    id: 'hold',
    kind: 'KEY',
    time: 1,
    duration: 0.55,
    point: null,
    label: 'Ctrl+K',
    preset: 'NONE',
    data: {
      combo: 'Ctrl+K',
      keyboardOnsetTime: 1,
      keyboardAttackId: 'attack',
      upTime: 2,
      pressDuration: 1,
      repeatCount: 0,
    },
  };
  const actions = [
    base,
    {
      ...base,
      id: 'modifiers',
      time: 3,
      data: { modifierOnly: true, keyboardOnsetTime: 3, upTime: 4 },
    },
    { ...base, id: 'lost-key', time: 5, data: { keyboardOnsetTime: 5, completion: 'lost' } },
    { ...base, id: 'legacy', time: 6, data: { combo: 'Ctrl+K' } },
  ];
  const original = structuredClone(actions);
  const markers = projectReviewTelemetry(
    { actionEvents: actions, signals: [], cursorTrack: null },
    10
  ).markers;
  expect(markers.map(({ eventType, start, end }) => ({ eventType, start, end }))).toEqual([
    { eventType: 'KEY_HOLD', start: 1, end: 2 },
    { eventType: 'KEY_MODIFIERS', start: 3, end: 4 },
    { eventType: 'KEY', start: 5, end: 5 },
    { eventType: 'KEY', start: 6, end: 6.55 },
  ]);
  expect(markers[0]?.keyboardAttack).toEqual({ id: 'attack', time: 1 });
  expect(markers[0]?.keyboardHold).toBeUndefined();
  expect(markers[0]?.keyboardRepeats).toBeUndefined();
  expect(actions).toEqual(original);
});

it.each([5, 31])(
  'preserves delivered additional mouse button %s without changing facts',
  (button) => {
    const event: RecordingActionEvent = {
      id: 'extra',
      kind: 'CLICK',
      time: 1,
      duration: 0.2,
      point: null,
      label: '',
      preset: 'NONE',
      data: { button },
    };
    const snapshot = structuredClone(event);
    expect(
      projectReviewTelemetry({ actionEvents: [event], signals: [], cursorTrack: null }, 4)
        .markers[0]?.mouseButton
    ).toBe(button);
    expect(event).toEqual(snapshot);
  }
);

it('projects a burst of browser scroll observations as one history interval per family', () => {
  const scroll = (id: string, time: number, eventType: string): RecordingActionEvent => ({
    id,
    kind: 'SCROLL',
    time,
    duration: 0.45,
    point: null,
    label: eventType,
    preset: 'SCROLL_EMPHASIS',
    data: { eventType, captureSegment: 0, observationClockId: 'clock' },
  });
  const actionEvents = [
    scroll('wheel', 1, 'wheel'),
    ...Array.from({ length: 50 }, (_, i) => scroll(`scroll-${i}`, 1.02 + i * 0.016, 'scroll')),
    scroll('wheel-2', 1.2, 'wheel'),
    scroll('later', 5, 'scroll'),
  ];
  const input = { actionEvents, signals: [], cursorTrack: null };
  const snapshot = structuredClone(input);
  const { markers } = projectReviewTelemetry(input, 5.2);
  expect(markers.map((marker) => [marker.ref.id, marker.eventType])).toEqual([
    ['wheel', 'WHEEL'],
    ['scroll-0', 'SCROLL'],
    ['later', 'SCROLL'],
  ]);
  expect(markers[0]).toMatchObject({ start: 1, end: 1.65 });
  expect(markers[1]?.end).toBeCloseTo(1.02 + 49 * 0.016 + 0.45);
  expect(markers[2]).toMatchObject({ start: 5, end: 5.2 });
  expect(input).toEqual(snapshot);
});
