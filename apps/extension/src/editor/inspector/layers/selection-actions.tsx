import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Copy, Layers3, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { EditorIconButton } from '../../chrome/ui';
import {
  canDeleteLayerSelection,
  canDuplicateLayerSelection,
  canMergeLayerSelection,
  canReorderLayerSelection,
  getLayerActionTitle,
} from './helpers';

interface LayerSelectionAction {
  danger?: true;
  enabled: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

const actionButtonClassName = 'h-8 w-8';
const actionGroupClassName = 'flex items-center gap-1';
const massActionGroupClassName =
  'flex items-center gap-1 border-l border-[color:var(--sniptale-color-border-soft)] pl-2';

function buildReorderActions(
  controller: ReturnType<typeof useEditorController>,
  layers: EditorLayerItem[]
): LayerSelectionAction[] {
  const canReorder = canReorderLayerSelection(layers);

  return [
    {
      enabled: canReorder,
      icon: ChevronsUp,
      label: translate('editor.toolbar.frontLayer'),
      onClick: () => controller.bringSelectionToFront(),
    },
    {
      enabled: canReorder,
      icon: ArrowUp,
      label: translate('editor.toolbar.raiseSelection'),
      onClick: () => controller.bringForwardSelection(),
    },
    {
      enabled: canReorder,
      icon: ArrowDown,
      label: translate('editor.toolbar.lowerSelection'),
      onClick: () => controller.sendBackwardSelection(),
    },
    {
      enabled: canReorder,
      icon: ChevronsDown,
      label: translate('editor.toolbar.backLayer'),
      onClick: () => controller.sendSelectionToBack(),
    },
  ];
}

function buildMassActions(
  controller: ReturnType<typeof useEditorController>,
  layers: EditorLayerItem[]
): LayerSelectionAction[] {
  return [
    {
      enabled: canMergeLayerSelection(layers),
      icon: Layers3,
      label: translate('editor.toolbar.mergeLayers'),
      onClick: () => void controller.mergeSelectedLayers(),
    },
    {
      enabled: canDuplicateLayerSelection(layers),
      icon: Copy,
      label: translate('editor.toolbar.duplicateLayer'),
      onClick: () => void controller.duplicateSelection(),
    },
    {
      danger: true,
      enabled: canDeleteLayerSelection(layers),
      icon: Trash2,
      label: translate('editor.toolbar.deleteLayer'),
      onClick: () => controller.deleteSelection(),
    },
  ];
}

function LayerSelectionActionGroup(props: {
  actions: LayerSelectionAction[];
  className: string;
  dataUi: string;
}) {
  return (
    <div data-ui={props.dataUi} className={props.className}>
      {props.actions.map((action) => (
        <EditorIconButton
          key={action.label}
          title={getLayerActionTitle(action)}
          onClick={action.onClick}
          className={actionButtonClassName}
          disabled={!action.enabled}
          {...(action.danger === undefined ? {} : { danger: action.danger })}
        >
          <action.icon size={14} strokeWidth={2} />
        </EditorIconButton>
      ))}
    </div>
  );
}

export function LayerSelectionActions(props: {
  layers: EditorLayerItem[];
  selectedObjectCount: number;
}) {
  const controller = useEditorController();
  const reorderActions = buildReorderActions(controller, props.layers);
  const massActions = buildMassActions(controller, props.layers);

  return (
    <div className="border-b border-[color:var(--sniptale-color-border-soft)] px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <LayerSelectionActionGroup
          actions={reorderActions}
          className={actionGroupClassName}
          dataUi="editor.layers.selection-actions.reorder-group"
        />
        <LayerSelectionActionGroup
          actions={massActions}
          className={massActionGroupClassName}
          dataUi="editor.layers.selection-actions.mass-group"
        />
      </div>
    </div>
  );
}
