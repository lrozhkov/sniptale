// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shouldKeepOpenMock: vi.fn(() => false),
  updateLayoutMock: vi.fn(),
}));

vi.mock('./layout', () => ({
  shouldKeepCompactPopoverOpen: mocks.shouldKeepOpenMock,
  updateCompactPopoverLayout: mocks.updateLayoutMock,
}));

import { createCompactToolbarEffectHandlers } from './effects.handlers';

beforeEach(() => {
  vi.clearAllMocks();
});

it('updates layout and closes only when the popover should not stay open', () => {
  const setCollapsedCommandId = vi.fn();
  const setCollapsedPopoverStyle = vi.fn();
  const collapsedCommandButtonRefs = { current: {} };
  const collapsedPopoverRef = { current: null };

  const handlers = createCompactToolbarEffectHandlers({
    commandId: 'command-id',
    collapsedCommandButtonRefs,
    collapsedPopoverRef,
    setCollapsedCommandId,
    setCollapsedPopoverStyle,
  });

  handlers.updateLayout();
  expect(mocks.updateLayoutMock).toHaveBeenCalledWith(
    'command-id',
    collapsedCommandButtonRefs,
    collapsedPopoverRef,
    setCollapsedPopoverStyle
  );

  handlers.handleClickOutside(new MouseEvent('click'));
  expect(mocks.shouldKeepOpenMock).toHaveBeenCalledWith(
    expect.any(MouseEvent),
    'command-id',
    collapsedCommandButtonRefs,
    collapsedPopoverRef
  );
  expect(setCollapsedCommandId).toHaveBeenCalledWith(null);

  mocks.shouldKeepOpenMock.mockReturnValueOnce(true);
  handlers.handleClickOutside(new MouseEvent('click'));
  expect(setCollapsedCommandId).toHaveBeenCalledTimes(1);

  handlers.handleEscape(new KeyboardEvent('keydown', { key: 'Enter' }));
  expect(setCollapsedCommandId).toHaveBeenCalledTimes(1);

  handlers.handleEscape(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(setCollapsedCommandId).toHaveBeenCalledTimes(2);
});
