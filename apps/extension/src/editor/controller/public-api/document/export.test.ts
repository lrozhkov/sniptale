import { beforeEach, expect, it, vi } from 'vitest';
import {
  copyRenderedEditorImageViaController,
  type EditorDocumentCopyControllerApi,
  type EditorDocumentExportControllerApi,
  type EditorDocumentRenderControllerApi,
  exportEditorDocumentViaController,
  renderEditorControllerToDataUrl,
} from './export';
import type { SourceState } from '../../../document/model/source-state';

const storeState = {
  browserFrame: { url: 'https://example.com' },
  frame: { padding: 8 },
};

const mocks = vi.hoisted(() => ({
  buildDocument: vi.fn(() => ({ id: 'exported' })),
  copyRenderedImage: vi.fn(async () => undefined),
  getSourceObject: vi.fn(() => 'source-object'),
  loadEditorExportSettings: vi.fn(async () => ({ imageFormat: 'png', imageQuality: 0.9 })),
  renderToDataUrl: vi.fn(() => 'data-url'),
  resolveMimeType: vi.fn(() => 'image/png'),
  storeGetState: vi.fn(() => storeState),
  syncSourceState: vi.fn(() => ({ synced: true })),
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: { getState: mocks.storeGetState },
}));

vi.mock('../../document/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/export')>()),
  buildEditorCanvasDocument: mocks.buildDocument,
  copyEditorRenderedImage: mocks.copyRenderedImage,
  renderEditorCanvasToDataUrl: mocks.renderToDataUrl,
  resolveEditorImageMimeType: mocks.resolveMimeType,
}));

vi.mock('../../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/layers')>()),
  getSourceObject: mocks.getSourceObject,
}));

vi.mock('../../document/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/source')>()),
  syncSourceStateFromObject: mocks.syncSourceState,
}));

vi.mock('../../../persistence/export-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../persistence/export-settings')>()),
  loadEditorExportSettings: mocks.loadEditorExportSettings,
}));

function createSourceState(): SourceState {
  return {
    dataUrl: 'data:image/png;base64,source',
    displayHeight: 80,
    displayWidth: 120,
    id: 'source',
    intrinsicHeight: 80,
    intrinsicWidth: 120,
    left: 0,
    locked: false,
    name: 'Source',
    top: 0,
    visible: true,
  };
}

function createController() {
  return {
    canvas: null,
    canvasDocumentSize: { height: 80, width: 120 },
    renderToDataUrl: vi.fn(() => 'rendered'),
    setSource: vi.fn(),
    source: createSourceState(),
  } satisfies EditorDocumentCopyControllerApi &
    EditorDocumentExportControllerApi &
    EditorDocumentRenderControllerApi;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('exports controller documents after syncing source state', () => {
  const controller = createController();

  expect(exportEditorDocumentViaController(controller)).toEqual({ id: 'exported' });

  expect(mocks.syncSourceState).toHaveBeenCalledWith(controller.source, 'source-object');
  expect(mocks.buildDocument).toHaveBeenCalledWith(
    expect.objectContaining({
      browserFrame: storeState.browserFrame,
      canvas: controller.canvas,
      canvasDocumentSize: { height: 80, width: 120 },
      frame: storeState.frame,
      source: controller.source,
    })
  );
});

it('renders and copies controller output through export settings', async () => {
  const controller = createController();

  expect(renderEditorControllerToDataUrl(controller, { format: 'png', quality: 0.8 })).toBe(
    'data-url'
  );
  await copyRenderedEditorImageViaController(controller, {
    outputSize: { width: 640, height: 360 },
  });

  expect(mocks.renderToDataUrl).toHaveBeenCalledWith(controller.canvas, {
    format: 'png',
    quality: 0.8,
  });
  expect(controller.renderToDataUrl).toHaveBeenCalledWith({
    format: 'png',
    outputSize: { height: 360, width: 640 },
    quality: 0.9,
  });
  expect(mocks.copyRenderedImage).toHaveBeenCalledWith({
    dataUrl: 'rendered',
    mimeType: 'image/png',
  });
});
