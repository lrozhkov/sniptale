import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectionToolSettings = {
  arrow: {
    color: '#111111',
    endHead: 'triangle',
    mode: 'straight',
    opacity: 0.4,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 2,
  },
  highlighter: {
    color: '#ffee00',
    opacity: 0.3,
    shapeCorrection: 'off',
    shadow: 0,
    smoothingLevel: 4,
    width: 12,
  },
  pencil: {
    color: '#ff0000',
    opacity: 1,
    shapeCorrection: 'subtle',
    shadow: 0,
    smoothingLevel: 4,
    width: 4,
  },
  rectangle: {
    borderPresetId: null,
    customCss: '',
    fillColor: '#ffffff',
    fillOpacity: 1,
    inheritCustomCss: false,
    opacity: 1,
    radius: 8,
    shadow: 0,
    strokeColor: '#000000',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 2,
  },
  ellipse: {
    borderPresetId: null,
    customCss: '',
    fillColor: '#ffffff',
    fillOpacity: 1,
    inheritCustomCss: false,
    opacity: 1,
    radius: 8,
    shadow: 0,
    strokeColor: '#000000',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 2,
  },
  step: { alphabet: 'latin', color: '#222222', sizeLevel: 'md', type: 'number', value: '1' },
  text: {
    backgroundColor: '#eeeeee',
    backgroundOpacity: 1,
    calloutFormat: 'panel',
    fontFamily: 'sans',
    fontSize: 18,
    fontStyle: 'normal',
    fontWeight: 'normal',
    layoutMode: 'fixed-width',
    linethrough: false,
    shadow: 0,
    textAlign: 'left',
    textColor: '#222222',
    underline: false,
  },
};

const mocks = vi.hoisted(() => ({
  getArrowSettingsMock: vi.fn(),
  isArrowObjectMock: vi.fn(() => false),
  isGroupMock: vi.fn((object: { kind?: string }) => object.kind === 'group'),
  isTextboxMock: vi.fn(() => false),
  parseColorForStoreMock: vi.fn((value: unknown, fallback: string) =>
    value == null || value === '' ? fallback : `parsed:${String(value)}`
  ),
  updateSelectionArrowSettingsMock: vi.fn(),
  updateSelectionBrushSettingsMock: vi.fn(),
  updateSelectionShapeSettingsMock: vi.fn(),
  updateSelectionStepSettingsMock: vi.fn(),
  updateSelectionTextSettingsMock: vi.fn(),
}));

vi.mock('fabric', () => ({
  PencilBrush: class PencilBrush {},
  Point: class Point {
    constructor(
      public x = 0,
      public y = 0
    ) {}
  },
  Rect: class Rect {},
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings,
      updateSelectionArrowSettings: mocks.updateSelectionArrowSettingsMock,
      updateSelectionBrushSettings: mocks.updateSelectionBrushSettingsMock,
      updateSelectionShapeSettings: mocks.updateSelectionShapeSettingsMock,
      updateSelectionStepSettings: mocks.updateSelectionStepSettingsMock,
      updateSelectionTextSettings: mocks.updateSelectionTextSettingsMock,
    }),
  },
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isGroup: mocks.isGroupMock,
  isTextbox: mocks.isTextboxMock,
  parseColorForStore: mocks.parseColorForStoreMock,
}));
vi.mock('../../objects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects')>()),
  normalizeTextCalloutFormat: (value: unknown) => (value === 'plain' ? 'plain' : 'bubble'),
  normalizeTextLayoutMode: (value: unknown) => (value === 'auto' ? 'auto' : 'fixed-width'),
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowSettings: mocks.getArrowSettingsMock,
  isArrowObject: mocks.isArrowObjectMock,
}));
import { syncSelectionToolSettingsFromObject } from './sync';

function runSelectionSyncExtendedSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isArrowObjectMock.mockReturnValue(false);
    mocks.isTextboxMock.mockReturnValue(false);
  });
  registerTextSyncTest();
  registerGroupedStepSyncTest();
  registerArrowSyncTest();
  registerGuardedOwnerSyncTest();
  registerIgnoredTypeSyncTest();
  registerTextFontFamilyBranchTest();
}

