// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createFrameSelectionEventHandlers } from './activation';

function frame(): FrameData {
  return { effectMode: 'border', height: 100, id: 'frame-1', width: 180, x: 100, y: 100 };
}

function createHandlers(
  selectedFrameId: string | null = null,
  activePopover: {
    frameId: string;
    kind: 'frame-settings' | 'step-badge' | 'callout-settings';
  } | null = null
) {
  const actions = {
    clearSelection: vi.fn(),
    hoverFrame: vi.fn(),
    selectFrame: vi.fn(),
  };
  return {
    actions,
    handlers: createFrameSelectionEventHandlers({
      framesRef: { current: [frame()] },
      hoveredFrameIdRef: { current: null },
      activePopoverRef: { current: activePopover },
      selectedFrameIdRef: { current: selectedFrameId },
      ...actions,
    }),
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('frame selection events', () => {
  it('selects and consumes a click on a concrete frame border', () => {
    const { actions, handlers } = createHandlers();
    const event = new MouseEvent('click', {
      cancelable: true,
      clientX: 101,
      clientY: 150,
    });

    handlers.click(event);

    expect(actions.selectFrame).toHaveBeenCalledWith('frame-1', { x: 1, y: 50 });
    expect(event.defaultPrevented).toBe(true);
  });

  it('clears a persistent selection on pointerdown in frame interior without consuming drawing', () => {
    const { actions, handlers } = createHandlers('frame-1');
    const event = new MouseEvent('pointerdown', {
      cancelable: true,
      clientX: 190,
      clientY: 150,
    });

    handlers.pointerDown(event as PointerEvent);

    expect(actions.clearSelection).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves native trigger activation to the button owner', () => {
    const { actions, handlers } = createHandlers('frame-1');
    const trigger = document.createElement('button');
    trigger.dataset['frameId'] = 'frame-1';
    trigger.dataset['frameControl'] = 'trigger';
    const event = new MouseEvent('click', { cancelable: true, clientX: 100, clientY: 100 });
    Object.defineProperty(event, 'target', { value: trigger });
    Object.defineProperty(event, 'composedPath', { value: () => [trigger] });

    handlers.click(event);

    expect(actions.selectFrame).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps size-editor pointer and Escape events under the edit interaction owner', () => {
    const { actions, handlers } = createHandlers('frame-1');
    const sizeEditor = document.createElement('div');
    sizeEditor.className = 'sniptale-content-size-tooltip';
    document.body.append(sizeEditor);
    const pointerDown = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, 'target', { value: sizeEditor });
    Object.defineProperty(pointerDown, 'composedPath', { value: () => [sizeEditor] });

    handlers.pointerDown(pointerDown as PointerEvent);
    const escape = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' });
    handlers.keyDown(escape);

    expect(actions.clearSelection).not.toHaveBeenCalled();
    expect(pointerDown.defaultPrevented).toBe(false);
    expect(escape.defaultPrevented).toBe(false);
  });

  it('leaves the first Escape to each open popover family without clearing selection', () => {
    const kinds = ['frame-settings', 'step-badge', 'callout-settings'] as const;

    kinds.forEach((kind) => {
      const { actions, handlers } = createHandlers('frame-1', {
        frameId: 'frame-1',
        kind,
      });
      const escape = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' });

      handlers.keyDown(escape);

      expect(actions.clearSelection).not.toHaveBeenCalled();
      expect(escape.defaultPrevented).toBe(false);
    });
  });

  it('closes selection on Escape and restores focus to its hover trigger', () => {
    const { actions, handlers } = createHandlers('frame-1');
    const trigger = document.createElement('button');
    trigger.className = 'sniptale-frame-toolbar-trigger';
    trigger.dataset['frameId'] = 'frame-1';
    document.body.append(trigger);
    vi.stubGlobal('CSS', { escape: (value: string) => value });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    handlers.keyDown(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }));

    expect(actions.hoverFrame).toHaveBeenCalledWith('frame-1');
    expect(actions.clearSelection).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  });
});
