// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewInspectorActionMenu } from './inspector-action-menu';
import {
  ReviewInspectorActionTrayContext,
  ReviewInspectorSections,
  reviewInspectorActions,
} from './inspector-sections';
import { ReviewButton } from './controls';

let host: HTMLDivElement;
let root: Root;
const run = vi.fn();
function Fixture({ scope = 'one' }: { scope?: string }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <ReviewInspectorActionMenu onHost={setTarget} scope={scope} />
      <ReviewInspectorActionTrayContext value={target}>
        <ReviewInspectorSections
          sections={[
            reviewInspectorActions(
              <>
                <ReviewButton label="First" onClick={() => run(scope)}>
                  First
                </ReviewButton>
                <ReviewButton label="Unavailable" disabled>
                  Unavailable
                </ReviewButton>
                <ReviewButton label="Last" onClick={() => run(scope)}>
                  Last
                </ReviewButton>
              </>
            ),
          ]}
        />
      </ReviewInspectorActionTrayContext>
      <button data-outside>Outside</button>
    </>
  );
}
const trigger = () => host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
const item = (label: string) =>
  host.querySelector<HTMLButtonElement>(`[role="menuitem"][aria-label="${label}"]`)!;
function key(value: string) {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
  act(() => document.activeElement!.dispatchEvent(event));
  return event;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  run.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Fixture />));
  trigger().focus();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('navigates portaled commands with arrows and boundaries, skips disabled items and restores focus', () => {
  key('x');
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  key('ArrowUp');
  expect(document.activeElement).toBe(item('Last'));
  key('Home');
  expect(document.activeElement).toBe(item('First'));
  key('ArrowDown');
  expect(document.activeElement).toBe(item('Last'));
  key('ArrowDown');
  expect(document.activeElement).toBe(item('First'));
  key('ArrowUp');
  expect(document.activeElement).toBe(item('Last'));
  key('Home');
  key('End');
  expect(document.activeElement).toBe(item('Last'));
  key('x');
  expect(document.activeElement).toBe(item('Last'));
  expect(key('Escape').defaultPrevented).toBe(true);
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger());
  key('ArrowDown');
  expect(document.activeElement).toBe(item('First'));
  expect(key('Tab').defaultPrevented).toBe(false);
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger());
});

it('ignores inside pointer actions and dismisses outside without taking outside focus', () => {
  act(() => trigger().click());
  act(() => item('First').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  const outside = host.querySelector<HTMLButtonElement>('[data-outside]')!;
  outside.focus();
  act(() => outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(outside);
  expect(run).not.toHaveBeenCalled();
});

it('closes when the inspected object changes and executes only the current command owner', () => {
  act(() => trigger().click());
  act(() => item('Unavailable').click());
  expect(run).not.toHaveBeenCalled();
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  act(() => root.render(<Fixture scope="two" />));
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  act(() => trigger().click());
  act(() => item('First').click());
  expect(run).toHaveBeenCalledExactlyOnceWith('two');
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger());
});
