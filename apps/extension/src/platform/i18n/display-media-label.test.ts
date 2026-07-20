import { describe, expect, it, vi } from 'vitest';

import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  translate: (key: string) =>
    ({
      'shared.displayMedia.screenLabel': 'Screen',
      'shared.displayMedia.windowLabel': 'Window',
    })[key] ?? key,
}));

import { normalizeDisplayMediaLabel } from './display-media-label';

describe('normalizeDisplayMediaLabel', () => {
  it('localizes display media labels and falls back by capture mode', () => {
    expect(normalizeDisplayMediaLabel(' window:42:screen ', CaptureMode.TAB)).toBe('Window (42)');
    expect(normalizeDisplayMediaLabel('screen:3', CaptureMode.SCREEN)).toBe('Screen (3)');
    expect(normalizeDisplayMediaLabel('  Plain label  ', CaptureMode.TAB)).toBe('Plain label');
    expect(normalizeDisplayMediaLabel('   ', CaptureMode.SCREEN)).toBe('Screen');
    expect(normalizeDisplayMediaLabel('', CaptureMode.TAB)).toBe('Window');
  });
});
