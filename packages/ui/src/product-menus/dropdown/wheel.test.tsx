// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ProductDropdownMenu } from './index';

it('contains wheel input while preserving a consumer wheel callback', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const calls: string[] = [];
  const onWheel = vi.fn(() => calls.push('wheel'));
  const onWheelCapture = vi.fn(() => calls.push('capture'));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ProductDropdownMenu onWheel={onWheel} onWheelCapture={onWheelCapture}>
        Menu
      </ProductDropdownMenu>
    );
  });
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 });

  container.querySelector('.sniptale-dropdown-menu')?.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
  expect(onWheelCapture).toHaveBeenCalledTimes(1);
  expect(onWheel).toHaveBeenCalledTimes(1);
  expect(calls).toEqual(['capture', 'wheel']);
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
