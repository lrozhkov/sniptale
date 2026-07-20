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
  toDevicePixelRegionMock: vi.fn((region) => ({ ...region, scale: 2 })),
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
  toDevicePixelRegion: mocks.toDevicePixelRegionMock,
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
});
