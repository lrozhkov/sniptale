/* eslint-disable max-lines-per-function */
// @vitest-environment jsdom

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompactToolbarEffectHandlers } from './effects.handlers';
import { registerCompactToolbarEffectListeners } from './listeners';
import { shouldKeepCompactPopoverOpen, updateCompactPopoverLayout } from './layout';
import { ensureCollapsedCommandState } from './state';

describe('compact toolbar unit seams', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('updates layout and keeps popovers open only for owned/floating targets', () => {
    const trigger = document.createElement('button');
    const popover = document.createElement('div');
    const outside = document.createElement('div');
    document.body.append(trigger, popover, outside);

    Object.defineProperty(trigger, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ right: 100, top: 20, width: 20, height: 10 }),
    });
    Object.defineProperty(popover, 'offsetHeight', { configurable: true, value: 80 });

    const refs = { current: { command: trigger } } as React.MutableRefObject<
      Record<string, HTMLButtonElement | null>
    >;
    const popoverRef = { current: popover } as React.RefObject<HTMLDivElement>;
    const setStyle = vi.fn();

    updateCompactPopoverLayout('command', refs, popoverRef, setStyle);

    expect(setStyle).toHaveBeenCalledWith(
      expect.objectContaining({ position: 'fixed', width: 336, zIndex: 90 })
    );
    expect(
      shouldKeepCompactPopoverOpen(
        new MouseEvent('mousedown', { bubbles: true }),
        'command',
        refs,
        popoverRef
      )
    ).toBe(false);

    const onTrigger = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(onTrigger, 'target', { configurable: true, value: trigger });
    expect(shouldKeepCompactPopoverOpen(onTrigger, 'command', refs, popoverRef)).toBe(true);

    const floatingRoot = document.createElement('div');
    floatingRoot.dataset['floatingUiRoot'] = 'true';
    const floatingChild = document.createElement('div');
    floatingRoot.appendChild(floatingChild);
    document.body.appendChild(floatingRoot);
    const floatingEvent = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(floatingEvent, 'target', { configurable: true, value: floatingChild });
    expect(shouldKeepCompactPopoverOpen(floatingEvent, 'command', refs, popoverRef)).toBe(true);
  });

  it('creates handlers, registers listeners, and clears collapsed command state', () => {
    const trigger = document.createElement('button');
    const popover = document.createElement('div');
    const refs = { current: { command: trigger } } as React.MutableRefObject<
      Record<string, HTMLButtonElement | null>
    >;
    const popoverRef = { current: popover } as React.RefObject<HTMLDivElement>;
    const setCollapsedCommandId = vi.fn();
    const setStyle = vi.fn();

    const handlers = createCompactToolbarEffectHandlers({
      collapsedCommandButtonRefs: refs,
      collapsedPopoverRef: popoverRef,
      commandId: 'command',
      setCollapsedCommandId,
      setCollapsedPopoverStyle: setStyle,
    });

    handlers.handleEscape(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(setCollapsedCommandId).not.toHaveBeenCalled();

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    handlers.handleEscape(escapeEvent);
    expect(setCollapsedCommandId).toHaveBeenCalledWith(null);

    const insideEvent = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(insideEvent, 'target', { configurable: true, value: trigger });
    handlers.handleClickOutside(insideEvent);
    expect(setCollapsedCommandId).toHaveBeenCalledTimes(1);

    const outsideEvent = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(outsideEvent, 'target', { configurable: true, value: document.body });
    handlers.handleClickOutside(outsideEvent);
    expect(setCollapsedCommandId).toHaveBeenCalledTimes(2);

    const addDocumentListener = vi.spyOn(document, 'addEventListener');
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const addWindowListener = vi.spyOn(window, 'addEventListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const cleanup = registerCompactToolbarEffectListeners(
      handlers.updateLayout,
      handlers.handleClickOutside,
      handlers.handleEscape
    );
    cleanup();

    expect(addDocumentListener).toHaveBeenCalled();
    expect(removeDocumentListener).toHaveBeenCalled();
    expect(addWindowListener).toHaveBeenCalled();
    expect(removeWindowListener).toHaveBeenCalled();

    ensureCollapsedCommandState({
      activeCollapsedCommand: undefined,
      collapsed: false,
      collapsedCommandId: 'command',
      setCollapsedCommandId,
    });
    ensureCollapsedCommandState({
      activeCollapsedCommand: undefined,
      collapsed: true,
      collapsedCommandId: 'command',
      setCollapsedCommandId,
    });

    expect(setCollapsedCommandId).toHaveBeenCalledTimes(4);
  });
});
