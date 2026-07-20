// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installContentRuntimeMessagingMock } from '../../application/runtime-services/services.test-support';

const mocks = vi.hoisted(() => ({
  appendToContentOverlayRootMock: vi.fn((node: Node) => node),
  applyIsolatedContentRootStyleMock: vi.fn(),
  hideRecordingOverlayMock: vi.fn(),
  runBestEffortMock: vi.fn((promise) => promise),
  sendRuntimeMessageMock: vi.fn(() => Promise.resolve()),
  surfaceArgs: null as any,
  surfaceMode: 'select',
  updateRegionSelectorUiMock: vi.fn(),
}));

vi.mock('@sniptale/foundation/best-effort', (_importOriginal) => ({
  runBestEffort: mocks.runBestEffortMock,
}));

vi.mock('../../platform/dom-host', (_importOriginal) => ({
  appendToContentOverlayRoot: mocks.appendToContentOverlayRootMock,
}));

vi.mock('../../platform/dom-host/isolated', (_importOriginal) => ({
  applyIsolatedContentRootStyle: mocks.applyIsolatedContentRootStyleMock,
}));

vi.mock('../../../platform/runtime-messaging', (_importOriginal) => ({
  sendRuntimeMessage: mocks.sendRuntimeMessageMock,
}));

vi.mock('./surface', (_importOriginal) => ({
  createRegionSelectorSurfaceActions: (args: any) => {
    mocks.surfaceArgs = args;
    return {
      showRecordingOverlay: () => {
        args.state.recordingOverlayContainer = document.createElement('div');
        document.body.appendChild(args.state.recordingOverlayContainer);
      },
      showRegionSelector: () => {
        args.state.regionSelectorContainer = document.createElement('div');
        args.bindDocumentEvents();
        if (mocks.surfaceMode === 'select') {
          args.handleRegionSelected({ height: 4, width: 3, x: 1, y: 2 });
          return;
        }
        if (mocks.surfaceMode === 'drag') {
          args.state.dragStart = { x: 4, y: 5 };
          args.state.initialRegion = { height: 10, width: 12, x: 2, y: 3 };
          args.state.currentRegion = { height: 10, width: 12, x: 2, y: 3 };
          args.state.isDragging = true;
          return;
        }
        if (mocks.surfaceMode === 'resize') {
          args.state.dragStart = { x: 6, y: 7 };
          args.state.initialRegion = { height: 10, width: 12, x: 2, y: 3 };
          args.state.currentRegion = { height: 10, width: 12, x: 2, y: 3 };
          args.state.isResizing = true;
          args.state.resizeCorner = 'se';
          return;
        }
        args.handleRegionCancelled();
      },
    };
  },
  hideRecordingOverlay: (state: any) => {
    state.recordingOverlayContainer?.remove();
    state.recordingOverlayContainer = null;
    mocks.hideRecordingOverlayMock();
  },
  updateRegionSelectorUi: mocks.updateRegionSelectorUiMock,
}));

import { createRegionSelectorController } from '.';

const requestBinding = {
  regionSelectionCapabilityToken: 'token-1',
  regionSelectionRequestGeneration: 'generation-1',
  regionSelectionRequestId: 'request-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(mocks.sendRuntimeMessageMock);
  mocks.surfaceArgs = null;
  mocks.surfaceMode = 'select';
  document.body.innerHTML = '';
});

it('selects a region, clears it, and hides the selector', async () => {
  const controller = createRegionSelectorController();

  controller.showRegionSelector(requestBinding);
  await Promise.resolve();
  controller.clearSelectedRegion();
  controller.hideRegionSelector();

  expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith({
    region: { height: 4, width: 3, x: 1, y: 2 },
    ...requestBinding,
    type: VideoMessageType.REGION_SELECTED,
  });
  expect(controller.getSelectedRegion()).toBeNull();
});

it('notifies cancellations and disposes overlays', async () => {
  mocks.surfaceMode = 'cancel';
  const controller = createRegionSelectorController();

  controller.showRecordingOverlay({ height: 4, width: 3, x: 1, y: 2 });
  controller.showRegionSelector(requestBinding);
  await Promise.resolve();
  controller.dispose();

  expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.REGION_SELECTION_CANCELLED,
    ...requestBinding,
  });
  expect(mocks.hideRecordingOverlayMock).toHaveBeenCalledOnce();
  expect(controller.getSelectedRegion()).toBeNull();
});

it('updates the selector UI while dragging and resizing', async () => {
  mocks.surfaceMode = 'drag';
  const controller = createRegionSelectorController();

  controller.showRegionSelector(requestBinding);
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: 18, clientY: 22 }));
  document.dispatchEvent(new MouseEvent('mouseup'));

  expect(mocks.updateRegionSelectorUiMock).toHaveBeenCalledOnce();
  expect(mocks.surfaceArgs.state.isDragging).toBe(false);

  mocks.surfaceMode = 'resize';
  controller.showRegionSelector(requestBinding);
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: 26, clientY: 30 }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await Promise.resolve();

  expect(mocks.updateRegionSelectorUiMock).toHaveBeenCalledTimes(2);
  expect(mocks.sendRuntimeMessageMock).toHaveBeenLastCalledWith({
    type: VideoMessageType.REGION_SELECTION_CANCELLED,
    ...requestBinding,
  });
  expect(mocks.surfaceArgs.state.keyDownHandler).toBeNull();
});
