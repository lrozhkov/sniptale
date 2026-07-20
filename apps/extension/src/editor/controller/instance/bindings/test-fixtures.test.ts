import { expect, it } from 'vitest';
import {
  createMockController,
  createMockDocument,
  createMockMutatorFixtures,
  getExpectedLabelIndexType,
} from './test-fixtures';

it('creates controller test doubles with the full document method surface', async () => {
  const controller = createMockController();

  controller.setZoomAtViewportPoint(1.25, { clientX: 10, clientY: 20 });
  controller.resizeCanvas(800, 600);
  controller.resizeImage(640, 480);
  controller.exportDocument();
  (controller.renderToDataUrl as any)();
  controller.cancelTransientInteraction();
  controller.getActiveCropRect();
  controller.ensureObjectReachable({} as never);
  controller.ensureReachableObjects();
  controller.withHistoryMuted(() => 'muted');
  controller.nextLabelIndex('text');
  controller.subscribeRasterOverlay(() => undefined)();
  await (controller.applyDocument as any)(createMockDocument());
  await controller.rebuildFrameDecorations();
  await controller.openImage('data:image/png;base64,abc');
  await controller.loadDocument(createMockDocument());
  await controller.copyRenderedImage();
  await controller.undo();
  await controller.redo();
  await controller.resetToOriginal();
  await controller.duplicateSelection();
  await controller.insertImage('data:image/png;base64,abc');
  await controller.applyBrowserFrame({} as never);
  await controller.removeBrowserFrame();
  await controller.applyCropSelection();

  expect(controller.setZoomAtViewportPoint).toHaveBeenCalledWith(1.25, {
    clientX: 10,
    clientY: 20,
  });
  expect(controller.resizeCanvas).toHaveBeenCalledWith(800, 600);
  expect(controller.resizeImage).toHaveBeenCalledWith(640, 480);
});

it('creates document and mutator fixtures for controller binding tests', () => {
  const document = createMockDocument();
  const fixtures = createMockMutatorFixtures();

  expect(document.sourceName).toBe('source.png');
  expect(fixtures.document).toEqual(document);
  expect(fixtures.history.getCurrent()).toBe('initial');
  expect(getExpectedLabelIndexType()).toBe('text');
});
