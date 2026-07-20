// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePopoverDistanceClose, usePopoverOutsideClose } from './hooks';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPopoverDistanceCloseHook(props: {
  isOpen: boolean;
  onClose: () => void;
  popoverRef: React.RefObject<HTMLDivElement | null>;
}) {
  function Harness() {
    usePopoverDistanceClose(props);
    return null;
  }
  renderHookHarness(<Harness />);
}

function renderPopoverOutsideCloseHook(props: {
  isOpen: boolean;
  onClose: () => void;
  popoverRef: React.RefObject<HTMLDivElement | null>;
}) {
  function Harness() {
    usePopoverOutsideClose(props);
    return null;
  }
  renderHookHarness(<Harness />);
}

function renderHookHarness(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function verifyOutsideClickClose(): void {
  const onClose = vi.fn();
  const popover = document.createElement('div');
  const popoverRef = { current: popover };
  document.body.appendChild(popover);

  renderPopoverOutsideCloseHook({
    isOpen: true,
    onClose,
    popoverRef,
  });

  act(() => {
    vi.advanceTimersByTime(150);
  });

  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

  expect(onClose).toHaveBeenCalledOnce();
}

function mockPopoverRect(popover: HTMLDivElement): void {
  vi.spyOn(popover, 'getBoundingClientRect').mockReturnValue({
    bottom: 50,
    height: 50,
    left: 0,
    right: 50,
    top: 0,
    width: 50,
    x: 0,
    y: 0,
    toJSON: () => undefined,
  });
}

function verifyDistanceClose(): void {
  const onClose = vi.fn();
  const popover = document.createElement('div');
  const popoverRef = { current: popover };
  document.body.appendChild(popover);
  mockPopoverRect(popover);

  renderPopoverDistanceCloseHook({
    isOpen: true,
    onClose,
    popoverRef,
  });

  act(() => {
    vi.advanceTimersByTime(300);
  });

  document.dispatchEvent(
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 500,
      clientY: 500,
    })
  );

  expect(onClose).toHaveBeenCalledOnce();
}

describe('popover sync hooks', () => {
  it(
    'closes when an outside click lands after the delayed listener is armed',
    verifyOutsideClickClose
  );
  it(
    'closes when the pointer moves far enough away after the delayed listener is armed',
    verifyDistanceClose
  );
});
