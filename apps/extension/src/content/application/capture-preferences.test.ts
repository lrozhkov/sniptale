import { expect, it, vi } from 'vitest';
import { createDefaultSettings } from '../../composition/persistence/settings';
import { createCaptureSessionPreferences } from './capture-preferences';

it('keeps workflow overrides in one document and never changes persistent defaults', async () => {
  const settings = createDefaultSettings();
  settings.imageFormat = 'jpeg';
  settings.imageQuality = 81;
  settings.fullPageImage = { imageFormat: 'webp', imageQuality: 67 };
  const before = structuredClone(settings);
  const loadSettings = vi.fn().mockResolvedValue(settings);
  const owner = createCaptureSessionPreferences({ loadSettings });
  await owner.load();
  expect(owner.read('visible')).toEqual({ imageFormat: 'jpeg', imageQuality: 81 });
  expect(owner.read('full')).toMatchObject({ imageFormat: 'webp', imageQuality: 67 });
  owner.update('visible', { imageFormat: 'png' });
  owner.update('selection', { imageQuality: 59 });
  owner.update('full', {
    fullPageCapture: { freezeMotion: false, preloadLazyContent: false, floatingElements: 'hide' },
  });
  await owner.load();
  expect(loadSettings).toHaveBeenCalledTimes(1);
  expect(owner.read('visible').imageFormat).toBe('png');
  expect(owner.read('selection')).toEqual({ imageFormat: 'jpeg', imageQuality: 59 });
  expect(owner.read('full').imageFormat).toBe('webp');
  expect(settings).toEqual(before);
});

it('preserves edits made before a delayed defaults read completes', async () => {
  let finish!: (settings: ReturnType<typeof createDefaultSettings>) => void;
  const owner = createCaptureSessionPreferences({
    loadSettings: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const loading = owner.load();
  owner.update('visible', { imageFormat: 'webp' });
  const settings = createDefaultSettings();
  settings.imageFormat = 'jpeg';
  settings.imageQuality = 72;
  finish(settings);
  await loading;
  expect(owner.read('visible')).toEqual({ imageFormat: 'webp', imageQuality: 72 });
  expect(owner.read('selection')).toEqual({ imageFormat: 'jpeg', imageQuality: 72 });
});

it('isolates documents and reads current defaults after a reload or global reset', async () => {
  const settings = createDefaultSettings();
  settings.imageQuality = 78;
  const loadSettings = vi.fn(async () => structuredClone(settings));
  const first = createCaptureSessionPreferences({ loadSettings });
  await first.load();
  first.update('visible', { imageFormat: 'webp' });
  settings.imageFormat = 'jpeg';
  settings.imageQuality = 63;
  const second = createCaptureSessionPreferences({ loadSettings });
  await second.load();
  expect(first.read('visible')).toEqual({ imageFormat: 'webp', imageQuality: 78 });
  expect(second.read('visible')).toEqual({ imageFormat: 'jpeg', imageQuality: 63 });
});

it('retries a failed defaults read without discarding an accepted local choice', async () => {
  const settings = createDefaultSettings();
  settings.imageQuality = 74;
  const loadSettings = vi
    .fn()
    .mockRejectedValueOnce(new Error('storage unavailable'))
    .mockResolvedValueOnce(settings);
  const owner = createCaptureSessionPreferences({ loadSettings });
  owner.update('selection', { imageFormat: 'webp' });
  await expect(owner.load()).rejects.toThrow('storage unavailable');
  await owner.load();
  expect(owner.read('selection')).toEqual({ imageFormat: 'webp', imageQuality: 74 });
});

it('merges a partial full-page edit with delayed defaults for untouched parameters', async () => {
  let finish!: (settings: ReturnType<typeof createDefaultSettings>) => void;
  const owner = createCaptureSessionPreferences({
    loadSettings: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const loading = owner.load();
  owner.update('full', { fullPageCapture: { freezeMotion: false } });
  const settings = createDefaultSettings();
  settings.fullPageCapture = {
    freezeMotion: true,
    preloadLazyContent: false,
    floatingElements: 'repeat',
  };
  finish(settings);
  await loading;
  expect(owner.read('full').fullPageCapture).toEqual({
    freezeMotion: false,
    preloadLazyContent: false,
    floatingElements: 'repeat',
  });
});

it('normalizes legacy out-of-range quality for the bounded wire profile without rewriting Settings', async () => {
  const settings = createDefaultSettings();
  settings.imageQuality = 0;
  settings.fullPageImage = { imageFormat: 'png', imageQuality: 200 };
  const owner = createCaptureSessionPreferences({ loadSettings: async () => settings });
  await owner.load();
  expect(owner.read('visible').imageQuality).toBe(100);
  expect(owner.read('full').imageQuality).toBe(100);
  expect(settings.imageQuality).toBe(0);
  expect(settings.fullPageImage.imageQuality).toBe(200);
});
