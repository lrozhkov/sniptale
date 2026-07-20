import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parseColorForStoreMock: vi.fn((value: unknown, fallback: string) =>
    value == null || value === '' ? fallback : `parsed:${String(value)}`
  ),
  updateSelectionTextSettingsMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings: {
        text: {
          backgroundColor: '#eeeeee',
          backgroundOpacity: 1,
          calloutFormat: 'panel',
          fontFamily: 'sans',
          fontSize: 18,
          fontWeight: 'bold',
          fontStyle: 'normal',
          layoutMode: 'fixed-width',
          underline: false,
          linethrough: false,
          shadow: 0,
          textAlign: 'left',
          textColor: '#222222',
        },
      },
      updateSelectionTextSettings: mocks.updateSelectionTextSettingsMock,
    }),
  },
}));

vi.mock('../core/helpers', () => ({
  isGroup: vi.fn(() => false),
  isTextbox: vi.fn((object: { kind?: string }) => object.kind === 'textbox'),
  parseColorForStore: mocks.parseColorForStoreMock,
}));

vi.mock('../../objects', () => ({
  getArrowSettings: vi.fn(),
  isArrowObject: vi.fn(() => false),
  normalizeTextCalloutFormat: (value: unknown) => value ?? 'bubble',
  normalizeTextLayoutMode: (value: unknown) => (value === 'auto' ? 'auto' : 'fixed-width'),
}));

import { syncSelectionToolSettingsFromObject } from './sync';

beforeEach(() => {
  vi.clearAllMocks();
});

it('syncs meta stamps through the shared text branch', () => {
  syncSelectionToolSettingsFromObject(
    {
      backgroundColor: '#fafafa',
      fill: '#111111',
      fontFamily: 'monospace',
      fontSize: 20,
      kind: 'textbox',
      sniptaleTextBackgroundOpacity: 0.35,
      sniptaleTextCalloutFormat: 'panel',
      sniptaleTextCalloutShadow: 100,
    } as never,
    'meta-stamp' as never
  );

  expect(mocks.updateSelectionTextSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      backgroundOpacity: 0.35,
      calloutFormat: 'panel',
      shadow: 100,
    })
  );
});
