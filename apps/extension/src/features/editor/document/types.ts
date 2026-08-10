import type { BorderPreset } from '../../highlighter/contracts';
import type { EditorRasterEffect } from './effects';
import type { EditorRichShapeDocumentObject } from './rich-shape/types';
import type { EditorImageSettings } from './image-types';
import type { EditorGradientColorStop } from './gradient';

export type EditorTool =
  | 'select'
  | 'pencil'
  | 'marker'
  | 'frame-annotation'
  | 'shape'
  | 'blur'
  | 'arrow'
  | 'text'
  | 'step'
  | 'image'
  | 'crop';

export type EditorObjectType =
  | 'transparent-base'
  | 'source-image'
  | 'background'
  | 'pencil'
  | 'marker'
  | 'frame-annotation'
  | 'shape'
  | 'blur'
  | 'arrow'
  | 'text'
  | 'step'
  | 'image'
  | 'browser-frame'
  | 'meta-stamp'
  | 'rich-shape';

type BrowserFrameCanvasMode = 'resize' | 'keep-size';
type BrowserFrameContentMode = 'push-down' | 'fit-content';
type EditorBackgroundMode = 'color' | 'gradient' | 'image';
type EditorBackgroundImageFit =
  | 'cover'
  | 'contain'
  | 'stretch'
  | 'tile'
  | 'fit-width'
  | 'fit-height';
type EditorFrameLayoutMode = 'expand-canvas' | 'fit-image';

export interface BrowserFrameState {
  enabled?: boolean;
  appearance?: 'header' | 'window';
  title: string;
  url: string;
  faviconDataUrl?: string | null;
  canvasMode: BrowserFrameCanvasMode;
  contentMode: BrowserFrameContentMode;
}

export interface EditorFrameSettings {
  browserMode: boolean;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  backgroundMode: EditorBackgroundMode;
  backgroundColor: string;
  backgroundGradientFrom: string;
  backgroundGradientTo: string;
  backgroundGradientStops?: string[] | undefined;
  backgroundGradientColorStops?: EditorGradientColorStop[] | undefined;
  backgroundGradientAngle: number;
  backgroundImageData: string | null;
  backgroundImageFit: EditorBackgroundImageFit;
  sourceImage?: EditorImageSettings;
  layoutMode: EditorFrameLayoutMode;
  browserTitle: string;
  browserUrl: string;
}

export interface EditorShapeSettings {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  strokeOpacity: number;
  fillOpacity: number;
  borderPresetId: string | null;
  strokeStyle: BorderPreset['style'];
  radius: number;
  shadow: BorderPreset['shadow'];
  shadowAngle?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowDistance?: number;
  customCss: string;
  inheritCustomCss: boolean;
}

interface EditorDocumentVersion2 {
  version: 2;
  sourceImageData: string;
  sourceName: string | null;
  sourceWidth: number;
  sourceHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  sourceLeft: number;
  sourceTop: number;
  sourceDisplayWidth: number;
  sourceDisplayHeight: number;
  frame: EditorFrameSettings;
  browserFrame?: BrowserFrameState;
  canvasJson: string;
  richShapes?: EditorRichShapeDocumentObject[];
}

export type EditorDocument = EditorDocumentVersion2;

export interface EditorLayerItem {
  effectCount: number;
  effects: EditorRasterEffect[];
  id: string;
  immutable?: boolean;
  type: EditorObjectType;
  previewColor: string | null;
  previewDataUrl: string | null;
  previewTransparent: boolean;
  raster: boolean;
  name: string;
  locked: boolean;
  selected: boolean;
  selectedCount: number;
  typeLabel: string;
  visible: boolean;
}

export interface EditorSelectionState {
  hasSelection: boolean;
  selectedObjectCount: number;
  selectedObjectType: EditorObjectType | null;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  selectedObjectLabel?: string | null;
  selectedObjectLocked?: boolean;
  selectedObjectWidth: number | null;
  selectedObjectHeight: number | null;
}

export interface EditorViewportState {
  zoomPercent: number;
  canvasWidth: number;
  canvasHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceName: string | null;
  viewportWidth: number;
  viewportHeight: number;
  scrollLeft: number;
  scrollTop: number;
  scaledCanvasWidth: number;
  scaledCanvasHeight: number;
  canvasOffsetLeft: number;
  canvasOffsetTop: number;
}

export interface EditorHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  index: number;
  size: number;
}

export interface EditorWorkspaceSettings {
  backgroundColor: string;
  gridEnabled: boolean;
  gridSnapEnabled: boolean;
  magnetEnabled: boolean;
  gridSize: number;
  gridColor: string;
}
