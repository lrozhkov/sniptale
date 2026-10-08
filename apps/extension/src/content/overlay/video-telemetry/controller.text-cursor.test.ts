// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { createVideoTelemetryController } from './controller';

const controllers: ReturnType<typeof createVideoTelemetryController>[] = [];
afterEach(() => {
  controllers.forEach((controller) => controller.disable());
  controllers.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('makes Windows text hover capture-safe only while recording and restores on focus', () => {
  vi.spyOn(runtimeInfo, 'getURL').mockImplementation((path) => `chrome-extension://test/${path}`);
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
  const input = document.createElement('input');
  input.style.setProperty('cursor', 'text', 'important');
  document.body.append(input);
  const hover = () => input.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  const controller = createVideoTelemetryController();
  controllers.push(controller);
  controller.enable('recording');
  hover();
  expect(input.style.cursor).toContain('chrome-extension://test/cursors/text.svg');
  expect(document.getElementById('sniptale-controlled-cursor-overlay')).toBeNull();
  input.focus();
  expect(input.style.cursor).toBe('text');
  hover();
  expect(input.style.cursor).toBe('text');
  input.blur();
  hover();
  expect(input.style.cursor).toContain('chrome-extension://test/cursors/text.svg');
  controller.pause();
  expect(input.style.cursor).toBe('text');
  expect(input.style.getPropertyPriority('cursor')).toBe('important');
  hover();
  expect(input.style.cursor).toBe('text');
  controller.resume();
  hover();
  expect(input.style.cursor).toContain('chrome-extension://test/cursors/text.svg');
  controller.enable(null);
  expect(input.style.cursor).toBe('text');
  hover();
  expect(input.style.cursor).toBe('text');
});
