import React from 'react';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import type { EditorLayerEffectCategory } from '../../../features/editor/document/effects';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import type { EditorLayerEffectCommandId } from '../../controller/layer-effects/registry';
import { TablerIcon } from '../compact/tabler-icon';
import { EditorIconButton, cx } from '../../chrome/ui';
import { LayerMutationButtons } from './mutation-buttons';
import type { EditorLayerEffectsOpenHandler } from './types';

const LAYER_ACTION_BUTTON_CLASS_NAME = 'h-[26px] w-[26px] shrink-0';
const expandedActionsClassName =
  'pointer-events-none absolute inset-y-0 right-0 z-10 min-w-0 max-w-full';
const expandedActionsLabelClassName =
  'pointer-events-none absolute right-1.5 top-1/2 max-w-full -translate-y-[calc(100%+3px)] ' +
  'truncate text-right text-[9px] font-medium leading-[10px] ' +
  'text-[color:var(--sniptale-color-text-muted)]';
const expandedActionsRowClassName =
  'pointer-events-auto absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5';
const DEFAULT_LAYER_EFFECT_BUTTON_TARGETS: Record<
  EditorLayerEffectCategory,
  EditorLayerEffectCommandId | null
> = {
  adjustments: 'brightness',
  transformations: null,
  filters: 'blur',
};

function LayerEffectIconButton(props: {
  activeEffectId?: EditorLayerEffectCommandId | null;
  autoNavigateSelectedLayer: boolean;
  category: EditorLayerEffectCategory;
  dataUi: string;
  disabled: boolean;
  icon: React.ReactNode;
  title: string;
  layerId: string;
  onOpenLayerEffects: EditorLayerEffectsOpenHandler;
}) {
  return (
    <EditorIconButton
      title={props.title}
      data-ui={props.dataUi}
      className={LAYER_ACTION_BUTTON_CLASS_NAME}
      disabled={props.disabled}
      onClick={() =>
        props.onOpenLayerEffects(
          props.layerId,
          props.category,
          props.activeEffectId ?? DEFAULT_LAYER_EFFECT_BUTTON_TARGETS[props.category],
          { focusViewport: props.autoNavigateSelectedLayer }
        )
      }
    >
      {props.icon}
    </EditorIconButton>
  );
}

function LayerEffectButtons(props: {
  autoNavigateSelectedLayer: boolean;
  disabled: boolean;
  layerId: string;
  onOpenLayerEffects: EditorLayerEffectsOpenHandler;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <LayerEffectIconButton
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
        layerId={props.layerId}
        category="adjustments"
        dataUi="editor.layers.effects-adjustments"
        disabled={props.disabled}
        icon={<TablerIcon icon="tabler:contrast-filled" size={13} />}
        title={translate('editor.toolbar.layerEffectsAdjustments')}
        onOpenLayerEffects={props.onOpenLayerEffects}
      />
      <LayerEffectIconButton
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
        layerId={props.layerId}
        category="transformations"
        dataUi="editor.layers.effects-transformations"
        disabled={props.disabled}
        icon={<TablerIcon icon="tabler:resize" size={13} />}
        title={translate('editor.toolbar.layerEffectsTransformations')}
        onOpenLayerEffects={props.onOpenLayerEffects}
      />
      <LayerEffectIconButton
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
        layerId={props.layerId}
        category="filters"
        dataUi="editor.layers.effects-filters"
        disabled={props.disabled}
        icon={<TablerIcon icon="tabler:color-filter" size={13} />}
        title={translate('editor.toolbar.layerEffectsFilters')}
        onOpenLayerEffects={props.onOpenLayerEffects}
      />
    </div>
  );
}

function LayerVisibilityButton(props: {
  disabled: boolean;
  layer: EditorLayerItem;
  onToggle: () => void;
}) {
  return (
    <EditorIconButton
      title={
        props.layer.visible
          ? translate('editor.toolbar.hideLayer')
          : translate('editor.toolbar.showLayer')
      }
      onClick={props.onToggle}
      active={props.layer.visible}
      disabled={props.disabled}
      className={LAYER_ACTION_BUTTON_CLASS_NAME}
    >
      {props.layer.visible ? (
        <Eye size={13} strokeWidth={2} />
      ) : (
        <EyeOff size={13} strokeWidth={2} />
      )}
    </EditorIconButton>
  );
}

function LayerLockButton(props: { disabled: boolean; locked: boolean; onToggle: () => void }) {
  return (
    <EditorIconButton
      title={
        props.locked
          ? translate('editor.toolbar.unlockLayer')
          : translate('editor.toolbar.lockLayer')
      }
      onClick={props.onToggle}
      active={props.locked}
      disabled={props.disabled}
      className={LAYER_ACTION_BUTTON_CLASS_NAME}
    >
      {props.locked ? <Lock size={13} strokeWidth={2} /> : <Unlock size={13} strokeWidth={2} />}
    </EditorIconButton>
  );
}

export function LayerActionRail(props: { layer: EditorLayerItem }) {
  const controller = useEditorController();

  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <LayerVisibilityButton
        disabled={props.layer.locked}
        layer={props.layer}
        onToggle={() => controller.toggleLayerVisibility(props.layer.id)}
      />
      <LayerLockButton
        disabled={false}
        locked={props.layer.locked}
        onToggle={() => controller.toggleLayerLock(props.layer.id)}
      />
    </div>
  );
}

export function LayerExpandedActions(props: {
  autoNavigateSelectedLayer: boolean;
  editingName: boolean;
  isImmutable: boolean;
  layer: EditorLayerItem;
  visible: boolean;
  onRenameLayer: () => void;
  onOpenLayerEffects: EditorLayerEffectsOpenHandler;
}) {
  if (props.editingName) {
    return null;
  }

  const locked = props.layer.locked;

  return (
    <div
      data-ui="editor.layers.expanded-actions"
      className={cx(expandedActionsClassName, !props.visible && 'hidden')}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <span data-ui="editor.layers.expanded-label" className={expandedActionsLabelClassName}>
        {props.layer.name}
      </span>
      <div data-ui="editor.layers.expanded-actions-row" className={expandedActionsRowClassName}>
        <LayerEffectButtons
          autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
          disabled={locked}
          layerId={props.layer.id}
          onOpenLayerEffects={props.onOpenLayerEffects}
        />
        <LayerMutationButtons
          autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
          canDelete={!locked && !props.isImmutable}
          canDuplicate={!locked && (!props.isImmutable || props.layer.type === 'source-image')}
          canRename={!locked}
          layerId={props.layer.id}
          onRenameLayer={props.onRenameLayer}
        />
      </div>
    </div>
  );
}
