// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { VideoRecordingSpotlight } from './view';

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

it('renders a pointer-transparent halo and click animation without delaying the page event', () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<VideoRecordingSpotlight active />));

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
  expect(overlay?.lastElementChild?.getAttribute('style')).toContain('300ms');
});
