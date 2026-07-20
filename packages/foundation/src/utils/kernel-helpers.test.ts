// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-23T08:09:10.011Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('shared utils filenames and path sanitization', () => {
  it('builds stable filenames and normalizes preset path input', async () => {
    vi.resetModules();
    const filename = await import('./filename');
    const presetPath = await import('./preset-path');

    expect(filename.generateFilename()).toBe('Screenshot_2026-03-23_11-09-10_011.png');
    expect(filename.generateFilename('visible', 'jpeg')).toBe(
      'Screenshot_2026-03-23_11-09-10_011_visible.jpg'
    );
    expect(presetPath.sanitizePresetPathInput('  ../folder//bad:name?.png/  ')).toBe(
      'folder/bad-name-.png'
    );
    expect(presetPath.sanitizePresetPathInput('safe/../../nested///file.txt')).toBe(
      'safe/nested/file.txt'
    );
  });
});

describe('shared utils delay', () => {
  it('resolves delay after the requested timeout', async () => {
    vi.resetModules();
    const { delay } = await import('./delay');
    const delayed = delay(50);
    let settled = false;

    void delayed.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(49);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(delayed).resolves.toBeUndefined();
  });
});
