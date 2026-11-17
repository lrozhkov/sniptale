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
import { useReviewPlayback } from './use-playback';
import { createReviewPlaybackPresentationClock } from './playback-presentation-clock.test-support';

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
let renders = 0;
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
  renders++;
  value = useReviewRecordingHistory(input, time, selection, options);
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  io.create.mockReset();
  renders = 0;
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

it('distinguishes initial loading from a later bounded history refresh', async () => {
  const owner = reader();
  const initial = Promise.withResolvers<Prepared>();
  const refresh = Promise.withResolvers<Prepared>();
  owner.read.mockReturnValueOnce(initial.promise).mockReturnValueOnce(refresh.promise);
  io.create.mockReturnValue(owner);
  await act(async () => root.render(<Probe />));
  expect(value.initialLoading).toBe(true);
  await act(async () => initial.resolve(prepared(0)));
  expect(value.initialLoading).toBe(false);
  await act(async () => root.render(<Probe time={2} />));
  expect(value.pending).toBe(true);
  expect(value.initialLoading).toBe(false);
  await act(async () => refresh.resolve(prepared(2)));
  expect(value.pending).toBe(false);
  expect(value.initialLoading).toBe(false);
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
  expect(next.read).toHaveBeenCalledWith(12, { start: 9, end: 15 });
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
  expect(owner.read).toHaveBeenCalledWith(10, { start: 0, end: 20 });
  await act(async () => root.render(<Probe time={10.5} options={{ reach: 5 }} />));
  expect(owner.read).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<Probe time={11.1} options={{ reach: 5 }} />));
  expect(owner.read).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<Probe time={19} options={{ reach: 5 }} />));
  expect(owner.read).toHaveBeenCalledTimes(1);
});

it('prefetches from the live clock without rerendering covered playback samples', async () => {
  const owner = reader();
  owner.covers = () => true;
  io.create.mockReturnValue(owner);
  const clock = createReviewPlaybackPresentationClock(() => true);
  await act(async () => root.render(<Probe time={12} options={{ clock }} />));
  expect(owner.read).toHaveBeenCalledWith(0, { start: 0, end: 3 });
  const before = renders;
  for (const time of [0.2, 0.4, 0.8]) await act(async () => clock.publish(time));
  expect(renders).toBe(before);
  expect(owner.read).toHaveBeenCalledTimes(1);
  const refresh = Promise.withResolvers<Prepared>();
  owner.read.mockReturnValueOnce(refresh.promise);
  await act(async () => clock.publish(1.1));
  expect(owner.read).toHaveBeenLastCalledWith(1.1, { start: 0, end: 4.1 });
  expect(value.pending).toBe(false);
  expect(renders).toBe(before);
  await act(async () => clock.publish(6));
  expect(value.pending).toBe(true);
  expect(renders).toBe(before + 1);
  await act(async () => refresh.resolve(prepared(1.1)));
  expect(owner.read).toHaveBeenLastCalledWith(6, { start: 3, end: 9 });
  expect(value.pending).toBe(false);
  const ready = renders;
  for (const time of [6.1, 6.2, 6.3]) await act(async () => clock.publish(time));
  expect(renders).toBe(ready);
});

it('retains clock failure recovery and unsubscribes when the history owner is removed', async () => {
  const owner = reader();
  owner.covers = () => true;
  io.create.mockReturnValue(owner);
  const clock = createReviewPlaybackPresentationClock(() => true);
  await act(async () => root.render(<Probe options={{ clock }} />));
  owner.read.mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => clock.publish(6));
  expect(value.failed).toBe(true);
  const failedReads = owner.read.mock.calls.length;
  await act(async () => clock.publish(10));
  expect(owner.read).toHaveBeenCalledTimes(failedReads);
  await act(async () => value.retry());
  expect(owner.read).toHaveBeenLastCalledWith(10, { start: 7, end: 13 });
  expect(value.failed).toBe(false);
  await act(async () =>
    root.render(<Probe input={{ source, telemetry: base }} options={{ clock }} />)
  );
  const stoppedReads = owner.read.mock.calls.length;
  await act(async () => clock.publish(15));
  expect(owner.read).toHaveBeenCalledTimes(stoppedReads);
  expect(owner.dispose).toHaveBeenCalledOnce();
});

