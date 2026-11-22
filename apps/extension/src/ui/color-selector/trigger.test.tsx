// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ColorSelectorTrigger, ColorValue } from './trigger';
import { ColorCopyActivation } from './inspector-color-value';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { InspectorLayout } from '../compact-inspector-controls/layout';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderTrigger(
  props: Partial<React.ComponentProps<typeof ColorSelectorTrigger>> = {},
  framed = false,
  authorizeCopy?: (event: Event) => boolean
) {
  if (!container) {
    throw new Error('missing container');
  }

  act(() => {
    const control = (
      <ColorSelectorTrigger
        formatMode="hex"
        label="Grid color"
        value="#123456"
        onOpenPicker={() => undefined}
        onCommit={() => undefined}
        {...props}
      />
    );
    const component = framed ? <InspectorLayout>{control}</InspectorLayout> : control;
    root?.render(
      authorizeCopy ? (
        <ColorCopyActivation value={authorizeCopy}>{component}</ColorCopyActivation>
      ) : (
        component
      )
    );
  });
}

function getButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

it('uses the shared release activation before replacing a scoped value button with its editor', () => {
  act(() =>
    root?.render(
      <CommandPressScope value>
        <ColorSelectorTrigger
          formatMode="hex"
          label="Grid color"
          value="#123456"
          onOpenPicker={() => undefined}
          onCommit={() => undefined}
        />
      </CommandPressScope>
    )
  );
  const value = container?.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.color-selector.value-trigger"]'
  );
  expect(value?.hasAttribute('data-command-press')).toBe(true);
  act(() => value?.click());
  const input = container?.querySelector('input');
  expect(input?.value).toBe('#123456');
  expect(document.activeElement).toBe(input);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('separates the picker swatch from editable text without a palette trigger', async () => {
  const onOpenPicker = vi.fn();
  renderTrigger({ onOpenPicker });
  expect(
    container?.querySelector('[data-ui="shared.ui.color-selector.palette-trigger"]')
  ).toBeNull();
  expect(getButton('Grid color')?.textContent).toBe('#123456');
  await act(async () => getButton('shared.ui.colorSelectorChooseColor')?.click());
  expect(onOpenPicker).toHaveBeenCalledOnce();
  await act(async () => getButton('Grid color')?.click());
  expect(container?.querySelector('input')?.value).toBe('#123456');
  expect(document.activeElement).toBe(container?.querySelector('input'));
  expect(onOpenPicker).toHaveBeenCalledOnce();
});

async function enterValue(value: string, key: string) {
  await act(async () => getButton('Grid color')?.click());
  const input = container!.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
  return input;
}

it('commits a normalized value once and restores keyboard focus', async () => {
  const onCommit = vi.fn();
  renderTrigger({ onCommit });
  await enterValue('#abc', 'Enter');
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('#aabbcc');
  expect(document.activeElement).toBe(getButton('Grid color'));
});

it('finishes the inline draft before opening the picker when toolbar presses retain focus', async () => {
  const order: string[] = [];
  function OwnedColor() {
    const [color, setColor] = React.useState('#123456');
    return (
      <ColorSelectorTrigger
        formatMode="hex"
        label="Grid color"
        value={color}
        onCommit={(value) => {
          order.push(value);
          setColor(value);
        }}
        onOpenPicker={() => order.push(`picker:${color}`)}
      />
    );
  }
  act(() => root?.render(<OwnedColor />));
  await enterValue('#abcdef', 'Tab');
  const swatch = getButton('shared.ui.colorSelectorChooseColor')!;
  await act(async () => {
    swatch.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    swatch.click();
  });
  expect(order).toEqual(['#abcdef', 'picker:#abcdef']);
});

it('retains invalid input without changing the color and Escape cancels it', async () => {
  const onCommit = vi.fn();
  renderTrigger({ onCommit });
  const input = await enterValue('invalid', 'Enter');
  expect(onCommit).not.toHaveBeenCalled();
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(container?.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(getButton('Grid color')?.textContent).toBe('#123456');
  expect(document.activeElement).toBe(getButton('Grid color'));
});

it('rejects alpha and transparent input when unavailable for the consumer', async () => {
  const onCommit = vi.fn();
  renderTrigger({ onCommit, allowAlpha: false, allowTransparent: false });
  await enterValue('#abcdef80', 'Enter');
  expect(onCommit).not.toHaveBeenCalled();
  await enterValue('transparent', 'Enter');
  expect(onCommit).not.toHaveBeenCalled();
});

it('preserves a transparent value until the user enters opaque black', async () => {
  const onCommit = vi.fn();
  renderTrigger({ value: 'transparent', allowAlpha: false, onCommit }, true);
  const label = 'shared.ui.colorSelectorTransparent';
  expect(getButton('Grid color')?.textContent).toBe(label);
  await enterValue(label, 'Enter');
  expect(onCommit).not.toHaveBeenCalled();
  await enterValue('#000000', 'Enter');
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('#000000');
});

it('accepts full hex into opaque framed fields and strips alpha', async () => {
  const onCommit = vi.fn();
  renderTrigger({ onCommit, allowAlpha: false }, true);
  await enterValue('#abcdef80', 'Enter');
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('#abcdef');
  expect(container?.querySelector('.alpha-value')).toBeNull();
});

it('keeps a single HEX and alpha control when a framed picker opens and closes', () => {
  for (const disabled of [false, true, false, true, false]) {
    act(() =>
      root?.render(
        <InspectorLayout>
          <ColorValue
            label="Grid color"
            value="#12345681"
            displayValue="#12345681"
            disabled={disabled}
            allowAlpha
            allowTransparent
            onCommit={() => undefined}
          />
        </InspectorLayout>
      )
    );
    expect(container?.querySelectorAll('.inspector-hex-trigger')).toHaveLength(1);
    expect(container?.querySelectorAll('.alpha-value')).toHaveLength(1);
  }
});

it('ignores synthetic copy events before calling either clipboard writer', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const legacyCopy = vi.fn().mockReturnValue(true);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: legacyCopy });
  try {
    renderTrigger({ value: '#12345681' }, true);
    await act(async () => getButton('shared.ui.colorSelectorCopy')?.click());
    expect(writeText).not.toHaveBeenCalled();
    expect(legacyCopy).not.toHaveBeenCalled();
    expect(container?.querySelector('button[data-copy-state="idle"]')).not.toBeNull();
  } finally {
    Reflect.deleteProperty(document, 'execCommand');
  }
});

