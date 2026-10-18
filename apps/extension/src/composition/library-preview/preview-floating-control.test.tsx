// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { PreviewFloatingControl } from './preview-floating-control';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('retains the pending editor native button contract outside the migrated scope', () => {
  const click = vi.fn();
  act(() =>
    root.render(
      <PreviewFloatingControl ariaLabel="Inspector" onClick={click} pressed tabIndex={-1}>
        <svg data-icon="inspector" />
      </PreviewFloatingControl>
    )
  );
  const button = host.querySelector('button')!;
  expect(button.title).toBe('Inspector');
  expect(button.tabIndex).toBe(-1);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(button.firstElementChild?.tagName).toBe('svg');
  expect(button.hasAttribute('data-command-press')).toBe(false);
  act(() => button.click());
  expect(click).toHaveBeenCalledOnce();
});

it('shows scoped chrome pressure and cancels the command without moving its target', () => {
  const click = vi.fn();
  const render = (disabled = false) =>
    act(() =>
      root.render(
        <CommandPressScope.Provider value={true}>
          <PreviewFloatingControl
            ariaLabel="Close"
            title="Close preview"
            onClick={click}
            dismiss
            disabled={disabled}
          >
            <svg data-icon="close" />
          </PreviewFloatingControl>
        </CommandPressScope.Provider>
      )
    );
  render();
  const button = host.querySelector('button')!;
  expect(button.title).toBe('Close preview');
  expect(button.dataset['commandChrome']).toBe('true');
  expect(button.querySelector('.sniptale-command-content > svg')).not.toBeNull();
  act(() => button.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true })));
  expect(button.dataset['pressing']).toBe('true');
  expect(click).not.toHaveBeenCalled();
  act(() => button.dispatchEvent(new Event('pointercancel', { bubbles: true })));
  expect(button.dataset['pressing']).toBeUndefined();
  act(() => button.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true })));
  expect(click).not.toHaveBeenCalled();
  act(() => button.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true })));
  act(() => button.dispatchEvent(new MouseEvent('pointerup', { button: 0, bubbles: true })));
  act(() => button.click());
  expect(click).toHaveBeenCalledOnce();
  render(true);
  expect(button.disabled).toBe(true);
  expect(button.dataset['pressing']).toBeUndefined();
  act(() => button.click());
  expect(click).toHaveBeenCalledOnce();
});
