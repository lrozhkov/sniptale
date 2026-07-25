// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalloutSettingsPopover } from '.';

let anchorEl: HTMLButtonElement | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  anchorEl = document.createElement('button');
  anchorEl.getBoundingClientRect = () =>
    ({
      bottom: 80,
      height: 40,
      left: 40,
      right: 120,
      top: 40,
      width: 80,
      x: 40,
      y: 40,
    }) as DOMRect;
  container = document.createElement('div');
  document.body.append(container, anchorEl);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  anchorEl?.remove();
  container = null;
  anchorEl = null;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CalloutSettingsPopover', () => {
  it('closes through the shared outside-interaction lifecycle', () => {
    const onClose = vi.fn();

    act(() => {
      root?.render(
        <CalloutSettingsPopover
          anchorEl={anchorEl}
          frameId="frame-1"
          frameRect={{ x: 100, y: 100, width: 180, height: 100 }}
          isOpen
          onClose={onClose}
        />
      );
    });

    expect(document.querySelector('[data-ui="content.callout-settings.popover"]')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(150);
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
