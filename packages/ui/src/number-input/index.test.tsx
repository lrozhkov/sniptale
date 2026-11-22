// @vitest-environment jsdom
import { act, createRef, useState, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NumberInput } from './index';
import { ProductInput } from '../product-form-controls';
import { ProductGlassInput } from '../product-glass-controls/buttons';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function render(node: ReactNode) {
  act(() => root.render(node));
  const input = host.querySelector('input');
  if (!input) throw new Error('Numeric input did not mount');
  return input;
}
function wheel(input: HTMLInputElement, deltaY = -120) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, altKey: true });
  act(() => input.dispatchEvent(event));
  return event;
}

it.each(['0.1', 'any'])('delivers one controlled change with step=%s and retains focus', (step) => {
  const changed = vi.fn();
  function Field() {
    const [value, setValue] = useState('1.1');
    return (
      <NumberInput
        value={value}
        step={step}
        onChange={(event) => {
          changed(event.currentTarget.valueAsNumber);
          setValue(event.currentTarget.value);
        }}
      />
    );
  }
  const input = render(<Field />);
  act(() => input.focus());
  expect(wheel(input).defaultPrevented).toBe(true);
  expect(input.value).toBe(step === 'any' ? '2.1' : '1.2');
  expect(changed).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(input);
});

it('retains form draft commit timing and leaves generic text input wheel alone', () => {
  const changed = vi.fn();
  const committed = vi.fn();
  const input = render(
    <ProductInput type="number" defaultValue="4" onChange={changed} onValueCommit={committed} />
  );
  act(() => input.focus());
  wheel(input);
  expect(input.value).toBe('5');
  expect(changed).toHaveBeenCalledOnce();
  expect(committed).not.toHaveBeenCalled();
  act(() => input.blur());
  expect(committed).toHaveBeenCalledExactlyOnceWith('5');
  const text = render(<ProductInput key="text" defaultValue="123" />);
  act(() => text.focus());
  expect(text.type).toBe('text');
  expect(wheel(text).defaultPrevented).toBe(false);
  expect(text.value).toBe('123');
});

it('delegates explicit text stepping through glass controls without numeric coercion', () => {
  const stepped = vi.fn();
  const changed = vi.fn();
  const input = render(
    <ProductGlassInput
      type="text"
      value="1.5em"
      readOnly={false}
      onChange={changed}
      onNumericStep={stepped}
    />
  );
  act(() => input.focus());
  expect(wheel(input, 120).defaultPrevented).toBe(true);
  expect(stepped).toHaveBeenCalledExactlyOnceWith(-1);
  expect(changed).not.toHaveBeenCalled();
  expect(input.value).toBe('1.5em');
});

it('uses the latest domain callback without replacing the focused input', () => {
  const first = vi.fn();
  const second = vi.fn();
  const input = render(<NumberInput type="text" defaultValue="5px" onNumericStep={first} />);
  act(() => input.focus());
  wheel(input);
  const next = render(<NumberInput type="text" defaultValue="5px" onNumericStep={second} />);
  expect(next).toBe(input);
  expect(document.activeElement).toBe(input);
  wheel(input);
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
});

it('cleans up forwarded callback refs and detaches a retained old input', () => {
  const cleanup = vi.fn();
  const ref: Ref<HTMLInputElement> = (node) => (node ? cleanup : undefined);
  const first = render(<NumberInput key="first" defaultValue="5" ref={ref} />);
  const objectRef = createRef<HTMLInputElement>();
  const second = render(<NumberInput key="second" defaultValue="8" ref={objectRef} />);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(objectRef.current).toBe(second);
  document.body.append(first);
  act(() => first.focus());
  expect(wheel(first).defaultPrevented).toBe(false);
  expect(first.value).toBe('5');
  act(() => root.render(null));
  expect(objectRef.current).toBeNull();
});
