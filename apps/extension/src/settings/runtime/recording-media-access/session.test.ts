import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type VideoRecordingRuntimeState,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';
import { createRecordingMediaAccessSession, type RecordingMediaAccessKind } from './session';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Value>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

function state(patch: Partial<VideoRecordingRuntimeState> = {}): VideoRecordingRuntimeState {
  return {
    status: VideoRecordingStatus.RECORDING,
    duration: 0,
    countdownEndsAt: null,
    captureMode: null,
    captureSource: null,
    viewportPresetId: null,
    error: null,
    liveMedia: {
      microphoneSelected: true,
      microphoneEnabled: true,
      microphoneDeviceId: 'mic-one',
      webcamSelected: true,
      webcamEnabled: true,
      webcamDeviceId: 'camera-one',
    },
    ...patch,
  };
}

function setup() {
  const initial = deferred<VideoRecordingRuntimeState>();
  const readState = vi.fn(() => initial.promise);
  let listener!: (value: VideoRecordingRuntimeState) => void;
  const unsubscribe = vi.fn();
  const leases: {
    kind: RecordingMediaAccessKind;
    deviceId: string | null;
    signal: AbortSignal;
    result: ReturnType<typeof deferred<void>>;
  }[] = [];
  const retainDevice = vi.fn(
    (kind: RecordingMediaAccessKind, deviceId: string | null, signal: AbortSignal) => {
      const result = deferred<void>();
      leases.push({ kind, deviceId, signal, result });
      return result.promise;
    }
  );
  const onFailure = vi.fn();
  const onIdle = vi.fn();
  const session = createRecordingMediaAccessSession({
    readState,
    subscribeState: (nextListener) => {
      listener = nextListener;
      return unsubscribe;
    },
    retainDevice,
    onFailure,
    onIdle,
  });
  return {
    initial,
    readState,
    leases,
    retainDevice,
    onFailure,
    onIdle,
    session,
    unsubscribe,
    emit: (value: VideoRecordingRuntimeState) => listener(value),
    leaseAt: (index: number) => {
      const lease = leases[index];
      if (!lease) throw new Error(`Expected retained device at index ${index}`);
      return lease;
    },
  };
}

