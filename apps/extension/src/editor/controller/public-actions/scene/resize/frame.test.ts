// @vitest-environment jsdom
import { FabricImage, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_IMAGE_SETTINGS,
} from '../../../../../features/editor/document/constants';
import { createFabricCanvasFixture } from '../../../../testing/fabric-canvas.test-support';
import { applyEditorFrameSceneSettings } from './frame';

vi.mock('./finalize', () => ({ finalizeSceneResizeMutation: vi.fn() }));

it.each([false, true])(
  'applies source decoration without geometry changes (browser header: %s)',
  (withHeader) => {
    const image = new FabricImage(document.createElement('img'), { width: 200, height: 100 });
    image.sniptaleType = 'source-image';
    image.sniptaleRole = 'source';
    const header = new Rect();
    header.sniptaleType = 'browser-frame';
    const frame = {
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      sourceImage: {
        ...DEFAULT_EDITOR_IMAGE_SETTINGS,
        strokeWidth: 8,
        shadow: 60,
        opacity: 0.7,
        radius: 12,
      },
    };
    const relayoutScene = vi.fn();
    applyEditorFrameSceneSettings({
      canvas: createFabricCanvasFixture({
        getObjects: () => (withHeader ? [image, header] : [image]),
      }),
      source: {
        id: 'source',
        dataUrl: '',
        name: null,
        intrinsicWidth: 200,
        intrinsicHeight: 100,
        displayWidth: 200,
        displayHeight: 100,
        left: 0,
        top: 0,
        locked: true,
        visible: true,
      },
      frame,
      store: {
        getFrame: () => DEFAULT_EDITOR_FRAME_SETTINGS,
        getBrowserFrame: () => DEFAULT_BROWSER_FRAME_STATE,
        updateFrame: vi.fn(),
      },
      relayoutScene,
      zoomLevel: 1,
      getCanvasDocumentSize: () => ({ width: 264, height: 164 }),
      ensureReachableObjects: () => false,
      rebuildFrameDecorations: async () => undefined,
      commitHistory: vi.fn(),
      syncRuntimeState: vi.fn(),
    });
    expect(relayoutScene).not.toHaveBeenCalled();
    expect(image.sniptaleImageStrokeWidth).toBe(8);
    expect(image.sniptaleImageRadius).toBe(12);
    expect(image.opacity).toBe(0.7);
    expect(image.shadow?.color).toContain('0.6');
    image.sniptaleImageStrokeWidth = 3;
    applyEditorFrameSceneSettings({
      canvas: createFabricCanvasFixture({ getObjects: () => [image] }),
      source: {
        id: 'source',
        dataUrl: '',
        name: null,
        intrinsicWidth: 200,
        intrinsicHeight: 100,
        displayWidth: 200,
        displayHeight: 100,
        left: 0,
        top: 0,
        locked: true,
        visible: true,
      },
      frame: { ...frame, backgroundColor: '#ffffff' },
      store: {
        getFrame: () => frame,
        getBrowserFrame: () => DEFAULT_BROWSER_FRAME_STATE,
        updateFrame: vi.fn(),
      },
      relayoutScene,
      zoomLevel: 1,
      getCanvasDocumentSize: () => ({ width: 264, height: 164 }),
      ensureReachableObjects: () => false,
      rebuildFrameDecorations: async () => undefined,
      commitHistory: vi.fn(),
      syncRuntimeState: vi.fn(),
    });
    expect(image.sniptaleImageStrokeWidth).toBe(3);
  }
);
