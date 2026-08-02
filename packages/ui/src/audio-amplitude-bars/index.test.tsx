// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AudioAmplitudeBars } from '.';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('renders bounded centered bars from real amplitude peaks', () => {
  act(() =>
    root.render(
      <AudioAmplitudeBars active={true} peaks={[Number.NaN, -1, 0.5, 2]} soundDetected={true} />
    )
  );

  const bars = [...container.querySelectorAll<HTMLElement>('[data-audio-peak]')];
  expect(bars).toHaveLength(4);
  expect(bars.map((bar) => bar.style.transform)).toEqual([
    'scaleY(0.1)',
    'scaleY(0.1)',
    'scaleY(0.5)',
    'scaleY(1)',
  ]);
  expect(bars[2]?.className).toContain('bg-[var(--sniptale-color-accent)]');
});
