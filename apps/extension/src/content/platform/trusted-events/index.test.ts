// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  hasActiveUserActivation,
  isTrustedDomEvent,
  isTrustedKeyboardEvent,
  isTrustedMouseEvent,
  isTrustedPointerEvent,
} from '.';

describe('trusted content DOM events', () => {
  it('treats synthetic DOM events as untrusted', () => {
    expect(isTrustedDomEvent(new Event('change'))).toBe(false);
    expect(isTrustedKeyboardEvent(new KeyboardEvent('keydown', { key: 'k' }))).toBe(false);
    expect(isTrustedMouseEvent(new MouseEvent('click'))).toBe(false);
    expect(isTrustedPointerEvent(new MouseEvent('pointerdown'))).toBe(false);
  });

  it('requires an active browser user-activation capability', () => {
    const createWindow = (isActive: boolean) =>
      ({ navigator: { userActivation: { isActive } } }) as Window;

    expect(hasActiveUserActivation(createWindow(true))).toBe(true);
    expect(hasActiveUserActivation(createWindow(false))).toBe(false);
    expect(hasActiveUserActivation({ navigator: {} } as Window)).toBe(false);
  });
});
