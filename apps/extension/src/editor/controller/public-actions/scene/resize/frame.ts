import type { Canvas, FabricObject } from 'fabric';
import { normalizeEditorImageSettings } from '../../../../../features/editor/document/constants';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../../features/editor/document/types';
import type { SourceState } from '../../../../document/model/source-state';
import { applyImageSettings } from '../../../../objects/image-style';
import { getSourceObject } from '../../../document/layers';
import { resolveRelayoutSceneGeometry } from '../../../document/scene/layout';
import { hasSameBackgroundPaint } from '../../../background/sync';
import {
  prepareBrowserFrameLayerReplacement,
  replaceBrowserFrameLayer,
} from '../../../browser-frame/document-layer';
import { findBrowserFrameHeader } from '../../../tools/frame-header';
import { applyEditorViewportZoom } from '../../../viewport';
import {
  shouldFitSourceToContent,
  shouldPreserveCanvasForBrowserFrame,
} from '../../../../browser-frame/layout';

import { doesFrameGeometryChange, hasBrowserFrameLayer } from './geometry';
import type { FrameSceneSettingsOptions } from './types';

const presentedFrames = new WeakMap<
  Canvas,
  {
    accepted: EditorFrameSettings;
    frame: EditorFrameSettings;
  }
>();
const mutationRevisions = new WeakMap<Canvas, number>();

function prepareResizedBrowserHeader(
  header: FabricObject | undefined,
  source: SourceState,
  nextSize: { width: number; height: number } | undefined,
  browserFrame: BrowserFrameState
): Promise<FabricObject> | null {
  if (
    !header ||
    !nextSize ||
    (nextSize.width === source.displayWidth && nextSize.height === source.displayHeight)
  )
    return null;
  return prepareBrowserFrameLayerReplacement({
    header,
    browserFrame,
    nextSource: { ...source, displayWidth: nextSize.width, displayHeight: nextSize.height },
  });
}

function applyChangedSourceImageStyle(
  canvas: Canvas,
  currentFrame: EditorFrameSettings,
  nextFrame: EditorFrameSettings
): void {
  const sourceObject = getSourceObject(canvas);
  const currentStyle = normalizeEditorImageSettings(currentFrame.sourceImage);
  const nextStyle = normalizeEditorImageSettings(nextFrame.sourceImage);
  const styleChanged = Object.entries(nextStyle).some(
    ([key, value]) => Reflect.get(currentStyle, key) !== value
  );
  if (sourceObject && styleChanged) applyImageSettings(sourceObject, nextStyle);
}

/** Prepare asynchronous assets first, then apply one current frame without yielding during mutation. */
export async function applyEditorFrameSceneSettings(
  options: FrameSceneSettingsOptions
): Promise<boolean> {
  const { canvas, source, frame } = options;
  if (!canvas || !source) return false;
  const accepted = options.store.getFrame();
  const browserFrame = options.store.getBrowserFrame();
  const revision = (mutationRevisions.get(canvas) ?? 0) + 1;
  mutationRevisions.set(canvas, revision);
  const isCurrent = () =>
    !options.signal?.aborted &&
    !canvas.disposed &&
    !canvas.destroyed &&
    mutationRevisions.get(canvas) === revision &&
    options.isCurrent?.() !== false &&
    options.store.getFrame() === accepted &&
    options.store.getBrowserFrame() === browserFrame;
  if (!isCurrent()) return false;

  const presented = presentedFrames.get(canvas);
  const current = presented?.accepted === accepted ? presented.frame : accepted;
  const geometryChanged = doesFrameGeometryChange(current, frame);
  const hasBrowserFrame = hasBrowserFrameLayer(canvas);
  const relayoutOptions = {
    preserveCanvasSize: shouldPreserveCanvasForBrowserFrame(frame, browserFrame, hasBrowserFrame),
    fitSourceToContent: shouldFitSourceToContent(frame, browserFrame, hasBrowserFrame),
  };
  const currentSize = options.getCanvasDocumentSize();
  const layout = geometryChanged
    ? resolveRelayoutSceneGeometry({
        canvas,
        source,
        canvasDocumentSize: currentSize,
        frame,
        browserFrame,
        options: relayoutOptions,
      })
    : null;
  const targetSize = layout?.canvas ?? currentSize;
  const backgroundChanged =
    !hasSameBackgroundPaint(current, frame) ||
    currentSize.width !== targetSize.width ||
    currentSize.height !== targetSize.height;
  const background =
    (backgroundChanged || !options.preview || options.quality === 'final') &&
    options.prepareBackground
      ? await options.prepareBackground(targetSize)
      : null;
  if (!isCurrent()) {
    background?.dispose();
    return false;
  }

  const header = findBrowserFrameHeader(canvas);
  let nextHeader = null;
  try {
    const preparation = prepareResizedBrowserHeader(header, source, layout?.source, browserFrame);
    nextHeader = preparation ? await preparation : null;
  } catch (error) {
    background?.dispose();
    throw error;
  }
  if (!isCurrent()) {
    background?.dispose();
    nextHeader?.dispose();
    return false;
  }
  if (geometryChanged) {
    options.relayoutScene(frame, browserFrame, relayoutOptions);
    applyEditorViewportZoom(
      canvas,
      options.getCanvasDocumentSize(),
      options.zoomLevel,
      options.viewportDevicePixelRatioBaseline
    );
  }
  background?.apply();
  if (header && nextHeader) {
    nextHeader.set({ left: header.left, top: header.top });
    replaceBrowserFrameLayer(canvas, header, nextHeader);
  }

  applyChangedSourceImageStyle(canvas, current, frame);
  presentedFrames.set(canvas, { accepted, frame });
  canvas.requestRenderAll();
  if (options.preview) return true;

  options.ensureReachableObjects();
  options.store.updateFrame(frame);
  presentedFrames.set(canvas, { accepted: options.store.getFrame(), frame });
  options.commitHistory();
  options.syncRuntimeState();
  return true;
}
