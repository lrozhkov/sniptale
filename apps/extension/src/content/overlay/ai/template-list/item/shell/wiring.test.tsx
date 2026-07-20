import { describe, expect, it, vi } from 'vitest';

const { blurPromptIfFocusedMock } = vi.hoisted(() => ({
  blurPromptIfFocusedMock: vi.fn(),
}));

vi.mock('../helpers', () => ({
  blurPromptIfFocused: blurPromptIfFocusedMock,
}));

import {
  createTemplateMenuToggleHandler,
  stopTemplateMenuEvent,
  updateTemplatePillRefs,
} from './wiring';

describe('template-list item shell wiring', () => {
  it('stops menu mouse-down propagation and blurs the prompt', () => {
    const stopPropagation = vi.fn();

    stopTemplateMenuEvent({ stopPropagation } as unknown as React.MouseEvent);

    expect(stopPropagation).toHaveBeenCalled();
    expect(blurPromptIfFocusedMock).toHaveBeenCalled();
  });

  it('toggles the open menu id based on the current open state', () => {
    const setOpenMenuId = vi.fn();
    const stopPropagation = vi.fn();

    createTemplateMenuToggleHandler({
      isMenuOpen: false,
      setOpenMenuId,
      templateId: 'template-1',
    })({ stopPropagation } as unknown as React.MouseEvent);

    expect(stopPropagation).toHaveBeenCalled();
    expect(setOpenMenuId).toHaveBeenCalledWith('template-1');
  });

  it('updates pill refs and menu ref for the active template', () => {
    const element = {} as HTMLDivElement;
    const state = {
      menuRef: { current: null },
      pillRefs: { current: new Map<string, HTMLDivElement>() },
    };

    updateTemplatePillRefs({
      element,
      isMenuOpen: true,
      state: state as never,
      templateId: 'template-1',
    });

    expect(state.pillRefs.current.get('template-1')).toBe(element);
    expect(state.menuRef.current).toBe(element);
  });
});
