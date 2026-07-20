import React, { useEffect, useState } from 'react';
import { translate } from '../../../platform/i18n';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import type { ImageEditorController } from '../../controller';
import { SelectField } from '../../chrome/ui';
import {
  applyCurrentAspectRatio,
  applySizePreset,
  buildAspectRatioOptions,
  buildSizePresetOptions,
  findAspectRatioValue,
  findPresetValue,
  fitSizeDraftToAspectRatio,
  type SizeDraft,
} from './resize-tool-options';
import { useCanvasResizePreview } from './resize-tool-preview';
import {
  INSPECTOR_PRIMARY_BUTTON_CLASS_NAME,
  INSPECTOR_SECTION_LABEL_CLASS_NAME,
  INSPECTOR_SECTION_SURFACE_CLASS_NAME,
} from '../chrome';
import { SizeControlsHeader, SizeControlsRow } from '../size-controls';

type ResizeToolMode = 'canvas' | 'image';

export { fitSizeDraftToAspectRatio };

type ResizeToolSectionProps = {
  canvasAspectRatio: number | null;
  canvasSize: SizeDraft;
  canvasSizeDraft: SizeDraft;
  canvasSizeLocked: boolean;
  canvasSizeText: string;
  controller: Pick<
    ImageEditorController,
    | 'applyCropSelection'
    | 'clearCanvasSizePreview'
    | 'clearCropSelection'
    | 'previewCanvasSize'
    | 'resizeCanvas'
    | 'resizeImage'
    | 'setCropSelectionMouseEnabled'
  >;
  cropReady: boolean;
  cropSelection: SizeDraft | null;
  imageAspectRatio: number | null;
  imageSizeDraft: SizeDraft;
  imageSizeLocked: boolean;
  imageSizeText: string;
  setCanvasSizeDraft: React.Dispatch<React.SetStateAction<SizeDraft>>;
  setCanvasSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setImageSizeDraft: React.Dispatch<React.SetStateAction<SizeDraft>>;
  setImageSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  updateLockedDraft: (
    state: SizeDraft,
    field: 'width' | 'height',
    value: number,
    locked: boolean,
    aspectRatio: number | null
  ) => SizeDraft;
};

type ActiveResizeState = {
  aspectRatio: number | null;
  draft: SizeDraft;
  locked: boolean;
  setDraft: React.Dispatch<React.SetStateAction<SizeDraft>>;
  setLocked: React.Dispatch<React.SetStateAction<boolean>>;
  sizeText: string;
};

function isSameSize(left: SizeDraft, right: SizeDraft | null): boolean {
  return Boolean(right && left.width === right.width && left.height === right.height);
}

export function EditorInspectorResizeToolSection(props: ResizeToolSectionProps) {
  const [mode, setMode] = useState<ResizeToolMode>('canvas');
  const isCanvasMode = mode === 'canvas';
  const active = selectActiveResizeState(props, mode);
  const canvasSizeMatchesDraft = isSameSize(props.canvasSizeDraft, props.canvasSize);
  const cropSelectionMatchesDraft = isSameSize(props.canvasSizeDraft, props.cropSelection ?? null);
  const applyDisabled = mode === 'canvas' && canvasSizeMatchesDraft;

  useCanvasResizePreview({
    canvasSizeDraft: props.canvasSizeDraft,
    canvasSizeMatchesDraft,
    controller: props.controller,
    cropSelection: props.cropSelection,
    cropSelectionMatchesDraft,
    isCanvasMode,
  });

  return (
    <div className="space-y-4">
      <ResizeToolModeSwitch mode={mode} onModeChange={setMode} />
      <ResizeToolSizePanel
        active={active}
        isCanvasMode={isCanvasMode}
        updateLockedDraft={props.updateLockedDraft}
      />
      <button
        type="button"
        className={INSPECTOR_PRIMARY_BUTTON_CLASS_NAME}
        disabled={applyDisabled}
        onClick={() => applyResizeToolMode(props, mode)}
      >
        {translate('editor.compact.apply')}
      </button>
    </div>
  );
}

function selectActiveResizeState(
  props: ResizeToolSectionProps,
  mode: ResizeToolMode
): ActiveResizeState {
  if (mode === 'canvas') {
    return {
      aspectRatio: props.canvasAspectRatio,
      draft: props.canvasSizeDraft,
      locked: props.canvasSizeLocked,
      setDraft: props.setCanvasSizeDraft,
      setLocked: props.setCanvasSizeLocked,
      sizeText: props.canvasSizeText,
    };
  }

  return {
    aspectRatio: props.imageAspectRatio,
    draft: props.imageSizeDraft,
    locked: props.imageSizeLocked,
    setDraft: props.setImageSizeDraft,
    setLocked: props.setImageSizeLocked,
    sizeText: props.imageSizeText,
  };
}

