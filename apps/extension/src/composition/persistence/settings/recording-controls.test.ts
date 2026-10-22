import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORDING_TOOLBAR_CONTROLS } from '../../../contracts/settings';
import { parseStoredSettings } from './guards';

const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() },
    sync: storage,
  },
}));

import { loadSettings, patchSettings } from './index';

beforeEach(() => {
  vi.clearAllMocks();
  storage.get.mockResolvedValue({});
  storage.set.mockResolvedValue(undefined);
});

describe('recording toolbar visibility settings', () => {
  it.each([true, false])(
    'accepts fadeDuringRecording=%s without changing sibling values',
    (fadeDuringRecording) => {
      expect(
        parseStoredSettings({ contentToolbar: { fadeDuringRecording, compactMenus: true } })
      ).toMatchObject({
        invalidFieldCount: 0,
        value: { contentToolbar: { fadeDuringRecording, compactMenus: true } },
      });
      expect(parseStoredSettings({ contentToolbar: {} }).value.contentToolbar).not.toHaveProperty(
        'fadeDuringRecording'
      );
    }
  );

  it.each([null, [], 'false', 0, {}].map((fadeDuringRecording) => ({ fadeDuringRecording })))(
    'rejects malformed fading preference $fadeDuringRecording',
    ({ fadeDuringRecording }) => {
      const parsed = parseStoredSettings({
        imageQuality: 85,
        contentToolbar: { fadeDuringRecording },
      });
      expect(parsed.invalidFieldCount).toBe(1);
      expect(parsed.value).toEqual({ imageQuality: 85 });
    }
  );

  it('accepts every optional control without inventing values for absent controls', () => {
    const recordingControls = Object.fromEntries(
      RECORDING_TOOLBAR_CONTROLS.map((control) => [control, false])
    );
    expect(parseStoredSettings({ contentToolbar: { recordingControls } })).toMatchObject({
      invalidFieldCount: 0,
      value: { contentToolbar: { recordingControls } },
    });
    expect(parseStoredSettings({ contentToolbar: {} }).value.contentToolbar).not.toHaveProperty(
      'recordingControls'
    );
  });

  it.each(
    [null, [], 'pencil', { pencil: 'false' }, { stop: false }, { navigation: false }].map(
      (recordingControls) => ({ recordingControls })
    )
  )(
    'rejects malformed or mandatory-control visibility map $recordingControls',
    ({ recordingControls }) => {
      const parsed = parseStoredSettings({
        imageQuality: 85,
        contentToolbar: { recordingControls },
      });
      expect(parsed.invalidFieldCount).toBe(1);
      expect(parsed.value).toEqual({ imageQuality: 85 });
    }
  );

  it('opens legacy settings without writing or hiding tools', async () => {
    storage.get.mockResolvedValue({
      sniptale_settings: { contentToolbar: { compactMenus: true } },
    });
    expect((await loadSettings()).contentToolbar).toMatchObject({ compactMenus: true });
    expect((await loadSettings()).contentToolbar?.recordingControls).toBeUndefined();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('merges per-control edits while preserving sibling preferences', async () => {
    let persisted: Record<string, unknown> = {
      contentToolbar: {
        displayMode: 'vertical',
        compactMenus: true,
        recordingControls: { camera: false, text: false },
      },
      imageQuality: 85,
    };
    storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
    storage.set.mockImplementation(
      async (items: { sniptale_settings: Record<string, unknown> }) => {
        persisted = items.sniptale_settings;
      }
    );
    await patchSettings({ contentToolbar: { recordingControls: { text: true, pencil: false } } });
    await patchSettings({ contentToolbar: { position: { x: 20, y: 30 } } });
    expect((await loadSettings()).contentToolbar).toMatchObject({
      displayMode: 'vertical',
      compactMenus: true,
      position: { x: 20, y: 30 },
      recordingControls: { camera: false, text: true, pencil: false },
    });
    expect(persisted['imageQuality']).toBe(85);
  });

  it('retains the last accepted visibility after a failed write and permits retry', async () => {
    let persisted: Record<string, unknown> = {
      contentToolbar: { recordingControls: { camera: false } },
    };
    storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
    storage.set
      .mockRejectedValueOnce(new Error('write refused'))
      .mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
        persisted = items.sniptale_settings;
      });
    const patch = { contentToolbar: { recordingControls: { camera: true } } };
    await expect(patchSettings(patch)).rejects.toThrow('write refused');
    expect((await loadSettings()).contentToolbar?.recordingControls).toEqual({ camera: false });
    await patchSettings(patch);
    expect((await loadSettings()).contentToolbar?.recordingControls).toEqual({ camera: true });
  });
});
