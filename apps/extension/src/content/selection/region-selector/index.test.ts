// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../application/runtime-services/services.test-support';

const mocks = vi.hoisted(() => ({
  appendOverlayMock: vi.fn(),
  applyIsolatedStyleMock: vi.fn(),
  bestEffortMock: vi.fn(),
  hideRecordingOverlayMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(() => Promise.resolve()),
  surfaceActionsMock: vi.fn((args) => ({
    showRecordingOverlay: vi.fn(),
    showRegionSelector: () => {
      args.bindDocumentEvents();
      args.state.regionSelectorContainer = document.createElement('div');
      document.body.appendChild(args.state.regionSelectorContainer);
    },
  })),
  updateRegionSelectorUiMock: vi.fn(),
}));

vi.mock('@sniptale/foundation/best-effort', (_importOriginal) => ({
  runBestEffort: mocks.bestEffortMock,
}));

vi.mock('../../platform/dom-host', (_importOriginal) => ({
  appendToContentOverlayRoot: mocks.appendOverlayMock,
}));

vi.mock('../../platform/dom-host/isolated', (_importOriginal) => ({
  applyIsolatedContentRootStyle: mocks.applyIsolatedStyleMock,
}));

vi.mock('@sniptale/platform/observability/logger', (_importOriginal) => ({
  createLogger: () => ({ log: vi.fn() }),
}));

vi.mock('../../../platform/runtime-messaging', (_importOriginal) => ({
  sendRuntimeMessage: mocks.sendRuntimeMessageMock,
}));

vi.mock('./helpers', (_importOriginal) => ({
  updateDraggingRegion: vi.fn(() => ({ height: 20, width: 30, x: 5, y: 7 })),
  updateResizingRegion: vi.fn(() => ({ height: 25, width: 35, x: 6, y: 8 })),
}));

vi.mock('./surface', (_importOriginal) => ({
  createRegionSelectorSurfaceActions: mocks.surfaceActionsMock,
  hideRecordingOverlay: mocks.hideRecordingOverlayMock,
  updateRegionSelectorUi: mocks.updateRegionSelectorUiMock,
}));

import { createRegionSelectorController } from '.';

const requestBinding = {
  regionSelectionCapabilityToken: 'token-1',
  regionSelectionRequestGeneration: 'generation-1',
  regionSelectionRequestId: 'request-1',
};

describe('region selector controller', () => {
  it('shows, cancels, and disposes the region selector overlay', () => {
    installContentRuntimeMessagingMock(mocks.sendRuntimeMessageMock);
    const controller = createRegionSelectorController();

    controller.showRegionSelector(requestBinding);
    expect(document.body.querySelector('div')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    controller.clearSelectedRegion();
    controller.dispose();

    expect(mocks.bestEffortMock).toHaveBeenCalled();
    expect(mocks.hideRecordingOverlayMock).toHaveBeenCalled();
    expect(controller.getSelectedRegion()).toBeNull();
  });

  it('keeps TAB_CROP coordinates in the final CSS viewport coordinate space', () => {
    installContentRuntimeMessagingMock(mocks.sendRuntimeMessageMock);
    const captureViewport = {
      devicePixelRatio: 2,
      height: 720,
      scrollX: 0,
      scrollY: 0,
      viewportOffsetX: 0,
      viewportOffsetY: 0,
      visualViewportScale: 1,
      width: 1280,
    };
    const getViewportInfo = vi.fn(() => captureViewport);
    const controller = createRegionSelectorController({ getViewportInfo });
    controller.showRegionSelector(requestBinding);

    const actions = mocks.surfaceActionsMock.mock.calls.at(-1)?.[0] as
      | {
          handleRegionSelected?: (region: {
            x: number;
            y: number;
            width: number;
            height: number;
          }) => void;
        }
      | undefined;
    actions?.handleRegionSelected?.({ x: 10, y: 20, width: 300, height: 200 });

    expect(controller.getSelectedRegion()).toEqual({ x: 10, y: 20, width: 300, height: 200 });
    expect(mocks.bestEffortMock).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.anything(),
      expect.any(String),
      expect.objectContaining({ type: 'REGION_SELECTED' })
    );
    expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        captureViewport,
        region: { x: 10, y: 20, width: 300, height: 200 },
        type: 'REGION_SELECTED',
      })
    );
    expect(getViewportInfo).toHaveBeenCalledOnce();
  });
});