function registerTextSyncTest() {
  it('syncs text selection settings through textbox metadata', () => {
    mocks.isTextboxMock.mockReturnValue(true);

    syncSelectionToolSettingsFromObject(
      {
        backgroundColor: '#abcdef',
        fill: '#010203',
        fontFamily: 'Georgia',
        fontSize: 24,
        fontStyle: 'italic',
        fontWeight: 'bold',
        linethrough: true,
        sniptaleTextBackgroundOpacity: 0.4,
        sniptaleTextCalloutFormat: 'plain',
        sniptaleTextCalloutShadow: 30,
        sniptaleTextOpacity: 0.75,
        sniptaleTextShadowAngle: 135,
        sniptaleTextShadowColor: '#0f172a',
        textBackgroundColor: '#abcdef',
        underline: true,
      } as never,
      'text'
    );

    expect(mocks.updateSelectionTextSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: 'parsed:#abcdef',
        backgroundOpacity: 0.4,
        calloutFormat: 'plain',
        fontFamily: 'serif',
        fontSize: 24,
        fontWeight: 'bold',
        linethrough: true,
        shadow: 30,
        textColor: 'parsed:#010203',
        underline: true,
      })
    );
  });
}

function registerGroupedStepSyncTest() {
  it('syncs grouped step settings through the group owner', () => {
    const circle = { fill: '#123456' };

    syncSelectionToolSettingsFromObject(
      {
        getObjects: () => [circle],
        kind: 'group',
        sniptaleStepAlphabet: 'cyrillic',
        sniptaleStepSizeLevel: 'lg',
        sniptaleStepType: 'roman',
        sniptaleStepValue: 'IV',
      } as never,
      'step'
    );

    expect(mocks.updateSelectionStepSettingsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        alphabet: 'cyrillic',
        sizeLevel: 'lg',
        type: 'roman',
        value: 'IV',
      })
    );
    expect(mocks.updateSelectionStepSettingsMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ color: 'parsed:#123456' })
    );
  });
}

function registerArrowSyncTest() {
  it('syncs arrow settings through the arrow owner', () => {
    mocks.isArrowObjectMock.mockReturnValue(true);
    mocks.getArrowSettingsMock.mockReturnValue({
      color: '#222222',
      dynamicWidth: true,
      endHead: 'triangle',
      mode: 'elbow',
      opacity: 0.8,
      shadow: 60,
      startHead: 'dot',
      arrowType: 'elbow',
      variant: 'tapered',
      width: 6,
    });

    syncSelectionToolSettingsFromObject({} as never, 'arrow');

    expect(mocks.updateSelectionArrowSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ arrowType: 'elbow', dynamicWidth: true, width: 6 })
    );
  });
}

function registerGuardedOwnerSyncTest() {
  it('guards non-group step color sync and non-arrow arrow sync branches', () => {
    syncSelectionToolSettingsFromObject(
      {
        sniptaleStepAlphabet: 'latin',
        sniptaleStepSizeLevel: 'sm',
        sniptaleStepType: 'number',
        sniptaleStepValue: '2',
      } as never,
      'step'
    );
    syncSelectionToolSettingsFromObject({} as never, 'arrow');

    expect(mocks.updateSelectionStepSettingsMock).toHaveBeenCalledOnce();
    expect(mocks.updateSelectionArrowSettingsMock).not.toHaveBeenCalled();
  });
}

function registerIgnoredTypeSyncTest() {
  it('ignores non-owned object types without mutating store settings', () => {
    syncSelectionToolSettingsFromObject({} as never, 'background');

    expect(mocks.updateSelectionArrowSettingsMock).not.toHaveBeenCalled();
    expect(mocks.updateSelectionBrushSettingsMock).not.toHaveBeenCalled();
    expect(mocks.updateSelectionShapeSettingsMock).not.toHaveBeenCalled();
    expect(mocks.updateSelectionStepSettingsMock).not.toHaveBeenCalled();
    expect(mocks.updateSelectionTextSettingsMock).not.toHaveBeenCalled();
  });
}

function registerTextFontFamilyBranchTest() {
  it('covers mono and sans font-family normalization branches for text sync', () => {
    mocks.isTextboxMock.mockReturnValue(true);

    syncSelectionToolSettingsFromObject(
      { fill: '#010203', fontFamily: 'Monospace' } as never,
      'text'
    );
    syncSelectionToolSettingsFromObject(
      { fill: '#010203', fontFamily: 'Helvetica' } as never,
      'text'
    );

    expect(mocks.updateSelectionTextSettingsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ fontFamily: 'mono' })
    );
    expect(mocks.updateSelectionTextSettingsMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fontFamily: 'sans' })
    );
  });
}

describe('selection sync text step and arrow seam', runSelectionSyncExtendedSuite);
