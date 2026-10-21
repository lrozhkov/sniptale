// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { RecordingStartConfirmation } from './start-confirmation';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let host: HTMLDivElement;
let trigger: HTMLButtonElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', undefined);
  host = document.createElement('div');
  trigger = document.createElement('button');
  document.body.append(trigger, host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  trigger.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderConfirmation() {
  const onCancel = vi.fn();
  const onContinue = vi.fn();
  act(() =>
    root.render(
      <CommandPressScope value={true}>
        <RecordingStartConfirmation
          displayMode="horizontal"
          triggerRef={{ current: trigger }}
          onCancel={onCancel}
          onContinue={onContinue}
        />
      </CommandPressScope>
    )
  );
  const checkbox = host.querySelector<HTMLInputElement>('input')!;
  const buttons = host.querySelectorAll<HTMLButtonElement>('button');
  return { onCancel, onContinue, checkbox, cancel: buttons[0]!, continueButton: buttons[1]! };
}

it('focuses the dialog without a button ring, ignores other keys, and cancels with Escape', () => {
  const { onCancel } = renderConfirmation();
  expect(document.activeElement).toBe(host.querySelector('[role="alertdialog"]'));
  act(() =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  );
  expect(onCancel).not.toHaveBeenCalled();
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  act(() => document.dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(onCancel).toHaveBeenCalledOnce();
});

it('contains keyboard focus at both boundaries and preserves ordinary Tab navigation', () => {
  const { checkbox, cancel, continueButton } = renderConfirmation();
  checkbox.focus();
  const reverse = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  act(() => checkbox.dispatchEvent(reverse));
  expect(reverse.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(continueButton);
  const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  act(() => continueButton.dispatchEvent(forward));
  expect(forward.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(checkbox);
  const ordinary = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  act(() => cancel.dispatchEvent(ordinary));
  expect(ordinary.defaultPrevented).toBe(false);
});

it('uses the actual Continue event with the default and remembered choice', () => {
  const { checkbox, continueButton, onContinue } = renderConfirmation();
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => continueButton.dispatchEvent(event));
  expect(onContinue).toHaveBeenNthCalledWith(1, event, false);
  act(() => checkbox.click());
  expect(checkbox.checked).toBe(true);
  const rememberedEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => continueButton.dispatchEvent(rememberedEvent));
  expect(onContinue).toHaveBeenNthCalledWith(2, rememberedEvent, true);
});

it('keeps confirmation clicks inside the surface and dismisses on Cancel', () => {
  const { cancel, onCancel } = renderConfirmation();
  const parentClick = vi.fn();
  document.body.addEventListener('click', parentClick);
  act(() => cancel.click());
  document.body.removeEventListener('click', parentClick);
  expect(onCancel).toHaveBeenCalledOnce();
  expect(parentClick).not.toHaveBeenCalled();
});

it('repositions a resized confirmation and disconnects its observer on removal', () => {
  let measure: (() => void) | undefined;
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
  );
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 500, 30, 30));
  let height = 180;
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height);
  renderConfirmation();
  const surface = host.querySelector<HTMLElement>('.sniptale-popover-menu')!;
  expect(observe).toHaveBeenCalledWith(surface);
  expect(surface.classList.contains('sniptale-popover-up')).toBe(false);
  height = 320;
  act(() => measure?.());
  expect(surface.classList.contains('sniptale-popover-up')).toBe(true);
  act(() => root.render(null));
  expect(disconnect).toHaveBeenCalledOnce();
});
