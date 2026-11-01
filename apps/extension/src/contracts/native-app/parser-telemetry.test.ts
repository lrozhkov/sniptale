import { expect, it } from 'vitest';
import type { RecordingActionEvent } from '../../features/video/project/types';

import { parseNativeAppInboundMessage, estimateNativeMessageJsonUtf8Bytes } from './index';

it('accepts safe shortcut labels and bounded telemetry records', () => {
  expect(
    parseNativeAppInboundMessage({
      ...createRecordingStopped(),
      telemetry: {
        actionEvents: [
          createSafeKeyEvent('Enter'),
          createSafeKeyEvent('Ctrl+A'),
          {
            data: { button: 0, modifiers: ['Ctrl'] },
            duration: 0.1,
            id: 'click-1',
            kind: 'CLICK',
            label: 'Click',
            point: { x: 1, y: 2 },
            preset: 'CLICK_RIPPLE',
            time: 0.2,
          },
        ],
        cursorTrack: {
          captureMode: 'screen',
          samples: [{ id: 'sample-1', time: 0.1, visible: true, x: 1, y: 2 }],
          skin: { color: '#fff', hidden: false, scale: 1, shadow: true },
        },
        signals: [],
        viewport: {
          devicePixelRatio: 1,
          height: 720,
          scrollX: 0,
          scrollY: 0,
          width: 1280,
        },
      },
    })
  ).toMatchObject({ ok: true });
});

function createRecordingStopped() {
  return {
    chunkCount: 1,
    controllerLeaseId: 'lease-1',
    durationMs: 50_000,
    filename: 'recording.mp4',
    fps: 30,
    height: 720,
    mimeType: 'video/mp4',
    openEditor: false,
    protocolVersion: 2,
    recordingId: 'recording-1',
    sha256: '0'.repeat(64),
    telemetry: {
      actionEvents: [],
      cursorTrack: null,
      signals: [],
      viewport: null,
    },
    totalBytes: 4,
    type: 'app.recording.stopped',
    width: 1280,
  };
}

function createSafeKeyEvent(label: string): RecordingActionEvent {
  return {
    data: { repeated: false },
    duration: 0.1,
    id: `key-${label.replace('+', '-')}`,
    kind: 'KEY',
    label,
    point: null,
    preset: 'NONE',
    time: 0.2,
  };
}

it.each([
  ...Array.from({ length: 24 }, (_, index) => `F${index + 1}`),
  'Ctrl+F5',
  'Ctrl+Alt+Shift+Meta+A',
  'Ctrl+Alt+Shift+Meta+F24',
  'Shift+Tab',
  'Ctrl+Home',
  'Alt+Shift',
  'Insert',
  'Ctrl+PageDown',
  'Shift+F24',
  'Unknown',
])(
  'accepts the Desktop sanitizer command label %s without discarding the recording message',
  (label) => {
    const input = createRecordingStopped();
    expect(
      parseNativeAppInboundMessage({
        ...input,
        telemetry: { ...input.telemetry, actionEvents: [createSafeKeyEvent(label)] },
      }).ok
    ).toBe(true);
  }
);

it.each(['recording-events', 'cursor-trajectory'])(
  'accepts the exact %s format-unavailable warning so legacy video remains usable',
  (source) => {
    const input = createRecordingStopped();
    expect(
      parseNativeAppInboundMessage({
        ...input,
        telemetry: {
          ...input.telemetry,
          signals: [
            {
              id: 'native-static-0',
              kind: 'static-frame',
              startTime: 0,
              endTime: 0,
              point: null,
              data: { source, code: 'format-unavailable', severity: 'warning' },
            },
          ],
        },
      })
    ).toMatchObject({ ok: true });
  }
);

it.each(['Shift+A', 'Shift+7', 'F0', 'F25', 'F999', 'Ctrl+typed-phrase'])(
  'rejects printable typing or unsupported command label %s',
  (label) => {
    const input = createRecordingStopped();
    expect(
      parseNativeAppInboundMessage({
        ...input,
        telemetry: { ...input.telemetry, actionEvents: [createSafeKeyEvent(label)] },
      }).ok
    ).toBe(false);
  }
);

