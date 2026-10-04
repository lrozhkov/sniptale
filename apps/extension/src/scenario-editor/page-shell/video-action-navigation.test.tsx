// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LibraryMediaPlayer } from '../../composition/library-preview/player';
import { createTranslator } from '../../platform/i18n';
import { GuideVideoActionNavigation, GuideVideoActionOverlay } from './video-action-navigation';
import type { GuideVideoAction } from '@sniptale/runtime-contracts/scenario/types/guide';
const action: GuideVideoAction = {
  id: 'click',
  kind: 'CLICK',
  time: 1,
  duration: 0.5,
  label: '',
  point: { x: 0.25, y: 0.5 },
  target: null,
};
let host: HTMLDivElement;
let root: Root;
const hover = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
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
async function mount(
  actions: GuideVideoAction[] = [action, { ...action, id: 'key', kind: 'KEY', time: 2 }]
) {
  await act(async () =>
    root.render(
      <LibraryMediaPlayer
        src="blob:video"
        filename="video"
        renderTimeline={(playback) => (
          <GuideVideoActionNavigation
            playback={playback}
            actions={actions}
            onHover={hover}
            t={createTranslator('en')}
          />
        )}
        renderOverlay={(playback) => (
          <GuideVideoActionOverlay playback={playback} action={action} />
        )}
      >
        <span>Loading</span>
      </LibraryMediaPlayer>
    )
  );
  const video = host.querySelector('video')!;
  Object.defineProperties(video, {
    error: { value: null },
    duration: { value: 5 },
    readyState: { value: 2 },
    videoWidth: { value: 200 },
    videoHeight: { value: 100 },
  });
  await act(async () => video.dispatchEvent(new Event('loadeddata', { bubbles: true })));
  return video;
}
async function click(title: string) {
  await act(async () => host.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!.click());
}
it('navigates click/key actions, highlights hover and scales the source ruler', async () => {
  const video = await mount();
  await click('1.00 · Click');
  expect(video.currentTime).toBe(1);
  await click('2.00 · Keystroke');
  expect(video.currentTime).toBe(2);
  const button = host.querySelector<HTMLButtonElement>('button[title="1.00 · Click"]')!;
  await act(async () => {
    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    button.focus();
  });
  expect(hover).toHaveBeenCalledWith(action);
  await act(async () => {
    button.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    button.blur();
  });
  expect(hover).toHaveBeenCalledWith(null);
  await click('Zoom in timeline');
  expect(host.querySelector<HTMLElement>('[role="slider"]')!.style.width).toBe('200%');
  await click('Zoom out timeline');
  expect(host.querySelector<HTMLElement>('[role="slider"]')!.style.width).toBe('100%');
});
it('seeks with keyboard and pointer capture without changing the recording', async () => {
  const video = await mount();
  const slider = host.querySelector<HTMLElement>('[role="slider"]')!;
  for (const key of ['End', 'ArrowLeft', 'ArrowRight', 'Home', 'a'])
    await act(async () =>
      slider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    );
  expect(video.currentTime).toBe(0);
  slider.setPointerCapture = vi.fn();
  slider.hasPointerCapture = () => true;
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 30));
  await act(async () =>
    slider.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 40, bubbles: true }))
  );
  expect(video.currentTime).toBe(2);
  await act(async () =>
    slider.dispatchEvent(new MouseEvent('pointermove', { clientX: 80, bubbles: true }))
  );
  expect(video.currentTime).toBe(4);
});
it('keeps source navigation available when there are no recorded actions', async () => {
  await mount([]);
  expect(host.textContent).toContain('No recorded clicks or keystrokes');
  expect(host.querySelector('[role="slider"]')).not.toBeNull();
});
it('previews source time without seeking and clears stale hover after zoom or leaving', async () => {
  const video = await mount();
  await click('1.00 · Click');
  const slider = host.querySelector<HTMLElement>('[role="slider"]')!;
  slider.hasPointerCapture = () => false;
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue(new DOMRect(-100, 0, 200, 30));
  await act(async () =>
    slider.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, bubbles: true }))
  );
  const guide = host.querySelector<HTMLElement>('.guide-video-hover-guide')!;
  expect(guide.textContent).toBe('3.75');
  expect(guide.style.left).toBe('75%');
  expect(video.currentTime).toBe(1);
  expect(host.querySelector<HTMLElement>('.guide-video-playhead')!.style.left).toBe('20%');
  await click('Zoom in timeline');
  expect(host.querySelector('.guide-video-hover-guide')).toBeNull();
  await act(async () =>
    slider.dispatchEvent(new MouseEvent('pointermove', { clientX: 0, bubbles: true }))
  );
  expect(host.querySelector('.guide-video-hover-guide')!.textContent).toBe('2.50');
  await act(async () => slider.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })));
  expect(host.querySelector('.guide-video-hover-guide')).toBeNull();
});
it('clamps captured seeking on a scrolled zoomed ruler and stops seeking after release', async () => {
  const video = await mount();
  await click('Zoom in timeline');
  const slider = host.querySelector<HTMLElement>('[role="slider"]')!;
  let captured = false;
  slider.setPointerCapture = vi.fn(() => {
    captured = true;
  });
  slider.hasPointerCapture = () => captured;
  slider.releasePointerCapture = vi.fn(() => {
    captured = false;
  });
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue(new DOMRect(-100, 0, 200, 30));
  const pointer = async (type: string, clientX: number) => {
    await act(async () =>
      slider.dispatchEvent(new MouseEvent(type, { button: 0, clientX, bubbles: true }))
    );
  };
  await pointer('pointerdown', 0);
  expect(video.currentTime).toBe(2.5);
  await pointer('pointermove', 200);
  expect(video.currentTime).toBe(5);
  await pointer('pointermove', -200);
  expect(video.currentTime).toBe(0);
  await pointer('pointerup', -200);
  expect(slider.releasePointerCapture).toHaveBeenCalled();
  await pointer('pointermove', 0);
  expect(video.currentTime).toBe(0);
  expect(host.querySelector('.guide-video-hover-guide')!.textContent).toBe('2.50');
  await pointer('pointercancel', 0);
  expect(host.querySelector('.guide-video-hover-guide')).toBeNull();
});
