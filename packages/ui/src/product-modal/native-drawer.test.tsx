// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { NativeDrawer } from './native-drawer';
it.each([false, true])(
  'owns native cancel/focus restoration and explicit key containment (%s)',
  async (containKeys) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const prototype = HTMLDialogElement.prototype;
    const descriptors = ['showModal', 'close'].map(
      (key) => [key, Object.getOwnPropertyDescriptor(prototype, key)] as const
    );
    Object.defineProperty(prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    });
    Object.defineProperty(prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    });
    const host = document.createElement('div');
    const trigger = document.createElement('button');
    document.body.append(host, trigger);
    trigger.focus();
    const root = createRoot(host);
    const close = vi.fn();
    const key = vi.fn();
    try {
      await act(async () =>
        root.render(
          <div onKeyDown={key}>
            <NativeDrawer
              anchor={trigger}
              title="Library"
              dataUi="test.drawer"
              onClose={close}
              containKeys={containKeys}
            >
              <button>Child</button>
            </NativeDrawer>
          </div>
        )
      );
      const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
      expect(dialog.open).toBe(true);
      expect(dialog.querySelector('[data-ui="test.drawer"]')).not.toBeNull();
      const child = dialog.querySelector('button')!;
      child.focus();
      child.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
      expect(key).toHaveBeenCalledTimes(containKeys ? 0 : 1);
      const cancel = new Event('cancel', { cancelable: true });
      dialog.dispatchEvent(cancel);
      expect(cancel.defaultPrevented).toBe(true);
      expect(close).toHaveBeenCalledOnce();
      await act(async () => root.unmount());
      expect(document.activeElement).toBe(trigger);
      expect(document.querySelector('dialog')).toBeNull();
    } finally {
      if (host.firstChild) await act(async () => root.unmount());
      host.remove();
      trigger.remove();
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(prototype, key, descriptor);
        else Reflect.deleteProperty(prototype, key);
      }
      vi.unstubAllGlobals();
    }
  }
);
