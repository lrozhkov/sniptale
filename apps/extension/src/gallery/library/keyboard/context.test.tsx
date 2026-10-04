// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  hasGalleryKeyboardLayer,
  hasGalleryPrimaryModifier,
  isGalleryListKeyboardTarget,
} from './context';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
it('admits only the current list or body while preserving Delete checkbox and button targets', () => {
  const grid = document.createElement('div');
  const button = document.createElement('button');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  const input = document.createElement('input');
  grid.append(button, checkbox, input);
  document.body.append(grid);
  expect(isGalleryListKeyboardTarget(document.body, grid)).toBe(true);
  expect(isGalleryListKeyboardTarget(button, grid)).toBe(true);
  expect(isGalleryListKeyboardTarget(checkbox, grid)).toBe(true);
  expect(isGalleryListKeyboardTarget(input, grid)).toBe(false);
  expect(isGalleryListKeyboardTarget(document.createElement('button'), grid)).toBe(false);
  button.setAttribute('aria-haspopup', 'menu');
  expect(isGalleryListKeyboardTarget(button, grid)).toBe(false);
});
it('recognizes open higher layers while ignoring hidden or inert layers', () => {
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  document.body.append(menu);
  expect(hasGalleryKeyboardLayer()).toBe(true);
  menu.hidden = true;
  expect(hasGalleryKeyboardLayer()).toBe(false);
  menu.hidden = false;
  menu.setAttribute('inert', '');
  expect(hasGalleryKeyboardLayer()).toBe(false);
});
it('requires Ctrl on Windows/Linux and Cmd on Apple without combining both', () => {
  for (const platform of ['Win32', 'Linux x86_64', 'MacIntel']) {
    vi.stubGlobal('navigator', { platform, userAgent: '' });
    expect(hasGalleryPrimaryModifier(new KeyboardEvent('keydown', { ctrlKey: true }))).toBe(
      platform !== 'MacIntel'
    );
    expect(hasGalleryPrimaryModifier(new KeyboardEvent('keydown', { metaKey: true }))).toBe(
      platform === 'MacIntel'
    );
    expect(
      hasGalleryPrimaryModifier(new KeyboardEvent('keydown', { ctrlKey: true, metaKey: true }))
    ).toBe(false);
  }
});
