import { isEditorRasterEffectId } from '../../controller/layer-effects/registry';
import { cx } from '../../chrome/ui';
import { translateLayerEffectName, translateLayerEffects } from './helpers';
import type { EditorInspectorLayerEffectsProps } from './types';
import type { getLayerEffectDefinitions } from './helpers';

const CATALOG_ITEM_ACTIVE_CLASS_NAME =
  'border-[color:var(--sniptale-color-border-accent-strong)] ' +
  'bg-[color:var(--sniptale-color-accent-soft)]';
const CATALOG_ITEM_IDLE_CLASS_NAME =
  'border-[color:var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_78%,transparent)] ' +
  'hover:bg-[color:var(--sniptale-color-surface-hover)]';

function hasAppliedEffect(
  definition: ReturnType<typeof getLayerEffectDefinitions>[number],
  layerEffects: EditorInspectorLayerEffectsProps['layers'][number]['effects']
) {
  return (
    isEditorRasterEffectId(definition.id) &&
    layerEffects.some((effect) => effect.id === definition.id)
  );
}

function sortCatalogDefinitions(
  definitions: ReturnType<typeof getLayerEffectDefinitions>,
  layerEffects: EditorInspectorLayerEffectsProps['layers'][number]['effects']
) {
  return [...definitions].sort((left, right) => {
    const leftApplied = hasAppliedEffect(left, layerEffects);
    const rightApplied = hasAppliedEffect(right, layerEffects);

    if (leftApplied !== rightApplied) {
      return leftApplied ? -1 : 1;
    }

    return translateLayerEffectName(left.titleKey).localeCompare(
      translateLayerEffectName(right.titleKey),
      'ru',
      { sensitivity: 'base' }
    );
  });
}

function LayerEffectsCatalogItem(props: {
  activeEffectId: string | null;
  definition: ReturnType<typeof getLayerEffectDefinitions>[number];
  layerEffects: EditorInspectorLayerEffectsProps['layers'][number]['effects'];
  layerId: string;
  onOpenLayerEffects: EditorInspectorLayerEffectsProps['onOpenLayerEffects'];
}) {
  const applied = hasAppliedEffect(props.definition, props.layerEffects);

  return (
    <button
      type="button"
      onClick={() =>
        props.onOpenLayerEffects(props.layerId, props.definition.category, props.definition.id, {
          focusViewport: false,
        })
      }
      className={cx(
        'flex items-center justify-between gap-2 rounded-[12px] border px-2.5 py-2 text-left',
        'transition',
        props.activeEffectId === props.definition.id
          ? CATALOG_ITEM_ACTIVE_CLASS_NAME
          : CATALOG_ITEM_IDLE_CLASS_NAME
      )}
    >
      <span className="min-w-0 truncate text-sm font-medium">
        {translateLayerEffectName(props.definition.titleKey)}
      </span>
      {applied ? (
        <span className="text-xs font-semibold uppercase text-[color:var(--sniptale-color-text-muted-strong)]">
          {translateLayerEffects('editor.toolbar.layerEffectsAppliedShort')}
        </span>
      ) : null}
    </button>
  );
}

export function LayerEffectsCatalog(props: {
  activeEffectId: string | null;
  definitions: ReturnType<typeof getLayerEffectDefinitions>;
  layerId: string;
  layerEffects: EditorInspectorLayerEffectsProps['layers'][number]['effects'];
  onOpenLayerEffects: EditorInspectorLayerEffectsProps['onOpenLayerEffects'];
}) {
  const definitions = sortCatalogDefinitions(props.definitions, props.layerEffects);

  return (
    <div className="grid max-h-[220px] gap-1.5 overflow-y-auto pr-1">
      {definitions.length > 0 ? (
        definitions.map((definition) => (
          <LayerEffectsCatalogItem
            key={definition.id}
            activeEffectId={props.activeEffectId}
            definition={definition}
            layerEffects={props.layerEffects}
            layerId={props.layerId}
            onOpenLayerEffects={props.onOpenLayerEffects}
          />
        ))
      ) : (
        <p className="text-sm text-[color:var(--sniptale-color-text-secondary)]">
          {translateLayerEffects('editor.toolbar.layerEffectsNoMatches')}
        </p>
      )}
    </div>
  );
}
