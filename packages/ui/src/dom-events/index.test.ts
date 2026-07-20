// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  getComposedEventTargetElement,
  isComposedEventWithinAnyElement,
  isComposedEventWithinElement,
} from './index';

describe('shared ui dom-events', () => {
  it('uses composed path targets before falling back to the raw event target', () => {
    const pathTarget = document.createElement('button');
    const fallbackTarget = document.createElement('span');
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: fallbackTarget,
    });
    event.composedPath = () => [pathTarget, document.body, window];

    expect(getComposedEventTargetElement(event)).toBe(pathTarget);
  });

  it('detects direct and descendant ownership through the composed path', () => {
    const owner = document.createElement('section');
    const descendant = document.createElement('button');
    owner.appendChild(descendant);
    const event = new MouseEvent('pointerdown');
    event.composedPath = () => [descendant, owner, document.body, window];

    expect(isComposedEventWithinElement(event, owner)).toBe(true);
  });

  it('checks multiple candidate owners and ignores null entries', () => {
    const owner = document.createElement('section');
    const other = document.createElement('aside');
    const target = document.createElement('button');
    owner.appendChild(target);
    const event = new MouseEvent('mousedown');
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: target,
    });

    expect(isComposedEventWithinAnyElement(event, [null, other, owner])).toBe(true);
  });
});
