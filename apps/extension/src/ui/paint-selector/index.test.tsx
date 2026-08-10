// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createGradientPaint, createSolidPaint } from '@sniptale/foundation/paint';
import { CompactPaintSelector } from '.';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function changeSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it('uses one popup owner, switches modes, applies, and never nests a color popup', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  act(() =>
    root.render(
      <CompactPaintSelector
        label="Fill"
        title="Fill"
        value={createSolidPaint('#f00')}
        onChange={onChange}
      />
    )
  );
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="shared.ui.paint-selector"] > button')!.click()
  );
  const popup = document.querySelector('[data-ui="shared.ui.paint-selector.popup"]')!;
  expect(popup).not.toBeNull();
  expect(popup.querySelectorAll('[data-ui="shared.ui.color-selector.editor-panel"]')).toHaveLength(
    1
  );
  expect(popup.querySelector('[data-ui="shared.ui.color-selector.picker"]')).toBeNull();
  act(() => changeSelect(popup.querySelector('select')!, 'linear'));
  expect(
    popup.querySelectorAll('[aria-label^="highlighter.paintPicker.gradientStop"]')
  ).toHaveLength(2);
  const buttons = Array.from(popup.querySelectorAll<HTMLButtonElement>('button'));
  act(() =>
    buttons.find((button) => button.textContent?.includes('shared.ui.colorSelectorApply'))?.click()
  );
  expect(onChange.mock.calls[0]?.[0]).toMatchObject({
    kind: 'gradient',
    gradient: { type: 'linear' },
  });
  act(() => root.unmount());
  host.remove();
});

it('cancels preview on Escape and when disabled while open', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const reset = vi.fn();
  const render = (disabled = false) =>
    root.render(
      <CompactPaintSelector
        label="Fill"
        title="Fill"
        disabled={disabled}
        value={createSolidPaint('#f00')}
        onChange={vi.fn()}
        onPreviewReset={reset}
      />
    );
  act(() => render());
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(reset).toHaveBeenCalledOnce();
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  act(() => render(true));
  expect(reset).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[data-ui="shared.ui.paint-selector.popup"]')).toBeNull();
  act(() => root.unmount());
  host.remove();
});

it('keeps dismissal and focus traversal inside a Shadow DOM paint popup', async () => {
  const host = document.createElement('div');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const mount = document.createElement('div');
  shadowRoot.append(mount);
  document.body.append(host);
  const root = createRoot(mount);
  act(() =>
    root.render(
      <CompactPaintSelector
        label="Fill"
        title="Fill"
        value={createSolidPaint('#f00')}
        onChange={vi.fn()}
      />
    )
  );
  act(() => mount.querySelector<HTMLButtonElement>('button')!.click());
  await act(nextFrame);
  const popup = shadowRoot.querySelector<HTMLElement>(
    '[data-ui="shared.ui.paint-selector.popup"]'
  )!;
  const mode = popup.querySelector<HTMLSelectElement>('select')!;
  act(() => {
    mode.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    changeSelect(mode, 'linear');
  });
  expect(shadowRoot.querySelector('[data-ui="shared.ui.paint-selector.popup"]')).toBe(popup);
  const colorField = popup.querySelector<HTMLInputElement>('input')!;
  act(() => {
    colorField.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
  });
  expect(shadowRoot.querySelector('[data-ui="shared.ui.paint-selector.popup"]')).toBe(popup);
  const focusable = Array.from(
    popup.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled)'
    )
  );
  mode.focus();
  const internalTab = new KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  act(() => mode.dispatchEvent(internalTab));
  expect(internalTab.defaultPrevented).toBe(false);
  focusable.at(-1)!.focus();
  const wrapForward = new KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  act(() => focusable.at(-1)!.dispatchEvent(wrapForward));
  expect(wrapForward.defaultPrevented).toBe(true);
  expect(shadowRoot.activeElement).toBe(focusable[0]);
  const wrapBackward = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  act(() => focusable[0]!.dispatchEvent(wrapBackward));
  expect(wrapBackward.defaultPrevented).toBe(true);
  expect(shadowRoot.activeElement).toBe(focusable.at(-1));
  act(() => root.unmount());
  host.remove();
});

it('traps focus in the dialog and restores it to the trigger on close', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <CompactPaintSelector
        label="Fill"
        title="Fill"
        value={createSolidPaint('#f00')}
        onChange={vi.fn()}
      />
    );
  });
  const trigger = host.querySelector<HTMLButtonElement>('button')!;
  act(() => trigger.click());
  await act(nextFrame);
  const popup = document.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.popup"]')!;
  const focusable = Array.from(
    popup.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled)'
    )
  );
  focusable.at(-1)!.focus();
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
  expect(document.activeElement).toBe(focusable[0]);
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await act(nextFrame);
  expect(document.activeElement).toBe(trigger);
  act(() => root.unmount());
  host.remove();
});

it('retains preset input on failure and blocks duplicate saves while pending', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let resolveSave!: (committed: boolean) => void;
  const onSave = vi.fn(() => new Promise<boolean>((resolve) => (resolveSave = resolve)));
  const value = createGradientPaint(
    '#f00',
    (() => {
      let id = 0;
      return () => `stop-${++id}`;
    })()
  );
  act(() =>
    root.render(
      <CompactPaintSelector
        label="Fill"
        title="Fill"
        value={value}
        onChange={vi.fn()}
        presetActions={{ onSave }}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  const popup = document.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.popup"]')!;
  act(() =>
    Array.from(popup.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'highlighter.paintPicker.saveAs')!
      .click()
  );
  const input = popup.querySelector<HTMLInputElement>('input[aria-label$="presetName"]')!;
  act(() => changeInput(input, 'Reusable gradient'));
  const save = Array.from(popup.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent === 'highlighter.paintPicker.save'
  )!;
  act(() => {
    save.click();
    save.click();
  });
  expect(onSave).toHaveBeenCalledOnce();
  await act(async () => resolveSave(false));
  expect(input.value).toBe('Reusable gradient');
  onSave.mockResolvedValueOnce(true);
  await act(async () => save.click());
  expect(popup.querySelector('input[aria-label$="presetName"]')).toBeNull();
  act(() => root.unmount());
  host.remove();
});
