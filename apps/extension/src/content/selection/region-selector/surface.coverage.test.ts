// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyRegionSelectorThemeMock: vi.fn(),
  bindRegionSelectorRootEventsMock: vi.fn(),
  buildRecordingOverlayNodeMock: vi.fn(() => document.createDocumentFragment()),
  buildRegionSelectorMarkupMock: vi.fn(() => {
    const fragment = document.createDocumentFragment();
    const overlay = document.createElement('div');
    overlay.id = 'sniptale-overlay';
    const region = document.createElement('div');
    region.id = 'sniptale-region';
    overlay.appendChild(region);
    fragment.appendChild(overlay);
    return fragment;
  }),
  createRegionSelectorTooltipMock: vi.fn(() => ({ root: document.createElement('div') })),
  getRecordingOverlayMetricsMock: vi.fn(() => ({
    cssHeight: 40,
    cssWidth: 30,
    cssX: 10,
    cssY: 20,
    indicatorTop: 8,
  })),
  getRecordingOverlayRootStyleMock: vi.fn(() => 'recording-style'),
  getRegionSelectorRootStyleMock: vi.fn(() => 'selector-style'),
  updateRegionDisplayMock: vi.fn(),
}));

vi.mock('./events', () => ({
  bindRegionSelectorRootEvents: mocks.bindRegionSelectorRootEventsMock,
}));

vi.mock('./markup.helpers', () => ({
  buildRegionSelectorMarkup: mocks.buildRegionSelectorMarkupMock,
}));

vi.mock('./recording-overlay.helpers', () => ({
  buildRecordingOverlayNode: mocks.buildRecordingOverlayNodeMock,
}));

vi.mock('./runtime', () => ({
  updateRegionDisplay: mocks.updateRegionDisplayMock,
}));

vi.mock('./tooltip', () => ({
  createRegionSelectorTooltip: mocks.createRegionSelectorTooltipMock,
}));

vi.mock('./config', () => ({
  applyRegionSelectorTheme: mocks.applyRegionSelectorThemeMock,
  getRecordingOverlayMetrics: mocks.getRecordingOverlayMetricsMock,
  getRecordingOverlayRootStyle: mocks.getRecordingOverlayRootStyleMock,
  getRegionSelectorRootStyle: mocks.getRegionSelectorRootStyleMock,
}));

import { createRegionSelectorSurfaceActions, hideRecordingOverlay } from './surface';

function createState() {
  return {
    currentRegion: { height: 40, width: 30, x: 10, y: 20 },
    dragStart: { x: 0, y: 0 },
    initialRegion: { height: 0, width: 0, x: 0, y: 0 },
    isDragging: false,
    isResizing: false,
    keyDownHandler: null,
    recordingOverlayContainer: null,
    regionSelectorContainer: null,
    regionSelectorTooltip: null,
    resizeCorner: '',
    selectedRegion: null,
  } as any;
}

function appendNode<T extends Node>(node: T): T {
  document.body.appendChild(node);
  return node;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

it('hides recording overlays safely when none exist or when one is mounted', () => {
  const state = createState();
  hideRecordingOverlay(state);

  const overlay = document.createElement('div');
  document.body.appendChild(overlay);
  state.recordingOverlayContainer = overlay;
  hideRecordingOverlay(state);

  expect(state.recordingOverlayContainer).toBeNull();
  expect(overlay.isConnected).toBe(false);
});

it('creates recording overlays and replaces any existing overlay', () => {
  const state = createState();
  const appendToContentOverlayRoot = appendNode;
  const actions = createRegionSelectorSurfaceActions({
    bindDocumentEvents: vi.fn(),
    handleRegionCancelled: vi.fn(),
    handleRegionSelected: vi.fn(),
    resolvedDeps: {
      appendToContentOverlayRoot,
      applyIsolatedContentRootStyle: vi.fn(),
      sendRuntimeMessage: vi.fn(),
    },
    state,
  });

  actions.showRecordingOverlay({ height: 40, width: 30, x: 10, y: 20 });
  const firstOverlay = state.recordingOverlayContainer;
  actions.showRecordingOverlay({ height: 20, width: 20, x: 5, y: 5 });

  expect(firstOverlay?.isConnected).toBe(false);
  expect(state.recordingOverlayContainer?.id).toBe('sniptale-recording-overlay');
  expect(document.querySelectorAll('#sniptale-recording-overlay')).toHaveLength(1);
});

it('shows region selectors once and renders the surface with tooltip wiring', () => {
  const state = createState();
  const bindDocumentEvents = vi.fn();
  const applyIsolatedContentRootStyle = vi.fn();
  const appendToContentOverlayRoot = appendNode;
  const actions = createRegionSelectorSurfaceActions({
    bindDocumentEvents,
    handleRegionCancelled: vi.fn(),
    handleRegionSelected: vi.fn(),
    resolvedDeps: {
      appendToContentOverlayRoot,
      applyIsolatedContentRootStyle,
      sendRuntimeMessage: vi.fn(),
    },
    state,
  });

  actions.showRegionSelector();
  actions.showRegionSelector();
  const firstBindCall = mocks.bindRegionSelectorRootEventsMock.mock.calls[0];
  if (!firstBindCall) {
    throw new Error('Expected region selector event binding');
  }
  const boundHandlers = firstBindCall[0];
  boundHandlers.onDragStart({ clientX: 12, clientY: 18, preventDefault: vi.fn() });
  boundHandlers.onResizeStart({ clientX: 30, clientY: 40, preventDefault: vi.fn() }, 'se');

  expect(state.regionSelectorContainer?.id).toBe('sniptale-region-selector-root');
  expect(applyIsolatedContentRootStyle).toHaveBeenCalledWith(
    expect.any(HTMLDivElement),
    'selector-style'
  );
  expect(state.isDragging).toBe(true);
  expect(state.isResizing).toBe(true);
  expect(state.resizeCorner).toBe('se');
  expect(mocks.applyRegionSelectorThemeMock).toHaveBeenCalledOnce();
  expect(mocks.createRegionSelectorTooltipMock).toHaveBeenCalledOnce();
  expect(mocks.bindRegionSelectorRootEventsMock).toHaveBeenCalledOnce();
  expect(mocks.updateRegionDisplayMock).toHaveBeenCalledOnce();
  expect(bindDocumentEvents).toHaveBeenCalledOnce();
});
