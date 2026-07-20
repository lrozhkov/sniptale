import React from 'react';
import { Link2 } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { EditorIconButton, NumericValueField, cx } from '../../chrome/ui';
import { INSPECTOR_PRIMARY_BUTTON_CLASS_NAME } from '../chrome';
import { PanelSection } from '../tools/sections';
import { translateLayerEffects } from './helpers';
import type { EditorInspectorLayerEffectsProps } from './types';

function SizeField(props: {
  layerAspectRatio: number | null;
  layerSizeDraft: { width: number; height: number };
  layerSizeLocked: boolean;
  field: 'width' | 'height';
  setLayerSizeDraft: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  updateLockedDraft: EditorInspectorLayerEffectsProps['updateLockedDraft'];
}) {
  const commitDraftValue = (nextValue: number) => {
    props.setLayerSizeDraft((state) =>
      props.updateLockedDraft(
        state,
        props.field,
        nextValue,
        props.layerSizeLocked,
        props.layerAspectRatio
      )
    );
  };

  return (
    <NumericValueField
      label={translate(
        props.field === 'width' ? 'editor.compact.widthDimension' : 'editor.compact.heightDimension'
      )}
      min={1}
      value={props.layerSizeDraft[props.field]}
      step={1}
      precision={0}
      unit="px"
      onPreviewValue={commitDraftValue}
      onCommitValue={commitDraftValue}
      scrub={{ min: 1, max: 9999, step: 1 }}
      className="!w-auto min-w-0 flex-1"
    />
  );
}

function AspectRatioButton(props: {
  layerSizeLocked: boolean;
  setLayerSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <EditorIconButton
      title={translate('editor.compact.keepAspectRatio')}
      active={props.layerSizeLocked}
      className={cx('h-10 w-10 shrink-0', props.layerSizeLocked && 'shadow-none')}
      onClick={() => props.setLayerSizeLocked((state) => !state)}
    >
      <Link2 size={15} strokeWidth={2} />
    </EditorIconButton>
  );
}

function SizeInputRow(props: {
  layerAspectRatio: number | null;
  layerSizeDraft: { width: number; height: number };
  layerSizeLocked: boolean;
  setLayerSizeDraft: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  updateLockedDraft: EditorInspectorLayerEffectsProps['updateLockedDraft'];
  setLayerSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div className="flex items-center gap-2">
      <SizeField
        field="width"
        layerAspectRatio={props.layerAspectRatio}
        layerSizeDraft={props.layerSizeDraft}
        layerSizeLocked={props.layerSizeLocked}
        setLayerSizeDraft={props.setLayerSizeDraft}
        updateLockedDraft={props.updateLockedDraft}
      />
      <span className="shrink-0 text-sm text-[color:var(--sniptale-color-text-muted)]">×</span>
      <SizeField
        field="height"
        layerAspectRatio={props.layerAspectRatio}
        layerSizeDraft={props.layerSizeDraft}
        layerSizeLocked={props.layerSizeLocked}
        setLayerSizeDraft={props.setLayerSizeDraft}
        updateLockedDraft={props.updateLockedDraft}
      />
      <AspectRatioButton
        layerSizeLocked={props.layerSizeLocked}
        setLayerSizeLocked={props.setLayerSizeLocked}
      />
    </div>
  );
}

function ResizeApplyButton(props: {
  className: string;
  layerId: string;
  layerSizeDraft: { width: number; height: number };
  onResizeLayer: EditorInspectorLayerEffectsProps['onResizeLayer'];
}) {
  return (
    <button
      type="button"
      className={props.className}
      onClick={() =>
        props.onResizeLayer(props.layerId, props.layerSizeDraft.width, props.layerSizeDraft.height)
      }
    >
      {translateLayerEffects('editor.toolbar.layerEffectsApplyResize')}
    </button>
  );
}

export function ResizeTransformationControls(
  props: Pick<
    EditorInspectorLayerEffectsProps,
    | 'layerAspectRatio'
    | 'layerSizeDraft'
    | 'layerSizeLocked'
    | 'layerSizeText'
    | 'onResizeLayer'
    | 'setLayerSizeDraft'
    | 'setLayerSizeLocked'
    | 'updateLockedDraft'
  > & { layerId: string }
) {
  return (
    <PanelSection
      label={translateLayerEffects('editor.toolbar.layerEffectsResize')}
      value={props.layerSizeText}
    >
      <div className="space-y-3">
        <SizeInputRow
          layerAspectRatio={props.layerAspectRatio}
          layerSizeDraft={props.layerSizeDraft}
          layerSizeLocked={props.layerSizeLocked}
          setLayerSizeDraft={props.setLayerSizeDraft}
          setLayerSizeLocked={props.setLayerSizeLocked}
          updateLockedDraft={props.updateLockedDraft}
        />
        <ResizeApplyButton
          className={INSPECTOR_PRIMARY_BUTTON_CLASS_NAME}
          layerId={props.layerId}
          layerSizeDraft={props.layerSizeDraft}
          onResizeLayer={props.onResizeLayer}
        />
      </div>
    </PanelSection>
  );
}
