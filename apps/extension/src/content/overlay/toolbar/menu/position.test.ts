// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { getToolbarMenuPosition } from './position';

it('includes the menu gap and viewport margin when deciding to open above', () => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
  const anchor = document.createElement('button');
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
    bottom: 510,
    height: 36,
    left: 100,
    right: 136,
    top: 474,
    width: 36,
    x: 100,
    y: 474,
    toJSON: () => ({}),
  });

  expect(getToolbarMenuPosition(anchor, 180)).toBe('up');
});
