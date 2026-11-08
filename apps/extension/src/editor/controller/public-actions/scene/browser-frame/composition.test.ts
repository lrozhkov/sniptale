// @vitest-environment jsdom
import { Canvas, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../../features/editor/document/constants';
import { relayoutEditorScene } from '../../../document/scene';
import {
  createFrameAnnotationProxy,
  readFrameAnnotationSnapshot,
} from '../../../../frame-annotation/proxy';
import { applyEditorBrowserFrameSettings, removeEditorBrowserFrameSettings } from './mutation';
import { resizeEditorCanvasScene } from '../resize/dimensions';
import type { BrowserFrameState } from '../../../../../features/editor/document/types';

vi.mock('../../../../objects/browser-frame', () => ({
  createBrowserFrameLayerObject: vi.fn(async (options) => {
    const object = new Rect({
      left: options.left,
      top: options.top,
      width: options.width,
      height: 30,
      strokeWidth: 0,
    });
    object.sniptaleRole = 'annotation';
    object.sniptaleType = 'browser-frame';
    return object;
  }),
}));

it.each([
  [801, 601],
  [801.5, 601.25],
])(
  'reverses header composition without changing source dimensions or annotation placement (%s × %s)',
  async (sourceWidth, sourceHeight) => {
    const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
    const sourceObject = new Rect({
      left: 0,
      top: 0,
      width: sourceWidth,
      height: sourceHeight,
      strokeWidth: 0,
    });
    sourceObject.sniptaleRole = 'source';
    const annotation = new Rect({ left: 100, top: 150, width: 80, height: 40, strokeWidth: 0 });
    annotation.sniptaleRole = 'annotation';
    const frameProxy = createFrameAnnotationProxy({
      frame: { id: 'frame', x: 200, y: 100, width: 120, height: 60 },
      ordering: 1,
      label: 'Frame',
    });
    canvas.add(sourceObject, annotation, frameProxy);
    let source: import('../../../../document/model/source-state').SourceState = {
      id: 'source',
      dataUrl: '',
      name: null,
      intrinsicWidth: sourceWidth,
      intrinsicHeight: sourceHeight,
      displayWidth: sourceWidth,
      displayHeight: sourceHeight,
      left: 0,
      top: 0,
      locked: false,
      visible: true,
    };
    let canvasSize = { width: 801, height: 601 };
    let state: BrowserFrameState = { ...DEFAULT_BROWSER_FRAME_STATE };
    const frame = {
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
    };
    const apply = async (fit: boolean) => {
      await applyEditorBrowserFrameSettings({
        canvas,
        source,
        canvasDocumentSize: canvasSize,
        browserFrame: {
          ...state,
          enabled: true,
          canvasMode: fit ? 'keep-size' : 'resize',
          contentMode: fit ? 'fit-content' : 'push-down',
        },
        store: {
          getBrowserFrame: () => state,
          setBrowserFrame: (next) => {
            state = next;
          },
          getFrame: () => frame,
        },
        relayoutScene: (next, options) => {
          const result = relayoutEditorScene(canvas, source, canvasSize, frame, next, options)!;
          source = result.source;
          canvasSize = result.canvasSize;
        },
        ensureBrowserFrameOnTop() {},
        commitHistory() {},
        syncRuntimeState() {},
      });
      const projected = readFrameAnnotationSnapshot(frameProxy)!;
      expect((projected.x - source.left) / source.displayWidth).toBeCloseTo(200 / sourceWidth, 6);
      expect((projected.y - source.top) / source.displayHeight).toBeCloseTo(100 / sourceHeight, 6);
      expect(projected.width / source.displayWidth).toBeCloseTo(120 / sourceWidth, 6);
      expect((annotation.left - source.left) / source.displayWidth).toBeCloseTo(
        100 / sourceWidth,
        6
      );
      expect((annotation.top - source.top) / source.displayHeight).toBeCloseTo(
        150 / sourceHeight,
        6
      );
      expect(annotation.getScaledWidth() / source.displayWidth).toBeCloseTo(80 / sourceWidth, 6);
    };
    const remove = async () =>
      removeEditorBrowserFrameSettings({
        canvas,
        source,
        canvasDocumentSize: canvasSize,
        store: {
          getBrowserFrame: () => state,
          getFrame: () => frame,
          setBrowserFrame: (next) => {
            state = next;
          },
        },
        relayoutScene: (nextHeader, options) => {
          const result = relayoutEditorScene(
            canvas,
            source,
            canvasSize,
            frame,
            nextHeader,
            options
          )!;
          source = result.source;
          canvasSize = result.canvasSize;
        },
        ensureBrowserFrameOnTop() {},
        commitHistory() {},
        syncRuntimeState() {},
      });
    try {
      await apply(false);
      const expanded = { ...canvasSize };
      for (let iteration = 0; iteration < 4; iteration += 1) {
        await apply(true);
        expect(canvasSize).toEqual({ width: 801, height: 601 });
        await apply(false);
        expect(source.displayWidth).toBeCloseTo(sourceWidth, 6);
        expect(source.displayHeight).toBeCloseTo(sourceHeight, 6);
        expect(canvasSize).toEqual(expanded);
      }
      await apply(true);
      await remove();
      expect(canvasSize).toEqual({ width: 801, height: 601 });
      expect(source.displayWidth).toBeCloseTo(sourceWidth, 6);
      expect(source.displayHeight).toBeCloseTo(sourceHeight, 6);
      await apply(true);
      resizeEditorCanvasScene({
        canvas,
        source,
        store: { getBrowserFrame: () => state, getFrame: () => frame },
        width: 500,
        height: 400,
        zoomLevel: 1,
        setCanvasDocumentSize: (next) => {
          canvasSize = next;
        },
        getCanvasDocumentSize: () => canvasSize,
        relayoutScene: (nextFrame, nextHeader, options) => {
          const result = relayoutEditorScene(
            canvas,
            source,
            canvasSize,
            nextFrame,
            nextHeader,
            options
          )!;
          source = result.source;
          canvasSize = result.canvasSize;
        },
        ensureReachableObjects: () => false,
        rebuildFrameDecorations: async () => undefined,
        commitHistory() {},
        syncRuntimeState() {},
      });
      const resizedSource = { width: source.displayWidth, height: source.displayHeight };
      await remove();
      expect(canvasSize).toEqual({ width: 500, height: 400 });
      expect(source.displayWidth).toBeCloseTo(resizedSource.width, 6);
      expect(source.displayHeight).toBeCloseTo(resizedSource.height, 6);
    } finally {
      await canvas.dispose();
    }
  }
);
