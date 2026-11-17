import { describe, expect, it, vi } from 'vitest';
import {
  createReviewTransportController,
  type ReviewTransportConfiguration,
  type ReviewTransportDependencies,
  type ReviewTransportMediaObservation,
} from './transport';
import type { ReviewEdit } from '../../features/video/review/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function whenPlaying(controller: ReturnType<typeof createReviewTransportController>) {
  if (controller.getStatusSnapshot().playing) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const unsubscribe = controller.subscribeStatus(() => {
      const status = controller.getStatusSnapshot();
      if (status.playing || status.mode === 'failed') {
        unsubscribe();
        if (status.playing) resolve();
        else reject(new Error(`Transport failed: ${status.failure?.kind}`));
      }
    });
  });
}

function hold(id = 'hold', start = 4, duration = 2): ReviewEdit {
  return {
    id,
    kind: 'freeze',
    start,
    end: start,
    requestedStart: start,
    requestedEnd: start,
    duration,
    frameTime: Math.max(0, start - 0.02),
    frameDuration: 0.04,
  };
}
function fixture(patch: Partial<ReviewTransportConfiguration> = {}) {
  let now = 0;
  let audioTime: number | null = null;
  const clockIdentity = {};
  const media: ReviewTransportMediaObservation = {
    sourceId: 'source',
    time: 0,
    paused: true,
    ended: false,
    seeking: false,
    readyState: 4,
    errorCode: null,
  };
  const timers = new Map<number, { at: number; callback(): void }>();
  let sequence = 0;
  const dependencies: ReviewTransportDependencies = {
    now: vi.fn(() => now),
    schedule: vi.fn((delayMs, callback) => {
      const id = ++sequence;
      timers.set(id, { at: now + delayMs, callback });
      return () => {
        timers.delete(id);
      };
    }),
    media: {
      read: vi.fn(() => ({ ...media })),
      seek: vi.fn((time) => {
        media.time = time;
        media.ended = false;
      }),
      pause: vi.fn(() => {
        media.paused = true;
      }),
      play: vi.fn(async () => {
        media.paused = false;
        media.ended = false;
      }),
      configure: vi.fn(),
      recoveryMode: vi.fn(),
      reload: vi.fn(),
    },
    audio: {
      readClock: vi.fn(() =>
        audioTime === null
          ? null
          : { identity: clockIdentity, graphTime: audioTime, outputTime: audioTime }
      ),
      prepare: vi.fn(async () => true),
      start: vi.fn(),
      stop: vi.fn(),
    },
    onSeek: vi.fn(),
    onFailure: vi.fn(),
    onRecovered: vi.fn(),
    onInvalidRange: vi.fn(),
  };
  let configuration: ReviewTransportConfiguration = {
    sourceId: 'source',
    duration: 12,
    edits: [],
    original: { muted: false, volume: 1 },
    ...patch,
  };
  const controller = createReviewTransportController(configuration, dependencies);
  return {
    controller,
    dependencies,
    media,
    timers,
    audioTime(time: number | null) {
      audioTime = time;
    },
    advance(time: number) {
      now = time;
      for (const [id, timer] of [...timers])
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
    },
    configure(next: Partial<ReviewTransportConfiguration>) {
      configuration = { ...configuration, ...next };
      controller.configure(configuration);
    },
  };
}

