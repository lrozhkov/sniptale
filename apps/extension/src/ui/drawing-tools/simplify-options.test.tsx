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

it('offers three sensitivities only in Auto and three thicknesses for text, with remembered values', async () => {
  render();
  expect(host.querySelectorAll('[data-ui*="simplify.sensitivity-"]')).toHaveLength(3);
  expect(host.querySelectorAll('[data-ui*="simplify.thickness-"]')).toHaveLength(3);
  await click('sensitivity-90');
  expect(change).toHaveBeenLastCalledWith({ sensitivity: 90 });
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
  expect(option('sensitivity-90')?.getAttribute('aria-pressed')).toBe('true');
  expect(option('thickness-0.65')?.getAttribute('aria-pressed')).toBe('true');
});

it('keeps automatic color separate from the opaque palette and restores it on request', async () => {
  render();
  expect(option('color-auto')?.getAttribute('aria-pressed')).toBe('true');
  expect(
    host.querySelectorAll(
      '[data-ui="content.toolbar.drawing-options.quick-colors"] [aria-pressed="true"]'
    )
  ).toHaveLength(0);
  const swatch = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('content.toolbar.drawingColor')}: #abcdef"]`
  )!;
  await act(async () => swatch.click());
  expect(change).toHaveBeenLastCalledWith({ color: '#abcdef' });
  expect(option('color-auto')?.getAttribute('aria-pressed')).toBe('false');
  await click('color-auto');
  expect(change).toHaveBeenLastCalledWith({ color: null });
  expect(option('color-auto')?.getAttribute('aria-pressed')).toBe('true');
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
    expect(properties.length).toBeGreaterThanOrEqual(10);
    for (const button of properties) expect(button.getAttribute('aria-label')).toBeTruthy();
    expect(host.querySelector('select')).toBeNull();
    expect(host.innerHTML).not.toContain('sniptale-glass-toolbar-button--active');
  }
);

it.each([false, true])(
  'restores automatic source color after cancel with explicit reset=%s',
  async (explicitReset) => {
    render(createDefaultSimplifySettings(), {}, !explicitReset);
    await act(async () => pickerButton('shared.ui.colorSelectorChooseColor').click());
    await editPicker('#abcdef');
    expect(preview).toHaveBeenLastCalledWith('#abcdef');
    await act(async () => pickerButton('shared.ui.colorSelectorCancel').click());
    expect(explicitReset ? reset : preview).toHaveBeenLastCalledWith(null);
    expect(change).not.toHaveBeenCalled();
    expect(option('color-auto')?.getAttribute('aria-pressed')).toBe('true');
  }
);

it('keeps shared translucent palette colors opaque for Simplify', async () => {
  render(createDefaultSimplifySettings(), { colors: ['#abcdef40'] });
  const swatch = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('content.toolbar.drawingColor')}: #abcdef"]`
  )!;
  await act(async () => swatch.click());
  expect(change).toHaveBeenCalledExactlyOnceWith({ color: '#abcdef' });
});
