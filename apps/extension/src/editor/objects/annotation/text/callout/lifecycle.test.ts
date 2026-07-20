import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyTextLayoutMock: vi.fn(),
  attachTextCalloutAlignmentMock: vi.fn(),
  attachTextCalloutEditingLifecycleMock: vi.fn(),
  attachTextCalloutGeometryMock: vi.fn(),
  attachTextLayoutLifecycleMock: vi.fn(),
  createPlainTextCalloutShadowMock: vi.fn(() => undefined),
  getTextCalloutSurfaceSizeMock: vi.fn(() => ({ height: 72, width: 144 })),
  normalizeCalloutDimensionMock: vi.fn((value: number | undefined) => value),
  normalizeShadowPresetMock: vi.fn((value: unknown) => value ?? 0),
  normalizeTextLayoutModeMock: vi.fn((value: unknown) => value ?? 'fixed-width'),
  renderTextCalloutBackgroundMock: vi.fn(),
}));

vi.mock('../../../shadow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shadow')>()),
  normalizeShadowPreset: mocks.normalizeShadowPresetMock,
}));
vi.mock('../alignment', () => ({
  attachTextCalloutAlignment: mocks.attachTextCalloutAlignmentMock,
}));
vi.mock('../callout-shadow', () => ({
  createPlainTextCalloutShadow: mocks.createPlainTextCalloutShadowMock,
}));
vi.mock('../editing', () => ({
  attachTextCalloutEditingLifecycle: mocks.attachTextCalloutEditingLifecycleMock,
}));
vi.mock('../geometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../geometry')>()),
  getTextCalloutSurfaceSize: mocks.getTextCalloutSurfaceSizeMock,
  normalizeCalloutDimension: mocks.normalizeCalloutDimensionMock,
}));
vi.mock('../interaction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../interaction')>()),
  attachTextCalloutGeometry: mocks.attachTextCalloutGeometryMock,
}));
vi.mock('../layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layout')>()),
  applyTextLayout: mocks.applyTextLayoutMock,
  attachTextLayoutLifecycle: mocks.attachTextLayoutLifecycleMock,
}));
vi.mock('../mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mode')>()),
  normalizeTextLayoutMode: mocks.normalizeTextLayoutModeMock,
}));
vi.mock('./rendering', () => ({
  renderTextCalloutBackground: mocks.renderTextCalloutBackgroundMock,
}));

import { applyTextCalloutRendering } from './lifecycle';

it('normalizes callout metadata, attaches lifecycles, and installs one renderer', () => {
  const textbox: {
    _renderBackground?: (context: CanvasRenderingContext2D) => void;
    sniptaleTextCalloutFormat: string;
    sniptaleTextCalloutHeight: number;
    sniptaleTextCalloutRendererAttached?: boolean;
    sniptaleTextCalloutShadow: number;
    sniptaleTextCalloutWidth: number;
    sniptaleTextLayoutMode: string;
    set: ReturnType<typeof vi.fn>;
  } = {
    sniptaleTextCalloutFormat: 'panel',
    sniptaleTextCalloutHeight: 40,
    sniptaleTextCalloutShadow: 30,
    sniptaleTextCalloutWidth: 90,
    sniptaleTextLayoutMode: 'auto',
    set: vi.fn(),
  };

  applyTextCalloutRendering(textbox as never);
  const firstRenderer = textbox._renderBackground;
  applyTextCalloutRendering(textbox as never);
  textbox._renderBackground?.({} as never);

  expect(textbox).toMatchObject({
    sniptaleTextCalloutFormat: 'panel',
    sniptaleTextCalloutHeight: 72,
    sniptaleTextCalloutRendererAttached: true,
    sniptaleTextCalloutShadow: 30,
    sniptaleTextCalloutWidth: 144,
  });
  expect(textbox._renderBackground).toBe(firstRenderer);
  expect(mocks.attachTextCalloutAlignmentMock).toHaveBeenCalledWith(textbox);
  expect(mocks.attachTextCalloutEditingLifecycleMock).toHaveBeenCalledWith(textbox);
  expect(mocks.attachTextCalloutGeometryMock).toHaveBeenCalledWith(textbox);
  expect(mocks.attachTextLayoutLifecycleMock).toHaveBeenCalledWith(textbox);
  expect(mocks.applyTextLayoutMock).toHaveBeenCalledWith(textbox);
  expect(mocks.renderTextCalloutBackgroundMock).toHaveBeenCalled();
});