describe('Gallery transport position and status', () => {
  it('reads source/result/map from one native observation and one monotonic sample', () => {
    const f = fixture({
      edits: [
        {
          id: 'fast',
          kind: 'speed',
          start: 2,
          end: 6,
          requestedStart: 2,
          requestedEnd: 6,
          rate: 2,
          audio: 'speed',
        },
      ],
    });
    f.controller.seekSource(4, false);
    vi.mocked(f.dependencies.media.read).mockClear();
    vi.mocked(f.dependencies.now).mockClear();
    expect(f.controller.readPosition()).toMatchObject({
      epoch: 1,
      mapRevision: 0,
      resultTime: 3,
      source: { kind: 'video', sourceTime: 4, mediaTime: 4 },
    });
    expect(f.dependencies.media.read).toHaveBeenCalledOnce();
    expect(f.dependencies.now).toHaveBeenCalledOnce();
  });

  it('keeps a cached discrete snapshot while ticks publish runtime positions', async () => {
    const f = fixture();
    const statuses = vi.fn(),
      positions = vi.fn();
    const stopStatus = f.controller.subscribeStatus(statuses);
    const stopPosition = f.controller.subscribePosition(positions);
    await f.controller.play();
    const status = f.controller.getStatusSnapshot();
    statuses.mockClear();
    for (const time of [1, 2, 3]) {
      f.media.time = time;
      f.controller.tick();
    }
    expect(statuses).not.toHaveBeenCalled();
    expect(f.controller.getStatusSnapshot()).toBe(status);
    expect(positions).toHaveBeenCalledTimes(3);
    f.controller.pause();
    expect(f.controller.getStatusSnapshot().position.source?.sourceTime).toBe(3);
    const paused = f.controller.getStatusSnapshot();
    f.controller.pause();
    expect(f.controller.getStatusSnapshot()).toBe(paused);
    stopStatus();
    stopPosition();
    statuses.mockClear();
    positions.mockClear();
    f.controller.seekSource(5, false);
    expect(statuses).not.toHaveBeenCalled();
    expect(positions).not.toHaveBeenCalled();
  });

  it('separates frame receipts and rejects old epochs/maps without moving logical time', () => {
    const f = fixture();
    f.controller.seekSource(5, false);
    const position = f.controller.readPosition();
    expect(
      f.controller.acceptsPresentation({
        epoch: position.epoch,
        mapRevision: position.mapRevision,
        resultTime: 2,
      })
    ).toBe(true);
    expect(f.controller.readPosition().resultTime).toBe(5);
    f.controller.seekSource(7, false);
    expect(
      f.controller.acceptsPresentation({
        epoch: position.epoch,
        mapRevision: position.mapRevision,
        resultTime: 2,
      })
    ).toBe(false);
    const afterSeek = f.controller.readPosition();
    f.configure({ edits: [hold()] });
    expect(
      f.controller.acceptsPresentation({
        epoch: afterSeek.epoch,
        mapRevision: afterSeek.mapRevision,
        resultTime: 2,
      })
    ).toBe(false);
    expect(
      f.controller.acceptsPresentation({ ...f.controller.readPosition(), resultTime: NaN })
    ).toBe(false);
  });

  it('changes temporal revision from accepted map content rather than document publication identity', () => {
    const f = fixture({ edits: [hold()] });
    const initial = f.controller.readPosition();
    f.configure({ edits: [hold()], original: { muted: false, volume: 2 } });
    expect(f.controller.readPosition().mapRevision).toBe(initial.mapRevision);
    f.configure({ edits: [hold('hold', 4, 3)] });
    expect(f.controller.readPosition().mapRevision).toBe(initial.mapRevision + 1);
    expect(f.controller.readPosition().epoch).toBe(initial.epoch);
    f.configure({ sourceId: 'replacement' });
    expect(f.controller.readPosition().epoch).toBe(initial.epoch + 1);
    expect(f.controller.readPosition().media).toBeNull();
  });

  it('does not publish an equal configuration or turn a repeated same-position seek into a new epoch', async () => {
    const f = fixture();
    f.controller.seekSource(2, false);
    const position = f.controller.readPosition();
    f.controller.seekSource(2, false);
    expect(f.controller.readPosition().epoch).toBe(position.epoch);
    await f.controller.play();
    const status = f.controller.getStatusSnapshot();
    const listener = vi.fn();
    f.controller.subscribeStatus(listener);
    f.media.time = 2.5;
    f.configure({ edits: [] });
    expect(f.controller.getStatusSnapshot()).toBe(status);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('Gallery active audio reference', () => {
  it('uses the prepared audio clock across inserted video without stopping or preparing music again', async () => {
    const f = fixture({ edits: [hold()] });
    f.controller.seekSource(3.9, false);
    f.audioTime(100);
    await f.controller.play();
    const epoch = f.controller.readPosition().epoch;
    f.media.time = 3.95;
    f.advance(200);
    f.audioTime(100.2);
    f.controller.tick();
    expect(f.controller.readPosition()).toMatchObject({
      resultTime: expect.closeTo(4.1, 8),
      source: { kind: 'freeze', sourceTime: 4, mediaTime: 3.98 },
    });
    expect(f.media.paused).toBe(true);
    f.advance(2200);
    f.audioTime(102.2);
    f.controller.tick();
    await Promise.resolve();
    expect(f.controller.readPosition()).toMatchObject({
      resultTime: expect.closeTo(6.1, 8),
      source: { kind: 'video', sourceTime: expect.closeTo(4.1, 8) },
    });
    expect(f.dependencies.audio.prepare).toHaveBeenCalledOnce();
    expect(f.controller.readPosition().epoch).toBe(epoch);
  });

  it('switches audio availability without a position jump or an extra playback timer', async () => {
    const f = fixture();
    f.controller.seekSource(2, false);
    f.audioTime(10);
    await f.controller.play();
    f.media.time = 3;
    f.advance(1000);
    f.audioTime(11);
    f.controller.tick();
    f.advance(1500);
    f.audioTime(null);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(3.5, 8);
    f.controller.tick();
    f.advance(2000);
    f.audioTime(200);
    const before = f.controller.readPosition();
    f.controller.tick();
    expect(f.controller.readPosition().resultTime).toBeCloseTo(before.resultTime!, 8);
    expect(f.dependencies.audio.start).toHaveBeenCalledTimes(2);
    f.advance(2250);
    f.audioTime(200.25);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(4.25, 8);
    expect(f.dependencies.schedule).not.toHaveBeenCalled();
  });

  it.each([
    { audioElapsed: 1, starts: 2 },
    { audioElapsed: 2, starts: 1 },
  ])(
    'distinguishes a hidden context interruption from an ordinary long UI task ($audioElapsed audio seconds)',
    async ({ audioElapsed, starts }) => {
      const f = fixture();
      f.controller.seekSource(2, false);
      f.audioTime(10);
      await f.controller.play();
      f.advance(2000);
      f.audioTime(10 + audioElapsed);
      expect(f.controller.readPosition().resultTime).toBeCloseTo(4, 8);
      f.controller.tick();
      expect(f.dependencies.audio.start).toHaveBeenCalledTimes(starts);
      expect(f.dependencies.audio.prepare).toHaveBeenCalledOnce();
      f.advance(2100);
      f.audioTime(10 + audioElapsed + 0.1);
      expect(f.controller.readPosition().resultTime).toBeCloseTo(4.1, 8);
      expect(f.dependencies.schedule).not.toHaveBeenCalled();
    }
  );

  it('corrects material native drift without restarting audio or seeking every frame', async () => {
    const f = fixture();
    f.controller.seekSource(3, false);
    f.audioTime(100);
    await f.controller.play();
    vi.mocked(f.dependencies.media.seek).mockClear();
    vi.mocked(f.dependencies.audio.stop).mockClear();
    f.advance(600);
    f.audioTime(100.6);
    f.controller.tick();
    expect(f.media.time).toBeCloseTo(3.6, 8);
    expect(f.dependencies.media.seek).toHaveBeenCalledOnce();
    f.media.time = 3.61;
    f.advance(620);
    f.audioTime(100.62);
    f.controller.tick();
    expect(f.dependencies.media.seek).toHaveBeenCalledOnce();
    expect(f.dependencies.audio.stop).not.toHaveBeenCalled();
    expect(f.dependencies.audio.prepare).toHaveBeenCalledOnce();
  });

  it('freezes a command activation snapshot even if the audio and native clocks advance before Pause', async () => {
    const f = fixture();
    f.controller.seekSource(2, false);
    f.audioTime(100);
    await f.controller.play();
    f.advance(100);
    f.audioTime(100.1);
    const position = f.controller.readPosition();
    f.advance(200);
    f.audioTime(100.2);
    f.media.time = 2.02;
    vi.mocked(f.dependencies.audio.readClock!).mockClear();
    expect(f.controller.pauseAt(position)).toBe(true);
    expect(f.dependencies.audio.readClock).not.toHaveBeenCalled();
    expect(f.controller.readPosition().resultTime).toBeCloseTo(2.1, 8);
    expect(f.media.time).toBeCloseTo(2.1, 8);
  });

  it('reanchors an audio-driven loop to the accepted range start exactly once', async () => {
    const f = fixture();
    f.controller.setRange({ start: 2, end: 3 });
    f.audioTime(100);
    await f.controller.play();
    const initial = f.controller.readPosition();
    const navigation = f.controller.getStatusSnapshot().navigationRevision;
    f.advance(1200);
    f.audioTime(101.2);
    f.controller.tick();
    await whenPlaying(f.controller);
    expect(f.controller.readPosition().resultTime).toBe(2);
    expect(f.controller.readPosition().epoch).toBe(initial.epoch + 1);
    expect(f.controller.getStatusSnapshot().navigationRevision).toBe(navigation);
    f.advance(1300);
    f.audioTime(101.3);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(2.1, 8);
  });

  it('pauses an audio target after a crossed hold without replaying that hold on resume', async () => {
    const f = fixture({ edits: [hold()] });
    f.controller.seekSource(3.9, false);
    f.audioTime(100);
    await f.controller.play();
    f.advance(2300);
    f.audioTime(102.3);
    const position = f.controller.readPosition();
    expect(position.resultTime).toBeCloseTo(6.2, 8);
    f.controller.pauseAt(position);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(6.2, 8);
    await f.controller.play();
    f.advance(2400);
    f.audioTime(102.4);
    f.controller.tick();
    expect(f.controller.readPosition()).toMatchObject({
      resultTime: expect.closeTo(6.3, 8),
      source: { kind: 'video' },
    });
  });
});

describe('Gallery source playback and ranges', () => {
  it('reuses cut rounding, speed, mute and authored gain without a timer-driven clock', async () => {
    const end = 2.123456789;
    const f = fixture({
      edits: [
        { id: 'cut', kind: 'cut', start: 1, end, requestedStart: 1, requestedEnd: end },
        {
          id: 'speed',
          kind: 'speed',
          start: end,
          end: 4,
          requestedStart: end,
          requestedEnd: 4,
          rate: 2,
          audio: 'mute',
        },
      ],
      original: { muted: false, volume: 0.5 },
    });
    await f.controller.play();
    f.media.time = 1.5;
    f.controller.tick();
    expect(f.media.time).toBeGreaterThanOrEqual(end);
    expect(f.media.time - end).toBeLessThan(0.0000011);
    expect(f.dependencies.media.configure).toHaveBeenLastCalledWith({
      rate: 2,
      muted: true,
      volume: 0,
    });
    f.media.time = 4;
    f.controller.tick();
    expect(f.dependencies.media.configure).toHaveBeenLastCalledWith({
      rate: 1,
      muted: false,
      volume: 0.5,
    });
    expect(f.dependencies.schedule).not.toHaveBeenCalled();
  });

  it('retains raw recording observations in removed source time without a fake visible frame', async () => {
    const f = fixture({
      silent: true,
      retainCutTime: true,
      edits: [{ id: 'cut', kind: 'cut', start: 2, end: 5, requestedStart: 2, requestedEnd: 5 }],
    });
    f.controller.setRange({ start: 0, end: 1 });
    await f.controller.play();
    f.media.time = 3;
    f.controller.tick();
    expect(f.controller.readPosition()).toMatchObject({
      resultTime: null,
      source: null,
      media: { sourceId: 'source', time: 3 },
    });
    expect(f.media.time).toBe(3);
    expect(f.dependencies.media.configure).toHaveBeenLastCalledWith({
      rate: 1,
      muted: true,
      volume: 0,
    });
    expect(f.dependencies.audio.prepare).not.toHaveBeenCalled();
  });

  it('pauses and freezes the exact final source position before native pause confirmation', async () => {
    const f = fixture();
    await f.controller.play();
    f.media.time = 3.125;
    f.controller.pause();
    const status = f.controller.getStatusSnapshot();
    expect(status).toMatchObject({
      mode: 'paused',
      playing: false,
      position: { resultTime: 3.125 },
    });
    f.controller.observeMedia('pause');
    expect(f.controller.getStatusSnapshot()).toBe(status);
    expect(f.controller.readPosition().epoch).toBe(0);
  });

  it('treats native playback as observations rather than a second playing setter', async () => {
    const f = fixture();
    f.media.paused = false;
    f.controller.observeMedia('play');
    expect(f.media.paused).toBe(true);
    expect(f.controller.getStatusSnapshot().playing).toBe(false);
    await f.controller.play();
    f.media.time = 2.5;
    f.media.paused = true;
    f.controller.observeMedia('pause');
    expect(f.controller.getStatusSnapshot()).toMatchObject({
      mode: 'paused',
      position: { resultTime: 2.5 },
    });
  });

  it('restarts a range once and holds its target until audio preparation succeeds', async () => {
    const f = fixture();
    f.controller.setRange({ start: 3.865, end: 6.105 });
    await f.controller.play();
    const gate = deferred<boolean>();
    vi.mocked(f.dependencies.audio.prepare).mockReturnValueOnce(gate.promise);
    f.media.time = 6.2;
    f.controller.tick();
    const position = f.controller.readPosition();
    expect(position.source?.sourceTime).toBeCloseTo(3.865, 6);
    expect(f.controller.getStatusSnapshot().mode).toBe('preparing');
    expect(f.media.paused).toBe(true);
    f.controller.tick();
    f.controller.tick();
    expect(f.controller.readPosition().epoch).toBe(position.epoch);
    gate.resolve(true);
    await whenPlaying(f.controller);
    expect(f.controller.getStatusSnapshot().playing).toBe(true);
    expect(f.controller.getStatusSnapshot().range).toEqual({ start: 3.865, end: 6.105 });
    f.controller.seekSource(4, false);
    expect(f.controller.getStatusSnapshot().range).not.toBeNull();
    f.controller.seekSource(8, false);
    expect(f.controller.getStatusSnapshot().range).toBeNull();
  });

  it('refuses removed-only ranges and never starts an all-cut result', async () => {
    const f = fixture({
      edits: [{ id: 'cut', kind: 'cut', start: 0, end: 12, requestedStart: 0, requestedEnd: 12 }],
    });
    f.controller.setRange({ start: 3, end: 4 });
    expect(f.dependencies.onInvalidRange).toHaveBeenCalledOnce();
    expect(f.controller.getStatusSnapshot().range).toBeNull();
    await f.controller.play();
    expect(f.dependencies.media.play).not.toHaveBeenCalled();
    expect(f.controller.getStatusSnapshot().mode).toBe('ended');
  });

  it('clamps rounded EOF in the position contract without correcting the physical browser timestamp', async () => {
    const duration = 26.283316666666664;
    const f = fixture({ duration });
    await f.controller.play();
    vi.mocked(f.dependencies.media.seek).mockClear();
    f.media.time = 26.283317;
    f.media.ended = true;
    f.controller.observeMedia('ended');
    expect(f.controller.readPosition()).toMatchObject({
      resultTime: duration,
      source: { sourceTime: duration },
    });
    expect(f.dependencies.media.seek).not.toHaveBeenCalled();
    expect(f.controller.getStatusSnapshot().mode).toBe('ended');
  });
});

describe('Gallery inserted video segments', () => {
  it('pauses a crossed insertion before its frame callback without skipping or replaying it', async () => {
    const f = fixture({ edits: [hold()] });
    f.controller.seekSource(3.9, false);
    await f.controller.play();
    f.media.time = 4.01;
    const position = f.controller.readPosition();
    expect(position.source?.kind).toBe('freeze');
    f.controller.pauseAt(position);
    expect(f.controller.readPosition().resultTime).toBe(4);
    await f.controller.play();
    f.controller.tick();
    f.advance(2000);
    f.controller.tick();
    expect(f.controller.readPosition()).toMatchObject({ resultTime: 6, source: { kind: 'video' } });
  });
  it('keeps anchor and raster separate while logical time advances, pauses and resumes', async () => {
    const f = fixture({ edits: [hold()] });
    f.controller.seekSource(3.9, false);
    await f.controller.play();
    f.media.time = 4.01;
    const pending = f.controller.readPosition();
    expect(pending).toMatchObject({
      resultTime: 4,
      source: { kind: 'freeze', sourceTime: 4, mediaTime: 3.98 },
    });
    f.controller.tick();
    f.advance(100);
    f.controller.tick();
    const status = f.controller.getStatusSnapshot();
    f.advance(700);
    f.controller.tick();
    expect(f.controller.getStatusSnapshot()).toBe(status);
    expect(f.controller.readPosition()).toMatchObject({
      resultTime: 4.6,
      source: { sourceTime: 4, mediaTime: 3.98 },
    });
    expect(f.media.paused).toBe(true);
    f.controller.observeMedia('pause');
    expect(f.controller.getStatusSnapshot().playing).toBe(true);
    f.controller.pause();
    f.advance(1500);
    expect(f.controller.readPosition().resultTime).toBe(4.6);
    await f.controller.play();
    f.controller.tick();
    f.advance(2000);
    f.controller.tick();
    expect(f.controller.readPosition().resultTime).toBeCloseTo(5.1);
  });

  it('seeks and loops inside a freeze using exact result positions', async () => {
    const f = fixture({ edits: [hold()] });
    f.controller.setRange({ start: 4, end: 4, result: { start: 4.5, end: 5 } });
    expect(f.controller.readPosition().resultTime).toBe(4.5);
    await f.controller.play();
    f.controller.tick();
    f.advance(600);
    f.controller.tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.controller.readPosition().resultTime).toBe(4.5);
    expect(f.controller.getStatusSnapshot().range?.result).toEqual({ start: 4.5, end: 5 });
  });

  it('publishes one complete result-seek position without an intermediate source-seek jump', () => {
    const f = fixture({ edits: [hold()] });
    const positions = vi.fn();
    f.controller.subscribePosition(positions);
    f.controller.seekResult(4.5);
    expect(positions).toHaveBeenCalledOnce();
    expect(positions.mock.calls[0]![0]).toMatchObject({
      resultTime: 4.5,
      source: { kind: 'freeze', sourceTime: 4, mediaTime: 3.98 },
    });
    const epoch = f.controller.readPosition().epoch;
    f.controller.seekResult(4.5);
    expect(f.controller.readPosition().epoch).toBe(epoch);
  });

  it('plays consecutive holds including EOF holds exactly once and then ends', async () => {
    const f = fixture({ duration: 4, edits: [hold('a', 4, 1), hold('b', 4, 1)] });
    await f.controller.play();
    f.media.time = 4;
    f.media.ended = true;
    f.controller.observeMedia('ended');
    f.controller.tick();
    f.advance(1000);
    f.controller.tick();
    expect(f.controller.readPosition().source?.segmentId).toBe('freeze:b');
    f.controller.tick();
    f.advance(2000);
    f.controller.tick();
    expect(f.controller.getStatusSnapshot().mode).toBe('ended');
    expect(f.controller.readPosition().resultTime).toBe(6);
    expect(f.dependencies.media.play).toHaveBeenCalledOnce();
  });

  it('retimes a retained result interval and removes a deleted active hold', () => {
    const f = fixture({ edits: [hold()] });
    f.controller.setRange({ start: 4, end: 5, result: { start: 4.5, end: 7 } });
    f.configure({ edits: [hold('hold', 4, 4)] });
    expect(f.controller.getStatusSnapshot().range?.result).toEqual({ start: 4.5, end: 9 });
    f.configure({ edits: [] });
    expect(f.controller.readPosition().source?.kind).toBe('video');
    expect(f.controller.getStatusSnapshot().playing).toBe(false);
  });
});

describe('Gallery output presentation projection', () => {
  function outputFixture(edits: readonly ReviewEdit[] = []) {
    const f = fixture({ edits });
    let sample = { identity: {}, graphTime: 10, outputTime: 9.95 as number | null | undefined };
    Object.assign(f.dependencies.audio, { readClock: vi.fn(() => sample) });
    return {
      ...f,
      pair(graphTime: number, outputTime: number | null | undefined, identity = sample.identity) {
        sample = { identity, graphTime, outputTime };
      },
    };
  }

  it('projects one scheduling anchor into output time and keeps native control in graph time', async () => {
    const f = outputFixture();
    f.controller.seekSource(3, false);
    await f.controller.play();
    expect(f.controller.readPosition().resultTime).toBe(3);
    f.advance(100);
    f.pair(10.1, 10.05);
    const listener = vi.fn();
    f.controller.subscribePosition(listener);
    const read = vi.mocked(f.dependencies.audio.readClock!);
    read.mockClear();
    f.controller.tick();
    expect(read).toHaveBeenCalledOnce();
    expect(listener.mock.lastCall?.[0].resultTime).toBeCloseTo(3.05, 8);
    const publications = listener.mock.calls.length;
    const seeks = vi.mocked(f.dependencies.media.seek).mock.calls.length;
    expect(f.controller.readPosition().resultTime).toBeCloseTo(3.05, 8);
    expect(listener).toHaveBeenCalledTimes(publications);
    expect(f.dependencies.media.seek).toHaveBeenCalledTimes(seeks);
    expect(f.controller.readSchedulingPosition().resultTime).toBeCloseTo(3.1, 8);
    expect(f.dependencies.audio.start).toHaveBeenCalledOnce();
    f.advance(400);
    f.pair(10.4, 10.35);
    f.controller.tick();
    expect(f.media.time).toBeCloseTo(3.4, 8);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(3.35, 8);
  });

  it('enters and leaves native holds in graph time while publishing the output map', async () => {
    const f = outputFixture([hold()]);
    f.controller.seekSource(3.9, false);
    await f.controller.play();
    f.advance(120);
    f.pair(10.12, 10.07);
    f.controller.tick();
    expect(f.media.paused).toBe(true);
    expect(f.media.time).toBe(3.98);
    expect(f.controller.readPosition().source?.kind).toBe('video');
    expect(f.controller.readPosition().resultTime).toBeCloseTo(3.97, 8);
    f.advance(200);
    f.pair(10.2, 10.15);
    f.controller.tick();
    expect(f.controller.readPosition().source?.kind).toBe('freeze');
    expect(f.controller.readPosition().resultTime).toBeCloseTo(4.05, 8);
    f.advance(2120);
    f.pair(12.12, 12.07);
    f.controller.tick();
    await Promise.resolve();
    expect(f.media.paused).toBe(false);
    expect(f.controller.readPosition().source?.kind).toBe('freeze');
    expect(f.dependencies.audio.start).toHaveBeenCalledOnce();
  });

  it.each(['AbortError', 'NotAllowedError'] as const)(
    'classifies %s from a pending hold-exit Play interrupted by its own range drain',
    async (name) => {
      const f = outputFixture([hold()]);
      f.controller.setRange({ start: 3.865, end: 4.105, result: { start: 3.865, end: 6.105 } });
      f.controller.seekResult(5.9);
      await f.controller.play();
      const native = deferred<void>();
      vi.mocked(f.dependencies.media.play).mockReturnValueOnce(native.promise);
      f.advance(120);
      f.pair(10.12, 10.07);
      f.controller.tick();
      expect(f.dependencies.media.play).toHaveBeenCalledOnce();
      expect(f.controller.readSchedulingPosition().resultTime).toBeCloseTo(6.02, 8);
      vi.mocked(f.dependencies.media.pause).mockImplementationOnce(() => {
        f.media.paused = true;
        native.reject(new DOMException('Pending Play interrupted by controller pause', name));
      });
      f.advance(240);
      f.pair(10.24, 10.19);
      f.controller.tick();
      await Promise.resolve();
      if (name === 'NotAllowedError') {
        expect(f.dependencies.onFailure).toHaveBeenCalledExactlyOnceWith({ kind: 'play' });
        expect(f.controller.getStatusSnapshot().mode).toBe('failed');
        return;
      }
      expect(f.dependencies.onFailure).not.toHaveBeenCalled();
      expect(f.controller.getStatusSnapshot().mode).toBe('playing');
      expect(f.controller.readPosition().resultTime).toBeCloseTo(6.09, 8);
      f.advance(280);
      f.pair(10.28, 10.23);
      f.controller.tick();
      await whenPlaying(f.controller);
      expect(f.controller.readPosition().resultTime).toBe(3.865);
      expect(f.dependencies.audio.start).toHaveBeenCalledTimes(2);
      expect(f.dependencies.onFailure).not.toHaveBeenCalled();
    }
  );

  it('keeps an unowned native AbortError fatal', async () => {
    const f = outputFixture();
    vi.mocked(f.dependencies.media.play).mockRejectedValueOnce(
      new DOMException('Native Play aborted', 'AbortError')
    );
    await f.controller.play();
    expect(f.dependencies.onFailure).toHaveBeenCalledExactlyOnceWith({ kind: 'play' });
    expect(f.controller.getStatusSnapshot().mode).toBe('failed');
  });

  it('keeps audio continuous when the next hold interrupts the previous hold-exit native Play', async () => {
    const f = outputFixture([hold(), hold('next', 4.05, 1)]);
    f.controller.seekResult(5.9);
    await f.controller.play();
    const native = deferred<void>();
    vi.mocked(f.dependencies.media.play).mockReturnValueOnce(native.promise);
    f.advance(120);
    f.pair(10.12, 10.07);
    f.controller.tick();
    vi.mocked(f.dependencies.media.pause).mockImplementationOnce(() => {
      f.media.paused = true;
      native.reject(new DOMException('Play interrupted by next hold', 'AbortError'));
    });
    f.advance(180);
    f.pair(10.18, 10.13);
    f.controller.tick();
    await Promise.resolve();
    expect(f.controller.readSchedulingPosition().source?.segmentId).toBe('freeze:next');
    expect(f.dependencies.audio.start).toHaveBeenCalledOnce();
    expect(f.dependencies.onFailure).not.toHaveBeenCalled();
    expect(f.controller.getStatusSnapshot().mode).toBe('playing');
  });

  it('drains output to exact EOF despite repeated native ended and pause receipts', async () => {
    const f = outputFixture();
    f.controller.seekSource(11.9, false);
    await f.controller.play();
    vi.mocked(f.dependencies.audio.stop).mockClear();
    f.advance(120);
    f.pair(10.12, 10.07);
    f.media.time = 12;
    f.media.ended = true;
    f.controller.tick();
    expect(f.controller.getStatusSnapshot().mode).toBe('playing');
    expect(f.controller.readPosition().resultTime).toBeCloseTo(11.97, 8);
    expect(f.dependencies.audio.stop).toHaveBeenCalledOnce();
    f.controller.observeMedia('ended');
    f.controller.observeMedia('pause');
    f.controller.observeMedia('ended');
    expect(f.controller.getStatusSnapshot().mode).toBe('playing');
    f.advance(140);
    f.pair(10.14, 10.09);
    f.controller.tick();
    expect(f.controller.readPosition().resultTime).toBeCloseTo(11.99, 8);
    expect(f.dependencies.audio.stop).toHaveBeenCalledOnce();
    f.advance(180);
    f.pair(10.18, 10.13);
    f.controller.tick();
    expect(f.controller.getStatusSnapshot().mode).toBe('ended');
    expect(f.controller.readPosition().resultTime).toBe(12);
    expect(f.dependencies.audio.stop).toHaveBeenCalledOnce();
  });

  it('drains the full result range before restarting and retains the running output clock', async () => {
    const f = outputFixture();
    f.controller.setRange({ start: 2, end: 3 });
    await f.controller.play();
    const epoch = f.controller.readPosition().epoch;
    vi.mocked(f.dependencies.audio.stop).mockClear();
    f.advance(1020);
    f.pair(11.02, 10.97);
    f.controller.tick();
    expect(f.controller.readPosition().epoch).toBe(epoch);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(2.97, 8);
    expect(f.dependencies.audio.start).toHaveBeenCalledOnce();
    expect(f.dependencies.audio.stop).toHaveBeenCalledOnce();
    f.controller.observeMedia('pause');
    f.media.ended = true;
    f.controller.observeMedia('ended');
    expect(f.controller.getStatusSnapshot().mode).toBe('playing');
    f.advance(1080);
    f.pair(11.08, 11.03);
    f.controller.tick();
    await whenPlaying(f.controller);
    expect(f.controller.readPosition().epoch).toBe(epoch + 1);
    expect(f.controller.readPosition().resultTime).toBe(2);
    expect(f.dependencies.audio.start).toHaveBeenCalledTimes(2);
    expect(f.dependencies.audio.stop).toHaveBeenCalledOnce();
    f.advance(1180);
    f.pair(11.18, 11.13);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(2.05, 8);
  });

  it('keeps cut and speed input transitions in graph phase while output maps the earlier sample', async () => {
    const f = outputFixture([
      { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
      {
        id: 'fast',
        kind: 'speed',
        start: 4,
        end: 6,
        requestedStart: 4,
        requestedEnd: 6,
        rate: 2,
        audio: 'speed',
      },
    ]);
    f.controller.seekSource(1.9, false);
    await f.controller.play();
    f.advance(200);
    f.pair(10.2, 10.15);
    f.controller.tick();
    expect(f.media.time).toBeCloseTo(4.2, 8);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(2.05, 8);
    expect(f.controller.readPosition().source?.sourceTime).toBeCloseTo(4.1, 8);
    expect(f.dependencies.media.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ rate: 2 })
    );
    expect(f.dependencies.audio.start).toHaveBeenCalledOnce();
  });

  it('resets output projection at a range loop and schedules only the accepted graph start', async () => {
    const f = outputFixture();
    f.controller.setRange({ start: 2, end: 3 });
    await f.controller.play();
    const epoch = f.controller.readPosition().epoch;
    f.advance(1100);
    f.pair(11.1, 11.05);
    f.controller.tick();
    await whenPlaying(f.controller);
    expect(f.controller.readPosition().epoch).toBe(epoch + 1);
    expect(f.controller.readPosition().resultTime).toBe(2);
    expect(f.dependencies.audio.start).toHaveBeenCalledTimes(2);
    expect(vi.mocked(f.dependencies.audio.start).mock.lastCall?.[0].position.resultTime).toBe(2);
    f.advance(1200);
    f.pair(11.2, 11.15);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(2.05, 8);
  });

  it('holds the projection floor when output returns behind it and resets on backward seek', async () => {
    const f = outputFixture();
    await f.controller.play();
    f.advance(200);
    f.pair(10.2, 10.15);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(0.15, 8);
    f.advance(400);
    f.pair(10.4, null);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(0.35, 8);
    f.advance(420);
    f.pair(10.42, 10.3);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(0.35, 8);
    f.advance(500);
    f.pair(10.5, 10.4);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(0.4, 8);
    f.controller.seekSource(0.1, false);
    expect(f.controller.readPosition().resultTime).toBe(0.1);
    expect(f.dependencies.audio.start).toHaveBeenCalledOnce();
  });

  it('keeps the accepted start at output startup and handles unavailable output without latency guesses', async () => {
    const pending = outputFixture();
    pending.pair(10, null);
    await pending.controller.play();
    pending.advance(20);
    pending.pair(10.02, null);
    expect(pending.controller.readPosition().resultTime).toBe(0);
    pending.advance(80);
    pending.pair(10.08, 10.03);
    expect(pending.controller.readPosition().resultTime).toBeCloseTo(0.03, 8);
    const unavailable = outputFixture();
    unavailable.pair(10, undefined);
    await unavailable.controller.play();
    unavailable.advance(100);
    unavailable.pair(10.1, undefined);
    expect(unavailable.controller.readPosition().resultTime).toBeCloseTo(0.1, 8);
    unavailable.advance(120);
    unavailable.pair(10.12, 10.07);
    expect(unavailable.controller.readPosition().resultTime).toBeCloseTo(0.1, 8);
  });

  it('discards old context calibration and projection floors on source replacement', async () => {
    const f = outputFixture();
    await f.controller.play();
    f.advance(100);
    f.pair(10.1, 10.05);
    f.controller.tick();
    const identity = {};
    f.advance(200);
    f.pair(10.2, 10.18, identity);
    f.controller.tick();
    expect(f.dependencies.audio.start).toHaveBeenCalledTimes(2);
    expect(f.controller.readPosition().resultTime).toBeCloseTo(0.18, 8);
    f.configure({ sourceId: 'replacement' });
    f.media.sourceId = 'replacement';
    f.media.time = 0;
    f.pair(1, 0.95, {});
    await f.controller.play();
    expect(f.controller.readPosition().resultTime).toBe(0);
  });
});

describe('Gallery native activation and seek receipts', () => {
  it.each([1, 2] as const)(
    'waits for native readiness and anchors fresh mapped media at rate %s',
    async (rate) => {
      const f = fixture({
        edits:
          rate === 1
            ? []
            : [
                {
                  id: 'fast',
                  kind: 'speed',
                  start: 2,
                  end: 6,
                  requestedStart: 2,
                  requestedEnd: 6,
                  rate,
                  audio: 'speed',
                },
              ],
      });
      f.controller.seekSource(3, false);
      f.audioTime(10);
      vi.mocked(f.dependencies.audio.prepare).mockReturnValue(true);
      const gate = deferred<void>();
      vi.mocked(f.dependencies.media.play).mockReturnValueOnce(gate.promise);
      const pending = f.controller.play();
      f.advance(100);
      f.audioTime(10.1);
      expect(f.dependencies.audio.start).not.toHaveBeenCalled();
      expect(f.controller.getStatusSnapshot().mode).toBe('preparing');
      f.media.time = 3.02;
      f.media.paused = false;
      gate.resolve();
      await pending;
      const result = 2 + 1.02 / rate;
      expect(f.dependencies.audio.start).toHaveBeenCalledExactlyOnceWith({
        position: expect.objectContaining({ resultTime: result }),
        seekRevision: 1,
      });
      f.advance(120);
      f.audioTime(10.12);
      f.media.time = 3.02 + 0.02 * rate;
      expect(f.controller.readPosition().resultTime).toBeCloseTo(result + 0.02, 8);
      expect(f.controller.readPosition().resultTime! - (2 + (f.media.time - 2) / rate)).toBeCloseTo(
        0,
        8
      );
    }
  );

  it.each(['pause', 'seek', 'map', 'source'] as const)(
    'refuses audio activation after %s during native readiness',
    async (operation) => {
      const f = fixture();
      vi.mocked(f.dependencies.audio.prepare).mockReturnValue(true);
      const gate = deferred<void>();
      vi.mocked(f.dependencies.media.play).mockReturnValueOnce(gate.promise);
      const pending = f.controller.play();
      if (operation === 'pause') f.controller.pause();
      if (operation === 'seek') f.controller.seekSource(7, false);
      if (operation === 'map') f.configure({ edits: [hold()] });
      if (operation === 'source') f.configure({ sourceId: 'replacement' });
      gate.resolve();
      await pending;
      expect(f.dependencies.audio.start).not.toHaveBeenCalled();
      expect(f.dependencies.onRecovered).not.toHaveBeenCalled();
      expect(f.dependencies.onFailure).not.toHaveBeenCalled();
    }
  );

  it('requires new native readiness after a superseded pending Play', async () => {
    const f = fixture();
    vi.mocked(f.dependencies.audio.prepare).mockReturnValue(true);
    const old = deferred<void>(),
      fresh = deferred<void>();
    vi.mocked(f.dependencies.media.play)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const oldPlay = f.controller.play();
    f.controller.seekSource(7, false);
    const newPlay = f.controller.play();
    const pauses = vi.mocked(f.dependencies.media.pause).mock.calls.length;
    old.resolve();
    await oldPlay;
    expect(f.dependencies.audio.start).not.toHaveBeenCalled();
    expect(f.dependencies.media.pause).toHaveBeenCalledTimes(pauses);
    expect(f.controller.getStatusSnapshot().mode).toBe('preparing');
    f.media.paused = false;
    fresh.resolve();
    await newPlay;
    expect(f.dependencies.audio.start).toHaveBeenCalledOnce();
    expect(f.controller.readPosition().resultTime).toBe(7);
  });

  it.each([1, 2] as const)(
    'aligns a delayed hold exit once to the continuous audio reference at rate %s',
    async (rate) => {
      const f = fixture({
        edits: [
          hold(),
          ...(rate === 1
            ? []
            : [
                {
                  id: 'fast',
                  kind: 'speed' as const,
                  start: 4,
                  end: 8,
                  requestedStart: 4,
                  requestedEnd: 8,
                  rate,
                  audio: 'speed' as const,
                },
              ]),
        ],
      });
      f.controller.seekResult(5.9);
      f.audioTime(10);
      await f.controller.play();
      const gate = deferred<void>();
      vi.mocked(f.dependencies.media.play).mockReturnValueOnce(gate.promise);
      f.advance(200);
      f.audioTime(10.2);
      f.controller.tick();
      expect(f.media.time).toBeCloseTo(4 + 0.1 * rate, 8);
      vi.mocked(f.dependencies.media.seek).mockClear();
      f.advance(300);
      f.audioTime(10.3);
      f.controller.tick();
      expect(f.dependencies.media.seek).not.toHaveBeenCalled();
      f.media.paused = false;
      gate.resolve();
      await Promise.resolve();
      expect(f.dependencies.media.seek).toHaveBeenCalledExactlyOnceWith(
        expect.closeTo(4 + 0.2 * rate, 8)
      );
      f.advance(320);
      f.audioTime(10.32);
      f.media.time = 4 + 0.22 * rate;
      f.controller.tick();
      expect(f.dependencies.media.seek).toHaveBeenCalledOnce();
      expect(f.dependencies.audio.start).toHaveBeenCalledOnce();
      expect(f.dependencies.audio.prepare).toHaveBeenCalledOnce();
    }
  );

  it('retains an exact result range on a rounded native receipt but clears it for an explicit outside seek', () => {
    const f = fixture({ edits: [hold()] });
    f.controller.setRange({ start: 3.8650003, end: 4.1, result: { start: 3.8650003, end: 6.1 } });
    const before = f.controller.getStatusSnapshot();
    f.media.time = 3.865;
    f.controller.observeMedia('seeked');
    expect(f.controller.getStatusSnapshot().range).toBe(before.range);
    expect(f.controller.getStatusSnapshot().navigationRevision).toBe(before.navigationRevision);
    expect(f.controller.getStatusSnapshot().seekRevision).toBe(before.seekRevision);
    expect(f.controller.readPosition().resultTime).toBe(3.8650003);
    f.controller.seekSource(3.865, false);
    expect(f.controller.getStatusSnapshot().range).toBeNull();
    expect(f.controller.readPosition().resultTime).toBe(3.865);
  });
});

describe('Gallery transport cancellation and recovery', () => {
  it.each(['pause', 'seek', 'replace', 'dispose'] as const)(
    'rejects audio preparation after %s',
    async (operation) => {
      const gate = deferred<boolean>();
      const f = fixture();
      vi.mocked(f.dependencies.audio.prepare).mockReturnValueOnce(gate.promise);
      const playing = f.controller.play();
      const signal = vi.mocked(f.dependencies.audio.prepare).mock.calls[0]![0];
      if (operation === 'pause') f.controller.pause();
      if (operation === 'seek') f.controller.seekSource(7, false);
      if (operation === 'replace') f.configure({ sourceId: 'replacement' });
      if (operation === 'dispose') f.controller.dispose();
      expect(signal.aborted).toBe(true);
      gate.resolve(true);
      await playing;
      expect(f.dependencies.audio.start).not.toHaveBeenCalled();
      expect(f.dependencies.media.play).not.toHaveBeenCalled();
      expect(f.dependencies.onFailure).not.toHaveBeenCalled();
    }
  );

  it('does not accept a late native Play completion after pause', async () => {
    const f = fixture();
    const gate = deferred<void>();
    vi.mocked(f.dependencies.media.play).mockReturnValueOnce(gate.promise);
    const pending = f.controller.play();
    await Promise.resolve();
    f.controller.pause();
    gate.resolve();
    await pending;
    expect(f.controller.getStatusSnapshot().playing).toBe(false);
    expect(f.dependencies.onRecovered).not.toHaveBeenCalled();
  });

  it('retains a terminal stopped snapshot after disposal without following a reused media adapter', async () => {
    const f = fixture();
    await f.controller.play();
    f.media.time = 3;
    f.controller.dispose();
    const position = f.controller.readPosition();
    f.media.time = 7;
    f.media.paused = false;
    f.controller.tick();
    f.controller.observeMedia('play');
    expect(f.controller.readPosition()).toBe(position);
    expect(position.resultTime).toBe(3);
    expect(f.controller.getStatusSnapshot().playing).toBe(false);
  });

  it('ignores queued ended/error observations after their native state has been replaced', async () => {
    const f = fixture();
    f.controller.seekSource(7, false);
    await f.controller.play();
    f.controller.observeMedia('ended');
    f.controller.observeMedia('error');
    expect(f.controller.getStatusSnapshot().playing).toBe(true);
    expect(f.dependencies.onFailure).not.toHaveBeenCalled();
  });

  it('invalidates old audio readiness when the accepted temporal map changes', async () => {
    const f = fixture();
    const gate = deferred<boolean>();
    vi.mocked(f.dependencies.audio.prepare).mockReturnValueOnce(gate.promise);
    const pending = f.controller.play();
    f.configure({ edits: [hold()] });
    gate.resolve(true);
    await pending;
    expect(f.dependencies.media.play).not.toHaveBeenCalled();
    expect(f.controller.getStatusSnapshot().mode).toBe('paused');
    expect(f.controller.readPosition().mapRevision).toBe(1);
  });

  it('accepts only the latest preparation after a newer seek and Play', async () => {
    const f = fixture();
    const first = deferred<boolean>(),
      second = deferred<boolean>();
    vi.mocked(f.dependencies.audio.prepare)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const oldPlay = f.controller.play();
    f.controller.seekSource(7, false);
    const newPlay = f.controller.play();
    first.resolve(true);
    await oldPlay;
    expect(f.dependencies.media.play).not.toHaveBeenCalled();
    second.resolve(true);
    await newPlay;
    expect(f.dependencies.media.play).toHaveBeenCalledOnce();
    expect(f.controller.getStatusSnapshot().position.source?.sourceTime).toBe(7);
  });

  it('keeps refused preparation paused and reports real failures', async () => {
    const f = fixture();
    vi.mocked(f.dependencies.audio.prepare).mockResolvedValueOnce(false);
    await f.controller.play();
    expect(f.controller.getStatusSnapshot().mode).toBe('paused');
    vi.mocked(f.dependencies.audio.prepare).mockRejectedValueOnce(new Error('DSP unavailable'));
    await f.controller.play();
    expect(f.controller.getStatusSnapshot().mode).toBe('failed');
    expect(f.dependencies.onFailure).toHaveBeenCalledWith({ kind: 'audio' });
  });

  it.each(['audio', 'play'] as const)(
    'keeps a real %s start failure classified at its owner',
    async (kind) => {
      const f = fixture();
      if (kind === 'audio')
        vi.mocked(f.dependencies.audio.start).mockImplementationOnce(() => {
          throw new Error('Processor refused start');
        });
      else
        vi.mocked(f.dependencies.media.play).mockRejectedValueOnce(
          new Error('Native Play refused')
        );
      await f.controller.play();
      expect(f.controller.getStatusSnapshot().mode).toBe('failed');
      expect(f.dependencies.onFailure).toHaveBeenCalledWith({ kind });
    }
  );

  it('normalizes a cut destination before starting the prepared audio clock', async () => {
    const f = fixture({
      edits: [{ id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 }],
    });
    f.controller.seekSource(3, false);
    vi.mocked(f.dependencies.audio.start).mockImplementationOnce(() => {
      expect(f.controller.readPosition().resultTime).toBe(2);
      expect(f.media.time).toBe(4);
    });
    await f.controller.play();
    expect(f.controller.getStatusSnapshot().playing).toBe(true);
  });

  it('performs one bounded automatic decoder reload and resumes only after restoration readiness', async () => {
    const f = fixture();
    await f.controller.play();
    f.media.time = 3.125;
    f.media.errorCode = 3;
    f.controller.observeMedia('error');
    expect(f.controller.getStatusSnapshot().mode).toBe('recovering');
    f.advance(499);
    expect(f.dependencies.media.reload).not.toHaveBeenCalled();
    f.advance(500);
    expect(f.dependencies.media.reload).toHaveBeenCalledOnce();
    f.media.time = 0;
    f.media.errorCode = null;
    f.controller.observeMedia('ready');
    expect(f.controller.getStatusSnapshot().mode).toBe('recovering');
    f.controller.observeMedia('metadata');
    expect(f.media.time).toBe(3.125);
    f.controller.observeMedia('ready');
    await whenPlaying(f.controller);
    expect(f.controller.getStatusSnapshot().playing).toBe(true);
    expect(f.timers.size).toBe(0);
    f.media.errorCode = 3;
    f.controller.observeMedia('error');
    expect(f.controller.getStatusSnapshot().mode).toBe('failed');
    expect(f.dependencies.media.reload).toHaveBeenCalledOnce();
  });

  it('times out decoder recovery and cancels pending lifecycle work on disposal', () => {
    const f = fixture();
    f.media.errorCode = 3;
    f.controller.observeMedia('error');
    f.advance(10000);
    expect(f.controller.getStatusSnapshot().mode).toBe('failed');
    expect(f.dependencies.onFailure).toHaveBeenCalledWith({ kind: 'media', code: 3 });
    const g = fixture();
    g.media.errorCode = 3;
    g.controller.observeMedia('error');
    g.controller.dispose();
    g.advance(10000);
    g.controller.observeMedia('ready');
    expect(g.timers.size).toBe(0);
    expect(g.dependencies.media.reload).not.toHaveBeenCalled();
    expect(g.dependencies.onFailure).not.toHaveBeenCalled();
  });

  it('retains decoder recovery when an explicit seek replaces the target and cancels its resume intent', async () => {
    const f = fixture();
    await f.controller.play();
    f.media.time = 3;
    f.media.errorCode = 3;
    f.controller.observeMedia('error');
    f.controller.seekSource(7, false);
    expect(f.controller.getStatusSnapshot().mode).toBe('recovering');
    f.advance(500);
    f.media.errorCode = null;
    f.media.time = 0;
    f.controller.observeMedia('metadata');
    f.controller.observeMedia('ready');
    expect(f.media.time).toBe(7);
    expect(f.controller.getStatusSnapshot().mode).toBe('paused');
    expect(f.dependencies.media.play).toHaveBeenCalledOnce();
  });

  it('allows an explicit retry after a failed automatic recovery and preserves paused recovery intent', async () => {
    const f = fixture();
    f.media.time = 3;
    f.media.errorCode = 3;
    f.controller.observeMedia('error');
    f.advance(500);
    f.media.time = 0;
    f.media.errorCode = null;
    f.controller.observeMedia('metadata');
    f.controller.observeMedia('ready');
    expect(f.controller.getStatusSnapshot().mode).toBe('paused');
    expect(f.dependencies.media.play).not.toHaveBeenCalled();
    f.media.errorCode = 3;
    f.controller.observeMedia('error');
    expect(f.controller.getStatusSnapshot().mode).toBe('failed');
    await f.controller.play();
    expect(f.controller.getStatusSnapshot().mode).toBe('recovering');
    f.advance(1000);
    f.media.time = 0;
    f.media.errorCode = null;
    f.controller.observeMedia('metadata');
    f.controller.observeMedia('ready');
    await whenPlaying(f.controller);
    expect(f.controller.getStatusSnapshot().playing).toBe(true);
    expect(f.dependencies.media.reload).toHaveBeenCalledTimes(2);
  });

  it.each([1, 2, 4])('reports native error %s without attempting decoder recovery', (code) => {
    const f = fixture();
    f.media.errorCode = code;
    f.controller.observeMedia('error');
    expect(f.controller.getStatusSnapshot().mode).toBe('failed');
    expect(f.dependencies.schedule).not.toHaveBeenCalled();
  });
});
