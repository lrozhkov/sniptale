import type React from 'react';
import type { ImageEditorController } from '../../controller';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import type { CompactSelectOption } from '../../chrome/ui';
import { renderEditorInspectorFrameSection } from './size';
import { EditorInspectorResizeToolSection } from './resize-tool';
import {
  renderEditorInspectorContentSurfaceSections,
  type EditorInspectorContentSurfaceSectionsProps,
} from './surface';
import type { BackgroundGradientPreset } from '../sidebar-shared';

export interface EditorInspectorContentBodyProps extends EditorInspectorContentSurfaceSectionsProps {
  imageSizeText: string;
  canvasSizeText: string;
  canvasSize: { width: number; height: number };
  cropSelection: { width: number; height: number } | null;
  imageSizeDraft: { width: number; height: number };
  canvasSizeDraft: { width: number; height: number };
  imageSizeLocked: boolean;
  canvasSizeLocked: boolean;
  imageAspectRatio: number | null;
  canvasAspectRatio: number | null;
  frameDraft: EditorFrameSettings;
  framePaddingSummary: string;
  layoutModeLabel: string;
  backgroundModeLabel: string;
  backgroundSummary: string;
  backgroundPreviewStyle: React.CSSProperties;
  frameBackgroundImageFitOptions: CompactSelectOption<EditorFrameSettings['backgroundImageFit']>[];
  frameBackgroundModeOptions: CompactSelectOption<EditorFrameSettings['backgroundMode']>[];
  frameGradientPresets: BackgroundGradientPreset[];
  frameLayoutModeOptions: CompactSelectOption<EditorFrameSettings['layoutMode']>[];
  frameBackgroundPalette: readonly string[];
  setImageSizeDraft: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setCanvasSizeDraft: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setImageSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setCanvasSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
  setUniformPadding: (value: number) => void;
  applyGradientPreset: (preset: BackgroundGradientPreset) => void;
  clearBackgroundImage: () => void;
  onPickBackgroundImage: () => void;
  onApplyFrame: () => void;
}

type ResizeToolController = Pick<
  ImageEditorController,
  | 'applyCropSelection'
  | 'clearCanvasSizePreview'
  | 'clearCropSelection'
  | 'previewCanvasSize'
  | 'resizeCanvas'
  | 'resizeImage'
  | 'setCropSelectionMouseEnabled'
>;

export function renderEditorInspectorContentBody(
  props: EditorInspectorContentBodyProps,
  controller: ResizeToolController
) {
  if (props.inspector === 'tool' && props.highlightedTool === 'crop') {
    return renderEditorInspectorResizeToolSection(props, controller);
  }

  if (props.inspector === 'image-size') {
    return renderEditorInspectorResizeToolSection(props, controller);
  }

  if (props.inspector === 'canvas-size') {
    return renderEditorInspectorResizeToolSection(props, controller);
  }

  if (props.inspector === 'frame') {
    return renderEditorInspectorFrameSection(props);
  }

  return renderEditorInspectorContentSurfaceSections(props);
}

function renderEditorInspectorResizeToolSection(
  props: EditorInspectorContentBodyProps,
  controller: ResizeToolController
) {
  return (
    <EditorInspectorResizeToolSection
      canvasAspectRatio={props.canvasAspectRatio}
      canvasSize={props.canvasSize}
      canvasSizeDraft={props.canvasSizeDraft}
      canvasSizeLocked={props.canvasSizeLocked}
      canvasSizeText={props.canvasSizeText}
      controller={controller}
      cropReady={props.cropReady}
      cropSelection={props.cropSelection}
      imageAspectRatio={props.imageAspectRatio}
      imageSizeDraft={props.imageSizeDraft}
      imageSizeLocked={props.imageSizeLocked}
      imageSizeText={props.imageSizeText}
      setCanvasSizeDraft={props.setCanvasSizeDraft}
      setCanvasSizeLocked={props.setCanvasSizeLocked}
      setImageSizeDraft={props.setImageSizeDraft}
      setImageSizeLocked={props.setImageSizeLocked}
      updateLockedDraft={props.updateLockedDraft}
    />
  );
}
