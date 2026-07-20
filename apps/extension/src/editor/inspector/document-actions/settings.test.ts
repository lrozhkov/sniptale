import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_EDITOR_EXPORT_SETTINGS,
  type EditorExportSettings,
} from '../../persistence/export-settings';
import { loadPersistedEditorSettings, syncLoadedSettings } from './settings';

describe('editor-inspector-document-actions.settings', () => {
  it('returns current settings when they already exist and rejects on load failure', async () => {
    const current: EditorExportSettings = {
      ...DEFAULT_EDITOR_EXPORT_SETTINGS,
      imageFormat: 'png',
      imageQuality: 100,
    };

    await expect(loadPersistedEditorSettings(current, vi.fn())).resolves.toBe(current);

    await expect(
      loadPersistedEditorSettings(null, vi.fn().mockRejectedValue(new Error('load failed')))
    ).rejects.toThrow('load failed');
  });

  it('loads settings from storage and syncs them into state setters', async () => {
    const loaded: EditorExportSettings = {
      ...DEFAULT_EDITOR_EXPORT_SETTINGS,
      imageFormat: 'webp',
      imageQuality: 88,
    };
    const setImageFormat = vi.fn();
    const setImageQuality = vi.fn();
    const settingsRef = { current: null };

    await expect(
      loadPersistedEditorSettings(null, vi.fn().mockResolvedValue(loaded))
    ).resolves.toBe(loaded);

    syncLoadedSettings(loaded, setImageFormat, setImageQuality, settingsRef);

    expect(settingsRef.current).toBe(loaded);
    expect(setImageFormat).toHaveBeenCalledWith('webp');
    expect(setImageQuality).toHaveBeenCalledWith(88);
  });
});
