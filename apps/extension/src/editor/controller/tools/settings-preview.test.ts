import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyShapeSettingsMock: vi.fn(),
  createFabricShadowMock: vi.fn(() => ({ blur: 6 })),
  getArrowGeometryMock: vi.fn(() => ({
    end: { x: 24, y: 32 },
    start: { x: 4, y: 6 },
  })),
  getBlurSettingsMock: vi.fn(() => ({
    amount: 7,
    blurType: 'gaussian',
    showBorder: false,
  })),
  hexToRgbaMock: vi.fn((color: string, opacity: number) => `${color}:${opacity}`),
  isArrowObjectMock: vi.fn(() => false),
  isBlurObjectMock: vi.fn(() => false),
  PencilBrushMock: vi.fn(function PencilBrush(this: { canvas?: unknown }, canvas: unknown) {
    this.canvas = canvas;
  }),
  updateArrowObjectMock: vi.fn(),
  updateBlurObjectMock: vi.fn(),
}));

let storeState: {
  toolSettings: {
    arrow: { color: string; endHead: 'block'; width: number };
    blur: { amount: number; blurType: 'distortion'; showBorder: true };
    highlighter: {
      color: string;
      opacity: number;
      shapeCorrection: 'off' | 'subtle' | 'strong';
      shadow: number;
      smoothingLevel: number;
      width: number;
    };
    pencil: {
      color: string;
      opacity: number;
      shapeCorrection: 'off' | 'subtle' | 'strong';
      shadow: number;
      smoothingLevel: number;
      width: number;
    };
    ellipse: { strokeColor: string; strokeWidth: number };
    rectangle: { strokeColor: string; strokeWidth: number };
  };
};

vi.mock('fabric', () => ({ PencilBrush: mocks.PencilBrushMock }));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: { getState: () => storeState },
}));
vi.mock('../../objects/annotation/blur/object/settings', () => ({
  getBlurSettings: mocks.getBlurSettingsMock,
}));
vi.mock('../../objects/annotation/blur/object/identity', () => ({
  isBlurObject: mocks.isBlurObjectMock,
}));
vi.mock('../../objects/annotation/blur/object/update', () => ({
  updateBlurObject: mocks.updateBlurObjectMock,
}));
vi.mock('../../objects/shape-style', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shape-style')>(
    '../../objects/shape-style'
  )),
  applyShapeSettings: mocks.applyShapeSettingsMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowGeometry: mocks.getArrowGeometryMock,
  isArrowObject: mocks.isArrowObjectMock,
  updateArrowObject: mocks.updateArrowObjectMock,
}));
vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  hexToRgba: mocks.hexToRgbaMock,
}));
vi.mock('../../objects/shadow', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shadow')>('../../objects/shadow')),
  createFabricShadow: mocks.createFabricShadowMock,
}));

import { refreshEditorToolSettingsPreview } from './settings-preview';

function resetStoreState() {
  storeState = {
    toolSettings: {
      arrow: { color: '#00ff00', endHead: 'block', width: 5 },
      blur: { amount: 16, blurType: 'distortion', showBorder: true },
      highlighter: {
        color: '#ffff00',
        opacity: 0.4,
        shapeCorrection: 'off',
        shadow: 100,
        smoothingLevel: 6,
        width: 12,
      },
      pencil: {
        color: '#ff0000',
        opacity: 1,
        shapeCorrection: 'subtle',
        shadow: 30,
        smoothingLevel: 4,
        width: 4,
      },
      ellipse: { strokeColor: '#222222', strokeWidth: 4 },
      rectangle: { strokeColor: '#111111', strokeWidth: 3 },
    },
  };
}

function registerFreehandPreviewRefreshTest() {
  it('refreshes the active freehand brush from current defaults', () => {
    resetStoreState();
    const canvas = { freeDrawingBrush: null, requestRenderAll: vi.fn() };

    refreshEditorToolSettingsPreview({
      activeTool: 'highlighter' as never,
      canvas: canvas as never,
      drawSession: null,
    });

    expect(canvas.freeDrawingBrush).toMatchObject({
      color: '#ffff00:0.4',
      decimate: 0.6,
      width: 12,
    });
    expect(canvas.freeDrawingBrush).toMatchObject({ shadow: { blur: 6 } });
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });
}

function registerShapePreviewRefreshTest() {
  it('reapplies current shape defaults to active shape drafts', () => {
    resetStoreState();
    const object = { setCoords: vi.fn() };
    const canvas = { requestRenderAll: vi.fn() };

    refreshEditorToolSettingsPreview({
      activeTool: 'rectangle' as never,
      canvas: canvas as never,
      drawSession: { object, tool: 'rectangle' } as never,
    });

    expect(mocks.applyShapeSettingsMock).toHaveBeenCalledWith(object, 'rectangle', {
      strokeColor: '#111111',
      strokeWidth: 3,
    });
    expect(object.setCoords).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });
}

function registerArrowPreviewRefreshTest() {
  it('reapplies current arrow defaults to active arrow drafts', () => {
    resetStoreState();
    const arrow = { setCoords: vi.fn() };
    const canvas = { requestRenderAll: vi.fn() };
    mocks.isArrowObjectMock.mockReturnValue(true);

    refreshEditorToolSettingsPreview({
      activeTool: 'arrow' as never,
      canvas: canvas as never,
      drawSession: { object: arrow, tool: 'arrow' } as never,
    });

    expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(arrow, {
      end: { x: 24, y: 32 },
      settings: { color: '#00ff00', endHead: 'block', width: 5 },
      start: { x: 4, y: 6 },
    });
    expect(arrow.setCoords).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });
}

function registerBlurPreviewRefreshTest() {
  it('reapplies current blur defaults to active blur drafts', () => {
    resetStoreState();
    const blur = { setCoords: vi.fn() };
    const canvas = { requestRenderAll: vi.fn() };
    mocks.isBlurObjectMock.mockReturnValue(true);

    refreshEditorToolSettingsPreview({
      activeTool: 'blur' as never,
      canvas: canvas as never,
      drawSession: { object: blur, tool: 'blur' } as never,
    });

    expect(mocks.updateBlurObjectMock).toHaveBeenCalledWith(blur, {
      settings: {
        amount: 16,
        blurType: 'distortion',
        showBorder: true,
      },
    });
    expect(blur.setCoords).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });
}

function runToolSettingsPreviewSuite() {
  registerFreehandPreviewRefreshTest();
  registerShapePreviewRefreshTest();
  registerArrowPreviewRefreshTest();
  registerBlurPreviewRefreshTest();
}

describe('editor-controller tool settings preview refresh', runToolSettingsPreviewSuite);
