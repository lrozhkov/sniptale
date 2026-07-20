import { describe, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import {
  createScenarioWorkspaceCanvasActions,
  createScenarioWorkspacePreviewToggleState,
} from './actions';

function createStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    title: 'Capture',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1200, height: 800 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  });
}

function verifiesResetAndQuickEditActions() {
  const onOpenQuickEdit = vi.fn();
  const onUpdateStep = vi.fn();
  const flushPendingZoom = vi.fn(() => createStep());
  const actions = createScenarioWorkspaceCanvasActions({
    flushPendingZoom,
    onOpenQuickEdit,
    onUpdateStep,
  });

  actions.onResetView();
  actions.onOpenEditor();

  expect(flushPendingZoom).toHaveBeenCalledTimes(2);
  expect(onUpdateStep).toHaveBeenCalledWith({
    imageTransform: { scale: 1, x: 0, y: 0 },
    viewportTransform: { x: 0, y: 0, width: 720, height: 420 },
  });
  expect(onOpenQuickEdit).toHaveBeenCalledTimes(1);
}

function verifiesZoomActions() {
  const onUpdateStep = vi.fn();
  const flushPendingZoom = vi.fn<() => ScenarioCaptureStep>(() => ({
    ...createStep(),
    imageTransform: { scale: 1.5, x: 12, y: -8 },
  }));
  const actions = createScenarioWorkspaceCanvasActions({
    flushPendingZoom,
    onOpenQuickEdit: vi.fn(),
    onUpdateStep,
  });

  actions.onDecreaseZoom();
  actions.onIncreaseZoom();

  expect(flushPendingZoom).toHaveBeenCalledTimes(2);
  expect(onUpdateStep).toHaveBeenNthCalledWith(1, {
    imageTransform: expect.objectContaining({ scale: 1.42, x: 12, y: -8 }),
  });
  expect(onUpdateStep).toHaveBeenNthCalledWith(2, {
    imageTransform: expect.objectContaining({ scale: 1.58, x: 12, y: -8 }),
  });
}

function verifiesPreviewToggleActions() {
  const onUpdateStep = vi.fn();
  const flushPendingZoom = vi.fn(createPreviewToggleStep);
  const actions = createScenarioWorkspaceCanvasActions({
    flushPendingZoom,
    onOpenQuickEdit: vi.fn(),
    onUpdateStep,
  });

  actions.onToggleClickPreview();
  actions.onToggleFramePreview();

  expect(flushPendingZoom).toHaveBeenCalledTimes(2);
  expect(onUpdateStep).toHaveBeenNthCalledWith(1, {
    annotationRenderMode: 'overlays',
    overlays: [
      expect.objectContaining({
        kind: 'click-ring',
        point: { x: 25, y: 35 },
        autoSource: 'capture-click',
      }),
    ],
  });
  expect(onUpdateStep).toHaveBeenNthCalledWith(2, {
    annotationRenderMode: 'overlays',
    overlays: [
      expect.objectContaining({
        kind: 'focus-rect',
        rect: { x: 4, y: 16, width: 114, height: 54 },
        autoSource: 'capture-target',
      }),
    ],
  });
}

function createPreviewToggleStep(): ScenarioCaptureStep {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    target: {
      selector: '#submit',
      iframeSelector: null,
      tagName: 'button',
      role: 'button',
      text: 'Submit',
      ariaLabel: null,
      title: null,
      rect: { x: 10, y: 20, width: 100, height: 40 },
      framePadding: { top: 4, left: 6, right: 8, bottom: 10 },
    },
    cursorPoint: { x: 25, y: 35 },
    overlays: [],
    annotationRenderMode: 'asset',
  });
}

describe('createScenarioWorkspaceCanvasActions', () => {
  it('flushes pending zoom before reset and quick-edit actions', verifiesResetAndQuickEditActions);
  it(
    'derives zoom changes from the flushed preview step for increase and decrease actions',
    verifiesZoomActions
  );
  it(
    'rebuilds auto overlays from the flushed preview step when preview toggles change',
    verifiesPreviewToggleActions
  );
});

describe('createScenarioWorkspacePreviewToggleState', () => {
  it('reflects auto-overlay visibility and active state from capture metadata', () => {
    const step = createScenarioCaptureStep({
      assetId: 'asset-1',
      target: {
        selector: '#submit',
        iframeSelector: null,
        tagName: 'button',
        role: 'button',
        text: 'Submit',
        ariaLabel: null,
        title: null,
        rect: { x: 10, y: 20, width: 100, height: 40 },
        framePadding: { top: 4, left: 6, right: 8, bottom: 10 },
      },
      cursorPoint: { x: 25, y: 35 },
      overlays: [
        {
          id: 'auto-frame',
          kind: 'focus-rect',
          rect: { x: 4, y: 16, width: 114, height: 54 },
          autoSource: 'capture-target',
        },
      ],
    });

    expect(createScenarioWorkspacePreviewToggleState(step)).toEqual({
      clickPreviewActive: false,
      clickPreviewVisible: true,
      framePreviewActive: true,
      framePreviewVisible: true,
    });
  });
});
