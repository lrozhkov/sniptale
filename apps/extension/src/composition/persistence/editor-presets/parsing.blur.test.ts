import { describe, expect, it, vi } from 'vitest';

const translateMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('../../../platform/i18n', () => ({
  translate: translateMock,
}));

import { createDefaultEditorPresetStorageState } from './defaults';
import { parseRootCollections } from './parsers';

describe('editor preset parsing blur root', () => {
  it('keeps blur collections through parsed root roundtrip helpers', () => {
    const state = createDefaultEditorPresetStorageState();
    const parsedRoot = parseRootCollections({
      blur: {
        defaultPresetId: 'blur-default',
        presets: [
          {
            enabled: true,
            id: 'blur-default',
            name: 'Blur preset',
            order: 1,
            settings: state.blur.presets[0]!.settings,
          },
        ],
      },
    });

    expect(parsedRoot.blur.collection).toEqual({
      defaultPresetId: 'blur-default',
      presets: [expect.objectContaining({ id: 'blur-default' })],
    });
    expect(parsedRoot.blur.invalidFieldCount).toBe(0);
  });
});