describe('recording media access session', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not acquire or poll idle media and ignores an initial response after newer sync', async () => {
    const fixture = setup();
    expect(fixture.readState).toHaveBeenCalledTimes(1);
    fixture.emit(state({ status: VideoRecordingStatus.IDLE }));
    fixture.initial.resolve(state());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fixture.retainDevice).not.toHaveBeenCalled();
    expect(fixture.readState).toHaveBeenCalledTimes(1);
    expect(fixture.onIdle).toHaveBeenCalledTimes(1);
    fixture.session.dispose();
  });

  it('retains selected devices through countdown, mute and pause without duration reacquisition', async () => {
    const fixture = setup();
    fixture.initial.resolve(state({ status: VideoRecordingStatus.PREPARING }));
    await Promise.resolve();
    expect(fixture.leases.map(({ kind, deviceId }) => [kind, deviceId])).toEqual([
      ['microphone', 'mic-one'],
      ['camera', 'camera-one'],
    ]);
    for (const status of [
      VideoRecordingStatus.COUNTDOWN,
      VideoRecordingStatus.RECORDING,
      VideoRecordingStatus.PAUSED,
    ]) {
      const next = state({ status, duration: 30 });
      if (next.liveMedia) {
        next.liveMedia.microphoneEnabled = false;
        next.liveMedia.webcamEnabled = false;
      }
      fixture.emit(next);
    }
    expect(fixture.retainDevice).toHaveBeenCalledTimes(2);
    expect(fixture.leases.every(({ signal }) => !signal.aborted)).toBe(true);
    fixture.session.dispose();
    expect(fixture.leases.every(({ signal }) => signal.aborted)).toBe(true);
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
    fixture.session.dispose();
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('replaces only the changed device and releases deselected devices', () => {
    const fixture = setup();
    fixture.emit(state());
    const next = state();
    if (next.liveMedia) {
      next.liveMedia.microphoneDeviceId = null;
      next.liveMedia.webcamSelected = false;
    }
    fixture.emit(next);
    expect(fixture.leases).toHaveLength(3);
    expect(fixture.leaseAt(0).signal.aborted).toBe(true);
    expect(fixture.leaseAt(1).signal.aborted).toBe(true);
    expect(fixture.leaseAt(2).deviceId).toBeNull();
    fixture.session.dispose();
  });

  it.each([
    { status: VideoRecordingStatus.STOPPING },
    { status: VideoRecordingStatus.IDLE },
    { error: 'recording failed' },
    { liveMedia: null },
  ])('releases all devices for terminal or unavailable state %j', async (patch) => {
    const fixture = setup();
    fixture.emit(state());
    fixture.emit(state(patch));
    expect(fixture.leases.every(({ signal }) => signal.aborted)).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fixture.readState).toHaveBeenCalledTimes(1);
    fixture.session.dispose();
  });

  it('does not reacquire after disposal or after a late retention failure', async () => {
    const fixture = setup();
    fixture.emit(state());
    fixture.session.dispose();
    fixture.initial.resolve(state());
    fixture.emit(state());
    fixture.leaseAt(0).result.reject(new Error('late acquisition'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fixture.retainDevice).toHaveBeenCalledTimes(2);
    expect(fixture.onFailure).not.toHaveBeenCalled();
  });

  it('contains one device failure without retrying the same projection or dropping the other', async () => {
    const fixture = setup();
    fixture.emit(state());
    fixture.leaseAt(0).result.reject(new Error('revoked'));
    await Promise.resolve();
    expect(fixture.onFailure).toHaveBeenCalledTimes(1);
    expect(fixture.leaseAt(0).signal.aborted).toBe(true);
    expect(fixture.leaseAt(1).signal.aborted).toBe(false);
    fixture.emit(state({ duration: 50 }));
    expect(fixture.leases).toHaveLength(2);
    const next = state();
    if (next.liveMedia) next.liveMedia.microphoneDeviceId = 'mic-two';
    fixture.emit(next);
    expect(fixture.leases).toHaveLength(3);
    fixture.emit(state({ status: VideoRecordingStatus.IDLE }));
    fixture.emit(state());
    expect(fixture.leases).toHaveLength(5);
    fixture.session.dispose();
  });

  it('detects a missed terminal broadcast with the authoritative heartbeat', async () => {
    const fixture = setup();
    fixture.initial.resolve(state());
    await Promise.resolve();
    fixture.readState.mockResolvedValue(state({ status: VideoRecordingStatus.IDLE }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fixture.leases.every(({ signal }) => signal.aborted)).toBe(true);
    expect(fixture.onIdle).toHaveBeenCalledTimes(1);
    expect(fixture.readState).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fixture.readState).toHaveBeenCalledTimes(2);
    fixture.session.dispose();
  });

  it('fails closed after a stalled heartbeat deadline without overlapping reads', async () => {
    const fixture = setup();
    fixture.initial.resolve(state());
    await Promise.resolve();
    const stalled = deferred<VideoRecordingRuntimeState>();
    fixture.readState.mockReturnValue(stalled.promise);
    await vi.advanceTimersByTimeAsync(5_999);
    expect(fixture.leases.every(({ signal }) => !signal.aborted)).toBe(true);
    expect(fixture.readState).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.leases.every(({ signal }) => signal.aborted)).toBe(true);
    expect(fixture.onFailure).toHaveBeenCalledTimes(1);
    stalled.resolve(state());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fixture.leases).toHaveLength(2);
    fixture.session.dispose();
  });

  it('ignores a heartbeat response superseded by authoritative sync', async () => {
    const fixture = setup();
    fixture.initial.resolve(state());
    await Promise.resolve();
    const stalled = deferred<VideoRecordingRuntimeState>();
    fixture.readState.mockReturnValue(stalled.promise);
    await vi.advanceTimersByTimeAsync(1_000);
    fixture.emit(state({ duration: 2 }));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fixture.leases.every(({ signal }) => !signal.aborted)).toBe(true);
    expect(fixture.onFailure).not.toHaveBeenCalled();
    stalled.resolve(state({ status: VideoRecordingStatus.IDLE }));
    await Promise.resolve();
    expect(fixture.leases.every(({ signal }) => !signal.aborted)).toBe(true);
    fixture.session.dispose();
  });

  it('does not fail closed for a read deadline superseded by authoritative sync', async () => {
    const fixture = setup();
    fixture.initial.resolve(state());
    await Promise.resolve();
    fixture.readState.mockReturnValue(deferred<VideoRecordingRuntimeState>().promise);
    await vi.advanceTimersByTimeAsync(1_000);
    fixture.emit(state({ duration: 2 }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fixture.leases.every(({ signal }) => !signal.aborted)).toBe(true);
    expect(fixture.onFailure).not.toHaveBeenCalled();
    fixture.session.dispose();
  });

  it('releases resources when an authoritative read rejects', async () => {
    const fixture = setup();
    fixture.initial.resolve(state());
    await Promise.resolve();
    fixture.readState.mockRejectedValue(new Error('worker unavailable'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fixture.leases.every(({ signal }) => signal.aborted)).toBe(true);
    expect(fixture.onFailure).toHaveBeenCalledTimes(1);
    fixture.session.dispose();
  });
});
