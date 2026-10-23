import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMicrophoneActivityObserver } from './microphone-activity';
import { createAudioStream } from '../multi-source/media-stream.test-support';

function createObservation() {
  const stream = createAudioStream();
  const publish = vi.fn();
  let sample: () => void = () => undefined;
  let now = 0;
  let amplitude = 0;
  const analyser = {
    fftSize: 0,
    disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((samples: Float32Array) => samples.fill(amplitude)),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const audioContext = {
    state: 'running',
    close: vi.fn().mockResolvedValue(undefined),
    createAnalyser: vi.fn(() => analyser),
    createMediaStreamSource: vi.fn(() => source),
  };
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return audioContext;
    })
  );
  const cancel = vi.fn();
  const observer = createMicrophoneActivityObserver(publish, {
    createAudioContext: () => new AudioContext(),
    now: () => now,
    schedule: (callback) => {
      sample = callback;
      return setInterval(() => undefined, 1_000_000);
    },
    cancel: (timer) => {
      cancel(timer);
      clearInterval(timer);
    },
  });
  return {
    stream,
    observer,
    publish,
    audioContext,
    source,
    analyser,
    cancel,
    setAmplitude: (next: number) => {
      amplitude = next;
    },
    tick: (count = 1) => {
      for (let index = 0; index < count; index += 1) {
        now += 250;
        sample();
      }
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('microphone signal observation', () => {
  it('borrows only the supplied microphone and releases analysis without changing its track', () => {
    const observation = createObservation();
    const track = observation.stream.getAudioTracks()[0]!;
    const clone = vi.spyOn(track, 'clone');
    observation.observer.setSource(observation.stream);
    observation.observer.dispose();
    observation.tick();
    expect(observation.audioContext.createMediaStreamSource).toHaveBeenCalledWith(
      observation.stream
    );
    expect(observation.source.connect).toHaveBeenCalledWith(observation.analyser);
    expect(observation.analyser.fftSize).toBe(1024);
    expect(track.stop).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
    expect(track.enabled).toBe(true);
    expect(observation.audioContext.close).toHaveBeenCalledOnce();
    expect(observation.cancel).toHaveBeenCalledOnce();
  });

  it('keeps preparation and initial silence unarmed, then warns and recovers at the first signal', () => {
    const observation = createObservation();
    observation.observer.setSource(observation.stream);
    observation.setAmplitude(0.1);
    observation.tick(100);
    observation.observer.setPhase('recording');
    observation.setAmplitude(0);
    observation.tick(100);
    expect(observation.observer.current.warning).toBe(false);
    observation.setAmplitude(0.1);
    observation.tick(3);
    observation.setAmplitude(0);
    observation.tick(80);
    expect(observation.observer.current.warning).toBe(false);
    observation.tick();
    expect(observation.observer.current.warning).toBe(true);
    observation.setAmplitude(0.1);
    observation.tick();
    expect(observation.observer.current.warning).toBe(false);
    observation.observer.dispose();
  });

  it('requires three consecutive gain-aware active samples and publishes recording changes only', () => {
    const observation = createObservation();
    observation.observer.setSource(observation.stream, 0.1);
    observation.observer.setPhase('recording');
    observation.setAmplitude(0.01);
    observation.tick(3);
    observation.setAmplitude(0);
    observation.tick(85);
    expect(observation.observer.current.warning).toBe(false);
    observation.setAmplitude(0.1);
    observation.tick(2);
    observation.setAmplitude(0);
    observation.tick(85);
    expect(observation.observer.current.warning).toBe(false);
    observation.setAmplitude(0.1);
    observation.tick(3);
    observation.publish.mockClear();
    observation.tick(10);
    expect(observation.publish).not.toHaveBeenCalled();
    observation.setAmplitude(0);
    observation.tick(81);
    expect(observation.publish).toHaveBeenCalledOnce();
    expect(observation.observer.current.warning).toBe(true);
    observation.observer.dispose();
  });

  it('resets on pause, resume, replacement and intentional disable', () => {
    const observation = createObservation();
    observation.observer.setSource(observation.stream);
    observation.observer.setPhase('recording');
    observation.setAmplitude(0.1);
    observation.tick(3);
    observation.setAmplitude(0);
    observation.tick(81);
    expect(observation.observer.current.warning).toBe(true);
    observation.observer.setPhase('paused');
    const reads = observation.analyser.getFloatTimeDomainData.mock.calls.length;
    observation.tick(100);
    expect(observation.analyser.getFloatTimeDomainData).toHaveBeenCalledTimes(reads);
    observation.observer.setPhase('recording');
    observation.tick(100);
    expect(observation.observer.current.warning).toBe(false);
    observation.setAmplitude(0.1);
    observation.tick(3);
    observation.observer.setSource(createAudioStream());
    observation.setAmplitude(0);
    observation.tick(100);
    expect(observation.observer.current.warning).toBe(false);
    observation.observer.setEnabled(false);
    expect(observation.observer.current).toEqual({ status: 'disabled', level: 0, warning: false });
    observation.observer.dispose();
  });

  it('treats suspended contexts and read failures as unavailable and recovers unarmed', () => {
    const observation = createObservation();
    observation.observer.setSource(observation.stream);
    observation.observer.setPhase('recording');
    observation.setAmplitude(0.1);
    observation.tick(3);
    observation.audioContext.state = 'suspended';
    observation.tick(100);
    expect(observation.observer.current).toEqual({
      status: 'unavailable',
      level: 0,
      warning: false,
    });
    observation.audioContext.state = 'running';
    observation.analyser.getFloatTimeDomainData.mockImplementationOnce(() => {
      throw new Error('read failed');
    });
    observation.tick();
    expect(observation.observer.current.status).toBe('unavailable');
    observation.setAmplitude(0);
    observation.tick(100);
    expect(observation.observer.current.warning).toBe(false);
    observation.observer.dispose();
  });

  it('keeps microphone capture usable when the analysis context cannot be created', () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        throw new Error('analysis unavailable');
      })
    );
    const microphone = createAudioStream();
    const publish = vi.fn();
    const observer = createMicrophoneActivityObserver(publish);
    expect(() => observer.setSource(microphone)).not.toThrow();
    observer.setPhase('recording');
    vi.advanceTimersByTime(30_000);
    expect(observer.current).toEqual({ status: 'unavailable', level: 0, warning: false });
    expect(microphone.getAudioTracks()[0]?.stop).not.toHaveBeenCalled();
    observer.dispose();
    vi.useRealTimers();
  });

  it('keeps track ending advisory after activity and gives intentional disable precedence', () => {
    const observation = createObservation();
    observation.observer.setSource(observation.stream);
    observation.observer.setPhase('recording');
    observation.setAmplitude(0.1);
    observation.tick(3);
    Object.defineProperty(observation.stream.getAudioTracks()[0], 'readyState', { value: 'ended' });
    observation.tick(81);
    expect(observation.observer.current.warning).toBe(true);
    observation.observer.setEnabled(false);
    expect(observation.observer.current).toEqual({ status: 'disabled', level: 0, warning: false });
    observation.observer.dispose();
  });

  it('warns when an established microphone source becomes muted and clears on recovered signal', () => {
    const observation = createObservation();
    const track = observation.stream.getAudioTracks()[0]!;
    let muted = false;
    Object.defineProperty(track, 'muted', { get: () => muted });
    observation.observer.setSource(observation.stream);
    observation.observer.setPhase('recording');
    observation.setAmplitude(0.1);
    observation.tick(3);

    muted = true;
    observation.tick(81);
    expect(observation.observer.current).toEqual({ status: 'ready', level: 0, warning: true });

    muted = false;
    observation.tick();
    expect(observation.observer.current.warning).toBe(false);
    expect(observation.observer.current.level).toBeGreaterThan(0);

    muted = true;
    observation.observer.setEnabled(false);
    observation.tick(100);
    expect(observation.observer.current).toEqual({ status: 'disabled', level: 0, warning: false });
    observation.observer.dispose();
  });

  it('keeps a microphone source that starts muted unarmed', () => {
    const observation = createObservation();
    Object.defineProperty(observation.stream.getAudioTracks()[0], 'muted', { value: true });
    observation.setAmplitude(0.1);
    observation.observer.setSource(observation.stream);
    observation.observer.setPhase('recording');
    observation.tick(100);

    expect(observation.observer.current).toEqual({ status: 'ready', level: 0, warning: false });
    observation.observer.dispose();
  });
});
