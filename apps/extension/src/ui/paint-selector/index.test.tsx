// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createSolidPaint } from '@sniptale/foundation/paint';
import { CompactPaintSelector } from '.';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function selectPaintMode(popup: Element, mode: 'solid' | 'linear' | 'radial' | 'conic') {
  popup.querySelector<HTMLButtonElement>(`[aria-label="highlighter.paintPicker.${mode}"]`)!.click();
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it('renders the shared selector trigger with a labeled value and transparency preview', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <CompactPaintSelector
        label="Fill"
        title="Fill"
        value={createSolidPaint('#00000000')}
        onChange={vi.fn()}
      />
    )
  );
  const trigger = host.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.paint-selector.trigger"]'
  )!;
  const preview = trigger.querySelector<HTMLElement>(
    '[data-ui="shared.ui.paint-selector.preview"]'
  )!;
  expect(trigger.textContent).toContain('Fill');
  expect(trigger.textContent).toContain('#00000000');
  expect(preview.style.backgroundSize).toBe('100% 100%, 8px 8px');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  act(() => trigger.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  act(() => root.unmount());
  host.remove();
});

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
  act(() => selectPaintMode(popup, 'linear'));
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

it('limits modes and advanced gradient controls for legacy-backed consumers', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <CompactPaintSelector
        allowedModes={['solid', 'linear']}
        showGradientAdvancedControls={false}
        label="Background"
        title="Background"
        value={createSolidPaint('#f00')}
        onChange={vi.fn()}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  const popup = document.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.popup"]')!;
  expect(popup.querySelector('[aria-label="highlighter.paintPicker.radial"]')).toBeNull();
  expect(popup.querySelector('[aria-label="highlighter.paintPicker.conic"]')).toBeNull();
  act(() => selectPaintMode(popup, 'linear'));
  expect(popup.querySelector('summary')).toBeNull();
  act(() => root.unmount());
  host.remove();
});

it('uses a compact solid-color layout and shows the palette in the same dialog', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  act(() =>
    root.render(
      <CompactPaintSelector
        label="Fill"
        title="Fill"
        palette={['#123456', '#abcdef']}
        value={createSolidPaint('#ffffff')}
        onChange={onChange}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  const layer = document.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.layer"]')!;
  const popup = layer.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.popup"]')!;
  expect(layer.style.width).toBe('328px');
  expect(popup.querySelector('[data-ui="shared.ui.paint-selector.presets"]')).toBeNull();
  const paletteColor = popup.querySelector<HTMLButtonElement>('[aria-label="Fill: #123456"]')!;
  act(() => paletteColor.click());
  act(() =>
    Array.from(popup.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'shared.ui.colorSelectorApply')!
      .click()
  );
  expect(onChange).toHaveBeenCalledWith(createSolidPaint('#123456'));
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
  const mode = popup.querySelector<HTMLButtonElement>(
    '[aria-label="highlighter.paintPicker.linear"]'
  )!;
  act(() => {
    mode.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    mode.click();
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

it('changes a newly created gradient without selecting a template', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  act(() =>
    root.render(
      <CompactPaintSelector
        label="Fill"
        title="Fill"
        value={createSolidPaint('#ffffff')}
        onChange={onChange}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  const popup = document.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.popup"]')!;
  act(() => selectPaintMode(popup, 'linear'));
  const color = popup.querySelector<HTMLInputElement>(
    'input[aria-label="shared.ui.colorSelectorHex"]'
  )!;
  act(() => changeInput(color, '#123456'));
  act(() =>
    Array.from(popup.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'shared.ui.colorSelectorApply')!
      .click()
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'gradient',
      gradient: expect.objectContaining({
        stops: expect.arrayContaining([expect.objectContaining({ color: '#123456ff' })]),
      }),
    })
  );
  act(() => root.unmount());
  host.remove();
});
