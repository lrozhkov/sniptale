// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createToolbarMenuItemClickHandler,
  preventToolbarMenuClick,
  resolveToolbarDropdownState,
  ToolbarMenuDropdown,
} from './dropdown.shared';

function createButtonRef(rectOverrides?: Partial<DOMRect>) {
  const button = document.createElement('button');
  document.body.appendChild(button);
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
    bottom: 80,
    height: 36,
    left: 100,
    right: 136,
    top: 44,
    width: 36,
    x: 100,
    y: 44,
    toJSON: () => ({}),
    ...rectOverrides,
  });

  return {
    current: button,
  } as React.RefObject<HTMLButtonElement | null>;
}

describe('toolbar capture dropdown shared helpers', () => {
  it('resolves vertical dropdown placement beside the toolbar anchor', () => {
    vi.stubGlobal('innerWidth', 1280);

    const state = resolveToolbarDropdownState({
      anchorRef: createButtonRef(),
      displayMode: 'vertical',
      getMenuPosition: () => 'down',
      menuHeight: 320,
      menuWidth: 280,
      viewportRightInset: 0,
    });

    expect(state.menuPlacement).toBe('side');
    expect(state.placement).toBe('down');
    expect(state.style?.left).toBe('calc(100% + 10px)');
  });

  it('renders the menu dropdown shell and prevents delegated item clicks', () => {
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();
    const onSelect = vi.fn();

    createToolbarMenuItemClickHandler(onSelect)({
      stopPropagation,
      preventDefault,
    } as unknown as React.MouseEvent);
    preventToolbarMenuClick({
      stopPropagation,
      preventDefault,
    } as unknown as React.MouseEvent);

    const markup = renderToStaticMarkup(
      <ToolbarMenuDropdown
        dataUi="content.toolbar.capture-action-menu"
        menuRef={{ current: null } as React.RefObject<HTMLDivElement | null>}
      >
        <span>Menu</span>
      </ToolbarMenuDropdown>
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(2);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(markup).toContain('content.toolbar.capture-action-menu');
    expect(markup).toContain('Menu');
  });
});