it('keeps split color text and alpha editable and copies the exact hex', async () => {
  const onCommit = vi.fn();
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  renderTrigger({ onCommit, value: '#12345681' }, true, () => true);
  expect(getButton('Grid color')?.textContent).toBe('#123456');
  expect(container?.querySelector('.alpha-value .readout-digits')?.textContent).toBe('51');
  await act(async () => getButton('shared.ui.colorSelectorCopy')?.click());
  expect(writeText).toHaveBeenCalledExactlyOnceWith('#12345681');
  expect(container?.querySelector('button[data-copy-state="copied"]')).not.toBeNull();
  await enterValue('#abcdef', 'Enter');
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('#abcdef81');
});

it('steps alpha on the full color field and keeps invalid drafts from committing', () => {
  const onCommit = vi.fn();
  renderTrigger({ onCommit, value: '#12345680' }, true);
  const surface = container!.querySelector<HTMLElement>(
    '[data-ui="shared.ui.color-selector.trigger"]'
  )!;
  const open = () => {
    act(() => surface.querySelector<HTMLButtonElement>('.alpha-value button')!.click());
    return surface.querySelector<HTMLInputElement>('.alpha-value input')!;
  };
  const input = open();
  expect(document.activeElement).toBe(input);
  const wheel = (init: WheelEventInit) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    act(() => surface.dispatchEvent(event));
    return event.defaultPrevented;
  };
  const press = (key: string) =>
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
  expect(wheel({ deltaY: -100 })).toBe(false);
  expect(wheel({ altKey: true, deltaX: 100 })).toBe(false);
  expect(input.value).toBe('50');
  expect(wheel({ altKey: true, deltaY: -100 })).toBe(true);
  expect(input.value).toBe('51');
  press('ArrowUp');
  press('ArrowDown');
  expect(input.value).toBe('51');
  press('Enter');
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('#12345682');

  const invalid = open();
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(invalid, '101');
    invalid.dispatchEvent(new Event('input', { bubbles: true }));
    invalid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(invalid.getAttribute('aria-invalid')).toBe('true');
  expect(surface.querySelector('[role="alert"]')).not.toBeNull();
  expect(wheel({ altKey: true, deltaY: 100 })).toBe(false);
  act(() => invalid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(surface.querySelector('[role="alert"]')).toBeNull();
  expect(onCommit).toHaveBeenCalledTimes(1);
});

