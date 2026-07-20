// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorViewportZoomMock: vi.fn(),
  captureEditorViewportAnchorMock: vi.fn(() => ({ relativeX: 0.5, relativeY: 0.5 })),
  restoreEditorViewportAnchorMock: vi.fn(),
}));

vi.mock('./', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./')>()),
  applyEditorViewportZoom: mocks.applyEditorViewportZoomMock,
  captureEditorViewportAnchor: mocks.captureEditorViewportAnchorMock,
  getEditorStageInsets: vi.fn(),
  getEditorViewportMetrics: vi.fn(),
  restoreEditorViewportAnchor: mocks.restoreEditorViewportAnchorMock,
}));

import { refreshEditorViewportPresentation, zoomEditorToFit } from './zoom-actions';

it('keeps logical zoom authority while refreshing presentation for browser page zoom changes', () => {
  const canvas = { requestRenderAll: vi.fn() };
  const syncViewportState = vi.fn();

  refreshEditorViewportPresentation({
    canvas: canvas as never,
    canvasDocumentSize: { height: 200, width: 300 },
    devicePixelRatioBaseline: 1,
    stageElement: document.createElement('div'),
    syncRuntimeState: vi.fn(),
    syncViewportState,
    viewportElement: document.createElement('div'),
    zoomLevel: 1.5,
  });

  expect(mocks.captureEditorViewportAnchorMock).toHaveBeenCalledWith(
    expect.objectContaining({ devicePixelRatioBaseline: 1 })
  );
  expect(mocks.applyEditorViewportZoomMock).toHaveBeenCalledWith(
    canvas,
    { height: 200, width: 300 },
    1.5,
    1
  );
  expect(mocks.restoreEditorViewportAnchorMock).toHaveBeenCalledWith(
    expect.objectContaining({ devicePixelRatioBaseline: 1 })
  );
  expect(syncViewportState).not.toHaveBeenCalled();
});

it('keeps zoom-to-fit advisory inputs separate from logical zoom state when no viewport exists', () => {
  expect(
    zoomEditorToFit({
      canvas: null,
      canvasDocumentSize: { height: 200, width: 300 },
      devicePixelRatioBaseline: 1,
      stageElement: null,
      syncRuntimeState: vi.fn(),
      syncViewportState: vi.fn(),
      viewportElement: null,
      zoomLevel: 1.25,
    })
  ).toBe(1.25);
});
