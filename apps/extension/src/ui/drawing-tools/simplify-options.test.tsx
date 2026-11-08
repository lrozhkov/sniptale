// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';
import { translate } from '../../platform/i18n';
import { DrawingSimplifyOptions, type DrawingSimplifyOptionsProps } from './simplify-options';

let host: HTMLDivElement;
let root: Root;
const change = vi.fn();
const preview = vi.fn();
const reset = vi.fn();

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  change.mockClear();
  preview.mockClear();
  reset.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(
  settings = createDefaultSimplifySettings(),
  extra: Partial<DrawingSimplifyOptionsProps> = {},
  omitReset = false
) {
  function ControlledOptions() {
    const [value, setValue] = useState(settings);
    return (
      <DrawingSimplifyOptions
        settings={value}
        colors={['#123456', '#abcdef']}
        floatingBoundaryRef={{ current: null }}
        floatingPlacement="auto"
        vertical={false}
        onPreview={preview}
        {...(omitReset ? {} : { onPreviewReset: reset })}
        onChange={(update) => {
          change(update);
          setValue((previous) => ({ ...previous, ...update }));
        }}
        {...extra}
      />
    );
  }
  act(() => root.render(<ControlledOptions />));
}
function option(name: string) {
  return host.querySelector<HTMLButtonElement>(
    `[data-ui="content.toolbar.drawing-options.simplify.${name}"]`
  );
}
async function click(name: string) {
  const button = option(name);
  expect(button).not.toBeNull();
  await act(async () => button!.click());
}
function pickerButton(key: Parameters<typeof translate>[0]) {
  const button = [...document.querySelectorAll('button')].find(
    (item) =>
      item.getAttribute('aria-label') === translate(key) || item.textContent === translate(key)
  );
  if (!button) throw new Error(`Missing picker action: ${key}`);
  return button;
}
async function editPicker(value: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="${translate('shared.ui.colorSelectorHex')}"]`
  );
  if (!input) throw new Error('Missing color HEX input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    input.focus();
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
  });
}

it('keeps Auto independent and restores the inactive content and manual choices', async () => {
  render();
  expect(option('automatic')?.getAttribute('aria-pressed')).toBe('true');
  expect(option('content-text')?.getAttribute('aria-pressed')).toBe('true');
  expect(option('manual-text')).toBeNull();
  await click('content-all');
  expect(change).toHaveBeenLastCalledWith({ content: 'all' });
  await click('automatic');
  expect(change).toHaveBeenLastCalledWith({ automatic: false });
  expect(option('manual-text')?.getAttribute('aria-pressed')).toBe('true');
  expect(option('content-all')).toBeNull();
  await click('manual-image');
  expect(change).toHaveBeenLastCalledWith({ manualKind: 'image' });
  await click('automatic');
  expect(option('content-all')?.getAttribute('aria-pressed')).toBe('true');
  await click('automatic');
  expect(option('manual-image')?.getAttribute('aria-pressed')).toBe('true');
});

it('keeps default sensitivity hidden and offers three text thickness samples without numbers', async () => {
  render();
  expect(createDefaultSimplifySettings().sensitivity).toBe(55);
  expect(host.querySelectorAll('[data-ui*="simplify.sensitivity-"]')).toHaveLength(0);
  expect(host.querySelectorAll('[data-ui*="simplify.thickness-"]')).toHaveLength(3);
  expect([0.35, 0.5, 0.65].map((v) => option('thickness-' + v)?.textContent)).toEqual(['', '', '']);
  await click('thickness-0.65');
  expect(change).toHaveBeenLastCalledWith({ thickness: 0.65 });
  await click('automatic');
  expect(host.querySelectorAll('[data-ui*="simplify.sensitivity-"]')).toHaveLength(0);
  expect(option('thickness-0.65')?.getAttribute('aria-pressed')).toBe('true');
  await click('manual-image');
  expect(host.querySelectorAll('[data-ui*="simplify.thickness-"]')).toHaveLength(0);
  expect(
    host
      .querySelector('[data-ui="content.toolbar.drawing-options.simplify.color"]')
      ?.getAttribute('aria-label')
  ).toBe(translate('content.toolbar.drawingFillColor'));
  await click('automatic');
  expect(host.querySelectorAll('[data-ui*="simplify.sensitivity-"]')).toHaveLength(0);
  expect(change.mock.calls.some(([update]) => 'sensitivity' in update)).toBe(false);
  expect(option('thickness-0.65')?.getAttribute('aria-pressed')).toBe('true');
});

it('uses the Shapes fill toggle for automatic color and remembers custom color', async () => {
  render();
  expect(option('color')?.getAttribute('aria-pressed')).toBe('false');
  expect(option('color-auto')).toBeNull();
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.quick-colors"]')).toBeNull();
  await click('color');
  expect(change).toHaveBeenLastCalledWith({ color: '#123456' });
  expect(option('color')?.getAttribute('aria-pressed')).toBe('true');
  const swatch = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('content.toolbar.drawingColor')}: #abcdef"]`
  )!;
  await act(async () => swatch.click());
  await click('color');
  expect(change).toHaveBeenLastCalledWith({ color: null });
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.quick-colors"]')).toBeNull();
  await click('color');
  expect(change).toHaveBeenLastCalledWith({ color: '#abcdef' });
});

