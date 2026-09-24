import React from 'react';
import { translate } from '../../../platform/i18n';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import type { ImageEditorController } from '../../controller';
import { SelectField } from '../../chrome/ui';
import {
  applySelectedAspectRatio,
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
  INSPECTOR_SECONDARY_BUTTON_CLASS_NAME,
  INSPECTOR_SECTION_SURFACE_CLASS_NAME,
} from '../chrome';
import { SizeControlsRow } from '../size-controls';
import { useEditorStore } from '../../state/useEditorStore';

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
    | 'cancelCropMode'
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
  mode: ResizeToolMode;
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

const CROP_MODE_BUTTON_CLASS = [
  'rounded-md px-2 py-1.5 text-xs',
  'focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-focus-ring)]',
].join(' ');

function CanvasCropModeSwitch(props: {
  mode: 'crop' | 'expand';
  onSelect: (mode: 'crop' | 'expand') => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--sniptale-color-surface-hover)] p-1">
      {(['crop', 'expand'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={props.mode === mode}
          data-ui={`editor.canvas-size.mode.${mode}`}
          className={[
            CROP_MODE_BUTTON_CLASS,
            props.mode === mode
              ? [
                  'bg-[var(--sniptale-color-surface-panel)] font-medium shadow-sm',
                  'text-[var(--sniptale-color-text-primary)]',
                ].join(' ')
              : [
                  'text-[var(--sniptale-color-text-secondary)]',
                  'hover:bg-[var(--sniptale-color-surface-panel)]',
                ].join(' '),
          ].join(' ')}
          onClick={() => props.onSelect(mode)}
        >
          {translate(
            mode === 'crop' ? 'editor.compact.cropWithinCanvas' : 'editor.compact.expandCanvas'
          )}
        </button>
      ))}
    </div>
  );
}

function isSameSize(left: SizeDraft, right: SizeDraft | null): boolean {
  return Boolean(right && left.width === right.width && left.height === right.height);
}

