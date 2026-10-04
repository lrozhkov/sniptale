// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  getNextEnabledIndex,
  getSelectedIndex,
  resolveCompactSelectMenuStyle,
} from './select-helpers';

function anchorRect(rect: Partial<DOMRect>): HTMLElement {
  const anchor = document.createElement('button');
  anchor.getBoundingClientRect = () =>
    ({
      bottom: rect.bottom ?? 40,
      height: rect.height ?? 32,
      left: rect.left ?? 20,
      right: rect.right ?? 160,
      top: rect.top ?? 8,
      width: rect.width ?? 140,
      x: rect.x ?? rect.left ?? 20,
      y: rect.y ?? rect.top ?? 8,
      toJSON: () => undefined,
    }) as DOMRect;
  return anchor;
}

it('walks compact select options while skipping disabled entries', () => {
  const options = [
    { value: 'a', label: 'A', disabled: true },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C', disabled: true },
  ] as const;

  expect(getSelectedIndex(options, 'b')).toBe(1);
  expect(getSelectedIndex(options, '')).toBe(-1);
  expect(getNextEnabledIndex(options, 0, 1)).toBe(1);
  expect(getNextEnabledIndex(options, 2, -1)).toBe(1);
  expect(getNextEnabledIndex([{ value: 'a', label: 'A', disabled: true }], 0, 1)).toBe(-1);
  expect(getNextEnabledIndex([], 0, 1)).toBe(-1);
});

it('positions compact select menus below, above, and clamped to the viewport', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 260 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 180 });

  expect(resolveCompactSelectMenuStyle(anchorRect({ left: 24, width: 160 })).left).toBe(24);
  expect(resolveCompactSelectMenuStyle(anchorRect({ left: 220, width: 160 })).left).toBe(92);

  const aboveStyle = resolveCompactSelectMenuStyle(
    anchorRect({ bottom: 172, height: 32, left: 24, top: 140, width: 160 })
  );

  expect(aboveStyle.transform).toBe('translateY(-100%)');
  expect(aboveStyle.top).toBe(135);
  expect(aboveStyle.maxHeight).toBeGreaterThanOrEqual(96);
});

it('uses the nearest opted-in settings width without moving the menu below its section', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  const outer = anchorRect({ left: 400, width: 400, bottom: 700 });
  const content = anchorRect({ left: 460, width: 320, bottom: 650 });
  const trigger = anchorRect({ left: 680, width: 100, top: 90, bottom: 122 });
  outer.setAttribute('data-compact-select-menu-bounds', '');
  content.setAttribute('data-compact-select-menu-bounds', '');
  outer.append(content);
  content.append(trigger);
  expect(resolveCompactSelectMenuStyle(trigger)).toMatchObject({ left: 460, width: 320, top: 127 });
  content.getBoundingClientRect = () => ({ left: 870, width: 110 }) as DOMRect;
  expect(resolveCompactSelectMenuStyle(trigger)).toMatchObject({ left: 870, width: 110, top: 127 });
  content.getBoundingClientRect = () => ({ left: 950, width: 320 }) as DOMRect;
  expect(resolveCompactSelectMenuStyle(trigger)).toMatchObject({ left: 672, width: 320, top: 127 });
});