it('uses the standard picker: edits preview, Cancel resets, and Apply commits once without alpha', async () => {
  render({ ...createDefaultSimplifySettings(), color: '#123456' });
  const open = async () =>
    act(async () => pickerButton('shared.ui.colorSelectorChooseColor').click());
  await open();
  expect(
    document.querySelector(`input[aria-label="${translate('shared.ui.colorSelectorAlpha')}"]`)
  ).toBeNull();
  await editPicker('#c83456');
  expect(preview).toHaveBeenLastCalledWith('#c83456');
  expect(change).not.toHaveBeenCalled();
  await act(async () => pickerButton('shared.ui.colorSelectorCancel').click());
  expect(reset).toHaveBeenLastCalledWith('#123456');
  expect(change).not.toHaveBeenCalled();
  await open();
  await editPicker('#abcdef');
  await act(async () => pickerButton('shared.ui.colorSelectorApply').click());
  expect(change).toHaveBeenCalledExactlyOnceWith({ color: '#abcdef' });
});

it('shows rebuild only when its selected-layer consumer provides a callback', async () => {
  render();
  expect(option('rebuild')).toBeNull();
  const rebuild = vi.fn();
  render(createDefaultSimplifySettings(), { onRebuild: rebuild });
  await click('rebuild');
  expect(rebuild).toHaveBeenCalledOnce();
  expect(change).not.toHaveBeenCalled();
});

it.each([false, true])(
  'uses neutral named property choices and standard layout with vertical=%s',
  (vertical) => {
    render(createDefaultSimplifySettings(), { vertical });
    const group = host.querySelector('[data-ui="content.toolbar.drawing-options.simplify"]')!;
    expect(group.className).toContain(vertical ? 'flex-col' : 'flex-row');
    const properties = host.querySelectorAll('button[data-command-property="true"]');
    expect(properties).toHaveLength(7);
    for (const button of properties) expect(button.getAttribute('aria-label')).toBeTruthy();
    expect(host.querySelector('select')).toBeNull();
    expect(host.innerHTML).not.toContain('sniptale-glass-toolbar-button--active');
  }
);

it.each([false, true])(
  'restores custom color on picker cancel and returns to automatic by toggle, explicit reset=%s',
  async (explicitReset) => {
    render(createDefaultSimplifySettings(), {}, !explicitReset);
    await click('color');
    change.mockClear();
    await act(async () => pickerButton('shared.ui.colorSelectorChooseColor').click());
    await editPicker('#abcdef');
    expect(preview).toHaveBeenLastCalledWith('#abcdef');
    await act(async () => pickerButton('shared.ui.colorSelectorCancel').click());
    expect(explicitReset ? reset : preview).toHaveBeenLastCalledWith('#123456');
    expect(change).not.toHaveBeenCalled();
    await click('color');
    expect(change).toHaveBeenLastCalledWith({ color: null });
    expect(option('color')?.getAttribute('aria-pressed')).toBe('false');
  }
);

it('keeps shared translucent palette colors opaque for Simplify', async () => {
  render(createDefaultSimplifySettings(), { colors: ['#abcdef40'] });
  await click('color');
  change.mockClear();
  const swatch = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('content.toolbar.drawingColor')}: #abcdef"]`
  )!;
  await act(async () => swatch.click());
  expect(change).toHaveBeenCalledExactlyOnceWith({ color: '#abcdef' });
});

it('offers three spacing icons only in manual Text and retains the choice across modes', async () => {
  render();
  const choices = () => host.querySelectorAll('[data-ui*="simplify.line-spacing-"]');
  expect(choices()).toHaveLength(0);
  await click('automatic');
  expect(choices()).toHaveLength(3);
  expect(option('line-spacing-1.5')?.getAttribute('aria-pressed')).toBe('true');
  expect(
    new Set([...choices()].map((button) => button.querySelector('path')?.getAttribute('d'))).size
  ).toBe(3);
  for (const value of [1, 2, 1.5]) {
    await click(`line-spacing-${value}`);
    expect(change).toHaveBeenLastCalledWith({ lineSpacing: value });
    expect(option(`line-spacing-${value}`)?.getAttribute('aria-pressed')).toBe('true');
    expect(option(`line-spacing-${value}`)?.getAttribute('aria-label')).toBeTruthy();
  }
  await click('manual-image');
  expect(choices()).toHaveLength(0);
  await click('manual-text');
  expect(option('line-spacing-1.5')?.getAttribute('aria-pressed')).toBe('true');
  await click('automatic');
  expect(choices()).toHaveLength(0);
  await click('automatic');
  expect(option('line-spacing-1.5')?.getAttribute('aria-pressed')).toBe('true');
});
