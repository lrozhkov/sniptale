import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateSelectionTextSettings: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings: {
        text: {
          backgroundOpacity: 0,
          calloutFormat: 'plain',
          fontFamily: 'sans',
          fontSize: 16,
          fontStyle: 'normal',
          fontWeight: 'normal',
          layoutMode: 'fit',
          linethrough: false,
          shadowAngle: 45,
          shadowBlur: 18,
          shadowColor: '#222222',
          shadowDistance: 6,
          textColor: '#111111',
          textOpacity: 1,
          underline: false,
        },
      },
      updateSelectionTextSettings: mocks.updateSelectionTextSettings,
    }),
  },
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isTextbox: vi.fn((object: { kind?: string }) => object.kind === 'textbox'),
}));

import { syncTextSelectionSettings } from './sync-text';

describe('syncTextSelectionSettings shadow metadata', () => {
  it('uses stored shadow values and settings fallbacks without losing hidden colors', () => {
    syncTextSelectionSettings({
      fill: '#12345600',
      kind: 'textbox',
      sniptaleTextBackgroundOpacity: 0,
      sniptaleTextOpacity: 0,
      sniptaleTextShadowAngle: 135,
      sniptaleTextShadowBlur: 24,
      sniptaleTextShadowColor: '#333333',
      sniptaleTextShadowDistance: 9,
      textBackgroundColor: 'rgba(10, 20, 30, 0)',
    } as never);
    syncTextSelectionSettings({ fill: '', kind: 'textbox' } as never);

    expect(mocks.updateSelectionTextSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: '#0a141e',
        shadowAngle: 135,
        shadowBlur: 24,
        shadowColor: '#333333',
        shadowDistance: 9,
        textColor: '#123456',
      })
    );
    expect(mocks.updateSelectionTextSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        shadowAngle: 45,
        shadowBlur: 18,
        shadowColor: '#222222',
        shadowDistance: 6,
      })
    );
  });
});
