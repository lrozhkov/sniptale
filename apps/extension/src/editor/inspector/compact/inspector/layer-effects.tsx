import { Sparkles } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { CompactCommandField, type CompactCommand } from '..';
import { EditorInspectorLayerEffectsPanel } from '../../layer-effects';
import type { InspectorCommandParams } from './command-types';

function getActiveLayerName(params: InspectorCommandParams): string {
  const activeLayer =
    (params.layerEffectsState.layerId
      ? params.layers.find((layer) => layer.id === params.layerEffectsState.layerId)
      : null) ??
    (params.selection.selectedObjectCount === 1 && params.selection.selectedObjectId
      ? params.layers.find((layer) => layer.id === params.selection.selectedObjectId)
      : null);

  return activeLayer?.name ?? translate('editor.toolbar.inspectorFallback');
}

export function buildLayerEffectsCompactCommands(params: InspectorCommandParams): CompactCommand[] {
  return [
    {
      id: 'layer-effects-browser',
      icon: 'preset',
      title: translate('editor.toolbar.layerEffectsTitle'),
      trigger: <Sparkles size={16} strokeWidth={2} />,
      value: getActiveLayerName(params),
      content: (
        <CompactCommandField
          label={translate('editor.toolbar.layerEffectsTitle')}
          value={getActiveLayerName(params)}
        >
          <EditorInspectorLayerEffectsPanel
            layers={params.layers}
            selection={params.selection}
            layerEffectsState={params.layerEffectsState}
            setLayerEffectsState={params.setLayerEffectsState}
            onOpenLayerEffects={params.onOpenLayerEffects}
            applyLayerEffect={params.applyLayerEffect}
            updateLayerEffect={params.updateLayerEffect}
            previewLayerEffect={params.previewLayerEffect}
            removeLayerEffect={params.removeLayerEffect}
            resetLayerEffectPreview={params.resetLayerEffectPreview}
            applyLayerTransformation={params.applyLayerTransformation}
            layerSizeText={params.layerSizeText}
            layerSizeDraft={params.layerSizeDraft}
            layerSizeLocked={params.layerSizeLocked}
            layerAspectRatio={params.layerAspectRatio}
            setLayerSizeDraft={params.setLayerSizeDraft}
            setLayerSizeLocked={params.setLayerSizeLocked}
            updateLockedDraft={params.updateLockedDraft}
            onResizeLayer={params.onResizeLayer}
          />
        </CompactCommandField>
      ),
    },
  ];
}
