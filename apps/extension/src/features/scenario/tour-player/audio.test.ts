// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createTourAudio } from './audio.js';
import { createTourImageSlide } from '../project/factories';
function fixture() {
  let tick = () => {};
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    tick = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const signal = new AbortController();
  const failed = vi.fn();
  const root = document.createElement('div');
  const changed = vi.fn();
  const player = createTourAudio(root, signal.signal, failed, changed);
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
  vi.spyOn(media, 'remove');
  const slide = createTourImageSlide();
  const narration = {
    assetId: 'voice',
    duration: 8,
    trimStart: 2,
    trimEnd: 4,
    gain: 0.5,
    transcript: '',
  };
  slide.narration = narration;
  slide.annotations = [
    {
      id: 'note',
      text: 'Note',
      anchor: null,
      appearance: null,
      narration: { ...narration, trigger: 'activation' },
    },
  ];
  player.show(slide, [{ id: 'voice', src: 'data:audio/wav;base64,AA==' }]);
  return { player, media, slide, signal, failed, changed, tick: () => tick() };
}
afterEach(() => vi.unstubAllGlobals());
it('synchronizes entry trim/gain to elapsed time, pauses and releases on navigation', async () => {
  const s = fixture();
  s.player.sync(0.5, true);
  await Promise.resolve();
  expect(s.media.currentTime).toBe(2.5);
  expect(s.media.volume).toBe(0.5);
  expect(s.media.play).toHaveBeenCalledOnce();
  s.player.sync(1, false);
  expect(s.media.paused).toBe(true);
  s.player.sync(3, true);
  expect(s.media.getAttribute('src')).toBeNull();
  s.player.show(s.slide, []);
  s.player.sync(0, true);
  expect(s.failed).toHaveBeenCalledWith('audio-error');
  s.signal.abort();
  expect(s.media.remove).toHaveBeenCalledOnce();
});
it('activation uses its own attachment and trim, ignores timeline ticks, and stops at trim end', async () => {
  const s = fixture();
  s.player.activate('note');
  await Promise.resolve();
  expect(s.media.currentTime).toBe(2);
  s.player.sync(1, false);
  expect(s.media.currentTime).toBe(2);
  s.media.currentTime = 4;
  s.tick();
  expect(s.media.paused).toBe(true);
  s.player.stop();
  expect(s.media.getAttribute('src')).toBeNull();
  s.signal.abort();
});
it('reports autoplay denial without unhandled rejection and allows a later retry', async () => {
  const s = fixture();
  vi.mocked(s.media.play).mockRejectedValueOnce(new DOMException('gesture', 'NotAllowedError'));
  s.player.sync(0, true);
  await Promise.resolve();
  await Promise.resolve();
  expect(s.failed).toHaveBeenCalledWith('blocked');
  s.player.sync(0, true);
  await Promise.resolve();
  expect(s.media.play).toHaveBeenCalledTimes(2);
  s.signal.abort();
});

it('replays entry narration locally and retains position across pause and resume', async () => {
  const s = fixture();
  s.player.replay(null);
  await Promise.resolve();
  expect(s.media.currentTime).toBe(2);
  expect(s.player.snapshot.status).toBe('playing');
  s.media.currentTime = 2.75;
  s.player.pause();
  s.player.sync(0, false);
  expect(s.media.currentTime).toBe(2.75);
  expect(s.player.snapshot.canResume).toBe(true);
  s.player.resume();
  await Promise.resolve();
  expect(s.media.currentTime).toBe(2.75);
  s.media.currentTime = 4;
  s.tick();
  expect(s.player.snapshot.status).toBe('ended');
  s.player.resume();
  expect(s.media.paused).toBe(true);
  s.player.replay(null);
  await Promise.resolve();
  expect(s.media.currentTime).toBe(2);
  s.signal.abort();
});

