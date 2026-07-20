import { expect, it } from 'vitest';

import { parseNativeAppInboundMessage } from './index';

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
    durationMs: 1000,
    filename: 'recording.mp4',
    fps: 30,
    height: 720,
    mimeType: 'video/mp4',
    openEditor: false,
    protocolVersion: 1,
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

function createSafeKeyEvent(label: string) {
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
