// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ControlDefinition } from '@sniptale/runtime-contracts/effect-v1';
import { InspectorLayout } from '../../../../../ui/compact-inspector-controls/layout';
import { EffectControl } from './control-field';

let host: HTMLDivElement;
let root: Root;
const update = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  update.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function render(
  control: ControlDefinition,
  value: number | string = control.defaultValue,
  inspector = false,
  disabled = false
) {
  const field = (
    <EffectControl
      control={control}
      value={value}
      instanceId="annotation"
      controls={{ [control.id]: value }}
      disabled={disabled}
      onUpdate={update}
    />
  );
  act(() => root.render(inspector ? <InspectorLayout>{field}</InspectorLayout> : field));
}
const number: Extract<ControlDefinition, { kind: 'number' }> = {
  id: 'amount',
  label: { en: 'Amount' },
  kind: 'number',
  defaultValue: 10,
  unit: 'percent',
};
function input() {
  const node = host.querySelector<HTMLInputElement>('input:not([type="range"])');
  if (!node) throw new Error('Missing parameter input');
  return node;
}
function type(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    node.focus();
    const prototype =
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) throw new Error('Missing native value setter');
    setter.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('keeps units beside values and commits a typed numeric command once', () => {
  render({ ...number, min: 0, max: 100, presentation: 'number' }, 'stale', true);
  expect(input().value).toBe('10');
  expect(host.textContent).toContain('%');
  expect(input().getAttribute('aria-label')).toBe('Amount');
  expect(host.querySelector('input[type="range"]')).toBeNull();
  type(input(), '30');
  act(() => input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
  expect(update).toHaveBeenCalledOnce();
  expect(update).toHaveBeenLastCalledWith('annotation', { controls: { amount: 30 } });
});

const ranges: Array<{
  min?: number;
  max?: number;
  step?: number;
  value: number;
  low: string;
  high: string;
}> = [
  { min: 500, value: 550, low: '500', high: '600' },
  { max: -500, value: -550, low: '-600', high: '-500' },
  { value: 50, low: '0', high: '100' },
  { min: 0, max: 50, step: 0.5, value: 20, low: '0', high: '50' },
];
it.each(ranges)(
  'offers a usable explicit slider for bounded and one-sided ranges $low..$high',
  ({ value, low, high, ...bounds }) => {
    render({ ...number, ...bounds, defaultValue: value, presentation: 'slider' }, value);
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]');
    expect(slider).not.toBeNull();
    expect([slider?.min, slider?.max, slider?.value]).toEqual([low, high, String(value)]);
    expect(update).not.toHaveBeenCalled();
  }
);

it('retains the ordinary bounded scrub for auto presentation', () => {
  render({ ...number, min: 0, max: 100 }, 20);
  expect(host.querySelector('input[type="range"]')).not.toBeNull();
});

it('dispatches numeric toggle options without serializing the value as text', () => {
  render(
    {
      id: 'amount',
      label: { en: 'Amount' },
      kind: 'number',
      defaultValue: 0,
      presentation: 'toggle',
      options: [
        { value: 0, label: { en: 'Off' } },
        { value: 1, label: { en: 'On' } },
      ],
    },
    0
  );
  const button = host.querySelector<HTMLButtonElement>('[role="switch"]');
  if (!button) throw new Error('Missing option switch');
  act(() => button.click());
  expect(update).toHaveBeenLastCalledWith('annotation', { controls: { amount: 1 } });
});

it.each([false, true])(
  'retains ordinary deferred text editing in inspector mode %s',
  (inspector) => {
    render(
      { id: 'text', label: { en: 'Text' }, kind: 'text', defaultValue: 'Original' },
      42,
      inspector
    );
    expect(input().value).toBe('Original');
    type(input(), 'Changed');
    expect(update).not.toHaveBeenCalled();
    act(() => input().blur());
    expect(update).toHaveBeenLastCalledWith('annotation', { controls: { text: 'Changed' } });
  }
);

it('cancels and then commits the explicit multiline draft through the native command owner', () => {
  render({
    id: 'text',
    label: { en: 'Text' },
    kind: 'text',
    defaultValue: 'Original',
    presentation: 'textarea',
  });
  const textarea = host.querySelector('textarea');
  if (!textarea) throw new Error('Missing multiline input');
  type(textarea, 'Cancelled');
  act(() => textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));
  expect(update).not.toHaveBeenCalled();
  expect(textarea.value).toBe('Original');
  type(textarea, 'Changed\nSecond line');
  act(() =>
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', ctrlKey: true })
    )
  );
  expect(update).toHaveBeenCalledOnce();
  expect(update).toHaveBeenLastCalledWith('annotation', {
    controls: { text: 'Changed\nSecond line' },
  });
});

it.each([
  { value: '#abcdef', expected: '#ABCDEF' },
  { value: 42, expected: '#123456' },
])(
  'displays admitted color values and falls back for a mismatched stored kind',
  ({ value, expected }) => {
    render({ id: 'color', label: { en: 'Color' }, kind: 'color', defaultValue: '#123456' }, value);
    expect(host.textContent).toContain(expected);
    expect(update).not.toHaveBeenCalled();
  }
);

it('keeps a disabled parameter inert', () => {
  render({ ...number, presentation: 'slider', min: 0, max: 100 }, 10, true, true);
  expect(input().disabled).toBe(true);
  expect(host.querySelector('input[type="range"]:enabled')).toBeNull();
  expect(update).not.toHaveBeenCalled();
});
