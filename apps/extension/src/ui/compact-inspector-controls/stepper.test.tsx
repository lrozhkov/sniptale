// @vitest-environment jsdom
import { act } from 'react';
import { flushSync } from 'react-dom';
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

it('stops a hold when disabled and does not resume it when enabled again', () => {
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
    expect(latest).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('pointerup')));
    act(() => vi.advanceTimersByTime(500));
    expect(latest).not.toHaveBeenCalled();
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

it.each([false, true])(
  'finishes a pointer hold before native Tab navigation, shift=%s',
  (shiftKey) => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const root = createRoot(container);
    const onStep = vi.fn();
    const onFinish = vi.fn();
    const onCancel = vi.fn();
    try {
      act(() =>
        root.render(
          <NumericStepper label="Value" onStep={onStep} onFinish={onFinish} onCancel={onCancel} />
        )
      );
      act(() =>
        container
          .querySelector('button')!
          .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      );
      const tab = new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      act(() => window.dispatchEvent(tab));
      expect(tab.defaultPrevented).toBe(false);
      expect(onFinish).toHaveBeenCalledOnce();
      expect(onCancel).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1000));
      act(() => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })));
      expect(onStep).toHaveBeenCalledOnce();
      expect(onFinish).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
      vi.useRealTimers();
    }
  }
);

it.each(['altKey', 'ctrlKey', 'metaKey'] as const)(
  'preserves native %s+Tab and cancels a hold on window blur',
  (modifier) => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const onFinish = vi.fn();
    const onCancel = vi.fn();
    try {
      act(() =>
        root.render(
          <NumericStepper label="Value" onStep={vi.fn()} onFinish={onFinish} onCancel={onCancel} />
        )
      );
      act(() =>
        container
          .querySelector('button')!
          .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      );
      const tab = new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        [modifier]: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => window.dispatchEvent(tab));
      expect(tab.defaultPrevented).toBe(false);
      expect(onFinish).not.toHaveBeenCalled();
      act(() => window.dispatchEvent(new Event('blur')));
      expect(onCancel).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
    }
  }
);

it.each(['Enter', ' '])('ends pointer repeat before native %s activation', (key) => {
  vi.useFakeTimers();
  const container = document.createElement('div');
  const root = createRoot(container);
  const onStep = vi.fn();
  const onFinish = vi.fn();
  try {
    act(() => root.render(<NumericStepper label="Value" onStep={onStep} onFinish={onFinish} />));
    const button = container.querySelector('button')!;
    act(() => button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
    const activation = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    act(() => window.dispatchEvent(activation));
    expect(activation.defaultPrevented).toBe(false);
    expect(onFinish).toHaveBeenCalledOnce();
    act(() => button.click());
    act(() => vi.advanceTimersByTime(1000));
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onFinish).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    vi.useRealTimers();
  }
});

it.each([false, true])(
  'finishes another field before stepping and preserves own field focus=%s',
  (inside) => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const calls: string[] = [];
    try {
      act(() =>
        root.render(
          <>
            <input aria-label="Other" onBlur={() => calls.push('blur')} />
            <div data-ui="shared.ui.compact-inspector.numeric-value-field">
              <input aria-label="Own" onBlur={() => calls.push('blur')} />
              <NumericStepper label="Value" onStep={() => calls.push('step')} />
            </div>
          </>
        )
      );
      const input = container.querySelector<HTMLInputElement>(
        inside ? '[aria-label="Own"]' : '[aria-label="Other"]'
      )!;
      act(() => input.focus());
      act(() =>
        container
          .querySelector('button')!
          .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      );
      expect(calls).toEqual(inside ? ['step'] : ['blur', 'step']);
      if (inside) expect(document.activeElement).toBe(input);
      else expect(document.activeElement).toBe(container.querySelector('button'));
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  }
);

it('preserves focus outside an inactive shadow root', () => {
  const host = document.createElement('div');
  const outside = document.createElement('input');
  document.body.append(outside, host);
  const shadow = host.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  shadow.append(container);
  const root = createRoot(container);
  const onStep = vi.fn();
  try {
    act(() => root.render(<NumericStepper label="Value" onStep={onStep} />));
    outside.focus();
    act(() =>
      container
        .querySelector('button')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    );
    expect(document.activeElement).toBe(outside);
    expect(onStep).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    outside.remove();
    host.remove();
  }
});

it.each(['unmount', 'disable'] as const)(
  'does not start after prior field blur causes %s',
  (mode) => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onStep = vi.fn();
    const render = (disabled = false) =>
      root.render(
        <>
          <input
            onBlur={() =>
              flushSync(() => (mode === 'disable' ? render(true) : root.render(<p>Replaced</p>)))
            }
          />
          <NumericStepper label="Value" disabled={disabled} onStep={onStep} />
        </>
      );
    try {
      act(() => render());
      act(() => container.querySelector('input')!.focus());
      act(() =>
        container
          .querySelector('button')!
          .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      );
      act(() => vi.advanceTimersByTime(500));
      expect(onStep).not.toHaveBeenCalled();
    } finally {
      act(() => window.dispatchEvent(new Event('blur')));
      act(() => root.unmount());
      container.remove();
      vi.useRealTimers();
    }
  }
);
