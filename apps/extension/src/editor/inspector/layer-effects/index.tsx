import React from 'react';
import { Contrast, Move, Sparkles } from 'lucide-react';
import { SegmentedSelector } from '../../chrome/ui';
import type { EditorLayerEffectCategory } from '../../../features/editor/document/effects';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { EmptyState, StatusRow } from '../../../ui/compact-inspector-controls';
import { EditorInspectorGroupSection } from '../grouped';
import { LayerEffectsCatalog } from './catalog';
import { LayerEffectsEditor } from './effect-editor';
import { LayerEffectsHeader } from './header';
import {
  getLayerEffectCategoryLabel,
  getLayerEffectDefinitions,
  isLayerEffectSearchable,
  resolveLayerEffectsActiveLayer,
  translateLayerEffects,
} from './helpers';
import { pickLayerEffectEditorControlProps } from './props';
import type { EditorInspectorLayerEffectsProps } from './types';

const LAYER_EFFECT_CATEGORIES: EditorLayerEffectCategory[] = [
  'adjustments',
  'transformations',
  'filters',
];

const EDITOR_INSPECTOR_SECTION_CLASS_NAME = 'py-3 first:pt-0 last:pb-0 focus:outline-none';

function LayerEffectsCategoryRow(props: {
  activeLayer: EditorLayerItem;
  layerEffectsState: EditorInspectorLayerEffectsProps['layerEffectsState'];
  onOpenLayerEffects: EditorInspectorLayerEffectsProps['onOpenLayerEffects'];
}) {
  return (
    <SegmentedSelector
      columns={3}
      ariaLabel={translate('editor.toolbar.layerEffectsTitle')}
      onChange={(category) =>
        props.onOpenLayerEffects(props.activeLayer.id, category, null, { focusViewport: false })
      }
      options={LAYER_EFFECT_CATEGORIES.map((category) => ({
        label: getLayerEffectCategoryLabel(category),
        icon:
          category === 'adjustments' ? (
            <Contrast size={16} />
          ) : category === 'transformations' ? (
            <Move size={16} />
          ) : (
            <Sparkles size={16} />
          ),
        value: category,
      }))}
      value={props.layerEffectsState.category}
    />
  );
}

function LayerEffectsLayerSection(
  props: Pick<EditorInspectorLayerEffectsProps, 'layerEffectsState' | 'onOpenLayerEffects'> & {
    activeLayer: EditorLayerItem;
  }
) {
  return (
    <section
      aria-label={translateLayerEffects('editor.layerEffects.selectedLayer')}
      className={EDITOR_INSPECTOR_SECTION_CLASS_NAME}
      data-section="layer"
      tabIndex={-1}
    >
      <EditorInspectorGroupSection>
        <StatusRow
          label={translateLayerEffects('editor.layerEffects.selectedLayer')}
          value={props.activeLayer.name}
        />
        <LayerEffectsCategoryRow
          activeLayer={props.activeLayer}
          layerEffectsState={props.layerEffectsState}
          onOpenLayerEffects={props.onOpenLayerEffects}
        />
      </EditorInspectorGroupSection>
    </section>
  );
}

function LayerEffectsEffectsSection(
  props: Pick<
    EditorInspectorLayerEffectsProps,
    'layerEffectsState' | 'onOpenLayerEffects' | 'setLayerEffectsState'
  > & { activeLayer: EditorLayerItem; editor: React.ReactNode }
) {
  const { category } = props.layerEffectsState;

  if (!isLayerEffectSearchable(category)) {
    return null;
  }

  return (
    <section
      aria-label={translateLayerEffects('editor.layerEffects.availableEffects')}
      className={EDITOR_INSPECTOR_SECTION_CLASS_NAME}
      data-section="effects"
      tabIndex={-1}
    >
      <LayerEffectsHeader
        category={category}
        query={props.layerEffectsState.query}
        setQuery={(query) => props.setLayerEffectsState((state) => ({ ...state, query }))}
      />
      <LayerEffectsCatalog
        activeEffectEditor={props.editor}
        activeEffectId={props.layerEffectsState.activeEffectId}
        definitions={getLayerEffectDefinitions(category, props.layerEffectsState.query)}
        layerEffects={props.activeLayer.effects}
        layerId={props.activeLayer.id}
        onOpenLayerEffects={props.onOpenLayerEffects}
      />
    </section>
  );
}

function LayerEffectsEmptyState() {
  return (
    <div data-ui="editor.inspector.sections">
      <section
        aria-label={translateLayerEffects('editor.toolbar.layerEffectsSelectLayer')}
        className={EDITOR_INSPECTOR_SECTION_CLASS_NAME}
        data-section="empty"
        tabIndex={-1}
      >
        <EmptyState>{translateLayerEffects('editor.toolbar.layerEffectsSelectLayer')}</EmptyState>
      </section>
    </div>
  );
}

function LayerEffectsBody(
  props: EditorInspectorLayerEffectsProps & { activeLayer: EditorLayerItem }
) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const previousEffect = React.useRef(props.layerEffectsState.activeEffectId);
  React.useEffect(() => {
    const activeEffect = props.layerEffectsState.activeEffectId;
    if (previousEffect.current === activeEffect) return;
    previousEffect.current = activeEffect;
    bodyRef.current
      ?.querySelector<HTMLElement>(
        activeEffect ? '[data-section="effect"]' : '[data-section="effects"]'
      )
      ?.focus();
  }, [props.layerEffectsState.activeEffectId]);

  return (
    <div
      ref={bodyRef}
      className="divide-y divide-[var(--sniptale-color-border-soft)]"
      data-ui="editor.inspector.sections"
    >
      <LayerEffectsLayerSection
        activeLayer={props.activeLayer}
        layerEffectsState={props.layerEffectsState}
        onOpenLayerEffects={props.onOpenLayerEffects}
      />
      <LayerEffectsEffectsSection
        activeLayer={props.activeLayer}
        layerEffectsState={props.layerEffectsState}
        onOpenLayerEffects={props.onOpenLayerEffects}
        setLayerEffectsState={props.setLayerEffectsState}
        editor={
          <LayerEffectsEditor
            {...pickLayerEffectEditorControlProps(props)}
            activeEffectId={props.layerEffectsState.activeEffectId}
            layer={props.activeLayer}
            layerEffectsState={props.layerEffectsState}
            selection={props.selection}
          />
        }
      />
      {props.layerEffectsState.category === 'transformations' ? (
        <LayerEffectsEditor
          {...pickLayerEffectEditorControlProps(props)}
          activeEffectId={props.layerEffectsState.activeEffectId}
          layer={props.activeLayer}
          layerEffectsState={props.layerEffectsState}
          selection={props.selection}
        />
      ) : null}
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