it('reports clipboard denial on the copy action without opening an editor', async () => {
  const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  renderTrigger({ value: '#12345681' }, true, () => true);
  await act(async () => getButton('shared.ui.colorSelectorCopy')?.click());
  expect(writeText).toHaveBeenCalledExactlyOnceWith('#12345681');
  expect(container?.querySelector('[role="status"]')?.textContent).toBe(
    'shared.ui.colorSelectorCopyFailed'
  );
  expect(container?.querySelector('[role="status"]')?.classList.contains('sr-only')).toBe(true);
  expect(container?.querySelector('button[data-copy-state="copied"]')).toBeNull();
  expect(container?.querySelector('button[data-copy-state="failed"]')).not.toBeNull();
  expect(container?.querySelector('input:not([aria-hidden="true"])')).toBeNull();
  expect(
    container?.querySelector('button[data-copy-state="failed"] svg.lucide-copy')
  ).not.toBeNull();
  expect(getButton('Grid color')?.textContent).toBe('#123456');
});

it.each(['Enter', 'blur'])('keeps the original alpha byte after unchanged %s', (action) => {
  const onCommit = vi.fn();
  renderTrigger({ value: '#33445501', onCommit }, true);
  const button = container!.querySelector<HTMLButtonElement>('.alpha-value button')!;
  act(() => button.click());
  const input = container!.querySelector<HTMLInputElement>('.alpha-value input')!;
  expect(input.value).toBe('0');
  act(() => {
    if (action === 'blur') input.blur();
    else input.dispatchEvent(new KeyboardEvent('keydown', { key: action, bubbles: true }));
  });
  expect(onCommit).not.toHaveBeenCalled();
});

it.each([
  [true, '#5985a380'],
  [false, '#5985a3'],
])('applies pasted HEX immediately with alpha support %s', async (allowAlpha, expected) => {
  const onCommit = vi.fn();
  renderTrigger({ onCommit, allowAlpha }, true);
  await act(async () => getButton('Grid color')?.click());
  const editor = container?.querySelector('input');
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '#5985A380' } });
  await act(async () => editor?.dispatchEvent(paste));
  expect(paste.defaultPrevented).toBe(true);
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(expected);
  expect(getButton('Grid color')).toBe(document.activeElement);
});

it('disables both actions and preserves formatted values', () => {
  renderTrigger({ disabled: true, formatMode: 'rgb', value: '#abcdef' });
  expect(getButton('Grid color')?.textContent).toBe('RGB(171, 205, 239)');
  expect([...container!.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
});

it('commits valid input on blur and discards an edit when the consumer value changes', async () => {
  const onCommit = vi.fn();
  renderTrigger({ onCommit });
  const input = await enterValue('#abcdef', 'Tab');
  await act(async () => input.blur());
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('#abcdef');
  await enterValue('#bad', 'Tab');
  renderTrigger({ onCommit, value: '#111111' });
  expect(container?.querySelector('input')).toBeNull();
  expect(getButton('Grid color')?.textContent).toBe('#111111');
  expect(onCommit).toHaveBeenCalledTimes(1);
});
