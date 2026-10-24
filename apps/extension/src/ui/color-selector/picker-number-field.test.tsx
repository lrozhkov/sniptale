// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PickerNumberField } from './picker-number-field';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('accelerates a held arrow and stops on window blur and unmount', () => {
  const onChange = vi.fn();
  act(() =>
    root.render(
      <PickerNumberField ariaLabel="Opacity" value={0} max={1000} onChange={onChange} unit="%" />
    )
  );
  const up = host.querySelector('button')!;
  act(() => up.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
  expect(onChange).toHaveBeenLastCalledWith('1');
  act(() => vi.advanceTimersByTime(1000));
  const first = onChange.mock.calls.length;
  act(() => vi.advanceTimersByTime(1000));
  expect(onChange.mock.calls.length - first).toBeGreaterThan(first);
  act(() => window.dispatchEvent(new Event('blur')));
  const stopped = onChange.mock.calls.length;
  act(() => vi.advanceTimersByTime(1000));
  expect(onChange).toHaveBeenCalledTimes(stopped);
  act(() => up.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
  act(() => root.unmount());
  const unmounted = onChange.mock.calls.length;
  act(() => vi.advanceTimersByTime(1000));
  expect(onChange).toHaveBeenCalledTimes(unmounted);
  root = createRoot(host);
});

it('wraps cyclic angles and supports keyboard larger steps', () => {
  const onChange = vi.fn();
  act(() =>
    root.render(
      <PickerNumberField
        ariaLabel="Angle"
        value={359}
        max={359}
        cyclic
        onChange={onChange}
        unit="°"
      />
    )
  );
  const input = host.querySelector('input')!;
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
  expect(onChange).toHaveBeenLastCalledWith('0');
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true })
    )
  );
  expect(onChange).toHaveBeenLastCalledWith('10');
});

it('retains invalid drafts without emitting and exposes empty input as invalid', () => {
  const onChange = vi.fn();
  act(() =>
    root.render(<PickerNumberField ariaLabel="Opacity" value={50} max={100} onChange={onChange} />)
  );
  const input = host.querySelector('input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, '101');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input.value).toBe('101');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(onChange).not.toHaveBeenCalled();
  act(() => {
    setter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input.getAttribute('aria-invalid')).toBe('true');
});

it.each(['Enter', ' '])(
  'accelerates %j on a focused stepper without browser-repeat or click duplicates',
  (key) => {
    const onChange = vi.fn();
    act(() =>
      root.render(
        <PickerNumberField ariaLabel="Opacity" value={0} max={1000} onChange={onChange} />
      )
    );
    const up = host.querySelector('button')!;
    act(() => up.focus());
    act(() =>
      up.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    );
    expect(onChange).toHaveBeenLastCalledWith('1');
    act(() => up.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true, bubbles: true })));
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    const first = onChange.mock.calls.length;
    act(() => vi.advanceTimersByTime(1000));
    expect(onChange.mock.calls.length - first).toBeGreaterThan(first);
    act(() =>
      up.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }))
    );
    const stopped = onChange.mock.calls.length;
    act(() => up.click());
    expect(onChange).toHaveBeenCalledTimes(stopped);
    act(() => vi.advanceTimersByTime(1000));
    expect(onChange).toHaveBeenCalledTimes(stopped);
    act(() => up.click());
    expect(onChange).toHaveBeenCalledTimes(stopped + 1);
  }
);

it.each(['blur', 'escape', 'window-blur', 'disabled', 'unmount'])(
  'releases a keyboard hold on %s',
  (stop) => {
    const onChange = vi.fn();
    const render = (disabled = false) =>
      root.render(
        <PickerNumberField ariaLabel="Opacity" value={50} onChange={onChange} disabled={disabled} />
      );
    act(() => render());
    const down = host.querySelectorAll('button')[1]!;
    act(() => down.focus());
    act(() => down.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onChange).toHaveBeenLastCalledWith('49');
    act(() => {
      if (stop === 'blur') down.blur();
      if (stop === 'escape')
        down.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (stop === 'window-blur') window.dispatchEvent(new Event('blur'));
      if (stop === 'disabled') render(true);
      if (stop === 'unmount') root.unmount();
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    if (stop === 'unmount') root = createRoot(host);
  }
);

it('stops at bounds and preserves a standalone assistive click', () => {
  const onChange = vi.fn();
  act(() => root.render(<PickerNumberField ariaLabel="Opacity" value={99} onChange={onChange} />));
  const up = host.querySelector('button')!;
  act(() => up.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  act(() => vi.advanceTimersByTime(1000));
  expect(onChange).toHaveBeenCalledExactlyOnceWith('100');
  expect(vi.getTimerCount()).toBe(0);
  act(() => host.querySelectorAll('button')[1]!.click());
  expect(onChange).toHaveBeenLastCalledWith('99');
});
