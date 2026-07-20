import React from 'react';
import { PanelSection } from '../tools/sections';
import { LayerEffectsCatalog } from './catalog';
import { LayerEffectsEditor } from './effect-editor';
import { LayerEffectsHeader } from './header';
import {
  getLayerEffectDefinitions,
  resolveLayerEffectsActiveLayer,
  translateLayerEffects,
} from './helpers';
import { pickLayerEffectEditorControlProps } from './props';
import type { EditorInspectorLayerEffectsProps } from './types';

function LayerEffectsEmptyState() {
  return (
    <PanelSection
      label={translateLayerEffects('editor.toolbar.layerEffectsTitle')}
      value={translateLayerEffects('editor.toolbar.noLayers')}
    >
      <p className="text-sm text-[color:var(--sniptale-color-text-secondary)]">
        {translateLayerEffects('editor.toolbar.layerEffectsSelectLayer')}
      </p>
    </PanelSection>
  );
}

type LayerEffectsBodyProps = EditorInspectorLayerEffectsProps & {
  activeLayer: NonNullable<ReturnType<typeof resolveLayerEffectsActiveLayer>>;
};

function LayerEffectsPanels(
  props: LayerEffectsBodyProps & {
    definitions: ReturnType<typeof getLayerEffectDefinitions>;
  }
) {
  return (
    <>
      {props.layerEffectsState.category === 'transformations' ? null : (
        <LayerEffectsCatalog
          activeEffectId={props.layerEffectsState.activeEffectId}
          definitions={props.definitions}
          layerId={props.activeLayer.id}
          layerEffects={props.activeLayer.effects}
          onOpenLayerEffects={props.onOpenLayerEffects}
        />
      )}
      <LayerEffectsEditor
        activeEffectId={props.layerEffectsState.activeEffectId}
        layer={props.activeLayer}
        layerEffectsState={props.layerEffectsState}
        {...pickLayerEffectEditorControlProps(props)}
      />
    </>
  );
}

function LayerEffectsBody(props: LayerEffectsBodyProps) {
  const definitions = getLayerEffectDefinitions(
    props.layerEffectsState.category,
    props.layerEffectsState.query
  );
  const setQuery = (query: string) => props.setLayerEffectsState((state) => ({ ...state, query }));

  return (
    <div className="space-y-4">
      <LayerEffectsHeader
        category={props.layerEffectsState.category}
        query={props.layerEffectsState.query}
        setQuery={setQuery}
      />
      <LayerEffectsPanels {...props} definitions={definitions} />
    </div>
  );
}

export const EditorInspectorLayerEffectsPanel: React.FC<EditorInspectorLayerEffectsProps> = (
  props
) => {
  const activeLayer = resolveLayerEffectsActiveLayer(
    props.layers,
    props.selection,
    props.layerEffectsState.layerId
  );

  return activeLayer ? (
    <LayerEffectsBody {...props} activeLayer={activeLayer} />
  ) : (
    <LayerEffectsEmptyState />
  );
};
