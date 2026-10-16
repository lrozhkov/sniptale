// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { dispatchHighlighterModeChanged } from '../../platform/page-context/mode-events';
import { useFrameSettingsPopoverModeClose, useFrameSettingsPopoverOutsideClose } from './sync';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let onCloseSpy: Mock<() => void> | null = null;

function renderHarness(isOpen: boolean) {
  onCloseSpy = vi.fn<() => void>();

  function Harness() {
    useFrameSettingsPopoverModeClose({
      isOpen,
      onClose: () => onCloseSpy?.(),
    });
    return null;
  }

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  onCloseSpy = null;
});

describe('useFrameSettingsPopoverModeClose', () => {
  it('closes the popover when highlighter mode changes while open', () => {
    renderHarness(true);

    act(() => {
      dispatchHighlighterModeChanged({ enabled: false });
    });

    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the popover open when highlighter mode stays enabled', () => {
    renderHarness(true);

    act(() => {
      dispatchHighlighterModeChanged({ enabled: true });
    });

    expect(onCloseSpy).not.toHaveBeenCalled();
  });

  it('does not subscribe when the popover is closed', () => {
    renderHarness(false);

    act(() => {
      dispatchHighlighterModeChanged({ enabled: false });
    });

    expect(onCloseSpy).not.toHaveBeenCalled();
  });
});

it('ignores the declared anchor mousedown so its following click closes rather than reopens the menu', () => {
  vi.useFakeTimers();
  const shadowHost = document.createElement('div');
  document.body.append(shadowHost);
  const shadow = shadowHost.attachShadow({ mode: 'open' });
  const anchor = document.createElement('button');
  const outside = document.createElement('button');
  shadow.append(anchor, outside);
  let open = true;
  const close = vi.fn(() => {
    open = false;
  });
  anchor.addEventListener('click', () => {
    open = !open;
  });
  function Harness() {
    const popoverRef = useRef<HTMLDivElement>(null);
    const args = { anchorEl: anchor, isOpen: true, onClose: close, popoverRef };
    useFrameSettingsPopoverOutsideClose(args);
    return <div ref={popoverRef} />;
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  try {
    act(() => {
      root!.render(<Harness />);
    });
    act(() => vi.advanceTimersByTime(150));
    act(() => anchor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true })));
    act(() =>
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }))
    );
    expect(open).toBe(false);
    expect(close).not.toHaveBeenCalled();
    act(() =>
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
    );
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    shadowHost.remove();
    vi.useRealTimers();
  }
});
