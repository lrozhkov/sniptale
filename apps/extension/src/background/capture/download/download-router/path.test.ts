import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadSettingsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

import { buildDownloadFilename, resolvePresetPath } from './path';

describe('download-router path helpers', () => {
  beforeEach(() => {
    loadSettingsMock.mockReset();
  });

  it('resolves preset paths and trims trailing slashes', async () => {
    loadSettingsMock.mockResolvedValue({
      presets: [{ id: 'preset-1', path: 'images/screenshots///' }],
    });

    await expect(resolvePresetPath('preset-1')).resolves.toBe('images/screenshots');
    expect(buildDownloadFilename('images/screenshots///', 'capture.png')).toBe(
      'images/screenshots/capture.png'
    );
  });

  it('removes control characters from preset paths and filenames', async () => {
    loadSettingsMock.mockResolvedValue({
      presets: [{ id: 'preset-1', path: 'images/\u0000screenshots/\u007fhidden' }],
    });

    await expect(resolvePresetPath('preset-1')).resolves.toBe('images/screenshots/hidden');
    expect(buildDownloadFilename('safe/\u0000dir', 'cap\u001fture.png')).toBe(
      'safe/dir/capture.png'
    );
  });

  it('returns null or the filename unchanged when no preset path exists', async () => {
    loadSettingsMock.mockResolvedValue({ presets: [] });

    await expect(resolvePresetPath(undefined)).resolves.toBeNull();
    await expect(resolvePresetPath('missing')).resolves.toBeNull();
    expect(buildDownloadFilename(null, 'capture.png')).toBe('capture.png');
    expect(buildDownloadFilename('', 'capture.png')).toBe('capture.png');
  });
});
