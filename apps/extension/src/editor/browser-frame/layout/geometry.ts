import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import { MIN_CANVAS_SIZE } from '../../document/model';
import type { EditorSceneLayout, Rect, ResolveEditorSceneLayoutInput, Size } from './types';

function roundSize(value: number): number {
  return Math.max(MIN_CANVAS_SIZE, Math.round(value));
}

function buildSceneHeaderRect(
  hasBrowserFrame: boolean,
  frame: EditorFrameSettings,
  headerHeight: number,
  source: Rect
): Rect | null {
  if (!hasBrowserFrame) {
    return null;
  }

  return {
    left: source.left,
    top: Math.max(frame.paddingTop, source.top - headerHeight),
    width: source.width,
    height: headerHeight,
  };
}

function buildSceneContentOutput(
  canvasWidth: number,
  canvasHeight: number,
  frame: EditorFrameSettings,
  headerHeight: number,
  content: Rect
): Rect {
  return {
    left: content.left,
    top: content.top,
    width: roundSize(canvasWidth - frame.paddingLeft - frame.paddingRight),
    height: roundSize(canvasHeight - frame.paddingTop - frame.paddingBottom - headerHeight),
  };
}

function createSceneContentRect(
  frame: EditorFrameSettings,
  canvas: Size,
  headerHeight: number
): Rect {
  return {
    left: frame.paddingLeft,
    top: frame.paddingTop + headerHeight,
    width: roundSize(canvas.width - frame.paddingLeft - frame.paddingRight),
    height: roundSize(canvas.height - frame.paddingTop - frame.paddingBottom - headerHeight),
  };
}

function normalizeSceneSource(input: ResolveEditorSceneLayoutInput) {
  return {
    width: roundSize(input.source.width),
    height: roundSize(input.source.height),
  };
}

function resolveInitialCanvasSize(
  input: ResolveEditorSceneLayoutInput,
  source: Size,
  headerHeight: number,
  hasBrowserFrame: boolean
) {
  const { frame, preserveCanvasSize } = input;
  const reserveCanvasHeader = hasBrowserFrame && input.browserFrame.canvasMode === 'resize';

  return {
    height:
      preserveCanvasSize && input.canvas
        ? roundSize(input.canvas.height)
        : roundSize(
            frame.paddingTop +
              source.height +
              frame.paddingBottom +
              (reserveCanvasHeader ? headerHeight : 0)
          ),
    reserveCanvasHeader,
    width:
      preserveCanvasSize && input.canvas
        ? roundSize(input.canvas.width)
        : roundSize(frame.paddingLeft + source.width + frame.paddingRight),
  };
}

function resolveFittedSourceRect(args: {
  content: Rect;
  fitSourceToContent: boolean;
  frame: EditorFrameSettings;
  hasBrowserFrame: boolean;
  source: Size;
}) {
  const { content, fitSourceToContent, frame, hasBrowserFrame, source } = args;
  let sourceWidth = source.width;
  let sourceHeight = source.height;
  let sourceLeft = content.left;
  let sourceTop = content.top;

  if (fitSourceToContent) {
    const scale = Math.min(content.width / source.width, content.height / source.height);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    sourceWidth = roundSize(source.width * safeScale);
    sourceHeight = roundSize(source.height * safeScale);
    sourceLeft = content.left + Math.round((content.width - sourceWidth) / 2);
    sourceTop = hasBrowserFrame
      ? content.top
      : frame.paddingTop + Math.round((content.height - sourceHeight) / 2);
  }

  return {
    height: sourceHeight,
    left: sourceLeft,
    top: sourceTop,
    width: sourceWidth,
  };
}

function resolveAdaptiveCanvasSize(args: {
  frame: EditorFrameSettings;
  headerHeight: number;
  preserveCanvasSize: boolean;
  reserveCanvasHeader: boolean;
  source: Rect;
  width: number;
  height: number;
}) {
  if (args.preserveCanvasSize) {
    return {
      width: args.width,
      height: args.height,
    };
  }

  return {
    width: roundSize(args.frame.paddingLeft + args.source.width + args.frame.paddingRight),
    height: roundSize(
      args.frame.paddingTop +
        args.source.height +
        args.frame.paddingBottom +
        (args.reserveCanvasHeader ? args.headerHeight : 0)
    ),
  };
}

interface ResolveEditorSceneLayoutGeometryArgs {
  browserFrame: BrowserFrameState;
  fitSourceToContent: boolean;
  frame: EditorFrameSettings;
  hasBrowserFrame: boolean;
  headerHeight: number;
  input: ResolveEditorSceneLayoutInput;
  preserveCanvasSize: boolean;
}

function resolveEditorSceneLayoutState(args: ResolveEditorSceneLayoutGeometryArgs) {
  const hasBrowserFrame = args.hasBrowserFrame;
  const safeSource = normalizeSceneSource(args.input);
  const initialCanvas = resolveInitialCanvasSize(
    args.input,
    safeSource,
    args.headerHeight,
    hasBrowserFrame
  );
  const content = createSceneContentRect(
    args.frame,
    { width: initialCanvas.width, height: initialCanvas.height },
    args.headerHeight
  );
  const source = resolveFittedSourceRect({
    content,
    fitSourceToContent: args.fitSourceToContent,
    frame: args.frame,
    hasBrowserFrame,
    source: safeSource,
  });
  const canvas = resolveAdaptiveCanvasSize({
    frame: args.frame,
    headerHeight: args.headerHeight,
    preserveCanvasSize: args.preserveCanvasSize,
    reserveCanvasHeader: initialCanvas.reserveCanvasHeader,
    source,
    width: initialCanvas.width,
    height: initialCanvas.height,
  });

  return {
    canvas,
    content,
    hasBrowserFrame,
    source,
  };
}

export function resolveEditorSceneLayoutGeometry(
  args: ResolveEditorSceneLayoutGeometryArgs
): EditorSceneLayout {
  const state = resolveEditorSceneLayoutState(args);
  return {
    canvas: state.canvas,
    content: buildSceneContentOutput(
      state.canvas.width,
      state.canvas.height,
      args.frame,
      args.headerHeight,
      state.content
    ),
    source: {
      left: state.source.left,
      top: state.source.top,
      width: state.source.width,
      height: state.source.height,
    },
    header: buildSceneHeaderRect(
      state.hasBrowserFrame,
      args.frame,
      args.headerHeight,
      state.source
    ),
  };
}
