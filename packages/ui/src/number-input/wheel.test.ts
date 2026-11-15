// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { attachNumericInputWheel, stepNativeNumberInput } from './wheel';
import { containFloatingSurfaceWheel } from '../dom-events';

afterEach(() => document.body.replaceChildren());

function createInput(value = '5') {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value;
  document.body.append(input);
  return input;
}

function wheel(input: HTMLInputElement, options: WheelEventInit = {}) {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    composed: true,
    cancelable: true,
    deltaY: -120,
    ...options,
  });
  input.dispatchEvent(event);
  return event;
}

it('changes only the focused wheel target and consumes the event before floating scrolling', () => {
  const input = createInput();
  const surface = document.createElement('div');
  document.body.append(surface);
  surface.append(input);
  const scrolling = vi.fn(containFloatingSurfaceWheel);
  surface.addEventListener('wheel', scrolling);
  attachNumericInputWheel(input, (direction) => stepNativeNumberInput(input, direction));
  expect(wheel(input).defaultPrevented).toBe(true);
  expect(scrolling).toHaveBeenCalledOnce();
  expect(input.value).toBe('5');
  input.focus();
  expect(wheel(input).defaultPrevented).toBe(true);
  expect(input.value).toBe('6');
  expect(scrolling).toHaveBeenCalledOnce();
  expect(wheel(input, { deltaY: 120 }).defaultPrevented).toBe(true);
  expect(input.value).toBe('5');
  expect(document.activeElement).toBe(input);
});

it.each([
  { ctrlKey: true },
  { metaKey: true },
  { altKey: true },
  { shiftKey: true },
  { deltaX: 200, deltaY: 10 },
  { deltaY: 0 },
  { cancelable: false },
])('retains existing scroll/zoom ownership for %j', (options) => {
  const input = createInput();
  const step = vi.fn();
  attachNumericInputWheel(input, step);
  input.focus();
  const ancestor = vi.fn();
  document.body.addEventListener('wheel', ancestor, { once: true });
  expect(wheel(input, options).defaultPrevented).toBe(false);
  expect(step).not.toHaveBeenCalled();
  expect(ancestor).toHaveBeenCalledOnce();
});

it.each(['disabled', 'readOnly'] as const)('retains an unavailable %s value', (property) => {
  const input = createInput();
  const step = vi.fn();
  attachNumericInputWheel(input, step);
  input.focus();
  input[property] = true;
  expect(wheel(input).defaultPrevented).toBe(false);
  expect(step).not.toHaveBeenCalled();
  expect(input.value).toBe('5');
});

it('uses focus inside a closed ShadowRoot and releases its input listener', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  const input = createInput();
  shadow.append(input);
  const step = vi.fn();
  const detach = attachNumericInputWheel(input, step);
  input.focus();
  expect(document.activeElement).toBe(host);
  expect(wheel(input).defaultPrevented).toBe(true);
  expect(step).toHaveBeenCalledWith(1);
  detach();
  expect(wheel(input).defaultPrevented).toBe(false);
  expect(step).toHaveBeenCalledOnce();
});

it.each([0, 1, 2])(
  'uses one domain step rather than pixel magnitude for deltaMode %s',
  (deltaMode) => {
    const input = createInput();
    const step = vi.fn();
    attachNumericInputWheel(input, step);
    input.focus();
    wheel(input, { deltaMode, deltaY: -1000 });
    expect(step).toHaveBeenCalledExactlyOnceWith(1);
  }
);

it('respects a prior owner cancellation', () => {
  const input = createInput();
  const step = vi.fn();
  input.addEventListener('wheel', (event) => event.preventDefault());
  attachNumericInputWheel(input, step);
  input.focus();
  wheel(input);
  expect(step).not.toHaveBeenCalled();
});

it.each([
  { value: '1', step: '0.1', min: '0.1', max: '2', direction: -1, expected: '0.9' },
  { value: '0.333', step: '0.05', min: '0', max: '1', direction: 1, expected: '0.35' },
  { value: '0.001', step: 'any', min: '0', max: '5', direction: 1, expected: '1.001' },
  { value: '1.001', step: 'any', min: '0', max: '5', direction: -1, expected: '0.001' },
  { value: '0.001', step: 'any', min: '0', max: '0.5', direction: 1, expected: '0.5' },
  { value: '', step: '1', min: '0', max: '5', direction: 1, expected: '1' },
] as const)('matches native stepping and event delivery for %j', (values) => {
  const input = createInput(values.value);
  input.step = values.step;
  input.min = values.min;
  input.max = values.max;
  const events: string[] = [];
  input.addEventListener('input', () => events.push('input'));
  input.addEventListener('change', () => events.push('change'));
  stepNativeNumberInput(input, values.direction);
  expect(input.value).toBe(values.expected);
  expect(events).toEqual(['input', 'change']);
});

it('consumes a boundary wheel without emitting duplicate input or scrolling', () => {
  const input = createInput('10');
  input.max = '10';
  const changed = vi.fn();
  input.addEventListener('input', changed);
  attachNumericInputWheel(input, (direction) => stepNativeNumberInput(input, direction));
  input.focus();
  expect(wheel(input).defaultPrevented).toBe(true);
  expect(input.value).toBe('10');
  expect(changed).not.toHaveBeenCalled();
});
