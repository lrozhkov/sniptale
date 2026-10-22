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
import { runWithPersistentDataErasureBarrier } from '../infrastructure/mutation-barrier';

beforeEach(() => {
  vi.clearAllMocks();
  storage.get.mockResolvedValue({});
  storage.set.mockResolvedValue(undefined);
});

describe('recording toolbar visibility settings', () => {
  it('drains an admitted page visibility write before erasure and recreates only the later choice', async () => {
    let persisted: Record<string, unknown> = {};
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
    storage.set.mockImplementation(
      async (items: { sniptale_settings: Record<string, unknown> }) => {
        if (storage.set.mock.calls.length === 1) {
          enter();
          await released;
        }
        persisted = items.sniptale_settings;
      }
    );
    const write = patchSettings({ contentToolbar: { pageControls: { 'drawing-pencil': false } } });
    await entered;
    const erase = vi.fn(() => {
      persisted = {};
    });
    const erasure = runWithPersistentDataErasureBarrier(erase);
    await Promise.resolve();
    expect(erase).not.toHaveBeenCalled();
    release();
    await Promise.all([write, erasure]);
    expect((await loadSettings()).contentToolbar?.pageControls).toBeUndefined();
    await patchSettings({ contentToolbar: { pageControls: { 'capture-size': false } } });
    expect((await loadSettings()).contentToolbar?.pageControls).toEqual({ 'capture-size': false });
  });
  it('admits page visibility independently and rejects mandatory or malformed choices', async () => {
    const pageControls = { 'capture-delay': false, 'drawing-pencil': false, 'review-export': true };
    expect(
      parseStoredSettings({
        contentToolbar: { pageControls, recordingControls: { camera: false } },
      })
    ).toMatchObject({
      invalidFieldCount: 0,
      value: { contentToolbar: { pageControls, recordingControls: { camera: false } } },
    });
    for (const invalid of [
      null,
      [],
      { settings: false },
      { 'drawing-select': false },
      { frame: false },
      { 'editing-block-selection': false },
      { 'capture-delay': 'no' },
    ]) {
      expect(
        parseStoredSettings({ contentToolbar: { pageControls: invalid } }).invalidFieldCount
      ).toBeGreaterThan(0);
    }
    storage.get.mockResolvedValue({
      sniptale_settings: { contentToolbar: { pageControls, recordingControls: { camera: false } } },
    });
    const result = await patchSettings({
      contentToolbar: { pageControls: { 'capture-full': false } },
    });
    expect(result.contentToolbar).toMatchObject({
      pageControls: { ...pageControls, 'capture-full': false },
      recordingControls: { camera: false },
    });
  });
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