function isValidSize(size: SizeDraft): boolean {
  return (
    Number.isInteger(size.width) &&
    Number.isInteger(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

function parseSizeText(value: string): SizeDraft | null {
  const match = value.match(/^\s*(\d+)\s*[×x]\s*(\d+)\s*$/u);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function EditorInspectorResizeToolSection(props: ResizeToolSectionProps) {
  const canvasCropMode = useEditorStore((state) => state.canvasCropMode);
  const setCanvasCropMode = useEditorStore((state) => state.setCanvasCropMode);
  const mode = props.mode;
  const isCanvasMode = mode === 'canvas';
  const active = selectActiveResizeState(props, mode);
  const canvasSizeMatchesDraft = isSameSize(props.canvasSizeDraft, props.canvasSize);
  const imageSizeMatchesDraft = isSameSize(
    props.imageSizeDraft,
    parseSizeText(props.imageSizeText)
  );
  const cropSelectionMatchesDraft = isSameSize(props.canvasSizeDraft, props.cropSelection ?? null);
  const activeSizeIsValid = isValidSize(active.draft);
  const cropSizeExceedsCanvas =
    isCanvasMode &&
    canvasCropMode === 'crop' &&
    (active.draft.width > props.canvasSize.width || active.draft.height > props.canvasSize.height);
  const expansionWouldShrink =
    isCanvasMode &&
    canvasCropMode === 'expand' &&
    (active.draft.width < props.canvasSize.width || active.draft.height < props.canvasSize.height);
  const applyDisabled =
    !activeSizeIsValid ||
    cropSizeExceedsCanvas ||
    expansionWouldShrink ||
    (isCanvasMode && canvasCropMode === 'expand' && canvasSizeMatchesDraft) ||
    (mode === 'canvas' ? canvasSizeMatchesDraft && !props.cropReady : imageSizeMatchesDraft);

  useCanvasResizePreview({
    canvasSizeDraft: props.canvasSizeDraft,
    canvasSizeMatchesDraft,
    controller: props.controller,
    cropSelection: props.cropSelection,
    cropSelectionMatchesDraft,
    isCanvasMode,
  });

  return (
    <div className="space-y-3">
      {isCanvasMode ? (
        <CanvasCropModeSwitch
          mode={canvasCropMode}
          onSelect={(cropMode) => {
            if (canvasCropMode === cropMode) return;
            setCanvasCropMode(cropMode);
            props.controller.clearCropSelection();
            props.setCanvasSizeDraft(props.canvasSize);
            if (cropMode === 'expand') {
              props.controller.previewCanvasSize(props.canvasSize.width, props.canvasSize.height);
            }
          }}
        />
      ) : null}
      {isCanvasMode ? (
        <p
          aria-live="polite"
          className="text-xs leading-5 text-[color:var(--sniptale-color-text-secondary)]"
        >
          {translate(
            canvasCropMode === 'expand'
              ? 'editor.compact.expandCanvasDescription'
              : props.cropReady
                ? 'editor.compact.cropReadyDescription'
                : 'editor.compact.cropWithinCanvasDescription'
          )}
        </p>
      ) : null}
      <ResizeToolSizePanel
        active={active}
        canvasSize={props.canvasSize}
        isCanvasMode={isCanvasMode}
        updateLockedDraft={props.updateLockedDraft}
      />
      {!activeSizeIsValid ? (
        <p role="alert" className="text-xs text-[color:var(--sniptale-color-danger)]">
          {translate('editor.compact.invalidImageDimensions')}
        </p>
      ) : null}
      {cropSizeExceedsCanvas ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('editor.compact.cropSizeExceedsCanvas')}
        </p>
      ) : null}
      <div className={isCanvasMode ? 'grid grid-cols-2 gap-2' : undefined}>
        {isCanvasMode ? (
          <button
            type="button"
            className={INSPECTOR_SECONDARY_BUTTON_CLASS_NAME}
            onClick={() => props.controller.cancelCropMode()}
          >
            {translate('common.actions.cancel')}
          </button>
        ) : null}
        <button
          type="button"
          className={INSPECTOR_PRIMARY_BUTTON_CLASS_NAME}
          disabled={applyDisabled}
          onClick={() => applyResizeToolMode(props, mode, canvasCropMode)}
        >
          {translate(
            mode === 'image'
              ? 'editor.compact.applyImageSize'
              : canvasCropMode === 'expand'
                ? 'editor.compact.applyExpandCanvas'
                : 'editor.compact.applyCropCanvas'
          )}
        </button>
      </div>
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

function ResizeToolSizePanel(props: {
  active: ActiveResizeState;
  canvasSize: SizeDraft;
  isCanvasMode: boolean;
  updateLockedDraft: ResizeToolSectionProps['updateLockedDraft'];
}) {
  const label = props.isCanvasMode
    ? translate('editor.compact.cropCanvas')
    : translate('editor.compact.imageSize');

  return (
    <section aria-label={label} className={INSPECTOR_SECTION_SURFACE_CLASS_NAME}>
      <div className="space-y-3">
        <ResizeToolDimensionRow active={props.active} updateLockedDraft={props.updateLockedDraft} />
        {props.isCanvasMode ? null : <ResizeToolSizePresetField active={props.active} />}
        <ResizeToolAspectRatioField
          active={props.active}
          bounds={props.isCanvasMode ? props.canvasSize : undefined}
        />
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
    props.updateLockedDraft(
      state,
      field,
      value,
      props.active.locked,
      state.width / Math.max(1, state.height)
    )
  );
}

function ResizeToolSizePresetField(props: { active: ActiveResizeState }) {
  const currentPresetValue = findPresetValue(props.active.draft) ?? 'custom';

  return (
    <div className="space-y-2">
      <SelectField
        label={translate('editor.compact.sizePreset')}
        value={currentPresetValue}
        onChange={(value) => applySizePreset(props.active.setDraft, value)}
        options={buildSizePresetOptions(currentPresetValue)}
      />
    </div>
  );
}

function ResizeToolAspectRatioField(props: {
  active: ActiveResizeState;
  bounds: SizeDraft | undefined;
}) {
  const currentValue = findAspectRatioValue(props.active.draft) ?? 'custom';

  return (
    <SelectField
      label={translate('editor.compact.aspectRatioPreset')}
      value={currentValue}
      onChange={(value) => applySelectedAspectRatio(props.active.setDraft, value, props.bounds)}
      options={buildAspectRatioOptions(currentValue)}
    />
  );
}

function applyResizeToolMode(
  props: ResizeToolSectionProps,
  mode: ResizeToolMode,
  canvasCropMode: 'crop' | 'expand'
) {
  if (mode === 'image') {
    props.controller.resizeImage(props.imageSizeDraft.width, props.imageSizeDraft.height);
    return;
  }

  if (canvasCropMode === 'expand' || props.cropReady) {
    void fireAndReportEditorAction('inspector-apply-crop-selection', () =>
      props.controller.applyCropSelection()
    );
    return;
  }

  props.controller.resizeCanvas(props.canvasSizeDraft.width, props.canvasSizeDraft.height);
  props.controller.clearCanvasSizePreview();
}
