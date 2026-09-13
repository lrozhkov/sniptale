// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createNarrationPlayback } from './narration-playback';
function fixture() {
  const audio = document.createElement('audio');
  audio.src = 'blob:voice';
  let paused = true;
  vi.spyOn(audio, 'readyState', 'get').mockReturnValue(2);
  vi.spyOn(audio, 'paused', 'get').mockImplementation(() => paused);
  vi.spyOn(audio, 'pause').mockImplementation(() => {
    paused = true;
    audio.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(audio, 'load').mockImplementation(() => {});
  const play = vi.spyOn(audio, 'play').mockImplementation(async () => {
    paused = false;
    audio.dispatchEvent(new Event('playing'));
  });
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    createGain: () => gain,
    createMediaElementSource: vi.fn(() => source),
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        return context;
      }
    }
  );
  let frame: FrameRequestCallback | null = null;
  vi.stubGlobal('requestAnimationFrame', (next: FrameRequestCallback) => {
    frame = next;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frame = null;
  });
  const life = new AbortController();
  const changed = vi.fn();
  const narration = {
    assetId: 'voice',
    duration: 5,
    trimStart: 1,
    trimEnd: 3,
    gain: 1,
    transcript: '',
  };
  const owner = createNarrationPlayback(audio, narration, changed, life.signal);
  return {
    owner,
    life,
    audio,
    gain,
    source,
    context,
    changed,
    play,
    narration,
    tick: () => {
      const next = frame;
      frame = null;
      next?.(0);
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('plays the selected trim at authored gain and stops exactly at its end', async () => {
  const f = fixture();
  f.owner.update({ ...f.narration, gain: 1.5 });
  await f.owner.toggle();
  expect(f.audio.currentTime).toBe(1);
  expect(f.gain.gain.value).toBe(1.5);
  f.audio.currentTime = 3.1;
  f.tick();
  expect(f.audio.currentTime).toBe(3);
  expect(f.audio.paused).toBe(true);
  f.owner.seek(-10);
  expect(f.audio.currentTime).toBe(1);
  f.owner.seek(99);
  expect(f.audio.currentTime).toBe(3);
  f.owner.update({ ...f.narration, trimStart: 0, trimEnd: 2, gain: 2 });
  expect(f.audio.currentTime).toBe(0);
  expect(f.gain.gain.value).toBe(2);
  f.life.abort();
  expect(f.source.disconnect).toHaveBeenCalledOnce();
  expect(f.gain.disconnect).toHaveBeenCalledOnce();
  expect(f.context.close).toHaveBeenCalledOnce();
  expect(f.audio.hasAttribute('src')).toBe(false);
});
it('keeps play failure recoverable and pauses when the document becomes hidden', async () => {
  const f = fixture();
  f.play.mockRejectedValueOnce(new Error('blocked'));
  await f.owner.toggle();
  expect(f.changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ failed: true, playing: false })
  );
  await f.owner.toggle();
  expect(f.changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ failed: false, playing: true })
  );
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(f.audio.paused).toBe(true);
  f.life.abort();
});
it('cannot start an old source after a late context resume', async () => {
  const f = fixture();
  let resume!: () => void;
  f.context.resume.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resume = resolve;
      })
  );
  const pending = f.owner.toggle();
  f.life.abort();
  resume();
  await pending;
  expect(f.play).not.toHaveBeenCalled();
});
it('stops late native play completion after disposal without publishing stale state', async () => {
  const f = fixture();
  let finish!: () => void;
  f.play.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const pending = f.owner.toggle();
  await Promise.resolve();
  f.life.abort();
  const count = f.changed.mock.calls.length;
  finish();
  await pending;
  expect(f.audio.paused).toBe(true);
  expect(f.changed).toHaveBeenCalledTimes(count);
});
