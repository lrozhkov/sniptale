import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';
import type { EditorControllerInstance } from '../types';
import { resizeEditorControllerImageScene } from '../../public-api/image-scene-resize';
import {
  applyEditorControllerBrowserFrame,
  previewEditorControllerBrowserFrame,
  previewRemoveEditorControllerBrowserFrame,
  removeEditorControllerBrowserFrame,
} from '../../public-api/scene-actions/browser-frame';
import {
  applyEditorControllerFrame,
  resizeEditorControllerCanvas,
} from '../../public-api/scene-actions/resize';

export function resizeCanvasForController(
  controller: EditorControllerInstance,
  width: number,
  height: number
): void {
  resizeEditorControllerCanvas(controller.getPublicApiAdapter(), width, height);
}

export function resizeImageForController(
  controller: EditorControllerInstance,
  width: number,
  height: number
): void {
  resizeEditorControllerImageScene(controller.getPublicApiAdapter(), width, height);
}

export function applyFrameSettingsForController(
  controller: EditorControllerInstance,
  frame: EditorFrameSettings
): void {
  applyEditorControllerFrame(controller.getPublicApiAdapter(), frame);
}

export async function applyBrowserFrameForController(
  controller: EditorControllerInstance,
  browserFrame: BrowserFrameState
): Promise<void> {
  await applyEditorControllerBrowserFrame(controller.getPublicApiAdapter(), browserFrame);
}

export async function previewBrowserFrameForController(
  controller: EditorControllerInstance,
  browserFrame: BrowserFrameState
): Promise<void> {
  await previewEditorControllerBrowserFrame(controller.getPublicApiAdapter(), browserFrame);
}

export async function removeBrowserFrameForController(
  controller: EditorControllerInstance
): Promise<void> {
  await removeEditorControllerBrowserFrame(controller.getPublicApiAdapter());
}

export async function previewRemoveBrowserFrameForController(
  controller: EditorControllerInstance
): Promise<void> {
  await previewRemoveEditorControllerBrowserFrame(controller.getPublicApiAdapter());
}
