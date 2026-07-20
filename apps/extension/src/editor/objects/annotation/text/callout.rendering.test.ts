import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyCanvasShadowMock: vi.fn(),
  applyTextLayoutMock: vi.fn(),
  attachTextCalloutEditingLifecycleMock: vi.fn(),
  attachTextCalloutGeometryMock: vi.fn(),
  attachTextLayoutLifecycleMock: vi.fn(),
  createFabricShadowMock: vi.fn(),
  getScaledTextCalloutSurfaceSizeMock: vi.fn(() => ({ height: 80, width: 120 })),
  getTextCalloutFrameMock: vi.fn(() => ({ height: 40, left: 0, top: 0, width: 90 })),
  getTextCalloutPathMock: vi.fn(() => 'M 0 0 Z'),
  getTextCalloutSurfaceSizeMock: vi.fn(() => ({ height: 72, width: 144 })),
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
  createFabricShadow: mocks.createFabricShadowMock,
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
  getScaledTextCalloutSurfaceSize: mocks.getScaledTextCalloutSurfaceSizeMock,
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

import {
  applyTextCalloutRendering,
  getScaledTextCalloutDimensions,
  resizeTextCallout,
} from './callout';

type TestTextbox = {
  _renderBackground?: (ctx: CanvasRenderingContext2D) => void;
  backgroundColor: string;
  fill?: string | { kind: string };
  height?: number;
  sniptaleTextBackgroundOpacity: number;
  sniptaleTextCalloutFormat: string;
  sniptaleTextCalloutHeight?: number | undefined;
  sniptaleTextCalloutRendererAttached?: boolean;
  sniptaleTextCalloutShadow?: number | undefined;
  sniptaleTextCalloutWidth?: number | undefined;
  sniptaleTextShadowAngle?: number;
  sniptaleTextShadowColor?: string;
  sniptaleTextLayoutMode: string;
  scaleX?: number;
  scaleY?: number;
  set: ReturnType<typeof vi.fn>;
  width?: number;
};

