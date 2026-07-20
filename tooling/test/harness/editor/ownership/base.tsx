import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import { EditorControllerProvider } from '../../../../../apps/extension/src/editor/application/controller-context';
import type { ImageEditorController } from '../../../../../apps/extension/src/editor/controller';
import type { useEditorStore } from '../../../../../apps/extension/src/editor/state/useEditorStore';

type EditorStoreState = ReturnType<typeof useEditorStore.getState>;
type EditorControllerHarnessMock = Partial<ImageEditorController> & object;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

export function createEditorOwnershipControllerMockBase() {
  return {
    applyBrowserFrame: vi.fn(async () => undefined),
    applyCropSelection: vi.fn(async () => undefined),
    applyActiveSettingsToSelection: vi.fn(),
    applyTextSelectionStyle: vi.fn(() => false),
    applyFrameSettings: vi.fn(),
    bringForwardSelection: vi.fn(),
    cancelCropMode: vi.fn(),
    clearCanvasSizePreview: vi.fn(),
    clearCropSelection: vi.fn(),
    clearSelection: vi.fn(),
    commitHistory: vi.fn(),
    copyRenderedImage: vi.fn(async () => undefined),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(async () => undefined),
    applyLayerEffect: vi.fn(async () => undefined),
    applyLayerTransformation: vi.fn(async () => undefined),
    mergeSelectedLayers: vi.fn(async () => undefined),
    previewBrowserFrame: vi.fn(async (_browserFrame?: unknown) => undefined),
    previewCanvasSize: vi.fn(),
    previewLayerEffect: vi.fn(),
    previewActiveSettingsOnSelection: vi.fn(),
    previewRemoveBrowserFrame: vi.fn(async () => undefined),
    removeBrowserFrame: vi.fn(async () => undefined),
    insertRichShape: vi.fn(),
    reorderLayer: vi.fn(),
    renameLayer: vi.fn(),
    removeLayerEffect: vi.fn(),
    refreshActiveToolSettingsPreview: vi.fn(),
    resizeCanvas: vi.fn(),
    resizeImage: vi.fn(),
    resizeLayer: vi.fn(),
    resetLayerEffectPreview: vi.fn(),
    selectLayer: vi.fn(),
    sendBackwardSelection: vi.fn(),
    sendSelectionToBack: vi.fn(),
    setActiveTool: vi.fn(),
    setCropSelectionMouseEnabled: vi.fn(),
    suspendToolMode: vi.fn(),
    toggleLayerLock: vi.fn(),
    toggleLayerVisibility: vi.fn(),
    updateLayerEffect: vi.fn(async () => undefined),
    withHistoryMuted: vi.fn(function withHistoryMuted<T>(callback: () => T) {
      return callback();
    }),
  };
}

export function createEditorOwnershipSelection(): EditorStoreState['selection'] {
  return {
    hasSelection: true,
    selectedObjectHeight: 120,
    selectedObjectCount: 1,
    selectedObjectId: 'layer-1',
    selectedObjectIds: ['layer-1'],
    selectedObjectType: 'rectangle',
    selectedObjectWidth: 160,
  };
}

export function createEditorOwnershipViewport(): EditorStoreState['viewport'] {
  return {
    canvasHeight: 720,
    canvasOffsetLeft: 0,
    canvasOffsetTop: 0,
    canvasWidth: 1280,
    scaledCanvasHeight: 720,
    scaledCanvasWidth: 1280,
    scrollLeft: 0,
    scrollTop: 0,
    sourceHeight: 720,
    sourceName: 'capture.png',
    sourceWidth: 1280,
    viewportHeight: 720,
    viewportWidth: 1280,
    zoomPercent: 125,
  };
}

function asEditorControllerHarnessMock(
  controller: EditorControllerHarnessMock
): ImageEditorController {
  return controller as ImageEditorController;
}

export function renderWithController(
  node: React.ReactNode,
  controller: EditorControllerHarnessMock
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <EditorControllerProvider controller={asEditorControllerHarnessMock(controller)}>
        {node}
      </EditorControllerProvider>
    );
  });
}

export async function renderWithControllerAsync(
  node: React.ReactNode,
  controller: EditorControllerHarnessMock
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <EditorControllerProvider controller={asEditorControllerHarnessMock(controller)}>
        {node}
      </EditorControllerProvider>
    );
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

export async function rerenderWithControllerAsync(
  node: React.ReactNode,
  controller: EditorControllerHarnessMock
) {
  if (!root || !container) {
    throw new Error('renderWithControllerAsync must be called before rerenderWithControllerAsync');
  }

  await act(async () => {
    root?.render(
      <EditorControllerProvider controller={asEditorControllerHarnessMock(controller)}>
        {node}
      </EditorControllerProvider>
    );
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

export function cleanupEditorOwnershipDom() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  document.body.replaceChildren();
}

export function setEditorOwnershipInputFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  });
}

export async function flushEditorOwnershipAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}
