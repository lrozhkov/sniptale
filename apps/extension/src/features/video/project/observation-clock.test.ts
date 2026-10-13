import { encodeRecordingKeyboardRhythm } from './keyboard-rhythm';
import { expect, it } from 'vitest';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { projectRecordingObservationClock } from './observation-clock';
import { isRecordingTelemetrySnapshot } from './validation/recording-telemetry';
import { createVideoProjectCursorTrack } from './defaults';

function entry(): RecordingTelemetryEntry {
  return {
    recordingId: 'r',
    createdAt: 1,
    updatedAt: 1,
    captureMode: 'TAB',
    viewport: null,
    capabilities: {
      version: 1,
      pointer: 'available',
      keyboard: 'available',
      wheel: 'available',
      coverage: 'document',
      timing: { mode: 'approximate', accuracyMs: null },
    },
    observationClock: {
      version: 1,
      domain: 'observation',
      segments: [
        {
          id: 'initial',
          documentId: 'doc',
          timeOriginMs: 100000,
          startedAtTimestampMs: 2000,
          observationStartSeconds: 2,
          mediaStartEstimateSeconds: 0,
          mapping: { captureEpochMs: 102000, mediaTimeSeconds: 0, uncertaintyMs: 2 },
          mediaEndSeconds: 0.4,
        },
        {
          id: 'resume',
          documentId: 'doc',
          timeOriginMs: 100000,
          startedAtTimestampMs: 5000,
          observationStartSeconds: 5,
          mediaStartEstimateSeconds: 0.4,
          mapping: null,
        },
      ],
    },
    actionEvents: [
      {
        id: 'press',
        kind: 'CLICK',
        time: 2.1,
        duration: 0.6,
        point: { x: 40, y: 60 },
        label: '',
        preset: 'CLICK_PRESS',
        data: { observationClockId: 'initial', downTime: 2.1, upTime: 2.3, pressDuration: 0.2 },
      },
      {
        id: 'excluded',
        kind: 'KEY',
        time: 2.8,
        duration: 0.6,
        point: null,
        label: 'F2',
        preset: 'NONE',
        data: { observationClockId: 'initial' },
      },
    ],
    cursorTrack: {
      ...createVideoProjectCursorTrack('embedded-fallback'),
      samples: [
        { id: 'cursor', time: 5.2, x: 40, y: 60, visible: true, observationClockId: 'resume' },
      ],
    },
    signals: [
      {
        id: 'private',
        kind: 'typing',
        startTime: 5,
        endTime: 6,
        point: null,
        data: {
          privacy: 'protected',
          activity: 'input',
          captureSegment: 1,
          observationClockId: 'resume',
        },
      },
    ],
  };
}
it('projects phases once, keeps raw excluded facts and preserves identities/physical duration', () => {
  const raw = entry();
  const before = structuredClone(raw);
  const view = projectRecordingObservationClock(raw);
  expect(view.actionEvents.map((event) => event.id)).toEqual(['press']);
  expect(view.actionEvents[0]?.time).toBeCloseTo(0.1);
  expect(view.actionEvents[0]?.data['upTime']).toBeCloseTo(0.3);
  expect(view.actionEvents[0]?.data['pressDuration']).toBe(0.2);
  expect(view.cursorTrack?.samples[0]).toMatchObject({
    id: 'cursor',
    time: expect.closeTo(0.6),
    x: 40,
    y: 60,
  });
  expect(view.signals[0]).toMatchObject({ startTime: 0, endTime: 2 });
  expect(view.signals[0]?.keyboardRhythm).toBeUndefined();
  expect(isRecordingTelemetrySnapshot(view)).toBe(true);
  expect(projectRecordingObservationClock(view)).toBe(view);
  expect(raw).toEqual(before);
  expect(isRecordingTelemetrySnapshot(raw)).toBe(true);
});
it('rejects malformed optional clock and timing metadata without admitting a private cadence', () => {
  const raw = entry();
  for (const clock of [
    { ...raw.observationClock, domain: 'other' },
    { ...raw.observationClock, segments: [{ id: 'bad' }] },
  ])
    expect(isRecordingTelemetrySnapshot({ ...raw, observationClock: clock })).toBe(false);
  expect(
    isRecordingTelemetrySnapshot({
      ...raw,
      capabilities: { ...raw.capabilities, timing: { mode: 'approximate', accuracyMs: NaN } },
    })
  ).toBe(false);
  expect(
    isRecordingTelemetrySnapshot({
      ...raw,
      signals: [{ ...raw.signals[0], data: { ...raw.signals[0]!.data, key: 'private' } }],
    })
  ).toBe(false);
});
it('keeps native and legacy media-domain inputs unchanged', () => {
  const raw = entry();
  delete raw.observationClock;
  expect(projectRecordingObservationClock(raw)).toBe(raw);
});

it('keeps a raw anonymous hold release while the excluded media tail shows an incomplete hold', () => {
  const raw = entry();
  raw.signals = [
    {
      id: 'held',
      kind: 'typing',
      startTime: 2.1,
      endTime: 2.8,
      point: null,
      data: {
        activity: 'keyboard',
        observationClockId: 'initial',
        downTime: 2.1,
        upTime: 2.8,
        pressDuration: 0.7,
        keyboardHold: true,
        completion: 'released',
      },
    },
  ];
  const view = projectRecordingObservationClock(raw);
  expect(view.signals[0]?.endTime).toBe(0.4);
  expect(view.signals[0]?.data).toMatchObject({ completion: 'lost', lastObservedTime: 0.4 });
  expect(view.signals[0]?.data).not.toHaveProperty('upTime');
  expect(view.signals[0]?.data).not.toHaveProperty('pressDuration');
  expect(raw.signals[0]?.data['pressDuration']).toBe(0.7);
  expect(isRecordingTelemetrySnapshot(view)).toBe(true);
});

it('refuses imported out-of-range clocks and safely omits cadence outside supported media time', () => {
  const raw = entry();
  raw.signals = [
    {
      id: 'keys',
      kind: 'typing',
      startTime: 1,
      endTime: 2,
      point: null,
      data: { activity: 'keyboard', observationClockId: 'initial' },
      keyboardRhythm: [encodeRecordingKeyboardRhythm('rhythm', [1, 2])],
    },
  ];
  const phase = raw.observationClock!.segments[0]!;
  phase.mapping = null;
  phase.observationStartSeconds = 0;
  phase.mediaStartEstimateSeconds = 90000;
  delete phase.mediaEndSeconds;
  expect(isRecordingTelemetrySnapshot(raw)).toBe(false);
  phase.mediaStartEstimateSeconds = 86400;
  expect(isRecordingTelemetrySnapshot(raw)).toBe(true);
  const view = projectRecordingObservationClock(raw);
  expect(view.signals).toEqual([]);
  expect(raw.signals[0]?.keyboardRhythm?.[0]?.startTime).toBe(1);
});
