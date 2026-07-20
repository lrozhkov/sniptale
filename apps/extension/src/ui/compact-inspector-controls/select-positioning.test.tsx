// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, expect, it } from 'vitest';

import { CompactSelect } from './index';
import {
  THEME_OPTIONS,
  cleanupSelectRoot,
  getContainer,
  getTrigger,
  nextFrame,
  render,
} from './select.interactions.test-support.tsx';

afterEach(cleanupSelectRoot);

it('keeps the portaled menu interactive and anchored to owning scroll parents', async () => {
  let anchorTop = 44;
  render(
    <div data-testid="scroll-parent">
      <CompactSelect
        aria-label="Theme"
        value="dark"
        onChange={() => undefined}
        options={THEME_OPTIONS}
      />
    </div>
  );
  const scroller = getContainer().querySelector<HTMLElement>('[data-testid="scroll-parent"]')!;
  getTrigger().getBoundingClientRect = () =>
    ({
      bottom: anchorTop + 40,
      height: 40,
      left: 48,
      right: 208,
      top: anchorTop,
      width: 160,
      x: 48,
      y: anchorTop,
      toJSON: () => undefined,
    }) as DOMRect;

  await act(async () => {
    getTrigger().click();
    await nextFrame();
  });
  const menu = document.body.querySelector<HTMLElement>('[role="listbox"]')!;
  expect(menu.style.pointerEvents).toBe('auto');
  expect(menu.style.top).toBe('89px');

  anchorTop = 96;
  act(() => {
    scroller.dispatchEvent(new Event('scroll'));
  });
  expect(menu.style.top).toBe('141px');
});
