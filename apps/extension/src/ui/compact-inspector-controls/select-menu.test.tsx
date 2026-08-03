// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CompactSelectMenu } from './select-menu';

it('contains wheel input inside the compact select menu', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const portalTarget = document.createElement('div');
  const container = document.createElement('div');
  document.body.append(container, portalTarget);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CompactSelectMenu
        menuId="menu-id"
        menuRef={{ current: null }}
        onOptionKeyDown={() => undefined}
        onSelect={() => undefined}
        optionRefs={{ current: [] }}
        options={[{ label: 'One', value: 'one' }]}
        ownerId="owner-id"
        portalTarget={portalTarget}
        style={{}}
        theme={null}
        value="one"
      />
    );
  });
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 });

  portalTarget.querySelector('[role="listbox"]')?.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
  act(() => root.unmount());
  container.remove();
  portalTarget.remove();
  vi.unstubAllGlobals();
});