function ResizeToolModeSwitch(props: {
  mode: ResizeToolMode;
  onModeChange: (mode: ResizeToolMode) => void;
}) {
  return (
    <SegmentedSwitch
      activeId={props.mode}
      ariaLabel={translate('editor.compact.resizeTarget')}
      options={[
        { id: 'canvas', label: translate('editor.compact.canvas') },
        { id: 'image', label: translate('editor.compact.image') },
      ]}
      onChange={props.onModeChange}
      dataAttribute={{ 'data-resize-tool-mode': props.mode }}
    />
  );
}

function ResizeToolSizePanel(props: {
  active: ActiveResizeState;
  isCanvasMode: boolean;
  updateLockedDraft: ResizeToolSectionProps['updateLockedDraft'];
}) {
  const label = props.isCanvasMode
    ? translate('editor.compact.canvasSize')
    : translate('editor.compact.imageSize');

  return (
    <section className={INSPECTOR_SECTION_SURFACE_CLASS_NAME}>
      <SizeControlsHeader label={label} valueText={props.active.sizeText} />
      <div className="space-y-3">
        <ResizeToolDimensionRow active={props.active} updateLockedDraft={props.updateLockedDraft} />
        <ResizeToolSizePresetField active={props.active} />
        <ResizeToolAspectRatioField active={props.active} />
      </div>
    </section>
  );
}

function ResizeToolDimensionRow(props: {
  active: ActiveResizeState;
  updateLockedDraft: ResizeToolSectionProps['updateLockedDraft'];
}) {
  return (
    <SizeControlsRow
      width={props.active.draft.width}
      height={props.active.draft.height}
      locked={props.active.locked}
      onWidthChange={(width) => updateSizeDraft(props, 'width', width)}
      onHeightChange={(height) => updateSizeDraft(props, 'height', height)}
      onToggleLock={() => props.active.setLocked((next) => !next)}
      dataSizePanelDimensions
    />
  );
}

function updateSizeDraft(
  props: React.ComponentProps<typeof ResizeToolDimensionRow>,
  field: 'width' | 'height',
  value: number
) {
  props.active.setDraft((state) =>
    props.updateLockedDraft(state, field, value, props.active.locked, props.active.aspectRatio)
  );
}

function ResizeToolSizePresetField(props: { active: ActiveResizeState }) {
  const currentPresetValue = findPresetValue(props.active.draft) ?? 'custom';

  return (
    <div className="space-y-2">
      <span className={INSPECTOR_SECTION_LABEL_CLASS_NAME}>
        {translate('editor.compact.sizePreset')}
      </span>
      <SelectField
        label={translate('editor.compact.sizePreset')}
        value={currentPresetValue}
        onChange={(value) => applySizePreset(props.active.setDraft, value)}
        options={buildSizePresetOptions(currentPresetValue)}
      />
    </div>
  );
}

function ResizeToolAspectRatioField(props: { active: ActiveResizeState }) {
  const { draft } = props.active;
  const [selectedValue, setSelectedValue] = useState(() => findAspectRatioValue(draft) ?? 'custom');

  useEffect(() => {
    const exactValue = findAspectRatioValue(draft);
    if (exactValue) {
      setSelectedValue(exactValue);
    }
  }, [draft]);

  return (
    <div className="space-y-2">
      <span className={INSPECTOR_SECTION_LABEL_CLASS_NAME}>
        {translate('editor.compact.aspectRatioPreset')}
      </span>
      <SelectField
        label={translate('editor.compact.aspectRatioPreset')}
        value={selectedValue}
        onChange={setSelectedValue}
        options={buildAspectRatioOptions(selectedValue)}
      />
      <ResizeToolAspectRatioButtons active={props.active} currentValue={selectedValue} />
    </div>
  );
}

function ResizeToolAspectRatioButtons(props: { active: ActiveResizeState; currentValue: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        className={INSPECTOR_PRIMARY_BUTTON_CLASS_NAME}
        onClick={() => applyCurrentAspectRatio(props.active.setDraft, props.currentValue, 'long')}
        disabled={props.currentValue === 'custom'}
      >
        {translate('editor.compact.fitAspectByLongSide')}
      </button>
      <button
        type="button"
        className={INSPECTOR_PRIMARY_BUTTON_CLASS_NAME}
        onClick={() => applyCurrentAspectRatio(props.active.setDraft, props.currentValue, 'short')}
        disabled={props.currentValue === 'custom'}
      >
        {translate('editor.compact.fitAspectByShortSide')}
      </button>
    </div>
  );
}

function applyResizeToolMode(props: ResizeToolSectionProps, mode: ResizeToolMode) {
  if (mode === 'image') {
    props.controller.resizeImage(props.imageSizeDraft.width, props.imageSizeDraft.height);
    return;
  }

  if (props.cropReady) {
    void fireAndReportEditorAction('inspector-apply-crop-selection', () =>
      props.controller.applyCropSelection()
    );
    return;
  }

  props.controller.resizeCanvas(props.canvasSizeDraft.width, props.canvasSizeDraft.height);
  props.controller.clearCanvasSizePreview();
}
