// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createTourAudio, createTourMusic } from './audio.js';
import { createTourImageSlide } from '../project/factories';

const controllers: AbortController[] = [];
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.abort());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  const signal = new AbortController();
  controllers.push(signal);
  const root = document.createElement('div');
  const changed = vi.fn();
  const master = { volume: 1, muted: false, audible: false };
  const graph = {
    gain: {
      value: 1,
      cancelAndHoldAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      setValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    currentTime: 10,
    state: 'running',
    destination: {},
    createGain: vi.fn(() => graph),
    createMediaElementSource: vi.fn(() => source),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const construct = vi.fn(function () {
    return context;
  });
  vi.stubGlobal('AudioContext', construct);
  const player = createTourMusic(root, signal.signal, () => master, changed);
  const media = root.querySelector('audio')!;
  let paused = true;
  Object.defineProperty(media, 'paused', { get: () => paused });
  vi.spyOn(media, 'play').mockImplementation(async () => {
    paused = false;
  });
  vi.spyOn(media, 'pause').mockImplementation(() => {
    paused = true;
  });
  vi.spyOn(media, 'load').mockImplementation(() => {});
  const binding = {
    assetId: 'music',
    duration: 20,
    volume: 0.3,
    loop: true,
    ducking: { enabled: true, level: 0.25 },
  };
  const assets = [{ id: 'music', src: 'data:audio/wav;base64,AA==' }];
  player.configure(binding, assets);
  return {
    player,
    media,
    binding,
    assets,
    master,
    graph,
    source,
    context,
    construct,
    signal,
    root,
    changed,
  };
}
async function settle() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
it('keeps one silent configured channel and retains position on slide refresh', async () => {
  const s = fixture();
  expect(s.media.play).not.toHaveBeenCalled();
  expect(s.player.snapshot.available).toBe(true);
  s.player.play();
  await settle();
  s.media.currentTime = 7;
  s.player.configure({ ...s.binding }, [...s.assets]);
  expect(s.media.currentTime).toBe(7);
  expect(s.media.play).toHaveBeenCalledOnce();
  expect(s.player.snapshot.status).toBe('playing');
  expect(s.root.querySelectorAll('audio')).toHaveLength(1);
});
it('composes author/master/mutes immediately and smoothly restores interrupted ducking', async () => {
  const s = fixture();
  s.player.play();
  await settle();
  s.master.volume = 0.4;
  s.master.audible = true;
  s.player.refreshMix();
  expect(s.media.volume).toBeCloseTo(0.12);
  expect(s.graph.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.25, 10.15);
  s.context.currentTime = 10.05;
  s.master.audible = false;
  s.player.refreshMix();
  expect(s.graph.gain.cancelAndHoldAtTime).toHaveBeenLastCalledWith(10.05);
  expect(s.graph.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 10.3);
  s.player.setMuted(true);
  expect(s.media.volume).toBe(0);
  s.player.setMuted(false);
  expect(s.media.volume).toBeCloseTo(0.12);
  expect(s.media.play).toHaveBeenCalledOnce();
});

function pendingPlay(media: HTMLAudioElement) {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  const original = vi.mocked(media.play).getMockImplementation()!;
  vi.mocked(media.play).mockImplementationOnce(async () => {
    await promise;
    await original.call(media);
  });
  return { resolve, reject };
}
it.each(['pause', 'remove', 'replace', 'dispose'] as const)(
  'silences late successful music after %s',
  async (command) => {
    const s = fixture();
    const pending = pendingPlay(s.media);
    s.player.play();
    await settle();
    if (command === 'pause') s.player.pause();
    if (command === 'remove') s.player.configure(null, []);
    if (command === 'replace')
      s.player.configure({ ...s.binding, assetId: 'new' }, [
        { id: 'new', src: 'data:audio/wav;base64,AQ==' },
      ]);
    if (command === 'dispose') s.signal.abort();
    const calls = s.changed.mock.calls.length;
    pending.resolve();
    await settle();
    expect(s.media.paused).toBe(true);
    expect(s.player.snapshot.status).not.toBe('playing');
    expect(s.changed).toHaveBeenCalledTimes(calls);
    if (command === 'remove' || command === 'dispose')
      expect(s.media.getAttribute('src')).toBeNull();
  }
);
it.each(['resolve', 'reject'] as const)(
  'ignores stale music %s after a new explicit play',
  async (completion) => {
    const s = fixture();
    const pending = pendingPlay(s.media);
    s.player.play();
    await settle();
    s.player.configure({ ...s.binding, assetId: 'new' }, [
      { id: 'new', src: 'data:audio/wav;base64,AQ==' },
    ]);
    s.player.play();
    await settle();
    if (completion === 'resolve') pending.resolve();
    else pending.reject(new DOMException('old', 'NotAllowedError'));
    await settle();
    expect(s.player.snapshot.status).toBe('playing');
    expect(s.media.paused).toBe(false);
  }
);
it('retries blocking explicitly and never restarts from refresh or mute', async () => {
  const s = fixture();
  vi.mocked(s.media.play).mockRejectedValueOnce(new DOMException('gesture', 'NotAllowedError'));
  s.player.play();
  await settle();
  expect(s.player.snapshot.status).toBe('blocked');
  s.player.refreshMix();
  s.player.setMuted(true);
  s.player.setMuted(false);
  s.player.configure({ ...s.binding }, s.assets);
  expect(s.media.play).toHaveBeenCalledOnce();
  s.player.play();
  await settle();
  expect(s.player.snapshot.status).toBe('playing');
  s.media.dispatchEvent(new Event('error'));
  expect(s.player.snapshot.status).toBe('error');
  s.player.play();
  await settle();
  expect(s.player.snapshot.status).toBe('playing');
});
it('preserves non-loop exhaustion across slides until the visit finishes', async () => {
  const s = fixture();
  s.player.configure({ ...s.binding, loop: false }, s.assets);
  s.player.play();
  await settle();
  s.media.currentTime = 20;
  Object.defineProperty(s.media, 'ended', { configurable: true, get: () => true });
  s.media.dispatchEvent(new Event('ended'));
  expect(s.player.snapshot).toMatchObject({ exhausted: true, status: 'ended' });
  s.player.configure({ ...s.binding, loop: false }, s.assets);
  s.player.play();
  expect(s.media.play).toHaveBeenCalledOnce();
  s.player.finish();
  Object.defineProperty(s.media, 'ended', { get: () => false });
  expect(s.media.currentTime).toBe(0);
  expect(s.player.snapshot.exhausted).toBe(false);
  s.player.play();
  await settle();
  expect(s.media.play).toHaveBeenCalledTimes(2);
});
it('keeps loop behavior native and ignores an obsolete ended event after replacement', async () => {
  const s = fixture();
  s.player.play();
  await settle();
  expect(s.media.loop).toBe(true);
  s.media.dispatchEvent(new Event('ended'));
  expect(s.player.snapshot.exhausted).toBe(false);
  s.player.configure({ ...s.binding, loop: false }, s.assets);
  s.media.dispatchEvent(new Event('ended'));
  expect(s.player.snapshot.exhausted).toBe(false);
});
it('reports bound missing assets, resets identity only on replacement, and keeps settings authored', async () => {
  const s = fixture();
  const authored = structuredClone(s.binding);
  s.player.play();
  await settle();
  s.media.currentTime = 5;
  s.player.configure({ ...s.binding, volume: 0.6, loop: false }, s.assets);
  expect(s.media.currentTime).toBe(5);
  expect(s.media.volume).toBe(0.6);
  expect(s.media.loop).toBe(false);
  s.player.setMuted(true);
  s.master.muted = true;
  s.player.refreshMix();
  s.player.setMuted(false);
  expect(s.media.volume).toBe(0);
  s.master.muted = false;
  s.player.refreshMix();
  expect(s.media.volume).toBe(0.6);
  expect(s.binding).toEqual(authored);
  s.player.configure({ ...s.binding, assetId: 'missing' }, []);
  expect(s.player.snapshot).toMatchObject({ available: true, status: 'error' });
  expect(s.media.getAttribute('src')).toBeNull();
  s.player.configure(null, []);
  expect(s.player.snapshot).toMatchObject({ available: false, status: 'idle' });
});
it('releases its graph, source and event effects and rejects commands after disposal', async () => {
  const s = fixture();
  s.player.play();
  await settle();
  s.signal.abort();
  expect(s.source.disconnect).toHaveBeenCalledOnce();
  expect(s.graph.disconnect).toHaveBeenCalledOnce();
  expect(s.context.close).toHaveBeenCalledOnce();
  expect(s.root.querySelector('audio')).toBeNull();
  const calls = s.changed.mock.calls.length;
  s.player.finish();
  s.player.play();
  s.player.configure(s.binding, s.assets);
  s.player.refreshMix();
  s.player.setMuted(true);
  for (const name of ['playing', 'waiting', 'ended', 'error'])
    s.media.dispatchEvent(new Event(name));
  expect(s.changed).toHaveBeenCalledTimes(calls);
  expect(s.media.getAttribute('src')).toBeNull();
  expect(s.media.play).toHaveBeenCalledOnce();
});

it('ducks and restores from real narration playback, pause, trim end and blocked retry', async () => {
  const s = fixture();
  let tick = () => {};
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    tick = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const narration = createTourAudio(s.root, s.signal.signal, vi.fn(), (snapshot) => {
    Object.assign(s.master, snapshot);
    s.player.refreshMix();
  });
  const voice = s.root.querySelector<HTMLAudioElement>('audio:not([data-tour-music])')!;
  let paused = true;
  Object.defineProperty(voice, 'paused', { get: () => paused });
  vi.spyOn(voice, 'pause').mockImplementation(() => {
    paused = true;
  });
  vi.spyOn(voice, 'load').mockImplementation(() => {});
  vi.spyOn(voice, 'play').mockImplementation(async () => {
    paused = false;
  });
  const slide = createTourImageSlide('spoken');
  slide.narration = {
    assetId: 'voice',
    duration: 4,
    trimStart: 1,
    trimEnd: 3,
    gain: 0.5,
    transcript: '',
  };
  narration.show(slide, [{ id: 'voice', src: 'data:audio/wav;base64,AQ==' }]);
  s.player.play();
  await settle();
  narration.replay(null);
  await settle();
  expect(narration.snapshot.audible).toBe(true);
  expect(s.graph.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.25, 10.15);
  narration.pause();
  expect(s.graph.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 10.25);
  narration.resume();
  await settle();
  expect(s.graph.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.25, 10.15);
  voice.currentTime = 3;
  tick();
  expect(narration.snapshot.status).toBe('ended');
  expect(s.graph.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 10.25);
  vi.mocked(voice.play).mockRejectedValueOnce(new DOMException('gesture', 'NotAllowedError'));
  narration.replay(null);
  await settle();
  expect(narration.snapshot.status).toBe('blocked');
  expect(s.graph.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 10.25);
  narration.resume();
  await settle();
  expect(s.graph.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.25, 10.15);
  expect(s.media.play).toHaveBeenCalledOnce();
});

it('does not play after disposal while audio context readiness is pending', async () => {
  const s = fixture();
  let ready!: () => void;
  vi.mocked(s.context.resume).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      ready = resolve;
    })
  );
  s.player.play();
  expect(s.player.snapshot.status).toBe('loading');
  s.signal.abort();
  ready();
  await settle();
  expect(s.media.play).not.toHaveBeenCalled();
  expect(s.context.close).toHaveBeenCalledOnce();
  expect(s.media.getAttribute('src')).toBeNull();
});

it('reuses one gain graph and does not reschedule an unchanged duck target', async () => {
  const s = fixture();
  s.player.play();
  await settle();
  s.master.audible = true;
  s.player.refreshMix();
  const ramps = s.graph.gain.linearRampToValueAtTime.mock.calls.length;
  s.player.refreshMix();
  expect(s.graph.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(ramps);
  s.media.currentTime = 6;
  s.player.pause();
  s.player.play();
  await settle();
  expect(s.media.currentTime).toBe(6);
  expect(s.construct).toHaveBeenCalledOnce();
  expect(s.context.createMediaElementSource).toHaveBeenCalledOnce();
  s.player.configure({ ...s.binding, ducking: { enabled: false, level: 0.25 } }, s.assets);
  expect(s.graph.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 10.25);
});
