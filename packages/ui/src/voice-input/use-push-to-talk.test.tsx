// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePushToTalk } from './use-push-to-talk';

let host: HTMLDivElement;
let root: Root;

function dispatchPointer(button: HTMLButtonElement, type: string, pointerId: number): void {
  const event = new MouseEvent(type, { bubbles: true, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  button.dispatchEvent(event);
}

function Harness(props: { active?: boolean; disabled?: boolean; onStart(): void; onStop(): void }) {
  const control = usePushToTalk({
    active: props.active ?? false,
    disabled: props.disabled ?? false,
    onStart: props.onStart,
    onStop: props.onStop,
  });
  return (
    <button
      data-holding={control.holding}
      onPointerCancel={control.onPointerCancel}
      onPointerDown={control.onPointerDown}
      onPointerUp={control.onPointerUp}
    />
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

it('ignores unavailable starts and treats cancellation as a terminal press', () => {
  const onStart = vi.fn();
  const onStop = vi.fn();
  act(() => root.render(<Harness active onStart={onStart} onStop={onStop} />));
  let button = host.querySelector('button')!;
  act(() => dispatchPointer(button, 'pointerdown', 3));
  expect(onStart).not.toHaveBeenCalled();

  act(() => root.render(<Harness disabled onStart={onStart} onStop={onStop} />));
  button = host.querySelector('button')!;
  act(() => dispatchPointer(button, 'pointerdown', 4));
  expect(onStart).not.toHaveBeenCalled();

  act(() => root.render(<Harness onStart={onStart} onStop={onStop} />));
  button = host.querySelector('button')!;
  act(() => dispatchPointer(button, 'pointerdown', 5));
  act(() => dispatchPointer(button, 'pointercancel', 5));
  expect(onStart).toHaveBeenCalledOnce();
  expect(onStop).toHaveBeenCalledOnce();

  act(() => dispatchPointer(button, 'pointerup', 99));
  expect(onStop).toHaveBeenCalledOnce();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('keeps a short press active and stops only after an intentional hold is released', () => {
  const onStart = vi.fn();
  const onStop = vi.fn();
  act(() => root.render(<Harness onStart={onStart} onStop={onStop} />));
  const button = host.querySelector('button')!;

  act(() => dispatchPointer(button, 'pointerdown', 1));
  act(() => vi.advanceTimersByTime(200));
  act(() => dispatchPointer(button, 'pointerup', 1));
  expect(onStart).toHaveBeenCalledOnce();
  expect(onStop).not.toHaveBeenCalled();

  act(() => dispatchPointer(button, 'pointerdown', 2));
  act(() => vi.advanceTimersByTime(450));
  expect(button.dataset['holding']).toBe('true');
  act(() => dispatchPointer(button, 'pointerup', 2));
  expect(onStop).toHaveBeenCalledOnce();
  expect(button.dataset['holding']).toBe('false');
});