it('retains raw wire timing and optional metadata without materializing a montage anchor', () => {
  const event: RecordingActionEvent = {
    ...createSafeKeyEvent('Enter'),
    animation: { start: 0.2, end: 0.3, duration: 0.1 },
    sourceAnchor: {
      kind: 'recording-source',
      recordingId: 'recording-1',
      sourceClipId: 'raw-source',
      sourceTime: 0.2,
    },
    timeBasis: 'project',
  };
  const input = createRecordingStopped();
  const result = parseNativeAppInboundMessage({
    ...input,
    telemetry: { ...input.telemetry, actionEvents: [event] },
  });
  expect(result).toEqual({
    ok: true,
    value: { ...input, telemetry: { ...input.telemetry, actionEvents: [event] } },
  });
});

it.each([null, { x: 0.25, y: 0.75 }])(
  'retains explicit recording-image geometry %j independently of raw client coordinates',
  (recordingPoint) => {
    const input = createRecordingStopped();
    const event = { ...createSafeKeyEvent('Enter'), point: { x: 320, y: 180 }, recordingPoint };
    expect(
      parseNativeAppInboundMessage({
        ...input,
        telemetry: { ...input.telemetry, actionEvents: [event] },
      })
    ).toEqual({
      ok: true,
      value: { ...input, telemetry: { ...input.telemetry, actionEvents: [event] } },
    });
  }
);

it.each([{ x: 1.01, y: 0.5 }, { x: -1, y: 0 }, { x: 0.5 }, { x: '0.5', y: 0.5 }])(
  'rejects malformed recording-image geometry %j at native ingress',
  (recordingPoint) => {
    const input = createRecordingStopped();
    expect(
      parseNativeAppInboundMessage({
        ...input,
        telemetry: {
          ...input.telemetry,
          actionEvents: [{ ...createSafeKeyEvent('Enter'), recordingPoint }],
        },
      })
    ).toMatchObject({ ok: false });
  }
);

function createCursorTelemetry(count: number) {
  return {
    actionEvents: [],
    signals: [],
    viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0, devicePixelRatio: 1 },
    cursorTrack: {
      captureMode: 'screen',
      skin: { color: '#fff', hidden: false, scale: 1, shadow: true },
      samples: Array.from({ length: count }, (_, index) => ({
        id: `native-cursor-${index}`,
        time: index * 10,
        x: index % 1280,
        y: index % 800,
        visible: true,
      })),
    },
  };
}

it.each([256, 257, 4096])('accepts %i valid native cursor samples', (count) => {
  const message = { ...createRecordingStopped(), telemetry: createCursorTelemetry(count) };
  expect(parseNativeAppInboundMessage(message)).toEqual({ ok: true, value: message });
});

it('rejects 4097 cursor samples', () => {
  expect(
    parseNativeAppInboundMessage({
      ...createRecordingStopped(),
      telemetry: createCursorTelemetry(4097),
    })
  ).toMatchObject({ ok: false, reason: 'malformed-message' });
});

it.each([
  { unknownField: 1 },
  { url: 'safe' },
  { id: 'https://example.invalid/' },
  { id: 'x'.repeat(121) },
  { visible: 'true' },
  { time: -1 },
  { x: NaN },
  { recordingPoint: { x: 2, y: 0 } },
  { recordingPoint: { x: 0, y: 0, extra: 1 } },
  { observationClockId: 3 },
  { captureSegment: 0.5 },
  { observation: 'unverified' },
  { interpolation: 'unverified' },
  { interpolationRange: { start: 0.8, end: 0.2 } },
  { skinOverride: { color: '#fff', hidden: false, scale: 'large', shadow: true } },
  { sourceAnchor: { kind: 'other', recordingId: 'r', sourceClipId: 's', sourceTime: 0 } },
  { timeBasis: 'wall-clock' },
])('rejects invalid fields at the final cursor sample: %j', (patch) => {
  const telemetry = createCursorTelemetry(4096);
  const samples = telemetry.cursorTrack.samples.map((sample, index) =>
    index === 4095 ? { ...sample, ...patch } : sample
  );
  expect(
    parseNativeAppInboundMessage({
      ...createRecordingStopped(),
      telemetry: { ...telemetry, cursorTrack: { ...telemetry.cursorTrack, samples } },
    })
  ).toMatchObject({ ok: false, reason: 'malformed-message' });
});

