// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { InspectorFieldClear } from '../../../ui/compact-inspector-controls/text-field';

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedDomEvent: vi.fn(() => true),
  isTrustedPointerEvent: vi.fn((_event?: Event) => true),
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

function commandPointer(type: string, target: EventTarget, pointerId = 1): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    composed: true,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  target.dispatchEvent(event);
}

function mountMarkedCommand() {
  const { root } = mountBridgeRoot();
  const button = document.createElement('button');
  const child = document.createElement('span');
  const onClick = vi.fn();
  button.setAttribute('data-command-press', '');
  button.append(child);
  button.addEventListener('click', onClick);
  root.append(button);
  return { root, button, child, onClick };
}

describe('content UI activation bridge command release', () => {
  it('waits through a long hold and ignores another pointer before releasing inside once', () => {
    vi.useFakeTimers();
    const { child, onClick } = mountMarkedCommand();
    commandPointer('pointerdown', child);
    vi.advanceTimersByTime(2000);
    expect(onClick).not.toHaveBeenCalled();
    commandPointer('pointerup', child, 2);
    vi.runOnlyPendingTimers();
    expect(onClick).not.toHaveBeenCalled();
    commandPointer('pointerup', child);
    vi.runOnlyPendingTimers();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each(['outside', 'pointercancel', 'Escape', 'lostpointercapture', 'blur', 'hidden'])(
    'does not fall back after %s, even on a later release',
    (ending) => {
      vi.useFakeTimers();
      const { button, child, onClick } = mountMarkedCommand();
      button.setAttribute('data-sniptale-activation-bridge', 'defer');
      commandPointer('pointerdown', child);
      if (ending === 'outside') commandPointer('pointerup', document.body);
      else if (ending === 'Escape')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else if (ending === 'blur') window.dispatchEvent(new Event('blur'));
      else if (ending === 'hidden') {
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
        hidden.mockRestore();
      } else commandPointer(ending, child);
      commandPointer('pointerup', child);
      vi.runAllTimers();
      expect(onClick).not.toHaveBeenCalled();
    }
  );

  it.each(['remove', 'disabled', 'unmarked'])(
    'does not activate a command retired by %s before its fallback',
    (retirement) => {
      vi.useFakeTimers();
      const { button, child, onClick } = mountMarkedCommand();
      button.setAttribute('data-sniptale-activation-bridge', 'defer');
      commandPointer('pointerdown', child);
      commandPointer('pointerup', child);
      if (retirement === 'remove') button.remove();
      else if (retirement === 'disabled') button.disabled = true;
      else button.removeAttribute('data-command-press');
      vi.runAllTimers();
      expect(onClick).not.toHaveBeenCalled();
    }
  );

  it('lets a delivered native click win and preserves a later keyboard activation', () => {
    vi.useFakeTimers();
    const { child, onClick } = mountMarkedCommand();
    commandPointer('pointerdown', child);
    commandPointer('pointerup', child);
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    vi.runAllTimers();
    expect(onClick).toHaveBeenCalledTimes(1);
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('suppresses the native pointer duplicate after a fallback without suppressing keyboard clicks', () => {
    vi.useFakeTimers();
    const { child, onClick } = mountMarkedCommand();
    commandPointer('pointerdown', child);
    commandPointer('pointerup', child);
    vi.runAllTimers();
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(onClick).toHaveBeenCalledTimes(1);
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not accept an untrusted release and still accepts the matching trusted release', () => {
    vi.useFakeTimers();
    const { child, onClick } = mountMarkedCommand();
    commandPointer('pointerdown', child);
    trustedEventMocks.isTrustedPointerEvent.mockReturnValue(false);
    commandPointer('pointerup', child);
    vi.runAllTimers();
    expect(onClick).not.toHaveBeenCalled();
    trustedEventMocks.isTrustedPointerEvent.mockReturnValue(true);
    commandPointer('pointerup', child);
    vi.runAllTimers();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('accepts release inside after leaving and returning while held', () => {
    vi.useFakeTimers();
    const { child, onClick } = mountMarkedCommand();
    commandPointer('pointerdown', child);
    commandPointer('pointerout', child);
    commandPointer('pointerover', child);
    commandPointer('pointerup', child);
    vi.runAllTimers();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not cancel a released command on implicit capture loss', () => {
    vi.useFakeTimers();
    const { child, onClick } = mountMarkedCommand();
    commandPointer('pointerdown', child);
    commandPointer('pointerup', child);
    commandPointer('lostpointercapture', child);
    vi.runAllTimers();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not extend activation admission to marked non-controls or opt-out controls', () => {
    vi.useFakeTimers();
    const { root } = mountBridgeRoot();
    for (const tag of ['div', 'button']) {
      const element = document.createElement(tag);
      const click = vi.fn();
      element.setAttribute('data-command-press', '');
      if (tag === 'button') element.setAttribute('data-sniptale-activation-bridge', 'off');
      element.addEventListener('click', click);
      root.append(element);
      commandPointer('pointerdown', element);
      commandPointer('pointerup', element);
      vi.runAllTimers();
      expect(click).not.toHaveBeenCalled();
    }
  });

  it.each(['release', 'Escape', 'Escape-no-click', 'claimed-Escape-no-click'] as const)(
    'keeps real controlled Clear focus and honors %s through the pointer tail',
    (ending) => {
      vi.useFakeTimers();
      const { root } = mountBridgeRoot();
      const reactRoot = createRoot(root);
      function Field() {
        const input = useRef<HTMLInputElement>(null);
        const [value, setValue] = useState('query');
        return createElement(
          CommandPressScope,
          { value: true },
          createElement('input', {
            ref: input,
            value,
            onChange: (event) => setValue(event.currentTarget.value),
            onKeyDown: (event) => {
              if (ending === 'claimed-Escape-no-click' && event.key === 'Escape')
                event.preventDefault();
            },
          }),
          value ? createElement(InspectorFieldClear, { label: 'Search', target: input }) : null
        );
      }
      act(() => reactRoot.render(createElement(Field)));
      const input = root.querySelector('input');
      const clear = root.querySelector('button');
      if (!input || !clear) throw new Error('Controlled Clear fixture is required');
      input.focus();
      act(() => commandPointer('pointerdown', clear));
      expect(input.value).toBe('query');
      expect(root.querySelector('button')).toBe(clear);
      expect(clear.dataset['pressing']).toBe('true');
      expect(root.activeElement).toBe(input);
      if (ending !== 'release')
        act(() =>
          input.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Escape',
              bubbles: true,
              composed: true,
              cancelable: true,
            })
          )
        );
      act(() => commandPointer('pointerup', clear));
      if (ending === 'Escape')
        act(() =>
          clear.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }))
        );
      act(() => vi.runAllTimers());
      expect(input.value).toBe(ending !== 'release' ? 'query' : '');
      expect(root.querySelector('button')).toBe(ending !== 'release' ? clear : null);
      expect(root.activeElement).toBe(input);
      act(() => reactRoot.unmount());
    }
  );
});
