// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  validateAnimationTemplate,
  type AnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import { AnimationSlotMappingDialog } from './slot-mapping-dialog';
import { translate } from '../../../../platform/i18n';

const validated = validateAnimationTemplate({
  format: 'sniptale-animation',
  version: 1,
  id: 'source',
  label: { en: 'Source' },
  controls: [],
  bindings: [],
  resources: [],
  animation: {
    v: '5.12.2',
    w: 320,
    h: 180,
    fr: 30,
    ip: 0,
    op: 60,
    assets: [],
    layers: [],
    slots: {
      title: { p: { a: 0, k: [{ t: 0, s: { t: 'Original' } }] } },
      opacity: { p: { a: 0, k: 0.5 } },
      animated: {
        p: {
          a: 1,
          k: [
            { t: 0, s: [0] },
            { t: 30, s: [1] },
          ],
        },
      },
    },
  },
});
if (!validated.ok) throw new Error(JSON.stringify(validated.diagnostics));
const template = validated.template;
let host: HTMLDivElement, root: Root, anchor: HTMLButtonElement;
const onSave = vi.fn<(template: AnimationTemplate) => Promise<boolean>>(async () => false),
  onCancel = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  host = document.createElement('div');
  anchor = document.createElement('button');
  document.body.append(host, anchor);
  anchor.focus();
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  anchor.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent === text
  )!;
const saveLabel = () => translate('videoEditor.effectsLibrary.mapping.save');
function render(busy = false, error: string | null = null) {
  return act(async () =>
    root.render(
      <AnimationSlotMappingDialog
        template={template}
        copyId="prepared"
        anchor={anchor}
        busy={busy}
        error={error}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
  );
}
it('prepares a selected static slot and preserves the form after a refused save', async () => {
  await render();
  const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
  expect(dialog.open).toBe(true);
  expect(button(saveLabel()).disabled).toBe(true);
  expect(dialog.querySelector<HTMLButtonElement>('[aria-label="animated"]')!.disabled).toBe(true);
  await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="title"]')!.click());
  expect(button(saveLabel()).disabled).toBe(false);
  await act(async () => button(saveLabel()).click());
  expect(onSave).toHaveBeenCalledOnce();
  expect(onSave.mock.calls[0]![0]).toMatchObject({
    id: 'prepared',
    bindings: [{ kind: 'text', slot: 'title' }],
  });
  expect(template.bindings).toEqual([]);
  await render(false, 'Save failed');
  expect(dialog.querySelector('[role=alert]')!.textContent).toBe('Save failed');
  expect(dialog.querySelector('[aria-label="title"]')!.getAttribute('aria-checked')).toBe('true');
  await act(async () => button(saveLabel()).click());
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onSave.mock.calls[1]![0]).toEqual(onSave.mock.calls[0]![0]);
});
it('validates edited numeric bounds before publication', async () => {
  await render();
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="opacity"]')!.click()
  );
  const field = document.querySelector<HTMLInputElement>(
    '[aria-label="' + translate('videoEditor.effectsLibrary.mapping.maximum') + ' opacity"]'
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '-1');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(button(saveLabel()).disabled).toBe(true);
  expect(document.querySelector('[role=alert]')).not.toBeNull();
  expect(onSave).not.toHaveBeenCalled();
});
it('cancels without publication, protects an in-flight save and restores the invoking focus', async () => {
  await render(true);
  const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
  await act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
  expect(onCancel).not.toHaveBeenCalled();
  await render(false);
  await act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
  act(() => root.render(null));
  expect(document.activeElement).toBe(anchor);
});

it('steps optional bound drafts while preserving invalid and empty text and save validation', async () => {
  await render();
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="opacity"]')!.click()
  );
  const input = document.querySelector<HTMLInputElement>(
    '[aria-label="' + translate('videoEditor.effectsLibrary.mapping.maximum') + ' opacity"]'
  )!;
  input.focus();
  const wheel = () => {
    const event = new WheelEvent('wheel', {
      altKey: true,
      deltaY: -20,
      bubbles: true,
      cancelable: true,
    });
    act(() => input.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
  };
  wheel();
  expect(input.value).toBe('101');
  for (const value of ['-', '', '0.25']) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    wheel();
    expect(input.value).toBe(value === '0.25' ? '1.25' : value);
    expect(button(saveLabel()).disabled).toBe(value !== '0.25');
  }
  const minimum = document.querySelector<HTMLInputElement>(
    '[aria-label="' + translate('videoEditor.effectsLibrary.mapping.minimum') + ' opacity"]'
  )!;
  minimum.focus();
  act(() =>
    minimum.dispatchEvent(
      new WheelEvent('wheel', {
        altKey: true,
        deltaY: 20,
        bubbles: true,
        cancelable: true,
      })
    )
  );
  expect(minimum.value).toBe('-1');
  input.focus();
  expect(onSave).not.toHaveBeenCalled();
  await render(true);
  act(() =>
    input.dispatchEvent(
      new WheelEvent('wheel', { altKey: true, deltaY: -20, bubbles: true, cancelable: true })
    )
  );
  expect(input.value).toBe('1.25');
});
