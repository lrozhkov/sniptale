import React from 'react';
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import type { EditorRasterEffect } from '../../../features/editor/document/effects';
import {
  createDefaultEditorRasterEffect,
  isEditorRasterEffectId,
  type EditorLayerEffectCommandId,
  type EditorLayerTransformationId,
} from '../../controller/layer-effects/registry';
import { EditorIconButton } from '../../chrome/ui';
import { INSPECTOR_PRIMARY_BUTTON_CLASS_NAME } from '../chrome';
import { PanelSection } from '../tools/sections';
import { EditorRasterEffectForm } from './form';
import { translateLayerEffectName, translateLayerEffects } from './helpers';
import { ResizeTransformationControls } from './resize-controls';
import { getAppliedRasterEffect, isAppliedRasterEffect } from './shared';
import type { EditorInspectorLayerEffectsProps } from './types';

const TRANSFORMATION_ACTIONS: Array<{
  icon: React.ReactNode;
  id: EditorLayerTransformationId;
  titleKey: `editor.layerEffects.${string}`;
}> = [
  {
    icon: <FlipHorizontal2 size={15} strokeWidth={2} />,
    id: 'flip-horizontal',
    titleKey: 'editor.layerEffects.flipHorizontal',
  },
  {
    icon: <FlipVertical2 size={15} strokeWidth={2} />,
    id: 'flip-vertical',
    titleKey: 'editor.layerEffects.flipVertical',
  },
  {
    icon: <RotateCcw size={15} strokeWidth={2} />,
    id: 'rotate-left',
    titleKey: 'editor.layerEffects.rotateLeft',
  },
  {
    icon: <RotateCw size={15} strokeWidth={2} />,
    id: 'rotate-right',
    titleKey: 'editor.layerEffects.rotateRight',
  },
];

function LayerTransformationActions(props: {
  applyLayerTransformation: EditorInspectorLayerEffectsProps['applyLayerTransformation'];
  layerId: string;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      {TRANSFORMATION_ACTIONS.map((action) => (
        <EditorIconButton
          key={action.id}
          title={translateLayerEffectName(action.titleKey)}
          className="h-8 w-8"
          onClick={() => void props.applyLayerTransformation(props.layerId, action.id)}
        >
          {action.icon}
        </EditorIconButton>
      ))}
    </div>
  );
}

function TransformationEditor(
  props: Pick<
    EditorInspectorLayerEffectsProps,
    | 'applyLayerTransformation'
    | 'layerAspectRatio'
    | 'layerSizeDraft'
    | 'layerSizeLocked'
    | 'layerSizeText'
    | 'onResizeLayer'
    | 'setLayerSizeDraft'
    | 'setLayerSizeLocked'
    | 'updateLockedDraft'
  > & {
    layerId: string;
    showResizeControls: boolean;
  }
) {
  return (
    <>
      <LayerTransformationActions
        applyLayerTransformation={props.applyLayerTransformation}
        layerId={props.layerId}
      />
      {props.showResizeControls ? (
        <ResizeTransformationControls
          layerId={props.layerId}
          layerSizeText={props.layerSizeText}
          layerSizeDraft={props.layerSizeDraft}
          layerSizeLocked={props.layerSizeLocked}
          layerAspectRatio={props.layerAspectRatio}
          setLayerSizeDraft={props.setLayerSizeDraft}
          setLayerSizeLocked={props.setLayerSizeLocked}
          updateLockedDraft={props.updateLockedDraft}
          onResizeLayer={props.onResizeLayer}
        />
      ) : null}
    </>
  );
}

function RasterEffectEditor(props: {
  draftEffect: EditorRasterEffect;
  layer: EditorLayerItem;
  applyLayerEffect: EditorInspectorLayerEffectsProps['applyLayerEffect'];
  updateLayerEffect: EditorInspectorLayerEffectsProps['updateLayerEffect'];
  previewLayerEffect: EditorInspectorLayerEffectsProps['previewLayerEffect'];
  resetLayerEffectPreview: EditorInspectorLayerEffectsProps['resetLayerEffectPreview'];
  removeLayerEffect: EditorInspectorLayerEffectsProps['removeLayerEffect'];
  onChange: (effect: EditorRasterEffect) => void;
}) {
  return (
    <PanelSection
      label={translateLayerEffects('editor.toolbar.layerEffectsEditor')}
      value={translateLayerEffectName(`editor.layerEffects.${props.draftEffect.id}`)}
    >
      <div className="space-y-4">
        <EditorRasterEffectForm draftEffect={props.draftEffect} onChange={props.onChange} />
        <RasterEffectActions
          draftEffect={props.draftEffect}
          layer={props.layer}
          applyLayerEffect={props.applyLayerEffect}
          updateLayerEffect={props.updateLayerEffect}
          resetLayerEffectPreview={props.resetLayerEffectPreview}
          removeLayerEffect={props.removeLayerEffect}
        />
      </div>
    </PanelSection>
  );
}