it('keeps explicit viewport history independent of the live playback clock', async () => {
  const owner = reader();
  io.create.mockReturnValue(owner);
  const clock = createReviewPlaybackPresentationClock(() => true);
  await act(async () =>
    root.render(<Probe time={10} options={{ clock, range: { start: 5, end: 15 } }} />)
  );
  const before = renders;
  await act(async () => clock.publish(18));
  expect(owner.read).toHaveBeenCalledExactlyOnceWith(10, { start: 5, end: 15 });
  expect(renders).toBe(before);
  expect(value.pending).toBe(false);
});

it('keeps strict archived history readable through rounded media EOF, End and seek-back without Retry', async () => {
  const duration = 26.283316666666664;
  const browserTime = 26.283317;
  const input = {
    ...resource,
    source: { ...source, duration },
    historyProject: { ...project, duration },
  };
  const owner = reader();
  owner.read.mockImplementation(async (time) => {
    if (!Number.isFinite(time) || time < 0 || time > duration)
      throw new Error('Review recording history range is invalid.');
    const window = structuredClone(input.historyProject);
    coverage.set(window, time);
    return { project: window, telemetry: base };
  });
  io.create.mockReturnValue(owner);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return Promise.resolve();
  });
  let playback!: ReturnType<typeof useReviewPlayback>;
  function PlaybackHistory() {
    playback = useReviewPlayback({
      duration,
      edits: [],
      boundaries: () => undefined,
      onSeek() {},
      onFailure() {},
      original: { muted: false, volume: 1 },
    });
    value = useReviewRecordingHistory(input, playback.time, { kind: 'none' });
    return <video ref={playback.video} />;
  }
  try {
    await act(async () => root.render(<PlaybackHistory />));
    await act(async () => playback.play());
    playback.video.current!.currentTime = browserTime;
    await act(async () => playback.onTime());
    expect(value.failed).toBe(false);
    expect(playback.time).toBe(duration);
    await act(async () => playback.onEnded());
    expect(value.failed).toBe(false);
    await act(async () => playback.seek(duration, false));
    expect(value.failed).toBe(false);
    await act(async () => playback.seek(duration - 2, false));
    expect(playback.time).toBe(duration - 2);
    expect(value.failed).toBe(false);
    expect(owner.read.mock.calls.map(([time]) => time)).toEqual([0, duration, duration - 2]);
    expect(io.create).toHaveBeenCalledOnce();
  } finally {
    pause.mockRestore();
    play.mockRestore();
  }
});

it('replaces the bounded reader when authored timing changes and ignores the old pending result', async () => {
  const old = reader(),
    next = reader();
  const pending = Promise.withResolvers<Prepared>();
  old.read.mockReturnValueOnce(pending.promise);
  io.create.mockReturnValueOnce(old).mockReturnValueOnce(next);
  await act(async () => root.render(<Probe time={10} />));
  const interactionTimeline = {
    presses: [],
    overrides: [
      {
        ref: { kind: 'action' as const, id: 'key' },
        start: 10,
        end: 11,
        enabled: true,
        sourceRange: { start: 1, end: 2 },
      },
    ],
  };
  await act(async () => root.render(<Probe time={10} options={{ interactionTimeline }} />));
  expect(old.dispose).toHaveBeenCalledOnce();
  expect(io.create.mock.calls[1]?.[3]).toMatchObject({ interactionTimeline });
  const accepted = value.telemetry;
  await act(async () =>
    pending.resolve(
      prepared(0, [{ ref: { kind: 'action', id: 'stale' }, eventType: 'KEY', start: 0, end: 1 }])
    )
  );
  expect(value.telemetry).toBe(accepted);
  expect(projectReviewTelemetry(value.telemetry!, 20).markers).toEqual([]);
});
