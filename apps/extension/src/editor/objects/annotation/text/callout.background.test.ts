import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyCanvasShadowMock: vi.fn(),
  applyTextLayoutMock: vi.fn(),
  attachTextCalloutEditingLifecycleMock: vi.fn(),
  attachTextCalloutGeometryMock: vi.fn(),
  attachTextLayoutLifecycleMock: vi.fn(),
  getTextCalloutFrameMock: vi.fn(() => ({ height: 40, left: 4, top: 8, width: 90 })),
  getTextCalloutPathMock: vi.fn(() => 'M 0 0 Z'),
  getTextCalloutSurfaceSizeMock: vi.fn<() => { height: number | undefined; width: number }>(() => ({
    height: 72,
    width: 144,
  })),
  normalizeCalloutDimensionMock: vi.fn((value: number | undefined) => value),
  normalizeShadowPresetMock: vi.fn((value: unknown) => value ?? 0),
  normalizeTextCalloutFormatMock: vi.fn((value: unknown) =>
    value === 'plain' ? 'plain' : 'panel'
  ),
  normalizeTextLayoutModeMock: vi.fn((value: unknown) =>
    value === 'auto' ? 'auto' : 'fixed-width'
  ),
  traceTextCalloutPathMock: vi.fn(() => false),
}));

vi.mock('../../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../../document/model')>('../../../document/model');
  return { ...actual, clamp: (value: number) => value };
});
vi.mock('../../shadow', () => ({
  applyCanvasShadow: mocks.applyCanvasShadowMock,
  createFabricShadow: vi.fn(),
  normalizeShadowPreset: mocks.normalizeShadowPresetMock,
}));
vi.mock('./formats', () => ({
  getTextCalloutPath: mocks.getTextCalloutPathMock,
  traceTextCalloutPath: mocks.traceTextCalloutPathMock,
}));
vi.mock('./geometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./geometry')>()),
  CALLOUT_PADDING: 10,
  DEFAULT_TEXT_CALLOUT_HEIGHT: 60,
  DEFAULT_TEXT_CALLOUT_WIDTH: 140,
  getScaledTextCalloutSurfaceSize: vi.fn(() => ({ height: 80, width: 120 })),
  getTextCalloutFrame: mocks.getTextCalloutFrameMock,
  getTextCalloutSurfaceSize: mocks.getTextCalloutSurfaceSizeMock,
  normalizeCalloutDimension: mocks.normalizeCalloutDimensionMock,
}));
vi.mock('./editing', () => ({
  attachTextCalloutEditingLifecycle: mocks.attachTextCalloutEditingLifecycleMock,
}));
vi.mock('./interaction', () => ({
  attachTextCalloutGeometry: mocks.attachTextCalloutGeometryMock,
  normalizeTextCalloutFormat: mocks.normalizeTextCalloutFormatMock,
}));
vi.mock('./layout', () => ({
  applyTextLayout: mocks.applyTextLayoutMock,
  attachTextLayoutLifecycle: mocks.attachTextLayoutLifecycleMock,
}));
vi.mock('./mode', () => ({
  normalizeTextLayoutMode: mocks.normalizeTextLayoutModeMock,
}));

import { applyTextCalloutRendering, resizeTextCallout } from './callout';

type TestCanvasContext = {
  fill: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  fillStyle?: string;
  globalAlpha: number;
  restore: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
};

type TestTextbox = {
  _renderBackground?: (ctx: CanvasRenderingContext2D) => void;
  backgroundColor: string;
  sniptaleTextBackgroundOpacity: number;
  sniptaleTextCalloutFormat: string;
  sniptaleTextCalloutHeight?: number | undefined;
  sniptaleTextCalloutRendererAttached?: boolean;
  sniptaleTextCalloutShadow?: number | undefined;
  sniptaleTextCalloutWidth?: number | undefined;
  sniptaleTextLayoutMode: string;
  set: ReturnType<typeof vi.fn>;
};

function createTextbox(overrides: Partial<TestTextbox> = {}): TestTextbox {
  return {
    backgroundColor: '#223344',
    sniptaleTextBackgroundOpacity: 0.4,
    sniptaleTextCalloutFormat: 'panel',
    sniptaleTextCalloutHeight: 40,
    sniptaleTextCalloutShadow: 30,
    sniptaleTextCalloutWidth: 90,
    sniptaleTextLayoutMode: 'auto',
    set: vi.fn(),
    ...overrides,
  };
}

function createCanvasContext(): TestCanvasContext {
  return {
    fill: vi.fn(),
    fillRect: vi.fn(),
    globalAlpha: 1,
    restore: vi.fn(),
    save: vi.fn(),
  };
}

function renderTextboxBackground(
  textboxOverrides: Partial<TestTextbox> = {},
  context: TestCanvasContext = createCanvasContext()
) {
  const textbox = createTextbox(textboxOverrides);
  applyTextCalloutRendering(textbox as never);
  textbox._renderBackground?.(context as never);
  return { context, textbox };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('text callout background guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips rendering when the callout path is empty', () => {
    mocks.getTextCalloutPathMock.mockReturnValueOnce('');

    const { context } = renderTextboxBackground();

    expect(context.save).not.toHaveBeenCalled();
    expect(mocks.applyCanvasShadowMock).not.toHaveBeenCalled();
    expect(context.fill).not.toHaveBeenCalled();
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it('skips rendering when the callout fill is blank', () => {
    const { context } = renderTextboxBackground({ backgroundColor: '  ' });

    expect(context.save).not.toHaveBeenCalled();
    expect(mocks.applyCanvasShadowMock).not.toHaveBeenCalled();
    expect(context.fill).not.toHaveBeenCalled();
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it('falls back to fillRect when Path2D is unavailable and tracing fails', () => {
    vi.stubGlobal('Path2D', undefined);

    const { context } = renderTextboxBackground();

    expect(mocks.traceTextCalloutPathMock).toHaveBeenCalledOnce();
    expect(context.fillRect).toHaveBeenCalledWith(4, 8, 90, 40);
    expect(context.fill).not.toHaveBeenCalled();
  });

  it('falls back to the rounded resize height when surface sizing returns no height', () => {
    const textbox = createTextbox();
    mocks.getTextCalloutSurfaceSizeMock
      .mockReturnValueOnce({ height: 72, width: 144 })
      .mockReturnValueOnce({ height: undefined, width: 81 });

    applyTextCalloutRendering(textbox as never);
    resizeTextCallout(textbox as never, 81.2, 27.9);

    expect(textbox.sniptaleTextCalloutHeight).toBe(28);
  });
});
