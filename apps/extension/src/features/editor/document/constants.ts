import type { BrowserFrameState, EditorFrameSettings, EditorWorkspaceSettings } from './types';
import { DEFAULT_COLOR_GRID, DEFAULT_COLOR_WORKSPACE } from '@sniptale/ui/default-colors/constants';
import {
  normalizeEditorFrameGradientColorStops,
  normalizeEditorFrameGradientStops,
} from './frame-gradient';
import { DEFAULT_EDITOR_IMAGE_SETTINGS, normalizeEditorImageSettings } from './image-types';
export { DEFAULT_EDITOR_TOOL_SETTINGS } from './tool-defaults';
export { DEFAULT_EDITOR_IMAGE_SETTINGS, normalizeEditorImageSettings } from './image-types';
export {
  EDITOR_SCENE_BACKGROUND_PALETTE,
  EDITOR_TOOL_SHAPE_FILL_PALETTE,
  EDITOR_TOOL_SHAPE_STROKE_PALETTE,
  EDITOR_TOOL_TEXT_BACKGROUND_PALETTE,
  EDITOR_TOOL_TEXT_COLOR_PALETTE,
} from './palettes';

export const DEFAULT_EDITOR_FRAME_SETTINGS: EditorFrameSettings = {
  browserMode: false,
  paddingTop: 128,
  paddingRight: 128,
  paddingBottom: 128,
  paddingLeft: 128,
  backgroundMode: 'gradient',
  backgroundColor: 'transparent',
  backgroundGradientFrom: '#7c2d12',
  backgroundGradientTo: '#f59e0b',
  backgroundGradientStops: ['#7c2d12', '#f59e0b'],
  backgroundGradientColorStops: [
    { color: '#7c2d12', offset: 0 },
    { color: '#f59e0b', offset: 1 },
  ],
  backgroundGradientAngle: 145,
  backgroundImageData: null,
  backgroundImageFit: 'cover',
  sourceImage: DEFAULT_EDITOR_IMAGE_SETTINGS,
  layoutMode: 'expand-canvas',
  browserTitle: '',
  browserUrl: '',
};

export const DEFAULT_BROWSER_FRAME_STATE = {
  title: '',
  url: '',
  faviconDataUrl: null,
  canvasMode: 'resize',
  contentMode: 'push-down',
} as const;

function normalizeBrowserFrameContentMode(value: unknown): BrowserFrameState['contentMode'] {
  const contentMode = value === 'keep-position' ? 'fit-content' : value;

  return contentMode === 'push-down' || contentMode === 'fit-content'
    ? contentMode
    : DEFAULT_BROWSER_FRAME_STATE.contentMode;
}

export function normalizeBrowserFrameState(
  browserFrame: Partial<BrowserFrameState> | null | undefined,
  frame?: Partial<EditorFrameSettings> | null
): BrowserFrameState {
  return {
    title: browserFrame?.title ?? frame?.browserTitle ?? DEFAULT_BROWSER_FRAME_STATE.title,
    url: browserFrame?.url ?? frame?.browserUrl ?? DEFAULT_BROWSER_FRAME_STATE.url,
    faviconDataUrl: browserFrame?.faviconDataUrl ?? DEFAULT_BROWSER_FRAME_STATE.faviconDataUrl,
    canvasMode: browserFrame?.canvasMode ?? DEFAULT_BROWSER_FRAME_STATE.canvasMode,
    contentMode: normalizeBrowserFrameContentMode(browserFrame?.contentMode),
  };
}

export const DEFAULT_EDITOR_WORKSPACE_SETTINGS: EditorWorkspaceSettings = {
  backgroundColor: DEFAULT_COLOR_WORKSPACE,
  gridEnabled: false,
  gridSnapEnabled: false,
  magnetEnabled: false,
  gridSize: 24,
  gridColor: DEFAULT_COLOR_GRID,
};

export function normalizeEditorFrameSettings(
  frame: Partial<EditorFrameSettings> | null | undefined
): EditorFrameSettings {
  const backgroundGradientFrom =
    frame?.backgroundGradientFrom ?? DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientFrom;
  const backgroundGradientTo =
    frame?.backgroundGradientTo ?? DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientTo;

  return {
    browserMode: frame?.browserMode ?? DEFAULT_EDITOR_FRAME_SETTINGS.browserMode,
    paddingTop: frame?.paddingTop ?? DEFAULT_EDITOR_FRAME_SETTINGS.paddingTop,
    paddingRight: frame?.paddingRight ?? DEFAULT_EDITOR_FRAME_SETTINGS.paddingRight,
    paddingBottom: frame?.paddingBottom ?? DEFAULT_EDITOR_FRAME_SETTINGS.paddingBottom,
    paddingLeft: frame?.paddingLeft ?? DEFAULT_EDITOR_FRAME_SETTINGS.paddingLeft,
    backgroundMode: frame?.backgroundMode ?? DEFAULT_EDITOR_FRAME_SETTINGS.backgroundMode,
    backgroundColor: frame?.backgroundColor ?? DEFAULT_EDITOR_FRAME_SETTINGS.backgroundColor,
    backgroundGradientFrom,
    backgroundGradientTo,
    backgroundGradientStops:
      frame?.backgroundGradientStops ??
      normalizeEditorFrameGradientStops({
        backgroundGradientFrom,
        backgroundGradientTo,
      }),
    backgroundGradientColorStops: normalizeEditorFrameGradientColorStops({
      backgroundGradientColorStops: frame?.backgroundGradientColorStops,
      backgroundGradientFrom,
      backgroundGradientStops: frame?.backgroundGradientStops,
      backgroundGradientTo,
    }),
    backgroundGradientAngle:
      frame?.backgroundGradientAngle ?? DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientAngle,
    backgroundImageData:
      frame?.backgroundImageData ?? DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageData,
    backgroundImageFit:
      frame?.backgroundImageFit ?? DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageFit,
    sourceImage: normalizeEditorImageSettings(frame?.sourceImage),
    layoutMode: frame?.layoutMode ?? DEFAULT_EDITOR_FRAME_SETTINGS.layoutMode,
    browserTitle: frame?.browserTitle ?? DEFAULT_EDITOR_FRAME_SETTINGS.browserTitle,
    browserUrl: frame?.browserUrl ?? DEFAULT_EDITOR_FRAME_SETTINGS.browserUrl,
  };
}
