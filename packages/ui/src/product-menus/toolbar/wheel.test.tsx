// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ProductToolbarMenu } from './index';

it('contains wheel input inside the toolbar menu', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ProductToolbarMenu title="Frame" compact placement="up" variant="viewport">
        Menu
      </ProductToolbarMenu>
    );
  });
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 });

  container.querySelector('.sniptale-toolbar-menu')?.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
