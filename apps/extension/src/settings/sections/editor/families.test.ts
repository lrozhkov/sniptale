import { describe, expect, it, vi } from 'vitest';

const translateMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('../../../platform/i18n', () => ({
  translate: translateMock,
}));

import {
  EDITOR_SETTINGS_PALETTE_KEYS,
  EDITOR_SETTINGS_PRESET_OWNERS,
  getEditorColorCountLabel,
  getEditorPaletteLabel,
  getEditorPresetCountLabel,
  getEditorPresetOwnerLabel,
} from './families';

describe('editor-section families helpers', () => {
  it('exposes every preset owner and palette scope label', () => {
    expect(EDITOR_SETTINGS_PRESET_OWNERS).toEqual([
      'pencil',
      'highlighter',
      'rectangle',
      'ellipse',
      'arrow',
      'text',
      'step',
      'sceneBackground',
    ]);
    expect(EDITOR_SETTINGS_PALETTE_KEYS).toEqual([
      'shapeStroke',
      'shapeFill',
      'textColor',
      'textBackground',
      'sceneBackground',
    ]);
    expect(getEditorPresetOwnerLabel('rectangle')).toBe('editor.tools.rectangle');
    expect(getEditorPresetOwnerLabel('sceneBackground')).toBe('editor.scene.sceneBackgroundTitle');
    expect(getEditorPaletteLabel('shapeStroke')).toBe('settings.editor.paletteShapeStroke');
  });

  it('routes preset and color counters through settings count labels', () => {
    expect(getEditorPresetCountLabel(2)).toBe('settings.editor.presetCountFew');
    expect(getEditorColorCountLabel(5)).toBe('settings.editor.colorCountMany');
  });
});
