import { beforeEach, expect, it, vi } from 'vitest';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { createMockDocument } from '../instance/bindings/test-fixtures-document';
import { undoEditorControllerSnapshot } from './document/history';

const mocks = vi.hoisted(() => ({
  reportEditorActionFailure: vi.fn(),
  renderForExport: vi.fn(async () => 'data:image/png;base64,flat'),
}));

vi.mock('../../runtime/async-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/async-actions')>()),
  reportEditorActionFailure: mocks.reportEditorActionFailure,
}));
vi.mock('./document/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./document/export')>()),
  renderEditorControllerForExport: mocks.renderForExport,
}));

import { resizeEditorControllerImageScene } from './image-scene-resize';

function createController(overrides: Record<string, unknown> = {}) {
  return {
    applyDocument: vi.fn(async () => undefined),
    canvas: { id: 'canvas' },
    clearCropSelection: vi.fn(),
    commitHistory: vi.fn(),
    renderToDataUrl: vi.fn(() => 'data:image/png;base64,legacy-flat'),
    source: { id: 'source', name: 'capture.png' },
    syncRuntimeState: vi.fn(),
    ...overrides,
  };
}

async function flushResize() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('flattens image scene resize through a fresh document apply', async () => {
  const controller = createController();

  resizeEditorControllerImageScene(controller as never, 120.4, 79.6);
  await flushResize();

  expect(controller.clearCropSelection).toHaveBeenCalledOnce();
  expect(mocks.renderForExport).toHaveBeenCalledWith(controller, {
    format: 'png',
    outputSize: { height: 80, width: 120 },
    quality: 1,
  });
  expect(controller.renderToDataUrl).not.toHaveBeenCalled();
  expect(controller.applyDocument).toHaveBeenCalledWith(
    expect.objectContaining({
      canvasHeight: 80,
      canvasWidth: 120,
      sourceDisplayHeight: 80,
      sourceDisplayWidth: 120,
      sourceHeight: 80,
      sourceImageData: 'data:image/png;base64,flat',
      sourceName: 'capture.png',
      sourceWidth: 120,
    }),
    {}
  );
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
});

it('does not mutate scene state when canvas or source is unavailable', async () => {
  const missingCanvas = createController({ canvas: null });
  const missingSource = createController({ source: null });

  resizeEditorControllerImageScene(missingCanvas as never, 120, 80);
  resizeEditorControllerImageScene(missingSource as never, 120, 80);
  await flushResize();

  expect(missingCanvas.applyDocument).not.toHaveBeenCalled();
  expect(missingSource.applyDocument).not.toHaveBeenCalled();
});

it('reports async flatten failures through editor action diagnostics', async () => {
  const error = new Error('apply failed');
  const controller = createController({
    applyDocument: vi.fn(async () => {
      throw error;
    }),
  });

  resizeEditorControllerImageScene(controller as never, 120, 80);
  await flushResize();

  await vi.waitFor(() => {
    expect(mocks.reportEditorActionFailure).toHaveBeenCalledWith('resize-image', error);
  });
});

it('applies undo after a pending image resize commits its snapshot', async () => {
  const original = { ...createMockDocument(), sourceImageData: 'blob:hydrated-source' };
  let visibleDocument = original;
  let releaseRender: (dataUrl: string) => void = () => undefined;
  mocks.renderForExport.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        releaseRender = resolve;
      })
  );
  const history = new SnapshotHistory(JSON.stringify(original));
  const controller = createController({
    history,
    publishHistoryDocument: vi.fn(),
    applyDocument: vi.fn(async (document: typeof original) => {
      visibleDocument = document;
    }),
    commitHistory: vi.fn(() => history.push(JSON.stringify(visibleDocument))),
  });

  resizeEditorControllerImageScene(controller as never, 120, 80);
  const undo = undoEditorControllerSnapshot(controller as never);
  releaseRender('data:image/png;base64,flat');
  await undo;
  await flushResize();

  expect(visibleDocument).toEqual(original);
  expect(history.getState().index).toBe(0);
  expect(controller.applyDocument).toHaveBeenCalledTimes(2);
});
