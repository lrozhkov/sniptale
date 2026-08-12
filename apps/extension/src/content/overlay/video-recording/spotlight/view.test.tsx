// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { VideoRecordingSpotlight } from './view';

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

it('does not subscribe to page pointer events while every effect is disabled', () => {
  const addEventListener = vi.spyOn(document, 'addEventListener');
  const host = document.createElement('div');
  root = createRoot(host);
  act(() =>
    root?.render(
      <VideoRecordingSpotlight
        cursorHaloEnabled={false}
        cursorDimmingEnabled={false}
        clickAnimationEnabled={false}
      />
    )
  );

  expect(addEventListener).not.toHaveBeenCalledWith('pointermove', expect.any(Function), true);
  addEventListener.mockRestore();
});

it('renders independently selected pointer effects without delaying the page event', () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <VideoRecordingSpotlight
        cursorHaloEnabled={false}
        cursorDimmingEnabled
        clickAnimationEnabled
      />
    )
  );

  let pageClickObserved = false;
  document.addEventListener(
    'click',
    () => {
      pageClickObserved = true;
    },
    { once: true }
  );
  act(() => {
    document.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 80, clientY: 45 }));
  });

  const overlay = host.querySelector<HTMLElement>('[data-ui="content.video-recording.spotlight"]');
  expect(pageClickObserved).toBe(true);
  expect(overlay?.style.pointerEvents).toBe('none');
  expect(host.querySelector('[data-ui="content.video-recording.spotlight-halo"]')).toBeNull();
  expect(
    host.querySelector('[data-ui="content.video-recording.spotlight-dimming"]')
  ).not.toBeNull();
  expect(
    host.querySelector('[data-ui="content.video-recording.spotlight-click"]')?.getAttribute('style')
  ).toContain('sniptale-recording-click-ripple 420ms');
});