it('retains supported optional fields at the final sample', () => {
  const telemetry = createCursorTelemetry(4096);
  const samples = telemetry.cursorTrack.samples.map((sample, index) =>
    index === 4095
      ? {
          ...sample,
          recordingPoint: { x: 0.5, y: 0.5 },
          observationClockId: 'clock-1',
          captureSegment: 1,
          observation: 'observed',
          interpolation: 'LINEAR',
          interpolationRange: { start: 0.2, end: 0.8 },
          skinOverride: {
            color: '#fff',
            hidden: false,
            scale: 1,
            shadow: true,
            animationPreset: 'NONE',
            preset: 'ARROW',
          },
          sourceAnchor: {
            kind: 'recording-source',
            recordingId: 'r',
            sourceClipId: 's',
            sourceTime: 1,
          },
          timeBasis: 'project',
        }
      : sample
  );
  const message = {
    ...createRecordingStopped(),
    telemetry: { ...telemetry, cursorTrack: { ...telemetry.cursorTrack, samples } },
  };
  expect(parseNativeAppInboundMessage(message)).toEqual({ ok: true, value: message });
});

it('preserves generic privacy array, depth, node and key limits', () => {
  let deep: Record<string, unknown> = {};
  for (let index = 0; index < 9; index++) deep = { nested: deep };
  const invalid = [
    { values: Array.from({ length: 257 }, () => 1) },
    deep,
    {
      values: Array.from({ length: 256 }, () =>
        Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`v${i}`, 1]))
      ),
    },
    Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`v${i}`, 1])),
  ];
  for (const data of invalid) {
    const message = createRecordingStopped();
    expect(
      parseNativeAppInboundMessage({
        ...message,
        telemetry: {
          ...message.telemetry,
          actionEvents: [{ ...createSafeKeyEvent('Enter'), data }],
        },
      })
    ).toMatchObject({ ok: false, reason: 'malformed-message' });
    const telemetry = createCursorTelemetry(1);
    expect(
      parseNativeAppInboundMessage({
        ...message,
        telemetry: { ...telemetry, cursorTrack: { ...telemetry.cursorTrack, metadata: data } },
      })
    ).toMatchObject({ ok: false, reason: 'malformed-message' });
    expect(
      parseNativeAppInboundMessage({
        ...message,
        telemetry: {
          ...telemetry,
          cursorTrack: {
            ...telemetry.cursorTrack,
            skin: { ...telemetry.cursorTrack.skin, metadata: data },
          },
        },
      })
    ).toMatchObject({ ok: false, reason: 'malformed-message' });
  }
});

it('retains the native wire byte budget for schema-valid cursor samples', () => {
  const telemetry = createCursorTelemetry(4096);
  const samples = telemetry.cursorTrack.samples.map((sample, index) => ({
    ...sample,
    id: 'x'.repeat(75) + String(index).padStart(5, '0'),
    observationClockId: 'c'.repeat(80),
  }));
  const message = {
    ...createRecordingStopped(),
    telemetry: { ...telemetry, cursorTrack: { ...telemetry.cursorTrack, samples } },
  };
  const bytes = estimateNativeMessageJsonUtf8Bytes(message);
  expect(bytes).toBeGreaterThan(921600);
  expect(bytes).toBeLessThanOrEqual(1048576);
  expect(parseNativeAppInboundMessage(message, bytes)).toMatchObject({
    ok: false,
    reason: 'oversized-payload',
  });
});

it('keeps the generic 256-element metadata boundary valid', () => {
  const message = createRecordingStopped();
  const telemetry = {
    ...message.telemetry,
    actionEvents: [
      { ...createSafeKeyEvent('Enter'), data: { values: Array.from({ length: 256 }, () => 1) } },
    ],
  };
  expect(parseNativeAppInboundMessage({ ...message, telemetry })).toMatchObject({ ok: true });
});
