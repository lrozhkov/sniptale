import { expect, it, vi } from 'vitest';
import { createReviewRecordingRenderSource } from './recording-render';
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/project/action-feedback/validation';
import { attachReviewRecordingWindow } from '../../features/video/review/telemetry';
import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
const source = { width: 160, height: 90, duration: 1000, mimeType: 'video/mp4', size: 100 };
const project = createVideoProjectFromRecording({
  ...source,
  recordingId: 'recording',
  filename: 'source.mp4',
});
const telemetry: RecordingTelemetryEntry = {
  recordingId: 'recording',
  createdAt: 1,
  updatedAt: 1,
  captureMode: null,
  viewport: null,
  cursorTrack: null,
  signals: [],
  actionEvents: [],
};
function setup() {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.clickAnimations = [
    {
      ...REVIEW_CLICK_DEFAULT,
      id: 'click',
      effect: 'ripple',
      before: 0,
      after: 5,
      offset: 2,
      x: 0.5,
      y: 0.5,
    },
  ];
  const reader = {
    read: vi.fn(
      async (_time: number, _range?: { start: number; end: number }, _signal?: AbortSignal) => ({
        project,
        telemetry: attachReviewRecordingWindow(telemetry, {
          markers: [
            {
              ref: { kind: 'action' as const, id: 'click' },
              eventType: 'CLICK',
              start: 500,
              end: 500,
              focusPoint: { x: 0.5, y: 0.5 },
            },
          ],
        }),
      })
    ),
    covers: () => true,
    dispose: vi.fn(),
  };
  const createReader = vi.fn(() => reader);
  const owner = createReviewRecordingRenderSource(
    {
      project,
      source,
      telemetry,
      advanced,
      edits: [
        {
          id: 'speed',
          kind: 'speed',
          start: 0,
          end: 1000,
          requestedStart: 0,
          requestedEnd: 1000,
          rate: 4,
          audio: 'speed',
        },
      ],
    },
    { createReader }
  );
  return { owner, reader };
}
it('reads authored animation reach on the source clock and schedules it on the result clock', async () => {
  const { owner, reader } = setup();
  const result = await owner.read(500, 125, { width: 160, height: 90, frameDuration: 1 / 30 });
  expect(reader.read).toHaveBeenCalledWith(500, { start: 472, end: 528 }, undefined);
  expect(result.clickCues).toHaveLength(1);
  expect(result.clickCues[0]).toMatchObject({ anchor: 127, start: 127, end: 132 });
  expect(project.actionEvents).toEqual([]);
  owner.dispose();
  expect(reader.dispose).toHaveBeenCalledOnce();
});
it('retains two endpoint windows and refuses a read after cancellation', async () => {
  const { owner, reader } = setup();
  for (const time of [100, 500, 100])
    await owner.read(time, time / 4, { width: 160, height: 90, frameDuration: 1 / 30 });
  expect(reader.read).toHaveBeenCalledTimes(2);
  await owner.read(800, 200, { width: 160, height: 90, frameDuration: 1 / 30 });
  await owner.read(100, 25, { width: 160, height: 90, frameDuration: 1 / 30 });
  expect(reader.read).toHaveBeenCalledTimes(4);
  const signal = AbortSignal.abort();
  await expect(
    owner.read(500, 125, { width: 160, height: 90, frameDuration: 1 / 30 }, signal)
  ).rejects.toThrow();
  owner.dispose();
});
it('propagates a source read failure and releases the history owner', async () => {
  const { owner, reader } = setup();
  reader.read.mockRejectedValueOnce(new Error('source-unavailable'));
  await expect(
    owner.read(500, 125, { width: 160, height: 90, frameDuration: 1 / 30 })
  ).rejects.toThrow('source-unavailable');
  owner.dispose();
  expect(reader.dispose).toHaveBeenCalledOnce();
});
