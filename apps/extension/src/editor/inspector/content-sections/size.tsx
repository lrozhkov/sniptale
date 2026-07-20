import React from 'react';

import { translate } from '../../../platform/i18n';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import type { EditorImageSettings } from '../../../features/editor/document/image-types';
import type { ImageEditorController } from '../../controller';
import type { EditorInspectorPresetHeaderState } from '../presets';
import type { CompactSelectOption } from '../../chrome/ui';
import { EditorInspectorFramePanel } from '../scene';
import { EditorInspectorSizePanel } from '../size-panel';
import { type BackgroundGradientPreset } from '../sidebar-shared';

interface RenderSizePanelParams {
  label: string;
  valueText: string;
  draft: { width: number; height: number };
  locked: boolean;
  aspectRatio: number | null;
  setDraft: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setLocked: React.Dispatch<React.SetStateAction<boolean>>;
  updateLockedDraft: (
    state: { width: number; height: number },
    field: 'width' | 'height',
    value: number,
    locked: boolean,
    aspectRatio: number | null
  ) => { width: number; height: number };
  onApply: () => void;
}

export function renderEditorInspectorSizeSection({
  label,
  valueText,
  draft,
  locked,
  aspectRatio,
  setDraft,
  setLocked,
  updateLockedDraft,
  onApply,
}: RenderSizePanelParams) {
  return (
    <EditorInspectorSizePanel
      label={label}
      valueText={valueText}
      width={draft.width}
      height={draft.height}
      locked={locked}
      onWidthChange={(value) =>
        setDraft((state) => updateLockedDraft(state, 'width', value, locked, aspectRatio))
      }
      onHeightChange={(value) =>
        setDraft((state) => updateLockedDraft(state, 'height', value, locked, aspectRatio))
      }
      onToggleLock={() => setLocked((state) => !state)}
      onApply={onApply}
    />
  );
}

interface RenderFrameSectionParams {
  scenePresetHeader: EditorInspectorPresetHeaderState | null;
  frameDraft: EditorFrameSettings;
  framePaddingSummary: string;
  backgroundPreviewStyle: React.CSSProperties;
  frameLayoutModeOptions: CompactSelectOption<EditorFrameSettings['layoutMode']>[];
  frameBackgroundModeOptions: CompactSelectOption<EditorFrameSettings['backgroundMode']>[];
  frameGradientPresets: BackgroundGradientPreset[];
  frameBackgroundPalette: readonly string[];
  frameBackgroundImageFitOptions: CompactSelectOption<EditorFrameSettings['backgroundImageFit']>[];
  lineStyleOptions?: CompactSelectOption<EditorImageSettings['strokeStyle']>[] | undefined;
  recentColors: string[];
  shapeStrokePalette?: readonly string[] | undefined;
  toNumber: (value: string, fallback?: number) => number;
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
  applyGradientPreset: (preset: BackgroundGradientPreset) => void;
  onPickBackgroundImage: () => void;
  clearBackgroundImage: () => void;
  onApplyFrame: () => void;
}

export function renderEditorInspectorFrameSection(props: RenderFrameSectionParams) {
  return (
    <EditorInspectorFramePanel
      scenePresetHeader={props.scenePresetHeader}
      frameDraft={props.frameDraft}
      backgroundPreviewStyle={props.backgroundPreviewStyle}
      framePaddingSummary={props.framePaddingSummary}
      frameLayoutModeOptions={props.frameLayoutModeOptions}
      frameBackgroundModeOptions={props.frameBackgroundModeOptions}
      gradientPresets={props.frameGradientPresets}
      frameBackgroundPalette={props.frameBackgroundPalette}
      frameBackgroundImageFitOptions={props.frameBackgroundImageFitOptions}
      {...(props.lineStyleOptions === undefined
        ? {}
        : { lineStyleOptions: props.lineStyleOptions })}
      recentColors={props.recentColors}
      {...(props.shapeStrokePalette === undefined
        ? {}
        : { shapeStrokePalette: props.shapeStrokePalette })}
      toNumber={props.toNumber}
      setFrameDraft={props.setFrameDraft}
      setLayoutMode={(value) => props.setFrameDraft((state) => ({ ...state, layoutMode: value }))}
      setBackgroundMode={(value) =>
        props.setFrameDraft((state) => ({ ...state, backgroundMode: value }))
      }
      applyGradientPreset={props.applyGradientPreset}
      previewFramePatch={(patch) => {
        props.setFrameDraft((state) => ({ ...state, ...patch }));
      }}
      applyFramePatch={(patch) => {
        props.setFrameDraft((state) => ({ ...state, ...patch }));
      }}
      onPickBackgroundImage={props.onPickBackgroundImage}
      onClearBackgroundImage={props.clearBackgroundImage}
      onApplyFrame={props.onApplyFrame}
    />
  );
}

export function getImageSizeSectionLabel() {
  return translate('editor.compact.imageSize');
}

export function getCanvasSizeSectionLabel() {
  return translate('editor.compact.canvasSize');
}

export function createResizeImageAction(
  controller: Pick<ImageEditorController, 'resizeImage'>,
  width: number,
  height: number
) {
  return () => controller.resizeImage(width, height);
}

export function createResizeCanvasAction(
  controller: Pick<ImageEditorController, 'resizeCanvas'>,
  width: number,
  height: number
) {
  return () => controller.resizeCanvas(width, height);
}
