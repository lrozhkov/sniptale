import type { EditorLayerItem } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';

function getSelectedLayers(layers: EditorLayerItem[]) {
  return layers.filter((layer) => layer.selected);
}

function canMutateSelectedLayers(layers: EditorLayerItem[]) {
  const selectedLayers = getSelectedLayers(layers);
  return (
    selectedLayers.length > 0 && selectedLayers.every((layer) => !layer.locked && !layer.immutable)
  );
}

export function canReorderLayerSelection(layers: EditorLayerItem[]) {
  return canMutateSelectedLayers(layers);
}

export function canMergeLayerSelection(layers: EditorLayerItem[]) {
  const selectedLayers = getSelectedLayers(layers);
  return selectedLayers.length >= 2 && selectedLayers.every((layer) => !layer.locked);
}

export function canDuplicateLayerSelection(layers: EditorLayerItem[]) {
  const selectedLayers = getSelectedLayers(layers);
  return (
    selectedLayers.length > 0 &&
    selectedLayers.every((layer) => !layer.locked) &&
    selectedLayers.some((layer) => !layer.immutable || layer.type === 'source-image')
  );
}

export function canDeleteLayerSelection(layers: EditorLayerItem[]) {
  const selectedLayers = getSelectedLayers(layers);
  return (
    selectedLayers.length > 0 &&
    selectedLayers.every((layer) => !layer.locked) &&
    selectedLayers.some((layer) => !layer.immutable)
  );
}

export function getLayerActionTitle(params: { enabled: boolean; label: string }): string {
  return params.enabled
    ? params.label
    : `${params.label} · ${translate('editor.toolbar.layerSelectionRequiredReason')}`;
}
