import type {
  EditorInspectorLayerEffectActions,
  EditorInspectorLayerEffectSizeControls,
} from './types';

type LayerEffectControlProps = EditorInspectorLayerEffectActions &
  EditorInspectorLayerEffectSizeControls;
type LayerEffectEditorControlProps = Omit<LayerEffectControlProps, 'onOpenLayerEffects'>;

export function pickLayerEffectEditorControlProps<TProps extends LayerEffectControlProps>(
  props: TProps
): LayerEffectEditorControlProps {
  return {
    applyLayerEffect: props.applyLayerEffect,
    updateLayerEffect: props.updateLayerEffect,
    previewLayerEffect: props.previewLayerEffect,
    resetLayerEffectPreview: props.resetLayerEffectPreview,
    removeLayerEffect: props.removeLayerEffect,
    applyLayerTransformation: props.applyLayerTransformation,
    layerSizeText: props.layerSizeText,
    layerSizeDraft: props.layerSizeDraft,
    layerSizeLocked: props.layerSizeLocked,
    layerAspectRatio: props.layerAspectRatio,
    setLayerSizeDraft: props.setLayerSizeDraft,
    setLayerSizeLocked: props.setLayerSizeLocked,
    updateLockedDraft: props.updateLockedDraft,
    onResizeLayer: props.onResizeLayer,
  };
}

export function pickLayerEffectControlProps<TProps extends LayerEffectControlProps>(
  props: TProps
): LayerEffectControlProps {
  return {
    ...pickLayerEffectEditorControlProps(props),
    onOpenLayerEffects: props.onOpenLayerEffects,
  };
}
