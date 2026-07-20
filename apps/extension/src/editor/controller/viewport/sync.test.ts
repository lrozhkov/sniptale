// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setViewportPreviewOpenFromSyncMock: vi.fn(),
  updateViewportMock: vi.fn(),
  getEditorStoreStateMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: mocks.getEditorStoreStateMock,
  },
}));

import { syncEditorViewportState } from './';

const OVERFLOW_CANVAS_SIZE = { width: 300, height: 200 };
const OVERFLOW_SOURCE = { displayHeight: 200, displayWidth: 300, name: 'image.png' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEditorStoreStateMock.mockReturnValue(createStoreState());
});

function createStoreState(
  args: {
    imageData?: string | null;
    blockedInSession?: boolean;
  } = {}
) {
  return {
    imageData: args.imageData ?? 'data:image/png;base64,canvas',
    setViewportPreviewOpenFromSync: mocks.setViewportPreviewOpenFromSyncMock,
    viewportPreviewAutomationBlockedInSession: args.blockedInSession ?? false,
    updateViewport: mocks.updateViewportMock,
  };
}

function createViewportFixture() {
  const viewportElement = document.createElement('div');
  Object.defineProperties(viewportElement, {
    clientHeight: { configurable: true, value: 180 },
    clientWidth: { configurable: true, value: 320 },
    scrollLeft: { configurable: true, value: 45, writable: true },
    scrollTop: { configurable: true, value: 30, writable: true },
  });
  const stageElement = document.createElement('div');

  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    paddingBottom: '8px',
    paddingLeft: '10px',
    paddingRight: '14px',
    paddingTop: '6px',
  } as CSSStyleDeclaration);

  return { stageElement, viewportElement };
}

it('auto-opens the preview when the canvas overflows the viewport', () => {
  const { stageElement, viewportElement } = createViewportFixture();

  syncEditorViewportState({
    canvasDocumentSize: OVERFLOW_CANVAS_SIZE,
    source: OVERFLOW_SOURCE,
    stageElement,
    viewportElement,
    zoomLevel: 2,
  });

  expect(mocks.setViewportPreviewOpenFromSyncMock).toHaveBeenCalledWith(true);
  expect(mocks.updateViewportMock).toHaveBeenCalledWith(
    expect.objectContaining({
      zoomPercent: 200,
    })
  );
});

it('hides the preview when viewport state cannot be derived', () => {
  const { stageElement } = createViewportFixture();

  mocks.getEditorStoreStateMock.mockReturnValueOnce(createStoreState({ imageData: null }));

  syncEditorViewportState({
    canvasDocumentSize: OVERFLOW_CANVAS_SIZE,
    source: null,
    stageElement,
    viewportElement: null,
    zoomLevel: 1,
  });

  expect(mocks.setViewportPreviewOpenFromSyncMock).toHaveBeenCalledWith(false);
  expect(mocks.updateViewportMock).toHaveBeenCalledWith(
    expect.objectContaining({
      canvasWidth: 0,
      viewportWidth: 0,
    })
  );
});

it('does not auto-open the preview after the user blocked it for the current tab session', () => {
  const { stageElement, viewportElement } = createViewportFixture();

  mocks.getEditorStoreStateMock.mockReturnValueOnce(createStoreState({ blockedInSession: true }));

  syncEditorViewportState({
    canvasDocumentSize: OVERFLOW_CANVAS_SIZE,
    source: OVERFLOW_SOURCE,
    stageElement,
    viewportElement,
    zoomLevel: 2,
  });

  expect(mocks.setViewportPreviewOpenFromSyncMock).not.toHaveBeenCalled();
  expect(mocks.updateViewportMock).toHaveBeenCalledWith(
    expect.objectContaining({
      zoomPercent: 200,
    })
  );
});

it('does not auto-hide the preview after the user manually enabled it for the current tab session', () => {
  const { stageElement, viewportElement } = createViewportFixture();

  mocks.getEditorStoreStateMock.mockReturnValueOnce(createStoreState({ blockedInSession: true }));

  syncEditorViewportState({
    canvasDocumentSize: { width: 100, height: 80 },
    source: OVERFLOW_SOURCE,
    stageElement,
    viewportElement,
    zoomLevel: 1,
  });

  expect(mocks.setViewportPreviewOpenFromSyncMock).not.toHaveBeenCalled();
  expect(mocks.updateViewportMock).toHaveBeenCalledWith(
    expect.objectContaining({
      zoomPercent: 100,
    })
  );
});
