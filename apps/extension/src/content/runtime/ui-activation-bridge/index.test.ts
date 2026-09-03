// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedDomEvent: vi.fn(() => true),
  isTrustedPointerEvent: vi.fn(() => true),
}));

vi.mock('../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/trusted-events')>()),
  isTrustedDomEvent: trustedEventMocks.isTrustedDomEvent,
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

function dispatchPointerMove(target: EventTarget, clientX: number): void {
  target.dispatchEvent(
    new MouseEvent('pointermove', {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX,
      clientY: 10,
      composed: true,
    })
  );
}

function dispatchHostCancelledKeydown(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  event.preventDefault();
  target.dispatchEvent(event);
  return event;
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
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);
  trustedEventMocks.isTrustedPointerEvent.mockReturnValue(true);
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

  it('transfers focus after an uncancelled bridged mousedown', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    const button = document.createElement('button');
    root.append(textarea, button);
    textarea.focus();

    dispatchPrimaryPointerDown(button);

    expect(root.activeElement).toBe(button);
  });

  it('retains editable focus when a formatting control cancels bridged mousedown', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    const button = document.createElement('button');
    button.addEventListener('mousedown', (event) => event.preventDefault());
    root.append(textarea, button);
    textarea.focus();

    dispatchPrimaryPointerDown(button);

    expect(root.activeElement).toBe(textarea);
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

  it('reactivates an opted-in read-only callout surface without treating it as editable', () => {
    const { root } = mountBridgeRoot();
    const callout = document.createElement('div');
    const body = document.createElement('div');
    const onClick = vi.fn();
    callout.setAttribute('data-sniptale-activation-bridge', 'immediate');
    body.setAttribute('contenteditable', 'false');
    callout.addEventListener('click', onClick);
    callout.append(body);
    root.append(callout);

    dispatchPrimaryPointerDown(body);

    expect(onClick).toHaveBeenCalledOnce();
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

  it('extends text-control selection during pointer drag when mouse events are unavailable', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    textarea.value = 'abcdef';
    root.append(textarea);
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ height: 40, width: 100 })
    );
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    rectSpy.mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'SPAN' && this.parentElement) {
        const prefixLength =
          this.previousSibling instanceof Text ? this.previousSibling.data.length : 0;
        return DOMRect.fromRect({
          height: 20,
          x: prefixLength * 10,
          y: 0,
        });
      }
      return DOMRect.fromRect();
    });

    textarea.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 10,
        clientY: 10,
        composed: true,
      })
    );
    dispatchPointerMove(window, 40);

    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(4);
  });

  it('owns pointer drag selection before a host window guard stops propagation', () => {
    const hostGuard = (event: Event) => event.stopPropagation();
    window.addEventListener('pointerdown', hostGuard, { capture: true });
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    textarea.value = 'abcdef';
    root.append(textarea);
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ height: 40, width: 100 })
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.tagName === 'SPAN' && this.previousSibling instanceof Text) {
          return DOMRect.fromRect({
            height: 20,
            x: this.previousSibling.data.length * 10,
          });
        }
        return DOMRect.fromRect();
      }
    );

    try {
      textarea.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          cancelable: true,
          clientX: 10,
          clientY: 10,
          composed: true,
        })
      );
      dispatchPointerMove(window, 40);
    } finally {
      window.removeEventListener('pointerdown', hostGuard, { capture: true });
    }

    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(4);
  });

  it('selects the pointed word from two pointerdowns when pointer detail stays zero', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    textarea.value = 'first second';
    root.append(textarea);
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ height: 40, width: 140 })
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.tagName === 'SPAN' && this.previousSibling instanceof Text) {
          return DOMRect.fromRect({
            height: 20,
            x: this.previousSibling.data.length * 10,
          });
        }
        return DOMRect.fromRect();
      }
    );

    for (let clickCount = 0; clickCount < 2; clickCount += 1) {
      textarea.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          cancelable: true,
          clientX: 80,
          clientY: 10,
          composed: true,
          detail: 0,
        })
      );
    }

    expect(textarea.selectionStart).toBe(6);
    expect(textarea.selectionEnd).toBe(12);
  });

  it('does not treat pointer detail as proof of a double click', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    textarea.value = 'first second';
    root.append(textarea);
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ height: 40, width: 140 })
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.tagName === 'SPAN' && this.previousSibling instanceof Text) {
          return DOMRect.fromRect({ height: 20, x: this.previousSibling.data.length * 10 });
        }
        return DOMRect.fromRect();
      }
    );

    textarea.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 80,
        clientY: 10,
        composed: true,
        detail: 2,
      })
    );

    expect(textarea.selectionStart).toBe(8);
    expect(textarea.selectionEnd).toBe(8);
  });

  it('keeps text measurement inside the shadow style boundary', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    textarea.value = 'text';
    root.append(textarea);
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 80 }));
    let markerRoot: Node | null = null;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.tagName === 'SPAN') markerRoot = this.getRootNode();
        return DOMRect.fromRect();
      }
    );

    dispatchPrimaryPointerDown(textarea);

    expect(markerRoot).toBe(root);
  });
});

