// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { dispatchBridgedMouseEvent, isBridgedMouseEvent } from './synthetic-mouse';

it('permits the original activation but denies retained-event replay on another control', () => {
  const source = new EventTarget();
  const other = new EventTarget();
  const retained: Event[] = [];
  const authorized = vi.fn();
  source.addEventListener('click', (event) => {
    expect(isBridgedMouseEvent(event)).toBe(true);
    retained.push(event);
  });
  other.addEventListener('click', (event) => {
    if (isBridgedMouseEvent(event)) authorized();
  });
  expect(dispatchBridgedMouseEvent(source, 'click', new MouseEvent('pointerdown'))).toBe(true);
  expect(retained).toHaveLength(1);
  other.dispatchEvent(retained[0]!);
  expect(authorized).not.toHaveBeenCalled();
  expect(isBridgedMouseEvent(retained[0]!)).toBe(false);
});

it('revokes cancelled activations and preserves their dispatch result', () => {
  const target = new EventTarget();
  const retained: Event[] = [];
  target.addEventListener('mousedown', (event) => {
    expect(isBridgedMouseEvent(event)).toBe(true);
    retained.push(event);
    event.preventDefault();
  });
  expect(dispatchBridgedMouseEvent(target, 'mousedown', new MouseEvent('pointerdown'))).toBe(false);
  expect(isBridgedMouseEvent(retained[0]!)).toBe(false);
});

it('revokes event authority when dispatch fails', () => {
  const target = new EventTarget();
  const retained: Event[] = [];
  vi.spyOn(target, 'dispatchEvent').mockImplementation((event) => {
    expect(isBridgedMouseEvent(event)).toBe(true);
    retained.push(event);
    throw new Error('dispatch failed');
  });
  expect(() => dispatchBridgedMouseEvent(target, 'click', new MouseEvent('pointerdown'))).toThrow(
    'dispatch failed'
  );
  expect(isBridgedMouseEvent(retained[0]!)).toBe(false);
});
