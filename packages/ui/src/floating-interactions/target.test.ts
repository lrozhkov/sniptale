// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  FLOATING_INTERACTION_ROOT_ATTRIBUTE,
  isFloatingInteractionEvent,
  isFloatingInteractionOutsideOwners,
  isFloatingInteractionTarget,
  isOwnedFloatingInteractionEvent,
} from './target';

describe('floating interaction target ownership', () => {
  it('detects floating roots from direct and descendant targets', () => {
    const floatingRoot = document.createElement('div');
    const button = document.createElement('button');
    floatingRoot.setAttribute(FLOATING_INTERACTION_ROOT_ATTRIBUTE, 'true');
    floatingRoot.append(button);

    expect(isFloatingInteractionTarget(floatingRoot)).toBe(true);
    expect(isFloatingInteractionTarget(button)).toBe(true);
  });

  it('detects floating roots through composed paths', () => {
    const floatingRoot = document.createElement('div');
    const button = document.createElement('button');
    floatingRoot.setAttribute(FLOATING_INTERACTION_ROOT_ATTRIBUTE, 'true');
    const event = new MouseEvent('mousedown');
    event.composedPath = () => [button, floatingRoot, document.body, window];

    expect(isFloatingInteractionEvent(event)).toBe(true);
  });

  it('treats explicit owners as inside even when the target is retargeted', () => {
    const owner = document.createElement('div');
    const input = document.createElement('input');
    owner.append(input);
    const event = new FocusEvent('focusin');
    event.composedPath = () => [input, owner, document.body, window];

    expect(isOwnedFloatingInteractionEvent(event, [owner])).toBe(true);
    expect(isFloatingInteractionOutsideOwners(event, [owner])).toBe(false);
  });

  it('reports outside events only when neither owner nor floating root appears in the path', () => {
    const owner = document.createElement('div');
    const outside = document.createElement('button');
    document.body.append(owner, outside);
    const event = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(event, 'target', { configurable: true, value: outside });

    expect(isFloatingInteractionOutsideOwners(event, [owner])).toBe(true);
  });
});
