import { isEditorCompositionBase } from '../../../../features/editor/document/guards';
import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';
import { resolveEditorWindowHeader } from '../../../../features/editor/document/constants';
import type {
  BrowserFrameState,
  EditorCompositionBase,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';
import { resolveEditorSceneLayout } from '../../../browser-frame/layout';
import type { EditorSceneLayout, Size } from '../../../browser-frame/layout/types';
import type { SourceState } from '../../../document/model/source-state';
import type { SceneRelayoutOptions } from './types';

/** Capture undecorated dimensions once; previews must not become the next baseline. */
export function resolveSceneCompositionBase(args: {
  source: SourceState;
  canvasSize: Size;
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  hasBrowserFrame: boolean;
}): EditorCompositionBase {
  if (args.source.compositionBase) return args.source.compositionBase;
  const legacy = args.hasBrowserFrame ? args.browserFrame.compositionBase : undefined;
  const paddingX = args.frame.paddingLeft + args.frame.paddingRight;
  const paddingY = args.frame.paddingTop + args.frame.paddingBottom;
  const headerHeight =
    args.hasBrowserFrame && args.browserFrame.canvasMode === 'resize'
      ? windowHeaderGeometry(resolveEditorWindowHeader(args.browserFrame), {
          width: args.source.displayWidth,
          height: args.source.displayHeight,
        }).height
      : 0;
  return {
    sourceWidth: legacy?.sourceWidth ?? args.source.displayWidth,
    sourceHeight: legacy?.sourceHeight ?? args.source.displayHeight,
    canvasWidth:
      (legacy?.canvasWidth ?? args.canvasSize.width) -
      (args.frame.layoutMode === 'expand-canvas' ? paddingX : 0),
    canvasHeight:
      (legacy?.canvasHeight ?? args.canvasSize.height - headerHeight) -
      (args.frame.layoutMode === 'expand-canvas' ? paddingY : 0),
  };
}

/** Background is composed first. The header then expands or fits that composition. */
function composeScene(args: {
  base: EditorCompositionBase;
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  hasBrowserFrame: boolean;
  options: SceneRelayoutOptions;
}): EditorSceneLayout {
  const { base, frame, browserFrame, hasBrowserFrame, options } = args;
  const source = options.sourceSize ?? { width: base.sourceWidth, height: base.sourceHeight };
  const backgroundCanvas = {
    width:
      base.canvasWidth +
      (frame.layoutMode === 'expand-canvas' ? frame.paddingLeft + frame.paddingRight : 0),
    height:
      base.canvasHeight +
      (frame.layoutMode === 'expand-canvas' ? frame.paddingTop + frame.paddingBottom : 0),
  };
  if (
    options.canvasSize ||
    options.sourceSize ||
    options.preserveCanvasSize !== undefined ||
    options.fitSourceToContent !== undefined
  ) {
    return resolveEditorSceneLayout({
      frame,
      browserFrame,
      hasBrowserFrame,
      source,
      canvas: options.canvasSize ?? backgroundCanvas,
      preserveCanvasSize: options.preserveCanvasSize ?? true,
      fitSourceToContent: options.fitSourceToContent ?? frame.layoutMode === 'fit-image',
    });
  }
  const background = resolveEditorSceneLayout({
    frame,
    browserFrame,
    hasBrowserFrame: false,
    source,
    canvas: backgroundCanvas,
    preserveCanvasSize: true,
    fitSourceToContent: frame.layoutMode === 'fit-image',
  });
  if (!hasBrowserFrame) return background;
  if (browserFrame.canvasMode === 'keep-size') {
    return resolveEditorSceneLayout({
      frame,
      browserFrame,
      hasBrowserFrame: true,
      source,
      canvas: background.canvas,
      preserveCanvasSize: true,
      fitSourceToContent: true,
    });
  }
  const height = windowHeaderGeometry(
    resolveEditorWindowHeader(browserFrame),
    background.source
  ).height;
  return {
    canvas: { ...background.canvas, height: Math.round(background.canvas.height + height) },
    source: { ...background.source, top: background.source.top + height },
    content: { ...background.content, top: background.content.top + height },
    header: {
      left: background.source.left,
      top: background.source.top,
      width: background.source.width,
      height,
    },
  };
}

/** Resolve bounded physical canvas dimensions before any raster allocation. */
export function resolveSceneComposition(
  args: Parameters<typeof composeScene>[0]
): EditorSceneLayout {
  const layout = composeScene(args);
  const { width, height } = layout.canvas;
  if (
    width < 1 ||
    height < 1 ||
    !isEditorCompositionBase({
      sourceWidth: layout.source.width,
      sourceHeight: layout.source.height,
      canvasWidth: width,
      canvasHeight: height,
    })
  )
    throw new RangeError('Editor composition exceeds canvas size limits.');
  return layout;
}

/** Explicit resize commands replace the relevant baseline; ordinary layout keeps it. */
export function resolveNextSceneCompositionBase(args: {
  base: EditorCompositionBase;
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  options: SceneRelayoutOptions;
  layout: EditorSceneLayout;
  source: Pick<SourceState, 'displayWidth' | 'displayHeight'>;
}): EditorCompositionBase {
  const { base, frame, browserFrame, options, layout, source } = args;
  if (options.canvasSize)
    return resolveCanvasCompositionBase({
      source,
      frame,
      browserFrame,
      canvasSize: options.canvasSize,
      headerHeight: layout.header?.height ?? 0,
    });
  if (options.sourceSize)
    return {
      ...base,
      sourceWidth: options.sourceSize.width,
      sourceHeight: options.sourceSize.height,
      ...(frame.layoutMode === 'expand-canvas'
        ? { canvasWidth: options.sourceSize.width, canvasHeight: options.sourceSize.height }
        : {}),
    };
  return base;
}

/** A canvas edit establishes new undecorated bounds without composing the image again. */
export function resolveCanvasCompositionBase(args: {
  source: Pick<SourceState, 'displayWidth' | 'displayHeight'>;
  canvasSize: Size;
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  headerHeight: number;
}): EditorCompositionBase {
  const { source, canvasSize, frame, browserFrame, headerHeight } = args;
  const expand = frame.layoutMode === 'expand-canvas';
  return {
    sourceWidth: source.displayWidth,
    sourceHeight: source.displayHeight,
    canvasWidth: canvasSize.width - (expand ? frame.paddingLeft + frame.paddingRight : 0),
    canvasHeight:
      canvasSize.height -
      (expand ? frame.paddingTop + frame.paddingBottom : 0) -
      (browserFrame.canvasMode === 'resize' ? headerHeight : 0),
  };
}
