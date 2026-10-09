// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SpeechAudition, formatSpeechTime } from './speech-audition';

let host: HTMLDivElement;
let root: Root;
let pause: ReturnType<typeof vi.spyOn>;
let play: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function render(mainVideo?: HTMLVideoElement) {
  act(() =>
    root.render(
      <SpeechAudition
        originalUrl="blob:original"
        result={{ url: 'blob:result', duration: 1.3 }}
        interval={{ start: 12.375, end: 15.875 }}
        tempo={1.5}
        mainVideo={mainVideo}
      />
    )
  );
}
function toggle() {
  host.querySelector<HTMLButtonElement>('button')!.click();
}
it('seeks within native source bounds and uses a zero-based result in one player', async () => {
  render();
  const audio = host.querySelector('audio')!;
  act(() => audio.dispatchEvent(new Event('loadedmetadata')));
  expect(audio.currentTime).toBe(12.375);
  await act(async () => toggle());
  expect(audio.playbackRate).toBe(1.5);
  const seek = host.querySelector<HTMLInputElement>('input[type=range]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(seek, '1.2');
    seek.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(audio.currentTime).toBeCloseTo(13.575);
  audio.currentTime = 16;
  act(() => audio.dispatchEvent(new Event('timeupdate')));
  expect(audio.currentTime).toBe(15.875);
  act(() => host.querySelector<HTMLButtonElement>('[role=group] button:last-child')!.click());
  expect(host.querySelectorAll('audio')).toHaveLength(1);
  expect(audio.src).toBe('blob:result');
  act(() => audio.dispatchEvent(new Event('loadedmetadata')));
  expect(audio.currentTime).toBe(0);
  expect(seek.max).toBe('1.3');
});
it('stops the main video and cannot restart audition after a late play promise', async () => {
  const video = document.createElement('video');
  render(video);
  let resolve!: () => void;
  play.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      })
  );
  act(() => toggle());
  expect(pause.mock.contexts).toContain(video);
  act(() => video.dispatchEvent(new Event('play')));
  const count = pause.mock.calls.length;
  await act(async () => resolve());
  expect(pause.mock.calls.length).toBeGreaterThan(count);
  expect(host.querySelector('button')!.getAttribute('aria-busy')).toBe('false');
  expect(host.querySelector('button svg')).not.toBeNull();
});
it('reports playback rejection and releases audio on unmount', async () => {
  render();
  play.mockRejectedValueOnce(new Error('decode'));
  await act(async () => toggle());
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  const before = pause.mock.calls.length;
  act(() => root.render(null));
  expect(pause.mock.calls.length).toBeGreaterThan(before);
});
it('formats carry boundaries without changing authored timestamps', () => {
  expect(formatSpeechTime(59.999)).toBe('01:00.00');
  expect(formatSpeechTime(3600.5)).toBe('1:00:00.50');
});
