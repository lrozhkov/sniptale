// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NumberInput } from '../inputs/number';
import {
  EffectPresetEditingProvider,
  useEffectPresetEditing,
  useEffectPresetMatchingControls,
} from './editing';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function Parameter({
  controls,
  onChange,
}: {
  controls: Record<string, number>;
  onChange(value: number): void;
}) {
  const editing = useEffectPresetEditing('effect', controls);
  return (
    <NumberInput
      label="Intensity"
      value={controls['intensity']!}
      min={0}
      max={100}
      onChange={onChange}
      onPreview={editing.begin}
      onCommit={editing.finish}
    />
  );
}
function Surface({ show = true }: { show?: boolean }) {
  const [controls, setControls] = useState({ intensity: 20 });
  const matching = useEffectPresetMatchingControls('effect', controls);
  const other = useEffectPresetMatchingControls('other', { intensity: 90 });
  return (
    <>
      <output data-matching>{matching['intensity']}</output>
      <output data-live>{controls['intensity']}</output>
      <output data-other>{other['intensity']}</output>
      {show && (
        <Parameter controls={controls} onChange={(intensity) => setControls({ intensity })} />
      )}
    </>
  );
}
const render = (show = true, selection = 'first') =>
  act(() =>
    root.render(
      <EffectPresetEditingProvider key={selection}>
        <Surface show={show} />
      </EffectPresetEditingProvider>
    )
  );
const read = (name: string) => host.querySelector(`[data-${name}]`)!.textContent;
const range = () => host.querySelector<HTMLInputElement>('input[type=range]')!;
function input(element: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it.each(['pointerup', 'keyup', 'pointercancel', 'focusout'])(
  'defers matching through preview and releases on %s, including duplicate completion',
  (event) => {
    render();
    input(range(), '50');
    expect(read('live')).toBe('50');
    expect(read('matching')).toBe('20');
    expect(read('other')).toBe('90');
    input(range(), '70');
    expect(read('matching')).toBe('20');
    act(() => range().dispatchEvent(new Event(event, { bubbles: true })));
    expect(read('matching')).toBe('70');
    act(() => range().dispatchEvent(new Event(event, { bubbles: true })));
    expect(read('matching')).toBe('70');
    input(range(), '50');
    expect(read('matching')).toBe('70');
  }
);

it('ends matching suspension when a parameter section unmounts or selection changes', () => {
  render();
  input(range(), '50');
  render(false);
  expect(read('matching')).toBe('50');
  render();
  input(range(), '70');
  render(true, 'second');
  expect(read('matching')).toBe('20');
});

it('matches numeric text only on Enter or blur, and preserves the selection on Escape', () => {
  render();
  const field = () => host.querySelector<HTMLInputElement>('input:not([type=range])')!;
  act(() => field().focus());
  input(field(), '50');
  expect(read('live')).toBe('20');
  expect(read('matching')).toBe('20');
  act(() => field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(read('matching')).toBe('50');
  act(() => field().focus());
  input(field(), '70');
  act(() => field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(read('matching')).toBe('50');
  input(field(), '80');
  act(() => field().blur());
  expect(read('matching')).toBe('80');
});

it.each(['button', 'svg'])(
  'keeps matching frozen when pressing the stepper %s until pointer release',
  (target) => {
    vi.useFakeTimers();
    try {
      render();
      const increase = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Intensity increase"]'
      )!;
      act(() =>
        (target === 'svg' ? increase.querySelector('svg')! : increase).dispatchEvent(
          new Event('pointerdown', { bubbles: true, cancelable: true })
        )
      );
      expect(read('live')).toBe('21');
      expect(read('matching')).toBe('20');
      act(() => vi.advanceTimersByTime(650));
      expect(Number(read('live'))).toBeGreaterThan(21);
      expect(read('matching')).toBe('20');
      act(() => increase.dispatchEvent(new Event('pointerup', { bubbles: true })));
      expect(read('matching')).toBe(read('live'));
    } finally {
      vi.useRealTimers();
    }
  }
);

it('keeps matching frozen through repeated keyboard activation of a stepper', () => {
  render();
  const increase = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Intensity increase"]'
  )!;
  act(() => increase.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  act(() => increase.click());
  act(() => increase.click());
  expect(read('live')).toBe('22');
  expect(read('matching')).toBe('20');
  act(() => increase.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })));
  expect(read('matching')).toBe('22');
});
