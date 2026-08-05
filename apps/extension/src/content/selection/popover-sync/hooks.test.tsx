// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePopoverDistanceClose, usePopoverEscapeClose, usePopoverOutsideClose } from './hooks';
import {
  FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE,
  FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE,
} from '@sniptale/ui/floating-interactions/ownership';

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

function renderPopoverEscapeCloseHook(props: {
  anchorEl: HTMLElement | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  function Harness() {
    usePopoverEscapeClose(props);
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

function verifyOwnedFloatingLayerDoesNotClose(): void {
  const onClose = vi.fn();
  const popover = document.createElement('div');
  const selectOwner = document.createElement('div');
  const optionLayer = document.createElement('div');
  selectOwner.setAttribute(FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE, 'numbering-preset-select');
  optionLayer.setAttribute(FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE, 'numbering-preset-select');
  popover.appendChild(selectOwner);
  document.body.append(popover, optionLayer);

  renderPopoverOutsideCloseHook({
    isOpen: true,
    onClose,
    popoverRef: { current: popover },
  });

  act(() => vi.advanceTimersByTime(150));
  optionLayer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));

  expect(onClose).not.toHaveBeenCalled();
}

function verifyOwnedFloatingLayerDoesNotDistanceClose(): void {
  const onClose = vi.fn();
  const popover = document.createElement('div');
  const selectOwner = document.createElement('div');
  const optionLayer = document.createElement('div');
  selectOwner.setAttribute(FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE, 'numbering-preset-select');
  optionLayer.setAttribute(FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE, 'numbering-preset-select');
  popover.appendChild(selectOwner);
  document.body.append(popover, optionLayer);
  mockPopoverRect(popover);

  renderPopoverDistanceCloseHook({
    isOpen: true,
    onClose,
    popoverRef: { current: popover },
  });

  act(() => vi.advanceTimersByTime(300));
  optionLayer.dispatchEvent(
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 500,
      clientY: 500,
      composed: true,
    })
  );

  expect(onClose).not.toHaveBeenCalled();
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
    'keeps the popover open for a portaled control owned by that popover',
    verifyOwnedFloatingLayerDoesNotClose
  );
  it(
    'keeps distance dismissal paused over a portaled control owned by that popover',
    verifyOwnedFloatingLayerDoesNotDistanceClose
  );
  it(
    'closes when the pointer moves far enough away after the delayed listener is armed',
    verifyDistanceClose
  );
  it('closes only the open popover layer on Escape and restores its trigger focus', () => {
    const anchorEl = document.createElement('button');
    document.body.append(anchorEl);
    const onClose = vi.fn();
    renderPopoverEscapeCloseHook({ anchorEl, isOpen: true, onClose });
    const escape = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });

    act(() => window.dispatchEvent(escape));

    expect(onClose).toHaveBeenCalledOnce();
    expect(escape.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(anchorEl);
  });
});
