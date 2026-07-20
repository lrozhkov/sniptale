import { expect, it, vi } from 'vitest';
import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import type { EditorControllerInstance } from '../instance/types';

const helperMocks = vi.hoisted(() => ({
  applyDocumentForController: vi.fn(() => Promise.resolve()),
  relayoutSceneForController: vi.fn(),
}));

vi.mock('../instance/bindings', () => ({
  createEditorControllerEventBindings: vi.fn(() => ({})),
  createEditorControllerPublicApiAdapter: vi.fn(() => ({})),
}));

vi.mock('../events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../events')>()),
  createEditorControllerEventHandlers: vi.fn(() => ({})),
}));

vi.mock('../instance/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../instance/helpers')>()),
  applyDocumentForController: helperMocks.applyDocumentForController,
  relayoutSceneForController: helperMocks.relayoutSceneForController,
}));

import { ImageEditorControllerSceneHelperActions } from './controller-scene-helper-actions';

class TestSceneHelperActions extends ImageEditorControllerSceneHelperActions {
  protected getControllerInstance(): EditorControllerInstance {
    return this as unknown as EditorControllerInstance;
  }
}

it('delegates scene and document helper actions through the controller instance', async () => {
  const controller = new TestSceneHelperActions();
  const document = { version: 1 } as EditorDocument;
  const frame = { preset: 'frame' } as unknown as EditorFrameSettings;
  const browserFrame = { enabled: true } as BrowserFrameState;

  controller.relayoutScene(frame, browserFrame, { preserveCanvasSize: true });
  await controller.applyDocument(document, { mode: 'replace' } as never);

  expect(helperMocks.relayoutSceneForController).toHaveBeenCalledWith(
    controller,
    frame,
    browserFrame,
    {
      preserveCanvasSize: true,
    }
  );
  expect(helperMocks.applyDocumentForController).toHaveBeenCalledWith(controller, document, {
    mode: 'replace',
  });
});
