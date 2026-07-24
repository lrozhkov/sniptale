import type { Canvas, FabricObject } from 'fabric';

import type { BrowserFrameState } from '../../../../../features/editor/document/types';
import { createBrowserFrameLayerObject } from '../../../../objects/browser-frame';
import { isBrowserFrameObject } from '../../../../document/model';
import { readCurrentBrowserFrameSourceState } from '../../../browser-frame/source-state';

import {
  resolveBrowserFrameRelayoutOptions,
  resolveBrowserFrameScene,
  resolveNextBrowserFramePosition,
  resolveNextBrowserFrameWidth,
} from './layout';
import type { BrowserFrameActionOptions } from './types';

export async function applyEditorBrowserFrameSettings(
  options: BrowserFrameActionOptions & { browserFrame: BrowserFrameState }
): Promise<void> {
  const nextBrowserFrame = { ...options.store.getBrowserFrame(), ...options.browserFrame };
  options.store.setBrowserFrame(nextBrowserFrame);

  const applied = await upsertBrowserFrameLayer(options, nextBrowserFrame);
  if (!applied) {
    options.syncRuntimeState();
    return;
  }

  options.commitHistory();
  options.syncRuntimeState();
}

export async function previewEditorBrowserFrameSettings(_options?: unknown): Promise<void> {}

export async function removeEditorBrowserFrameSettings(_options?: unknown): Promise<void> {}

export async function previewRemoveEditorBrowserFrameSettings(_options?: unknown): Promise<void> {}

async function upsertBrowserFrameLayer(
  options: BrowserFrameActionOptions,
  browserFrame: BrowserFrameState
): Promise<boolean> {
  const { canvas } = options;
  if (!canvas) {
    return false;
  }

  const existingLayer = findBrowserFrameLayer(canvas);
  const currentSource = readCurrentBrowserFrameSourceState(canvas, options.source);
  if (!currentSource) {
    return false;
  }
  const relayoutOptions = resolveBrowserFrameRelayoutOptions(browserFrame);
  const nextScene = resolveBrowserFrameScene({
    browserFrame,
    currentSource,
    options,
    relayoutOptions,
  });
  const position = resolveNextBrowserFramePosition({
    currentSource,
    existingLayer,
    nextSource: nextScene.source,
  });

  const nextLayer = await createBrowserFrameLayerObject({
    browserFrame,
    existingObject: existingLayer,
    left: position.left,
    nextLabelIndex: options.nextLabelIndex?.('browser-frame') ?? 1,
    prepareObject: options.prepareObject ?? (() => undefined),
    top: position.top,
    width: resolveNextBrowserFrameWidth({
      currentSource,
      existingLayer,
      nextSource: nextScene.source,
    }),
  });

  options.relayoutScene(browserFrame, relayoutOptions);
  replaceBrowserFrameLayer(canvas, existingLayer, nextLayer);
  options.ensureBrowserFrameOnTop();
  canvas.requestRenderAll();
  return true;
}

function findBrowserFrameLayer(canvas: Canvas): FabricObject | null {
  return canvas.getObjects?.().find((object) => isBrowserFrameObject(object)) ?? null;
}

function replaceBrowserFrameLayer(
  canvas: Canvas,
  previous: FabricObject | null,
  next: FabricObject
): void {
  const previousIndex = previous ? (canvas.getObjects?.() ?? []).indexOf(previous) : -1;
  if (previous) {
    canvas.remove(previous);
  }

  canvas.add(next);
  if (previousIndex >= 0) {
    canvas.moveObjectTo(next, previousIndex);
  } else {
    canvas.bringObjectToFront(next);
  }
  canvas.setActiveObject(next);
  next.setCoords();
}