it('changes viewer volume and mute without changing authored gain or restarting', async () => {
  const s = fixture();
  s.player.replay('note');
  await Promise.resolve();
  s.player.setVolume(0.4);
  expect(s.media.volume).toBeCloseTo(0.2);
  s.player.setMuted(true);
  expect(s.media.volume).toBe(0);
  expect(s.player.snapshot.audible).toBe(false);
  s.player.setMuted(false);
  expect(s.media.volume).toBeCloseTo(0.2);
  expect(s.player.snapshot.audible).toBe(true);
  expect(s.slide.narration?.gain).toBe(0.5);
  expect(s.media.play).toHaveBeenCalledOnce();
  s.signal.abort();
});

function deferredPlay(media: HTMLAudioElement) {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const result = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  const original = vi.mocked(media.play).getMockImplementation()!;
  vi.mocked(media.play).mockImplementationOnce(async () => {
    await result;
    await original.call(media);
  });
  return { resolve, reject };
}
async function settle() {
  for (let index = 0; index < 6; index++) await Promise.resolve();
}

it.each(['pause', 'stop', 'dispose'] as const)(
  'silences a late successful play after %s',
  async (command) => {
    const s = fixture();
    const pending = deferredPlay(s.media);
    s.player.replay('note');
    expect(s.player.snapshot.status).toBe('loading');
    if (command === 'dispose') s.signal.abort();
    else s.player[command]();
    const notifications = s.changed.mock.calls.length;
    pending.resolve();
    await settle();
    expect(s.media.paused).toBe(true);
    expect(s.player.snapshot.audible).toBe(false);
    expect(s.changed).toHaveBeenCalledTimes(notifications);
    if (command !== 'pause') expect(s.media.getAttribute('src')).toBeNull();
    s.signal.abort();
  }
);

it.each(['resolve', 'reject'] as const)(
  'does not let old play %s override a newer narration command',
  async (completion) => {
    const s = fixture();
    const pending = deferredPlay(s.media);
    s.player.replay('note');
    s.player.replay(null);
    await settle();
    if (completion === 'resolve') pending.resolve();
    else pending.reject(new DOMException('old', 'NotAllowedError'));
    await settle();
    expect(s.player.snapshot).toMatchObject({ objectId: null, status: 'playing', audible: true });
    expect(s.media.paused).toBe(false);
    expect(s.failed).not.toHaveBeenCalled();
    s.signal.abort();
  }
);

it('keeps pending resume singular and exposes actual waiting, playback, end and error transitions', async () => {
  const s = fixture();
  s.player.replay('note');
  await settle();
  s.player.pause();
  const pending = deferredPlay(s.media);
  s.player.resume();
  s.player.resume();
  expect(s.media.play).toHaveBeenCalledTimes(2);
  pending.resolve();
  await settle();
  s.media.dispatchEvent(new Event('waiting'));
  expect(s.player.snapshot).toMatchObject({ status: 'loading', audible: false });
  s.media.dispatchEvent(new Event('playing'));
  expect(s.player.snapshot).toMatchObject({ status: 'playing', audible: true });
  s.media.dispatchEvent(new Event('ended'));
  expect(s.player.snapshot.status).toBe('ended');
  s.player.replay('note');
  await settle();
  s.media.dispatchEvent(new Event('error'));
  expect(s.player.snapshot).toMatchObject({ status: 'error', audible: false });
  const count = vi.mocked(s.media.play).mock.calls.length;
  s.player.sync(0, true);
  expect(s.media.play).toHaveBeenCalledTimes(count);
  s.signal.abort();
});

it('keeps gesture denial local and retries explicitly without changing the retained position', async () => {
  const s = fixture();
  vi.mocked(s.media.play).mockRejectedValueOnce(new DOMException('gesture', 'NotAllowedError'));
  s.player.replay(null);
  await settle();
  expect(s.player.snapshot).toMatchObject({ status: 'blocked', canResume: true, audible: false });
  s.player.sync(1, true);
  expect(s.media.play).toHaveBeenCalledOnce();
  s.player.resume();
  await settle();
  expect(s.player.snapshot.status).toBe('playing');
  expect(s.media.currentTime).toBe(2);
  s.signal.abort();
});

