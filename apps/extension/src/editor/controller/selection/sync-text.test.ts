import { beforeEach, expect, it, vi } from 'vitest';

const settings = {
  backgroundColor: '#eeeeee',
  backgroundOpacity: 1,
  calloutFormat: 'plain',
  fontFamily: 'sans',
  fontSize: 18,
  fontStyle: 'normal',
  fontWeight: 'normal',
  layoutMode: 'fixed-width',
  linethrough: false,
  shadow: 0,
  shadowAngle: 90,
  shadowColor: '#111827',
  textAlign: 'left',
  textColor: '#112233',
  textOpacity: 1,
  underline: false,
  verticalAlign: 'top',
};

const mocks = vi.hoisted(() => ({
  isTextbox: vi.fn(() => true),
  updateSelectionTextSettings: vi.fn(),
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isTextbox: mocks.isTextbox,
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings: { text: settings },
      updateSelectionTextSettings: mocks.updateSelectionTextSettings,
    }),
  },
}));

import { syncTextSelectionSettings } from './sync-text';

beforeEach(() => {
  vi.clearAllMocks();
});

it('preserves hidden text and background colors when opacity renders rgba alpha zero', () => {
  syncTextSelectionSettings({
    fill: 'rgba(68, 85, 102, 0)',
    fontFamily: 'Inter',
    kind: 'textbox',
    sniptaleTextBackgroundOpacity: 0,
    sniptaleTextCalloutFormat: 'plain',
    sniptaleTextOpacity: 0,
    textBackgroundColor: 'rgba(255, 204, 0, 0)',
  } as never);

  expect(mocks.updateSelectionTextSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      backgroundColor: '#ffcc00',
      backgroundOpacity: 0,
      textColor: '#445566',
      textOpacity: 0,
    })
  );
});

it('preserves hidden hex colors and explicit transparent values at zero opacity', () => {
  syncTextSelectionSettings({
    backgroundColor: 'transparent',
    fill: '#12345600',
    fontFamily: 'Inter',
    kind: 'textbox',
    sniptaleTextBackgroundOpacity: 0,
    sniptaleTextCalloutFormat: 'panel',
    sniptaleTextOpacity: 0,
  } as never);

  expect(mocks.updateSelectionTextSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      backgroundColor: 'transparent',
      textColor: '#123456',
    })
  );
});

it('keeps non-transparent rendered colors when zero opacity has no hidden source', () => {
  syncTextSelectionSettings({
    fill: '#abcd',
    fontFamily: 'Inter',
    kind: 'textbox',
    sniptaleTextCalloutFormat: 'plain',
    sniptaleTextOpacity: 0,
    textBackgroundColor: '',
  } as never);

  expect(mocks.updateSelectionTextSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      backgroundColor: 'transparent',
      textColor: '#abcd',
    })
  );
});