describe('content UI activation bridge controlled text input', () => {
  it('updates React state before a host document guard cancels the trusted keydown', () => {
    const { root } = mountBridgeRoot();
    const container = document.createElement('div');
    root.append(container);
    const reactRoot = createRoot(container);

    function ControlledField() {
      const [value, setValue] = useState('');
      return createElement('textarea', {
        value,
        onChange: (event: { currentTarget: HTMLTextAreaElement }) =>
          setValue(event.currentTarget.value),
      });
    }

    act(() => reactRoot.render(createElement(ControlledField)));
    const textarea = root.querySelector('textarea');
    if (!textarea) throw new Error('Expected controlled textarea');
    textarea.focus();
    act(() => {
      dispatchHostCancelledKeydown(textarea, { key: 'ф' });
    });

    expect(textarea.value).toBe('ф');
    act(() => reactRoot.unmount());
  });

  it('applies text input to a contenteditable callout before the host guard', () => {
    const { root } = mountBridgeRoot();
    const editable = document.createElement('div');
    const input = vi.fn();
    editable.setAttribute('contenteditable', 'true');
    editable.addEventListener('input', input);
    root.append(editable);
    editable.focus();
    const selection = document.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);

    dispatchHostCancelledKeydown(editable, { key: 'ф' });

    expect(editable.textContent).toBe('ф');
    expect(input).toHaveBeenCalledOnce();
  });

  it('deletes contenteditable text after host cancellation', () => {
    const { root } = mountBridgeRoot();
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editable.textContent = 'abc';
    root.append(editable);
    editable.focus();
    const selection = document.getSelection();
    const range = document.createRange();
    range.setStart(editable.firstChild ?? editable, 3);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);

    dispatchHostCancelledKeydown(editable, { key: 'Backspace' });

    expect(editable.textContent).toBe('ab');
  });

  it('does not leak a locally claimed Escape to later window owners', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    textarea.addEventListener('keydown', (event) => event.preventDefault());
    root.append(textarea);
    const laterOwner = vi.fn();
    window.addEventListener('keydown', laterOwner, { capture: true });

    dispatchHostCancelledKeydown(textarea, { key: 'Escape' });

    expect(laterOwner).not.toHaveBeenCalled();
    window.removeEventListener('keydown', laterOwner, { capture: true });
  });

  it('extends textarea selection to the line start for Shift+Home after host cancellation', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    textarea.value = 'first\nsecond';
    root.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(12, 12);

    dispatchHostCancelledKeydown(textarea, { key: 'Home', shiftKey: true });

    expect(textarea.selectionStart).toBe(6);
    expect(textarea.selectionEnd).toBe(12);
    expect(textarea.selectionDirection).toBe('backward');
  });

  it('extends contenteditable selection through Selection.modify for Shift+Home', () => {
    const { root } = mountBridgeRoot();
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editable.textContent = 'comment';
    root.append(editable);
    editable.focus();
    const selection = document.getSelection();
    const modify = vi.fn();
    Object.defineProperty(selection, 'modify', { configurable: true, value: modify });

    dispatchHostCancelledKeydown(editable, { key: 'Home', shiftKey: true });

    expect(modify).toHaveBeenCalledWith('extend', 'backward', 'lineboundary');
  });

  it('keeps native editing authoritative when the host did not cancel keydown', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    textarea.value = 'before';
    root.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(6, 6);

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: 'x',
    });
    textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(textarea.value).toBe('before');
  });

  it('does not mutate read-only or max-length controls after host cancellation', () => {
    const { root } = mountBridgeRoot();
    const readOnly = document.createElement('input');
    const maxLength = document.createElement('input');
    readOnly.readOnly = true;
    readOnly.value = 'fixed';
    maxLength.maxLength = 3;
    maxLength.value = 'abc';
    root.append(readOnly, maxLength);

    readOnly.focus();
    readOnly.setSelectionRange(5, 5);
    dispatchHostCancelledKeydown(readOnly, { key: 'x' });
    maxLength.focus();
    maxLength.setSelectionRange(3, 3);
    dispatchHostCancelledKeydown(maxLength, { key: 'x' });

    expect(readOnly.value).toBe('fixed');
    expect(maxLength.value).toBe('abc');
  });

  it('moves vertically across soft-wrapped textarea lines after host cancellation', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    textarea.value = 'abcdefghij';
    root.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(7, 7);
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ height: 60, width: 50 })
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.tagName === 'SPAN' && this.previousSibling instanceof Text) {
          const offset = this.previousSibling.data.length;
          return DOMRect.fromRect({
            height: 20,
            x: (offset % 5) * 10,
            y: Math.floor(offset / 5) * 20,
          });
        }
        return DOMRect.fromRect();
      }
    );

    dispatchHostCancelledKeydown(textarea, { key: 'ArrowUp' });

    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(2);
  });

  it('does not synthesize text while an IME composition keydown is in progress', () => {
    const { root } = mountBridgeRoot();
    const textarea = document.createElement('textarea');
    root.append(textarea);
    textarea.focus();

    dispatchHostCancelledKeydown(textarea, { isComposing: true, key: 'Process' });

    expect(textarea.value).toBe('');
  });
});
