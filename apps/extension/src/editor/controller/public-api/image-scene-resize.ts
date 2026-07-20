import type { EditorDocument, EditorFrameSettings } from '../../../features/editor/document/types';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import { reportEditorActionFailure } from '../../runtime/async-actions';
import { emptyCanvasJson } from '../core/helpers';
import { MIN_CANVAS_SIZE } from '../../document/model';
import type { EditorControllerPublicApiAdapter } from './types';

function normalizeSceneSize(width: number, height: number) {
  return {
    width: Math.max(MIN_CANVAS_SIZE, Math.round(width)),
    height: Math.max(MIN_CANVAS_SIZE, Math.round(height)),
  };
}

function createFlatResizeFrame(): EditorFrameSettings {
  return {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    browserMode: false,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    backgroundMode: 'color',
    backgroundColor: 'transparent',
    backgroundImageData: null,
    layoutMode: 'fit-image',
    browserTitle: '',
    browserUrl: '',
  };
}

function createFlattenedResizeDocument(options: {
  dataUrl: string;
  height: number;
  name: string | null;
  width: number;
}): EditorDocument {
  return {
    version: 1,
    sourceImageData: options.dataUrl,
    sourceName: options.name,
    sourceWidth: options.width,
    sourceHeight: options.height,
    canvasWidth: options.width,
    canvasHeight: options.height,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: options.width,
    sourceDisplayHeight: options.height,
    frame: createFlatResizeFrame(),
    browserFrame: { ...DEFAULT_BROWSER_FRAME_STATE },
    canvasJson: emptyCanvasJson(),
    richShapes: [],
  };
}

async function flattenEditorControllerImageScene(
  controller: EditorControllerPublicApiAdapter,
  width: number,
  height: number
): Promise<void> {
  if (!controller.canvas || !controller.source) {
    return;
  }

  const nextSize = normalizeSceneSize(width, height);
  controller.clearCropSelection();
  const dataUrl = controller.renderToDataUrl({
    format: 'png',
    outputSize: nextSize,
    quality: 1,
  });
  await controller.applyDocument(
    createFlattenedResizeDocument({
      dataUrl,
      height: nextSize.height,
      name: controller.source.name,
      width: nextSize.width,
    }),
    {}
  );
  controller.commitHistory();
  controller.syncRuntimeState();
}

export function resizeEditorControllerImageScene(
  controller: EditorControllerPublicApiAdapter,
  width: number,
  height: number
): void {
  void flattenEditorControllerImageScene(controller, width, height).catch((error) => {
    reportEditorActionFailure('resize-image', error);
  });
}