function useDraftRasterEffect(
  activeEffectId: EditorLayerEffectCommandId | null,
  layer: EditorLayerItem
) {
  const appliedEffect =
    activeEffectId && isEditorRasterEffectId(activeEffectId)
      ? getAppliedRasterEffect(layer, activeEffectId)
      : null;
  const resolvedDraft =
    activeEffectId && isEditorRasterEffectId(activeEffectId)
      ? (appliedEffect ?? createDefaultEditorRasterEffect(activeEffectId))
      : null;
  const [draftEffect, setDraftEffect] = React.useState<EditorRasterEffect | null>(null);
  const appliedEffectSyncKey = appliedEffect ? JSON.stringify(appliedEffect) : null;
  const draftSyncKey = `${layer.id}:${activeEffectId ?? 'none'}:${appliedEffectSyncKey ?? 'draft'}`;
  const lastDraftSyncKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (lastDraftSyncKeyRef.current === draftSyncKey) {
      return;
    }

    lastDraftSyncKeyRef.current = draftSyncKey;
    setDraftEffect(resolvedDraft);
  }, [draftSyncKey, resolvedDraft]);

  return { draftEffect, setDraftEffect };
}

function RasterEffectActions(props: {
  draftEffect: EditorRasterEffect;
  layer: EditorLayerItem;
  applyLayerEffect: EditorInspectorLayerEffectsProps['applyLayerEffect'];
  updateLayerEffect: EditorInspectorLayerEffectsProps['updateLayerEffect'];
  resetLayerEffectPreview: EditorInspectorLayerEffectsProps['resetLayerEffectPreview'];
  removeLayerEffect: EditorInspectorLayerEffectsProps['removeLayerEffect'];
}) {
  const applied = isAppliedRasterEffect(props.layer, props.draftEffect.id);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={INSPECTOR_PRIMARY_BUTTON_CLASS_NAME}
        onClick={() => {
          props.resetLayerEffectPreview(props.layer.id);
          void (applied
            ? props.updateLayerEffect(props.layer.id, props.draftEffect)
            : props.applyLayerEffect(props.layer.id, props.draftEffect));
        }}
      >
        {translateLayerEffects(
          applied ? 'editor.toolbar.layerEffectsUpdate' : 'editor.toolbar.layerEffectsApply'
        )}
      </button>
      {applied ? (
        <EditorIconButton
          title={translateLayerEffects('editor.toolbar.layerEffectsRemove')}
          onClick={() => {
            props.resetLayerEffectPreview(props.layer.id);
            props.removeLayerEffect(props.layer.id, props.draftEffect.id);
          }}
          danger
          className="h-8 w-8"
        >
          <Trash2 size={14} strokeWidth={2} />
        </EditorIconButton>
      ) : null}
    </div>
  );
}

type LayerEffectsEditorProps = Pick<
  EditorInspectorLayerEffectsProps,
  | 'applyLayerEffect'
  | 'applyLayerTransformation'
  | 'layerEffectsState'
  | 'layerAspectRatio'
  | 'layerSizeDraft'
  | 'layerSizeLocked'
  | 'layerSizeText'
  | 'onResizeLayer'
  | 'previewLayerEffect'
  | 'removeLayerEffect'
  | 'resetLayerEffectPreview'
  | 'setLayerSizeDraft'
  | 'setLayerSizeLocked'
  | 'updateLayerEffect'
  | 'updateLockedDraft'
> & {
  activeEffectId: EditorLayerEffectCommandId | null;
  layer: EditorLayerItem;
};

function useLayerEffectPreview(
  props: LayerEffectsEditorProps,
  draftEffect: EditorRasterEffect | null
) {
  const layerId = props.layer.id;
  const layerEffectsCategory = props.layerEffectsState.category;
  const { previewLayerEffect, resetLayerEffectPreview } = props;

  React.useEffect(() => {
    if (draftEffect && layerEffectsCategory !== 'transformations') {
      previewLayerEffect(layerId, draftEffect);
    }

    return () => resetLayerEffectPreview(layerId);
  }, [draftEffect, layerEffectsCategory, layerId, previewLayerEffect, resetLayerEffectPreview]);
}

export function LayerEffectsEditor(props: LayerEffectsEditorProps) {
  const { draftEffect, setDraftEffect } = useDraftRasterEffect(props.activeEffectId, props.layer);
  useLayerEffectPreview(props, draftEffect);

  if (props.layerEffectsState.category === 'transformations') {
    return (
      <TransformationEditor
        applyLayerTransformation={props.applyLayerTransformation}
        layerAspectRatio={props.layerAspectRatio}
        layerId={props.layer.id}
        layerSizeDraft={props.layerSizeDraft}
        layerSizeLocked={props.layerSizeLocked}
        layerSizeText={props.layerSizeText}
        onResizeLayer={props.onResizeLayer}
        setLayerSizeDraft={props.setLayerSizeDraft}
        setLayerSizeLocked={props.setLayerSizeLocked}
        showResizeControls
        updateLockedDraft={props.updateLockedDraft}
      />
    );
  }

  if (!props.activeEffectId) {
    return null;
  }

  if (!draftEffect) {
    return null;
  }

  return (
    <RasterEffectEditor
      draftEffect={draftEffect}
      layer={props.layer}
      applyLayerEffect={props.applyLayerEffect}
      updateLayerEffect={props.updateLayerEffect}
      previewLayerEffect={props.previewLayerEffect}
      resetLayerEffectPreview={props.resetLayerEffectPreview}
      removeLayerEffect={props.removeLayerEffect}
      onChange={setDraftEffect}
    />
  );
}
