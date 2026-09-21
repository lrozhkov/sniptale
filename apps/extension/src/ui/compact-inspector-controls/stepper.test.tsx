// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { NumericStepper } from './stepper';

it.each([false, true])(
  'handles native keyboard activation once and respects disabled=%s',
  (disabled) => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const onStep = vi.fn();
    try {
      act(() => root.render(<NumericStepper label="Value" disabled={disabled} onStep={onStep} />));
      const buttons = container.querySelectorAll('button');
      act(() => buttons[0]!.click());
      act(() => buttons[1]!.click());
      expect(onStep.mock.calls).toEqual(disabled ? [] : [[1], [-1]]);
      act(() => buttons[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
      expect(onStep).toHaveBeenCalledTimes(disabled ? 0 : 2);
    } finally {
      act(() => root.unmount());
    }
  }
);

it('uses the latest callback and skips repeat while the current value is being saved', () => {
  vi.useFakeTimers();
  const container = document.createElement('div');
  const root = createRoot(container);
  const first = vi.fn();
  const latest = vi.fn();
  const render = (onStep: typeof first, disabled = false) =>
    act(() => root.render(<NumericStepper label="Value" onStep={onStep} disabled={disabled} />));
  try {
    render(first);
    act(() =>
      container
        .querySelector('button')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    );
    expect(first).toHaveBeenCalledTimes(1);
    render(latest, true);
    act(() => vi.advanceTimersByTime(300));
    expect(first).toHaveBeenCalledTimes(1);
    expect(latest).not.toHaveBeenCalled();
    render(latest);
    act(() => vi.advanceTimersByTime(70));
    expect(latest).toHaveBeenCalledExactlyOnceWith(1);
    act(() => window.dispatchEvent(new Event('pointerup')));
    act(() => vi.advanceTimersByTime(500));
    expect(latest).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    vi.useRealTimers();
  }
});

it('keeps pointer repeat and release without adding a second click step', () => {
  vi.useFakeTimers();
  const container = document.createElement('div');
  const root = createRoot(container);
  const onStep = vi.fn();
  try {
    act(() => root.render(<NumericStepper label="Value" onStep={onStep} />));
    const button = container.querySelector('button')!;
    act(() => button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    expect(onStep).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(300));
    expect(onStep).toHaveBeenCalledTimes(2);
    act(() => window.dispatchEvent(new Event('pointerup')));
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    act(() => vi.advanceTimersByTime(500));
    expect(onStep).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    vi.useRealTimers();
  }
});
