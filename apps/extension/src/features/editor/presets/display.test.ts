import { describe, expect, it, vi } from 'vitest';

const translateMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('../../../platform/i18n', () => ({
  translate: translateMock,
}));

import { getEditorPresetDisplayName, getEditorSystemPresetDisplayName } from './display';

describe('editor preset display labels', () => {
  it('projects a generic system label for editor-owned UI only when the preset is system-owned', () => {
    expect(getEditorSystemPresetDisplayName()).toBe('shared.defaults.defaultEditorPresetName');
    expect(
      getEditorPresetDisplayName({
        isSystemDefault: true,
        name: 'shared.defaults.defaultBorderPresetName',
      })
    ).toBe('shared.defaults.defaultEditorPresetName');
    expect(
      getEditorPresetDisplayName({
        isSystemDefault: false,
        name: 'Rectangle from editor 1',
      })
    ).toBe('Rectangle from editor 1');
    expect(translateMock).toHaveBeenCalledWith('shared.defaults.defaultEditorPresetName');
  });
});
