import { beforeEach, expect, it, vi } from 'vitest';

const { localGetMock, localSetMock } = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localSetMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      local: {
        get: localGetMock,
        set: localSetMock,
      },
    },
  })
);

import {
  loadEditorFloatingLayersPreference,
  parseStoredEditorFloatingLayersPreference,
  saveEditorFloatingLayersPreference,
} from './floating-layers';

beforeEach(() => {
  vi.clearAllMocks();
});

it('parses editor floating layers preference from storage-safe payloads', () => {
  expect(
    parseStoredEditorFloatingLayersPreference({ collapsed: true, heightRatio: 0.625 })
  ).toEqual({
    collapsed: true,
    heightRatio: 0.625,
  });
  expect(parseStoredEditorFloatingLayersPreference({ collapsed: 'yes', heightRatio: 3 })).toEqual({
    collapsed: false,
    heightRatio: null,
  });
  expect(parseStoredEditorFloatingLayersPreference(undefined)).toEqual({
    collapsed: false,
    heightRatio: null,
  });
});

it('loads and saves editor floating layers preference with fail-soft reads and writes', async () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  localGetMock
    .mockResolvedValueOnce({
      sniptale_editor_floating_layers: { collapsed: true, heightRatio: 0.4 },
    })
    .mockRejectedValueOnce(new Error('offline'));
  localSetMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('quota'));

  await expect(loadEditorFloatingLayersPreference()).resolves.toEqual({
    collapsed: true,
    heightRatio: 0.4,
  });
  await expect(loadEditorFloatingLayersPreference()).resolves.toEqual({
    collapsed: false,
    heightRatio: null,
  });
  await expect(
    saveEditorFloatingLayersPreference({ collapsed: false, heightRatio: 0.7 })
  ).resolves.toBeUndefined();
  await expect(
    saveEditorFloatingLayersPreference({ collapsed: true, heightRatio: null })
  ).resolves.toBeUndefined();

  expect(localSetMock).toHaveBeenNthCalledWith(1, {
    sniptale_editor_floating_layers: { collapsed: false, heightRatio: 0.7 },
  });
  expect(warnSpy).toHaveBeenCalledWith(
    '[SharedUiStateStorage]',
    'Failed to save editor floating layers preference',
    expect.any(Error)
  );
});
