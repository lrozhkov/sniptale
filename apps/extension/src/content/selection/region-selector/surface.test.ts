// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  applyRegionSelectorThemeMock,
  bindRegionSelectorRootEventsMock,
  buildRecordingOverlayNodeMock,
  buildRegionSelectorMarkupMock,
  calculateContentSizeTooltipPositionMock,
  createRegionSelectorTooltipMock,
  getRecordingOverlayMetricsMock,
  getRecordingOverlayRootStyleMock,
  getRegionSelectorRootStyleMock,
  setContentSizeTooltipPositionMock,
  syncContentSizeTooltipValuesMock,
  updateOverlayMaskMock,
} = vi.hoisted(() => ({
  applyRegionSelectorThemeMock: vi.fn(),
  bindRegionSelectorRootEventsMock: vi.fn(),
  buildRecordingOverlayNodeMock: vi.fn(),
  buildRegionSelectorMarkupMock: vi.fn(),
  calculateContentSizeTooltipPositionMock: vi.fn(),
  createRegionSelectorTooltipMock: vi.fn(),
  getRecordingOverlayMetricsMock: vi.fn(),
  getRecordingOverlayRootStyleMock: vi.fn(),
  getRegionSelectorRootStyleMock: vi.fn(),
  setContentSizeTooltipPositionMock: vi.fn(),
  syncContentSizeTooltipValuesMock: vi.fn(),
  updateOverlayMaskMock: vi.fn(),
}));

vi.mock('@sniptale/ui/content-size-tooltip/core', () => ({
  calculateContentSizeTooltipPosition: calculateContentSizeTooltipPositionMock,
}));

vi.mock('@sniptale/ui/content-size-tooltip/dom', () => ({
  setContentSizeTooltipPosition: setContentSizeTooltipPositionMock,
  syncContentSizeTooltipValues: syncContentSizeTooltipValuesMock,
}));

vi.mock('./events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./events')>()),
  bindRegionSelectorRootEvents: bindRegionSelectorRootEventsMock,
}));

vi.mock('./markup', () => ({
  buildRegionSelectorMarkup: buildRegionSelectorMarkupMock,
  updateOverlayMask: updateOverlayMaskMock,
}));

vi.mock('./recording-overlay.helpers', () => ({
  buildRecordingOverlayNode: buildRecordingOverlayNodeMock,
}));

vi.mock('./tooltip', () => ({
  createRegionSelectorTooltip: createRegionSelectorTooltipMock,
}));

vi.mock('./config', () => ({
  applyRegionSelectorTheme: applyRegionSelectorThemeMock,
  getRecordingOverlayMetrics: getRecordingOverlayMetricsMock,
  getRecordingOverlayRootStyle: getRecordingOverlayRootStyleMock,
  getRegionSelectorRootStyle: getRegionSelectorRootStyleMock,
}));

import { createDefaultRegionSelectorState } from './types';
import {
  createRegionSelectorSurfaceActions,
  hideRecordingOverlay,
  updateRegionSelectorUi,
} from './surface';

function createMarkup() {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  overlay.id = 'sniptale-overlay';
  const region = document.createElement('div');
  region.id = 'sniptale-region';
  root.append(overlay, region);
  return root;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 720);
  calculateContentSizeTooltipPositionMock.mockReturnValue({ left: 12, top: 24 });
  buildRegionSelectorMarkupMock.mockImplementation(() => createMarkup());
  createRegionSelectorTooltipMock.mockReturnValue({
    aspectRatioButton: document.createElement('button'),
    root: document.createElement('div'),
  });
  buildRecordingOverlayNodeMock.mockReturnValue(document.createElement('div'));
  getRegionSelectorRootStyleMock.mockReturnValue('selector-style');
  getRecordingOverlayRootStyleMock.mockReturnValue('recording-style');
  getRecordingOverlayMetricsMock.mockReturnValue({
    cssHeight: 80,
    cssWidth: 120,
    cssX: 10,
    cssY: 20,
    indicatorTop: 8,
  });
});

