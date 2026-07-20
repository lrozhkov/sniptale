import { describe, expect, it, vi } from 'vitest';

import { createEditorControllerPublicApiMethods } from './methods';

describe('editor controller public api method bindings', () => {
  it('delegates public methods to the controller instance', async () => {
    const controller = {
      applyDocument: vi.fn(async () => undefined),
      clearCropSelection: vi.fn(),
      clearSelection: vi.fn(),
      commitHistory: vi.fn(),
      copyRenderedImage: vi.fn(async () => undefined),
      ensureBrowserFrameOnTop: vi.fn(),
      ensureObjectReachable: vi.fn(() => true),
      ensureReachableObjects: vi.fn(() => true),
      focusObjectInViewport: vi.fn(),
      logBrowserFrame: vi.fn(),
      nextLabelIndex: vi.fn(() => 7),
      prepareObject: vi.fn(),
      rebuildFrameDecorations: vi.fn(async () => undefined),
      relayoutScene: vi.fn(),
      renderToDataUrl: vi.fn(() => 'data:image/png;base64,abc'),
      scheduleZoomToFit: vi.fn(),
      sendFrameObjectsToBack: vi.fn(),
      switchToSelectTool: vi.fn(),
      syncRuntimeState: vi.fn(),
    };

    const methods = createEditorControllerPublicApiMethods(controller as never);
    expect(methods.nextLabelIndex('rectangle')).toBe(7);
    await methods.applyDocument({ id: 'document' } as never, {} as never);
    expect(controller.applyDocument).toHaveBeenCalledWith({ id: 'document' }, {});
    expect(methods.renderToDataUrl({ format: 'png' } as never)).toBe('data:image/png;base64,abc');
  });
});
