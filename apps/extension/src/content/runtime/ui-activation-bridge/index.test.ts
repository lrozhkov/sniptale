// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedPointerEvent: vi.fn(() => true),
}));

vi.mock('../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/trusted-events')>()),
  isTrustedPointerEvent: trustedEventMocks.isTrustedPointerEvent,
}));

import { installContentUiActivationBridge } from '.';

function mountBridgeRoot(): { root: ShadowRoot; host: HTMLDivElement } {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  installContentUiActivationBridge(root);

  return { host, root };
}

function dispatchPrimaryPointerDown(target: Element): void {
  target.dispatchEvent(
    new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      cancelable: true,
      composed: true,
    })
  );
}

function dispatchNativeFollowUp(target: Element): void {
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function dispatchPointerUp(target: EventTarget = window): void {
  target.dispatchEvent(
    new MouseEvent('pointerup', {
      bubbles: true,
      button: 0,
      cancelable: true,
      composed: true,
    })
  );
}

beforeEach(() => {
  trustedEventMocks.isTrustedPointerEvent.mockReturnValue(true);
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('content UI activation bridge immediate activation', () => {
  it('delivers button click actions from pointerdown and suppresses native click duplicates', () => {
    const { root } = mountBridgeRoot();
    const button = document.createElement('button');
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    root.append(button);

    dispatchPrimaryPointerDown(button);
    dispatchNativeFollowUp(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('delivers menu mousedown actions from pointerdown and suppresses native mousedown duplicates', () => {
    const { root } = mountBridgeRoot();
    const menuItem = document.createElement('button');
    menuItem.setAttribute('role', 'menuitem');
    const onMouseDown = vi.fn();
    menuItem.addEventListener('mousedown', onMouseDown);
    root.append(menuItem);

    dispatchPrimaryPointerDown(menuItem);
    dispatchNativeFollowUp(menuItem);

    expect(onMouseDown).toHaveBeenCalledTimes(1);
  });

  it('ignores drag handles and editable controls', () => {
    const { root } = mountBridgeRoot();
    const dragButton = document.createElement('button');
    const input = document.createElement('input');
    const onDragClick = vi.fn();
    const onInputClick = vi.fn();
    dragButton.className = 'sniptale-drag-handle';
    dragButton.addEventListener('click', onDragClick);
    input.addEventListener('click', onInputClick);
    root.append(dragButton, input);

    dispatchPrimaryPointerDown(dragButton);
    dispatchPrimaryPointerDown(input);

    expect(onDragClick).not.toHaveBeenCalled();
    expect(onInputClick).not.toHaveBeenCalled();
  });
});

describe('content UI activation bridge trusted events', () => {
  it('does not bridge synthetic pointerdown events into extension UI clicks', () => {
    const { root } = mountBridgeRoot();
    const button = document.createElement('button');
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    root.append(button);
    trustedEventMocks.isTrustedPointerEvent.mockReturnValue(false);

    dispatchPrimaryPointerDown(button);

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('content UI activation bridge deferred activation', () => {
  it('defers bridged activation until pointerup for pointer-driven controls', () => {
    vi.useFakeTimers();
    const { root } = mountBridgeRoot();
    const button = document.createElement('button');
    const onClick = vi.fn();
    button.setAttribute('data-sniptale-activation-bridge', 'defer');
    button.addEventListener('click', onClick);
    root.append(button);

    dispatchPrimaryPointerDown(button);

    expect(onClick).not.toHaveBeenCalled();

    dispatchPointerUp();
    vi.runOnlyPendingTimers();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not synthesize deferred activation when native click reaches the control', () => {
    vi.useFakeTimers();
    const { root } = mountBridgeRoot();
    const button = document.createElement('button');
    const onClick = vi.fn();
    button.setAttribute('data-sniptale-activation-bridge', 'defer');
    button.addEventListener('click', onClick);
    root.append(button);

    dispatchPrimaryPointerDown(button);
    dispatchPointerUp();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    vi.runOnlyPendingTimers();

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('content UI activation bridge focus ownership', () => {
  it('focuses editable controls on pointerdown before host pages can cancel mousedown', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    const focus = vi.spyOn(textarea, 'focus');
    root.append(textarea);

    dispatchPrimaryPointerDown(textarea);

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
