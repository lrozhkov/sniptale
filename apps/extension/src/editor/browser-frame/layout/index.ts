import { resolveEditorSceneLayoutGeometry } from './geometry';
import {
  getBrowserHeaderHeight,
  shouldFitSourceToContent,
  shouldPreserveCanvasForBrowserFrame,
} from './modes';
import type { EditorSceneLayout, ResolveEditorSceneLayoutInput } from './types';

export function resolveEditorSceneLayout(input: ResolveEditorSceneLayoutInput): EditorSceneLayout {
  const {
    frame,
    browserFrame,
    hasBrowserFrame = false,
    preserveCanvasSize,
    fitSourceToContent,
  } = input;
  const headerHeight = getBrowserHeaderHeight(hasBrowserFrame, browserFrame, input.source);

  return resolveEditorSceneLayoutGeometry({
    browserFrame,
    fitSourceToContent,
    frame,
    hasBrowserFrame,
    headerHeight,
    input,
    preserveCanvasSize,
  });
}

export { getBrowserHeaderHeight, shouldFitSourceToContent, shouldPreserveCanvasForBrowserFrame };
