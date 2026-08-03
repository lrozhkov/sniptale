// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ProductDropdownMenu } from './index';

it('contains wheel input while preserving a consumer wheel callback', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const onWheel = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ProductDropdownMenu onWheel={onWheel}>Menu</ProductDropdownMenu>);
  });
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 });

  container.querySelector('.sniptale-dropdown-menu')?.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
  expect(onWheel).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
