// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import {
  attachReviewRecordingWindow,
  projectReviewTelemetry,
  type ReviewTelemetryMarker,
} from '../../features/video/review/telemetry';
import type { ReviewSelection } from '../../features/video/review/types';
import type { VideoProject } from '../../features/video/project/types';
import { useReviewRecordingHistory } from './use-recording-history';

const io = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../workflows/video-review/recording-review', () => ({
  createReviewRecordingHistorySource: io.create,
}));
const source = { duration: 20, width: 160, height: 90, mimeType: 'video/mp4', size: 10 };
const base: RecordingTelemetryEntry = {
  recordingId: 'recording',
  createdAt: 1,
  updatedAt: 1,
  captureMode: null,
  viewport: null,
  cursorTrack: null,
  actionEvents: [],
  signals: [],
};
const project = createVideoProjectFromRecording({
  ...source,
  recordingId: 'recording',
  filename: 'source.mp4',
});
const resource = { source, telemetry: base, historyProject: project };
type Prepared = { project: VideoProject; telemetry: RecordingTelemetryEntry };
const coverage = new WeakMap<VideoProject, number>();
function prepared(time: number, markers: ReviewTelemetryMarker[] = []): Prepared {
  const window = structuredClone(project);
  coverage.set(window, time);
  return { project: window, telemetry: attachReviewRecordingWindow({ ...base }, { markers }) };
}
function reader() {
  return {
    read: vi.fn(async (time: number, _range?: { start: number; end: number }) => prepared(time)),
    covers: (project: VideoProject, time: number) => coverage.get(project) === time,
    dispose: vi.fn(),
  };
}
let root: Root;
let host: HTMLDivElement;
let value: ReturnType<typeof useReviewRecordingHistory>;
function Probe({
  time = 0,
  input = resource,
  selection = { kind: 'none' },
  options,
}: {
  time?: number;
  input?: Parameters<typeof useReviewRecordingHistory>[0];
  selection?: ReviewSelection;
  options?: Parameters<typeof useReviewRecordingHistory>[3];
}) {
  value = useReviewRecordingHistory(input, time, selection, options);
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  io.create.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('coalesces changing playheads and clears stale facts while the latest window loads', async () => {
  const owner = reader();
  io.create.mockReturnValue(owner);
  const first = Promise.withResolvers<Prepared>();
  const latest = Promise.withResolvers<Prepared>();
  owner.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(latest.promise);
  await act(async () => root.render(<Probe />));
  await act(async () => root.render(<Probe time={8} />));
  await act(async () => root.render(<Probe time={12} />));
  expect(owner.read).toHaveBeenCalledTimes(1);
  expect(value.pending).toBe(true);
  await act(async () => first.resolve(prepared(0)));
  expect(owner.read.mock.calls.map((call) => call[0])).toEqual([0, 12]);
  expect(value.pending).toBe(true);
  await act(async () => latest.resolve(prepared(12)));
  expect(value.pending).toBe(false);
  expect(value.failed).toBe(false);
});
it('retains one selected source marker outside the read window', async () => {
  const marker: ReviewTelemetryMarker = {
    ref: { kind: 'action', id: 'click' },
    eventType: 'CLICK',
    start: 0,
    end: 0,
  };
  const owner = reader();
  owner.read.mockImplementation(async (time) => prepared(time, time === 0 ? [marker] : []));
  io.create.mockReturnValue(owner);
  await act(async () => root.render(<Probe />));
  await act(async () =>
    root.render(<Probe time={12} selection={{ kind: 'telemetry', ref: marker.ref }} />)
  );
  expect(projectReviewTelemetry(value.telemetry!, 20).markers).toEqual([marker]);
  await act(async () => root.render(<Probe time={12} />));
  expect(projectReviewTelemetry(value.telemetry!, 20).markers).toEqual([]);
});
it('preserves the source after a failed read and retries only on request', async () => {
  const owner = reader();
  owner.read.mockRejectedValueOnce(new Error('unavailable'));
  io.create.mockReturnValue(owner);
  await act(async () => root.render(<Probe />));
  expect(value.failed).toBe(true);
  await act(async () => root.render(<Probe time={12} />));
  expect(owner.read).toHaveBeenCalledTimes(1);
  await act(async () => value.retry());
  expect(owner.read).toHaveBeenCalledTimes(2);
  expect(value.failed).toBe(false);
});
it('disposes switched resources and ignores their delayed result', async () => {
  const old = reader();
  const next = reader();
  io.create.mockReturnValueOnce(old).mockReturnValueOnce(next);
  const pending = Promise.withResolvers<Prepared>();
  old.read.mockReturnValueOnce(pending.promise);
  await act(async () => root.render(<Probe />));
  const changed = { ...resource, historyProject: structuredClone(project) };
  await act(async () => root.render(<Probe time={12} input={changed} />));
  expect(old.dispose).toHaveBeenCalledOnce();
  await act(async () => pending.resolve(prepared(0)));
  expect(value.failed).toBe(false);
  expect(value.pending).toBe(false);
  expect(next.read).toHaveBeenCalledWith(12);
});
it('supports StrictMode cleanup and keeps legacy sources on their original telemetry', async () => {
  io.create.mockImplementation(reader);
  await act(async () =>
    root.render(
      <StrictMode>
        <Probe />
      </StrictMode>
    )
  );
  expect(value.pending).toBe(false);
  expect(value.failed).toBe(false);
  await act(async () => root.render(<Probe input={{ source, telemetry: base }} />));
  expect(value.telemetry).toBe(base);
  expect(value.pending).toBe(false);
});

it('reloads an expanded visible range even when its center is unchanged and keeps smaller ranges cached', async () => {
  const owner = reader();
  io.create.mockReturnValue(owner);
  await act(async () =>
    root.render(
      <Probe time={10} options={{ includeCursor: false, range: { start: 5, end: 15 } }} />
    )
  );
  expect(io.create).toHaveBeenCalledWith(project, base, undefined, { includeCursor: false });
  expect(owner.read).toHaveBeenCalledWith(10, { start: 5, end: 15 });
  await act(async () =>
    root.render(
      <Probe time={10} options={{ includeCursor: false, range: { start: 0, end: 20 } }} />
    )
  );
  expect(owner.read).toHaveBeenCalledTimes(2);
  await act(async () =>
    root.render(
      <Probe time={10} options={{ includeCursor: false, range: { start: 2, end: 18 } }} />
    )
  );
  expect(owner.read).toHaveBeenCalledTimes(2);
});
it('coalesces viewport expansion while the previous range is still reading', async () => {
  const owner = reader();
  io.create.mockReturnValue(owner);
  const first = Promise.withResolvers<Prepared>();
  owner.read.mockReturnValueOnce(first.promise);
  await act(async () =>
    root.render(
      <Probe time={10} options={{ includeCursor: false, range: { start: 5, end: 15 } }} />
    )
  );
  await act(async () =>
    root.render(
      <Probe time={10} options={{ includeCursor: false, range: { start: 0, end: 20 } }} />
    )
  );
  expect(owner.read).toHaveBeenCalledTimes(1);
  await act(async () => first.resolve(prepared(10)));
  expect(owner.read).toHaveBeenCalledTimes(2);
  expect(owner.read).toHaveBeenLastCalledWith(10, { start: 0, end: 20 });
});
it('bounds reuse of an expanded animation window while the playhead advances', async () => {
  const owner = reader();
  owner.covers = () => true;
  io.create.mockReturnValue(owner);
  await act(async () => root.render(<Probe time={10} options={{ reach: 5 }} />));
  expect(owner.read).toHaveBeenCalledWith(10, { start: 5, end: 15 });
  await act(async () => root.render(<Probe time={10.5} options={{ reach: 5 }} />));
  expect(owner.read).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<Probe time={11.1} options={{ reach: 5 }} />));
  expect(owner.read).toHaveBeenCalledTimes(2);
});