function gainGraph() {
  const node = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    state: 'running',
    destination: {},
    createGain: vi.fn(() => node),
    createMediaElementSource: vi.fn(() => source),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const construct = vi.fn(function () {
    return context;
  });
  vi.stubGlobal('AudioContext', construct);
  return { node, source, context, construct };
}
it('composes amplified gain once, keeps the graph and viewer master across cues, then disconnects it', async () => {
  const graph = gainGraph();
  const s = fixture();
  s.slide.narration!.gain = 2;
  s.player.setVolume(0.4);
  s.player.replay(null);
  await settle();
  expect(s.media.volume * graph.node.gain.value).toBeCloseTo(0.8);
  s.player.setMuted(true);
  expect(s.media.volume * graph.node.gain.value).toBe(0);
  s.player.setVolume(0.7);
  s.player.setMuted(false);
  expect(s.media.volume * graph.node.gain.value).toBeCloseTo(1.4);
  s.player.replay('note');
  await settle();
  expect(s.media.volume * graph.node.gain.value).toBeCloseTo(0.35);
  expect(graph.construct).toHaveBeenCalledOnce();
  expect(graph.context.createMediaElementSource).toHaveBeenCalledOnce();
  expect(s.slide.narration?.gain).toBe(2);
  s.signal.abort();
  expect(graph.source.disconnect).toHaveBeenCalledOnce();
  expect(graph.node.disconnect).toHaveBeenCalledOnce();
  expect(graph.context.close).toHaveBeenCalledOnce();
  expect(s.media.getAttribute('src')).toBeNull();
});

it('bounds transient volume, preserves it across navigation, and ignores commands after disposal', async () => {
  const s = fixture();
  s.player.setVolume(-1);
  expect(s.player.snapshot.volume).toBe(0);
  s.player.setVolume(2);
  expect(s.player.snapshot.volume).toBe(1);
  s.player.setVolume(0.4);
  s.player.setVolume(Number.NaN);
  s.player.setVolume(Infinity);
  s.player.show(s.slide, [{ id: 'voice', src: 'data:audio/wav;base64,AA==' }]);
  expect(s.player.snapshot.volume).toBe(0.4);
  s.signal.abort();
  s.player.replay(null);
  s.player.resume();
  s.player.setVolume(1);
  expect(s.media.play).not.toHaveBeenCalled();
  expect(s.player.snapshot.volume).toBe(0.4);
});

it('never redirects an unknown target and clears old audio when its next attachment has no asset', async () => {
  const s = fixture();
  s.player.replay('missing');
  expect(s.media.play).not.toHaveBeenCalled();
  s.player.replay('note');
  await settle();
  s.slide.narration!.assetId = 'missing-asset';
  s.player.replay(null);
  expect(s.media.paused).toBe(true);
  expect(s.media.getAttribute('src')).toBeNull();
  expect(s.player.snapshot).toMatchObject({
    slideId: s.slide.id,
    objectId: null,
    status: 'error',
    canResume: false,
    audible: false,
  });
  expect(s.failed).toHaveBeenCalledWith('audio-error');
  s.signal.abort();
});

it('ignores obsolete pause events and removes listeners on disposal', async () => {
  const s = fixture();
  s.player.replay(null);
  await settle();
  s.media.dispatchEvent(new Event('pause'));
  expect(s.media.paused).toBe(false);
  expect(s.player.snapshot.status).toBe('playing');
  s.media.currentTime = 4;
  s.tick();
  s.player.pause();
  expect(s.player.snapshot).toMatchObject({ status: 'ended', canResume: false });
  s.signal.abort();
  const notifications = s.changed.mock.calls.length;
  for (const name of ['playing', 'waiting', 'pause', 'ended', 'error'])
    s.media.dispatchEvent(new Event(name));
  expect(s.changed).toHaveBeenCalledTimes(notifications);
  expect(s.failed).not.toHaveBeenCalled();
});
