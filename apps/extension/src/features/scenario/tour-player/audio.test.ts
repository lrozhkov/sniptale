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
  const player = createTourAudio(root, signal.signal, failed);
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
  return { player, media, slide, signal, failed, tick: () => tick() };
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
  expect(s.failed).toHaveBeenCalledWith('error');
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