type TestCanvasContext = {
  fill: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  fillStyle?: string;
  globalAlpha: number;
  restore: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
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

function expectAttachmentLifecycle(textbox: TestTextbox) {
  expect(mocks.attachTextCalloutEditingLifecycleMock).toHaveBeenCalledWith(textbox);
  expect(mocks.attachTextCalloutGeometryMock).toHaveBeenCalledWith(textbox);
  expect(mocks.attachTextLayoutLifecycleMock).toHaveBeenCalledWith(textbox);
  expect(mocks.applyTextLayoutMock).toHaveBeenCalledWith(textbox);
}

function expectNormalizedRenderable(textbox: TestTextbox) {
  expect(textbox.sniptaleTextCalloutFormat).toBe('panel');
  expect(textbox.sniptaleTextLayoutMode).toBe('auto');
  expect(textbox.sniptaleTextCalloutShadow).toBe(30);
  expect(textbox.sniptaleTextCalloutWidth).toBe(144);
  expect(textbox.sniptaleTextCalloutHeight).toBe(72);
  expect(textbox.set).toHaveBeenCalledWith({
    objectCaching: false,
    padding: 10,
    shadow: undefined,
  });
}

function resetRenderingMocks() {
  vi.clearAllMocks();
  mocks.getScaledTextCalloutSurfaceSizeMock.mockReturnValue({ height: 80, width: 120 });
  mocks.getTextCalloutSurfaceSizeMock.mockReturnValue({ height: 72, width: 144 });
}

beforeEach(resetRenderingMocks);
afterEach(() => {
  vi.unstubAllGlobals();
});

it('normalizes non-plain callouts, updates surface metadata, and attaches renderer once', () => {
  const textbox = createTextbox();

  applyTextCalloutRendering(textbox as never);

  expectNormalizedRenderable(textbox);
  expectAttachmentLifecycle(textbox);
  expect(textbox.sniptaleTextCalloutRendererAttached).toBe(true);

  const firstRenderer = textbox._renderBackground;
  applyTextCalloutRendering(textbox as never);
  expect(textbox._renderBackground).toBe(firstRenderer);
});

it('keeps plain callouts on normalized defaults and reuses fixed-width layout during resize', () => {
  const shadow = { blur: 6 };
  mocks.createFabricShadowMock.mockReturnValueOnce(shadow);
  const textbox = createTextbox({
    fill: '#556677',
    sniptaleTextCalloutFormat: 'plain',
    sniptaleTextCalloutHeight: undefined,
    sniptaleTextCalloutShadow: undefined,
    sniptaleTextCalloutWidth: undefined,
    sniptaleTextShadowAngle: 135,
    sniptaleTextShadowColor: '#112233',
  });

  applyTextCalloutRendering(textbox as never);
  resizeTextCallout(textbox as never, 81.2, 27.9);

  expect(textbox.sniptaleTextCalloutFormat).toBe('plain');
  expect(textbox.sniptaleTextCalloutWidth).toBe(144);
  expect(textbox.sniptaleTextCalloutHeight).toBe(72);
  expect(textbox.set).toHaveBeenCalledWith({
    objectCaching: false,
    padding: 0,
    shadow,
  });
  expect(mocks.createFabricShadowMock).toHaveBeenCalledWith(0, '#112233', {
    angle: 135,
    blur: 12,
    distance: 4,
  });
  expect(mocks.applyTextLayoutMock).toHaveBeenLastCalledWith(textbox, {
    layoutMode: 'fixed-width',
    surfaceHeight: 28,
    surfaceWidth: 81,
  });
  applyTextCalloutRendering(
    createTextbox({ fill: '#556677', sniptaleTextCalloutFormat: 'plain' }) as never
  );
  expect(mocks.createFabricShadowMock).toHaveBeenLastCalledWith(30, '#556677', {
    angle: 90,
    blur: 12,
    distance: 4,
  });
});

it('falls back to default plain text shadow color and skips Fabric shadow for panels', () => {
  const plainTextbox = createTextbox({
    fill: { kind: 'pattern' },
    sniptaleTextCalloutFormat: 'plain',
    sniptaleTextShadowColor: '  ',
  });

  applyTextCalloutRendering(plainTextbox as never);

  expect(mocks.createFabricShadowMock).toHaveBeenLastCalledWith(30, '#111827', {
    angle: 90,
    blur: 12,
    distance: 4,
  });

  const panelTextbox = createTextbox({ sniptaleTextShadowColor: '#112233' });
  applyTextCalloutRendering(panelTextbox as never);

  expect(panelTextbox.set).toHaveBeenCalledWith({
    objectCaching: false,
    padding: 10,
    shadow: undefined,
  });
});

it('renders panel background through the attached custom renderer', () => {
  vi.stubGlobal('Path2D', undefined);
  const context = createCanvasContext();
  const textbox = createTextbox();

  applyTextCalloutRendering(textbox as never);
  textbox._renderBackground?.(context as never);

  expect(context.save).toHaveBeenCalledOnce();
  expect(context.globalAlpha).toBe(0.4);
  expect(mocks.applyCanvasShadowMock).toHaveBeenCalledWith(context, 30, '#223344', {
    angle: 90,
    blur: 12,
    distance: 4,
  });
  expect(mocks.traceTextCalloutPathMock).toHaveBeenCalledOnce();
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 90, 40);
  expect(context.restore).toHaveBeenCalledOnce();
});

it('skips custom background rendering when path or fill is missing', () => {
  const emptyPathContext = createCanvasContext();
  const blankFillContext = createCanvasContext();
  const emptyPathTextbox = createTextbox();
  const blankFillTextbox = createTextbox({ backgroundColor: '  ' });

  mocks.getTextCalloutPathMock.mockReturnValueOnce('');
  applyTextCalloutRendering(emptyPathTextbox as never);
  emptyPathTextbox._renderBackground?.(emptyPathContext as never);
  applyTextCalloutRendering(blankFillTextbox as never);
  blankFillTextbox._renderBackground?.(blankFillContext as never);

  expect(emptyPathContext.save).not.toHaveBeenCalled();
  expect(blankFillContext.save).not.toHaveBeenCalled();
});

it('reports scaled dimensions through the geometry seam', () => {
  expect(getScaledTextCalloutDimensions(createTextbox() as never)).toEqual({
    height: 80,
    width: 120,
  });
});
