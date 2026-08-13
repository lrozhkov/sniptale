// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { disposeViewportCalibration, hideViewportCalibration, showViewportCalibration } from '.';

const pattern = {
  edgeThicknessCss: 8,
  colors: {
    top: { red: 236, green: 32, blue: 58 },
    right: { red: 38, green: 220, blue: 75 },
    bottom: { red: 42, green: 72, blue: 232 },
    left: { red: 226, green: 42, blue: 214 },
  },
} as const;

afterEach(() => disposeViewportCalibration());

it('owns one calibration marker and removes it only for the exact transition', () => {
  const binding = { generation: 3, recordingId: 'recording-1', transitionId: 'transition-1' };
  expect(showViewportCalibration(binding, pattern)).toBe('applied');

  const host = document.querySelector<HTMLElement>('[data-sniptale-viewport-calibration]');
  expect(host?.dataset['sniptaleViewportCalibration']).toBe('transition-1');
  expect(host?.shadowRoot?.querySelectorAll('[data-edge]')).toHaveLength(4);
  expect(hideViewportCalibration({ ...binding, transitionId: 'stale-transition' })).toBe('stale');
  expect(host?.isConnected).toBe(true);

  expect(hideViewportCalibration(binding)).toBe('applied');
  expect(host?.isConnected).toBe(false);
});

it('replaces a marker when a newer navigation generation takes authority', () => {
  showViewportCalibration(
    { generation: 3, recordingId: 'recording-1', transitionId: 'transition-1' },
    pattern
  );
  showViewportCalibration(
    { generation: 4, recordingId: 'recording-1', transitionId: 'transition-2' },
    pattern
  );

  const markers = document.querySelectorAll('[data-sniptale-viewport-calibration]');
  expect(markers).toHaveLength(1);
  expect((markers[0] as HTMLElement).dataset['sniptaleViewportCalibration']).toBe('transition-2');
});

it('rolls back an unpresentable marker without leaving an orphan owner', () => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
  Object.defineProperty(HTMLElement.prototype, 'showPopover', {
    configurable: true,
    value: vi.fn(() => {
      throw new Error('popover presentation failed');
    }),
  });
  const binding = { generation: 5, recordingId: 'recording-1', transitionId: 'transition-failed' };
  try {
    expect(() => showViewportCalibration(binding, pattern)).toThrow('popover presentation failed');
    expect(document.querySelector('[data-sniptale-viewport-calibration]')).toBeNull();
    expect(hideViewportCalibration(binding)).toBe('stale');
  } finally {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'showPopover', descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
  }
});
