import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectionToolSettings = {
  step: { alphabet: 'latin', color: '#123123', sizeLevel: 'md', type: 'number', value: '1' },
  text: {
    backgroundColor: '#ffffff',
    backgroundOpacity: 1,
    calloutFormat: 'panel',
    fontFamily: 'serif',
    fontSize: 18,
    fontStyle: 'normal',
    fontWeight: 'bold',
    layoutMode: 'fixed-width',
    linethrough: false,
    shadow: 0,
    textAlign: 'left',
    textColor: '#222222',
    underline: false,
    verticalAlign: 'top',
  },
};

const mocks = vi.hoisted(() => ({
  getBlurSettingsMock: vi.fn(() => ({ amount: 8 })),
  isArrowObjectMock: vi.fn(() => false),
  isBlurObjectMock: vi.fn(() => false),
  isGroupMock: vi.fn(() => false),
  isTextboxMock: vi.fn(() => false),
  parseColorForStoreMock: vi.fn((value: unknown, fallback: string) => {
    return value == null || value === '' ? fallback : `parsed:${String(value)}`;
  }),
  syncRichShapeSelectionSettingsMock: vi.fn(),
  updateSelectionBlurSettingsMock: vi.fn(),
  updateSelectionStepSettingsMock: vi.fn(),
  updateSelectionTextSettingsMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings,
      updateSelectionBlurSettings: mocks.updateSelectionBlurSettingsMock,
      updateSelectionStepSettings: mocks.updateSelectionStepSettingsMock,
      updateSelectionTextSettings: mocks.updateSelectionTextSettingsMock,
    }),
  },
}));
vi.mock('../core/helpers', async () => ({
  ...(await vi.importActual<typeof import('../core/helpers')>('../core/helpers')),
  isGroup: mocks.isGroupMock,
  isTextbox: mocks.isTextboxMock,
  parseColorForStore: mocks.parseColorForStoreMock,
}));
vi.mock('../../objects', async () => ({
  ...(await vi.importActual<typeof import('../../objects')>('../../objects')),
  isArrowObject: mocks.isArrowObjectMock,
}));
vi.mock('../../objects/annotation/blur/object', async () => ({
  ...(await vi.importActual<typeof import('../../objects/annotation/blur/object')>(
    '../../objects/annotation/blur/object'
  )),
  getBlurSettings: mocks.getBlurSettingsMock,
  isBlurObject: mocks.isBlurObjectMock,
}));
vi.mock('./rich-shape-sync', () => ({
  syncRichShapeSelectionSettings: mocks.syncRichShapeSelectionSettingsMock,
}));

import { syncSelectionToolSettingsFromObject } from './sync';

describe('editor-controller selection sync remaining branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps early exits explicit for unsupported selected object shapes', () => {
    syncSelectionToolSettingsFromObject({} as never, 'text');
    syncSelectionToolSettingsFromObject({} as never, 'step');
    syncSelectionToolSettingsFromObject({} as never, 'arrow');
    syncSelectionToolSettingsFromObject({} as never, 'blur');

    expect(mocks.updateSelectionTextSettingsMock).not.toHaveBeenCalled();
    expect(mocks.updateSelectionStepSettingsMock).toHaveBeenCalledOnce();
    expect(mocks.updateSelectionBlurSettingsMock).not.toHaveBeenCalled();
  });

  it('covers text font fallbacks and plain sans font inference', () => {
    mocks.isTextboxMock.mockReturnValue(true);

    syncSelectionToolSettingsFromObject({ fill: '#111111', fontFamily: 42 } as never, 'text');
    syncSelectionToolSettingsFromObject({ fill: '#222222', fontFamily: 'Arial' } as never, 'text');

    expect(mocks.updateSelectionTextSettingsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ fontFamily: 'serif' })
    );
    expect(mocks.updateSelectionTextSettingsMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fontFamily: 'sans' })
    );
  });

  it('covers grouped step, blur, and rich-shape sync branches', () => {
    mocks.isGroupMock.mockReturnValueOnce(true);
    syncSelectionToolSettingsFromObject({ getObjects: () => [] } as never, 'step');

    mocks.isBlurObjectMock.mockReturnValueOnce(true);
    syncSelectionToolSettingsFromObject({ kind: 'blur' } as never, 'blur');

    syncSelectionToolSettingsFromObject({ kind: 'rich' } as never, 'rich-shape');

    expect(mocks.updateSelectionBlurSettingsMock).toHaveBeenCalledWith({ amount: 8 });
    expect(mocks.syncRichShapeSelectionSettingsMock).toHaveBeenCalledWith({ kind: 'rich' });
  });
});
