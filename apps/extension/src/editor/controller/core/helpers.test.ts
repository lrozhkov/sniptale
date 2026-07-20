// @vitest-environment jsdom

import { Group, Textbox } from 'fabric';
import { describe, expect, it } from 'vitest';

import {
  emptyCanvasJson,
  getBrowserVersion,
  isGroup,
  isInteractiveShortcutTarget,
  isTextbox,
  nextStepLetter,
  parseColorForStore,
} from './helpers';

function runCanvasAndAlphabetSuite() {
  it('builds empty canvas json and advances latin and cyrillic step letters', () => {
    expect(emptyCanvasJson()).toBe('{"version":"7.2.0","objects":[]}');
    expect(nextStepLetter('A', 'latin')).toBe('B');
    expect(nextStepLetter('Я', 'cyrillic')).toBe('А');
    expect(nextStepLetter('?', 'latin')).toBe('A');
  });
}

function runColorAndTargetSuite() {
  it('normalizes stored colors and detects interactive shortcut targets', () => {
    const input = document.createElement('input');
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', {
      configurable: true,
      value: true,
    });

    expect(parseColorForStore('rgba(255, 103, 29, 0)', '#111111')).toBe('transparent');
    expect(parseColorForStore('#ff00ff00', '#111111')).toBe('transparent');
    expect(parseColorForStore('rgb(255, 103, 29)', '#111111')).toBe('#ff671d');
    expect(parseColorForStore('', 'transparent')).toBe('transparent');
    expect(isInteractiveShortcutTarget(input)).toBe(true);
    expect(isInteractiveShortcutTarget(editable)).toBe(true);
    expect(isInteractiveShortcutTarget(document.createElement('span'))).toBeFalsy();
  });
}

function runBrowserAndFabricSuite() {
  it('derives browser versions and fabric type guards', () => {
    const originalUserAgent = navigator.userAgent;
    const originalAppVersion = navigator.appVersion;

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 Edg/122.0.1 Chrome/122.0.0.0 Safari/537.36',
    });
    Object.defineProperty(window.navigator, 'appVersion', {
      configurable: true,
      value: 'Fallback',
    });

    expect(getBrowserVersion()).toBe('Edge 122.0.1');

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 YaBrowser/24.1.0.0 Chrome/120.0.0.0 Safari/537.36',
    });
    expect(getBrowserVersion()).toBe('Yandex 24.1.0.0');

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 Chrome/132.0.0.0 Safari/537.36',
    });
    expect(getBrowserVersion()).toBe('Chrome 132.0.0.0');
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 Safari/537.36',
    });
    expect(getBrowserVersion()).toBe('Fallback');
    expect(isTextbox(new Textbox('Text'))).toBe(true);
    expect(isGroup(new Group([]))).toBe(true);

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
    Object.defineProperty(window.navigator, 'appVersion', {
      configurable: true,
      value: originalAppVersion,
    });
  });
}

describe('editor-controller helpers', () => {
  runCanvasAndAlphabetSuite();
  runColorAndTargetSuite();
  runBrowserAndFabricSuite();
});
