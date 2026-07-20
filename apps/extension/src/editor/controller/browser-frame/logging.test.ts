import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BROWSER_FRAME_STATE } from '../../../features/editor/document/constants';

const { findBrowserFrameHeaderMock, rebuildEditorFrameDecorationsMock } = vi.hoisted(() => ({
  findBrowserFrameHeaderMock: vi.fn(),
  rebuildEditorFrameDecorationsMock: vi.fn(),
}));

vi.mock('../tools/decorations', () => ({
  findBrowserFrameHeader: findBrowserFrameHeaderMock,
  rebuildEditorFrameDecorations: rebuildEditorFrameDecorationsMock,
}));

import {
  logBrowserFrameApplyDone,
  logBrowserFrameApplyStart,
  logBrowserFrameRemoveDone,
  logBrowserFrameRemoveStart,
} from './logging';
import type { SourceState } from '../../document/model/source-state';

function createSource(): SourceState {
  return {
    dataUrl: 'data:image/png;base64,source',
    displayHeight: 720,
    displayWidth: 1280,
    id: 'source-image',
    intrinsicHeight: 720,
    intrinsicWidth: 1280,
    left: 20,
    locked: false,
    name: 'capture.png',
    top: 88,
    visible: true,
  };
}

function registerApplyStartLoggingTest() {
  it('logs apply start with the narrowed browser-frame payload', () => {
    const logBrowserFrame = vi.fn();

    logBrowserFrameApplyStart({
      canvasDocumentSize: { height: 808, width: 1280 },
      currentBrowserFrame: DEFAULT_BROWSER_FRAME_STATE,
      logBrowserFrame,
      nextBrowserFrame: {
        ...DEFAULT_BROWSER_FRAME_STATE,
        canvasMode: 'keep-size',
        contentMode: 'push-down',
        url: 'https://sniptale.app/browser-frame-proof',
      },
      source: createSource(),
    });

    expect(logBrowserFrame).toHaveBeenCalledWith('apply:start', {
      canvasHeight: 808,
      canvasMode: 'keep-size',
      canvasWidth: 1280,
      contentMode: 'push-down',
      hadUrl: false,
      hasUrl: true,
      sourceHeight: 720,
      sourceWidth: 1280,
      url: 'https://sniptale.app/browser-frame-proof',
    });
  });
}

function registerApplyDoneLoggingTest() {
  it('logs apply completion with header metrics from the rendered decoration', () => {
    const logBrowserFrame = vi.fn();
    findBrowserFrameHeaderMock.mockReturnValue({
      getScaledHeight: () => 88,
      getScaledWidth: () => 1280,
      left: 20,
      top: 0,
      visible: false,
    });

    logBrowserFrameApplyDone({
      canvas: {} as never,
      canvasDocumentSize: { height: 808, width: 1280 },
      logBrowserFrame,
      source: createSource(),
    });

    expect(logBrowserFrame).toHaveBeenCalledWith('apply:done', {
      canvasHeight: 808,
      canvasWidth: 1280,
      headerHeight: 88,
      headerLeft: 20,
      headerTop: 0,
      headerVisible: false,
      headerWidth: 1280,
      sourceHeight: 720,
      sourceLeft: 20,
      sourceTop: 88,
      sourceWidth: 1280,
    });
  });
}

function registerRemoveLoggingTests() {
  it('logs browser-frame removal start and done through the current header state', () => {
    const logBrowserFrame = vi.fn();
    findBrowserFrameHeaderMock.mockReturnValueOnce(null);

    logBrowserFrameRemoveStart({
      canvas: {} as never,
      canvasDocumentSize: { height: 808, width: 1280 },
      logBrowserFrame,
      source: createSource(),
    });
    logBrowserFrameRemoveDone({
      canvasDocumentSize: { height: 808, width: 1280 },
      logBrowserFrame,
      source: createSource(),
    });

    expect(logBrowserFrame).toHaveBeenNthCalledWith(1, 'remove:start', {
      canvasHeight: 808,
      canvasWidth: 1280,
      hasHeader: false,
      sourceHeight: 720,
      sourceWidth: 1280,
    });
    expect(logBrowserFrame).toHaveBeenNthCalledWith(2, 'remove:done', {
      canvasHeight: 808,
      canvasWidth: 1280,
      sourceHeight: 720,
      sourceLeft: 20,
      sourceTop: 88,
      sourceWidth: 1280,
    });
  });
}

describe('editor-controller browser-frame logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerApplyStartLoggingTest();
  registerApplyDoneLoggingTest();
  registerRemoveLoggingTests();
});