describe('region-selector surface actions', () => {
  it('mounts the selector root once and wires theme, tooltip, runtime update, and events', () => {
    const state = createDefaultRegionSelectorState();
    const appendToContentOverlayRoot = vi.fn((node) => {
      document.body.appendChild(node);
      return node;
    });
    const applyIsolatedContentRootStyle = vi.fn();
    const bindDocumentEvents = vi.fn();
    const actions = createRegionSelectorSurfaceActions({
      bindDocumentEvents,
      handleRegionCancelled: vi.fn(),
      handleRegionSelected: vi.fn(),
      resolvedDeps: { appendToContentOverlayRoot, applyIsolatedContentRootStyle } as never,
      state,
    });

    actions.showRegionSelector();
    actions.showRegionSelector();

    expect(appendToContentOverlayRoot).toHaveBeenCalledTimes(1);
    expect(applyIsolatedContentRootStyle).toHaveBeenCalledWith(
      state.regionSelectorContainer,
      'selector-style'
    );
    expect(applyRegionSelectorThemeMock).toHaveBeenCalledWith(state.regionSelectorContainer);
    expect(createRegionSelectorTooltipMock).toHaveBeenCalledTimes(1);
    expect(bindRegionSelectorRootEventsMock).toHaveBeenCalledTimes(1);
    const region = state.regionSelectorContainer?.querySelector<HTMLElement>('#sniptale-region');
    expect(region?.style.left).toBe('100px');
    expect(region?.style.top).toBe('100px');
    expect(region?.style.width).toBe('640px');
    expect(region?.style.height).toBe('480px');
    expect(updateOverlayMaskMock).toHaveBeenCalledWith(expect.any(HTMLElement), {
      x: 100,
      y: 100,
      width: 640,
      height: 480,
    });
    expect(setContentSizeTooltipPositionMock).toHaveBeenCalledWith(
      state.regionSelectorTooltip?.root,
      { left: 12, top: 24 }
    );
    expect(syncContentSizeTooltipValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ height: 480, maintainAspectRatio: false, width: 640 })
    );
    state.regionSelectorTooltip?.aspectRatioButton.setAttribute('aria-pressed', 'true');
    updateRegionSelectorUi(state);
    expect(syncContentSizeTooltipValuesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ maintainAspectRatio: true })
    );
    expect(bindDocumentEvents).toHaveBeenCalledTimes(1);
  });

  it('does not update detached selector state', () => {
    updateRegionSelectorUi(createDefaultRegionSelectorState());

    expect(updateOverlayMaskMock).not.toHaveBeenCalled();
    expect(syncContentSizeTooltipValuesMock).not.toHaveBeenCalled();
  });
});

describe('region-selector recording overlay actions', () => {
  it('replaces stale recording overlays and removes them through the shared helper', () => {
    const state = createDefaultRegionSelectorState();
    const appendToContentOverlayRoot = vi.fn((node) => {
      document.body.appendChild(node);
      return node;
    });
    const applyIsolatedContentRootStyle = vi.fn();
    const actions = createRegionSelectorSurfaceActions({
      bindDocumentEvents: vi.fn(),
      handleRegionCancelled: vi.fn(),
      handleRegionSelected: vi.fn(),
      resolvedDeps: { appendToContentOverlayRoot, applyIsolatedContentRootStyle } as never,
      state,
    });

    actions.showRecordingOverlay({ x: 10, y: 20, width: 200, height: 120 });
    const firstOverlay = state.recordingOverlayContainer;
    actions.showRecordingOverlay({ x: 30, y: 40, width: 220, height: 140 });

    expect(firstOverlay?.isConnected).toBe(false);
    expect(state.recordingOverlayContainer?.id).toBe('sniptale-recording-overlay');

    hideRecordingOverlay(state);

    expect(state.recordingOverlayContainer).toBeNull();
  });
});
