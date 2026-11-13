// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { RasterParametersPopover } from './raster-parameters-popover';

let container: HTMLDivElement;
let root: Root;
function renderPopover(children: ReactNode = <button>Rectangle</button>) {
  act(() =>
    root.render(
      <div data-ui="editor.raster.toolbar">
        <button aria-pressed="true">Active tool</button>
        <RasterParametersPopover
          title="Tool parameters"
          trigger={<svg aria-hidden="true" />}
          triggerClassName="parameter-trigger"
        >
          {children}
        </RasterParametersPopover>
      </div>
    )
  );
}
function trigger() {
  return container.querySelector<HTMLButtonElement>('[data-ui="editor.raster.parameters"]')!;
}
function dialog() {
  return document.querySelector<HTMLDivElement>('[role="dialog"]');
}
function open() {
  act(() => trigger().click());
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1499);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  renderPopover();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('owns portal placement and focuses the first enabled parameter control', () => {
  vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue(new DOMRect(1450, 60, 28, 28));
  open();
  expect(dialog()).not.toBeNull();
  expect(container.contains(dialog())).toBe(false);
  expect(dialog()?.style.left).toBe('1167px');
  expect(dialog()?.style.top).toBe('94px');
  expect(dialog()?.contains(document.activeElement)).toBe(true);
  expect(document.activeElement?.textContent).toBe('Rectangle');
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
});
it('gives the dialog focus when no parameter control is available', () => {
  renderPopover(<span>No active tool</span>);
  open();
  expect(document.activeElement).toBe(dialog());
});
it('dismisses on dialog Escape and restores focus to the disclosure', () => {
  open();
  act(() =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
  );
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(trigger());
});
it('closes the portal when inline controls become visible at the breakpoint', () => {
  open();
  act(() => {
    vi.stubGlobal('innerWidth', 1500);
    window.dispatchEvent(new Event('resize'));
  });
  expect(dialog()).toBeNull();
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement?.textContent).toBe('Active tool');
});
it('retains a nested floating picker but dismisses for an outside pointer', () => {
  open();
  const picker = document.createElement('div');
  picker.dataset['floatingUiRoot'] = 'true';
  document.body.appendChild(picker);
  act(() => picker.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(dialog()).not.toBeNull();
  act(() => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(dialog()).toBeNull();
  picker.remove();
});
it('toggles from its disclosure and removes the portal when its owner unmounts', () => {
  open();
  open();
  expect(dialog()).toBeNull();
  open();
  act(() => root.render(null));
  expect(dialog()).toBeNull();
});

it('retains its anchor native dialog and scoped theme for the parameter portal', () => {
  const nativeDialog = document.createElement('dialog');
  nativeDialog.open = true;
  nativeDialog.dataset['theme'] = 'dark';
  document.body.appendChild(nativeDialog);
  nativeDialog.appendChild(container);
  open();
  expect(dialog()?.parentElement).toBe(nativeDialog);
  expect(dialog()?.getAttribute('data-theme')).toBe('dark');
  act(() => root.render(null));
  nativeDialog.remove();
});

it('keeps the parameter dialog open when Escape closes its canonical choice menu', () => {
  renderPopover(
    <ProductSelect
      value="free"
      onChange={vi.fn()}
      options={[
        { value: 'free', label: 'Free ratio' },
        { value: '1:1', label: '1:1' },
      ]}
      aria-label="Crop ratio"
    />
  );
  open();
  act(() => dialog()?.querySelector<HTMLButtonElement>('button')?.click());
  const option = document.querySelector<HTMLButtonElement>('[role="option"]');
  expect(option).not.toBeNull();
  act(() =>
    option?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(dialog()).not.toBeNull();
});
