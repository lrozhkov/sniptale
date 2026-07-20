import type React from 'react';
import {
  ArrowDownToLine,
  ArrowDownUp,
  ArrowUpFromLine,
  Copy,
  Layers,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { EditorLayerEffectCategory } from '../../../features/editor/document/effects';
import type { EditorLayerEffectCommandId } from '../../controller/layer-effects/registry';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import type { EditorFloatingDocumentController } from './document-bar';
import {
  CANVAS_TOOLBAR_GROUP_TITLES,
  CANVAS_TOOLBAR_GROUP_WIDTHS,
  type FloatingToolbarGroup,
  getCanvasToolbarGroupTrigger,
} from './canvas-toolbar-model';

export interface CanvasToolbarActionHandlers {
  arrangeSelection: EditorFloatingDocumentController['arrangeSelection'];
  deleteSelection: () => void;
  duplicateSelection: () => Promise<void> | void;
  toggleLayerLock: (layerId: string) => void;
  openLayerEffects: (
    layerId: string,
    category: EditorLayerEffectCategory,
    activeEffectId: EditorLayerEffectCommandId | null
  ) => void;
}

function MenuAction(props: {
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  onClick: () => Promise<void> | void;
}) {
  return (
    <button
      type="button"
      className={[
        'flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left text-sm transition',
        props.danger
          ? 'text-[var(--sniptale-color-danger-text)] hover:bg-[var(--sniptale-color-danger-soft)]'
          : 'text-[var(--sniptale-color-text-primary)] hover:bg-[var(--sniptale-color-surface-hover)]',
        'disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent',
      ].join(' ')}
      disabled={props.disabled}
      onClick={() => {
        void props.onClick();
      }}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center">{props.icon}</span>
      <span className="min-w-0 truncate">{props.children}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-[var(--sniptale-color-border-soft)]" />;
}

function SelectionMutationMenu(args: {
  canMutateSelection: boolean;
  canDeleteSelection: boolean;
  handlers: CanvasToolbarActionHandlers;
}) {
  return (
    <>
      <MenuAction
        icon={<Copy size={15} strokeWidth={2} />}
        disabled={!args.canMutateSelection}
        onClick={args.handlers.duplicateSelection}
      >
        {translate('editor.toolbar.duplicateSelection')}
      </MenuAction>
      <MenuAction
        icon={<Trash2 size={15} strokeWidth={2} />}
        danger
        disabled={!args.canDeleteSelection}
        onClick={args.handlers.deleteSelection}
      >
        {translate('editor.toolbar.deleteSelection')}
      </MenuAction>
    </>
  );
}

function ArrangeMenu(args: { canMutateSelection: boolean; handlers: CanvasToolbarActionHandlers }) {
  return (
    <>
      <MenuAction
        icon={<ArrowUpFromLine size={15} strokeWidth={2} />}
        disabled={!args.canMutateSelection}
        onClick={() => args.handlers.arrangeSelection('forward')}
      >
        {translate('editor.toolbar.forwardLayer')}
      </MenuAction>
      <MenuAction
        icon={<ArrowDownToLine size={15} strokeWidth={2} />}
        disabled={!args.canMutateSelection}
        onClick={() => args.handlers.arrangeSelection('backward')}
      >
        {translate('editor.toolbar.backwardLayer')}
      </MenuAction>
      <MenuAction
        icon={<Layers size={15} strokeWidth={2} />}
        disabled={!args.canMutateSelection}
        onClick={() => args.handlers.arrangeSelection('front')}
      >
        {translate('editor.toolbar.frontLayer')}
      </MenuAction>
      <MenuAction
        icon={<ArrowDownUp size={15} strokeWidth={2} />}
        disabled={!args.canMutateSelection}
        onClick={() => args.handlers.arrangeSelection('back')}
      >
        {translate('editor.toolbar.backLayer')}
      </MenuAction>
    </>
  );
}

function LayerEffectsMenu(args: {
  disabled?: boolean;
  selectedLayerId: string | null;
  handlers: CanvasToolbarActionHandlers;
}) {
  const openLayerEffects = (
    category: EditorLayerEffectCategory,
    activeEffectId: EditorLayerEffectCommandId | null
  ) => {
    if (!args.selectedLayerId) {
      return;
    }

    args.handlers.openLayerEffects(args.selectedLayerId, category, activeEffectId);
  };

  return (
    <>
      <MenuAction
        icon={<TablerIcon icon="tabler:contrast-filled" />}
        disabled={args.disabled || !args.selectedLayerId}
        onClick={() => openLayerEffects('adjustments', 'brightness')}
      >
        {translate('editor.toolbar.layerEffectsAdjustments')}
      </MenuAction>
      <MenuAction
        icon={<TablerIcon icon="tabler:resize" />}
        disabled={args.disabled || !args.selectedLayerId}
        onClick={() => openLayerEffects('transformations', null)}
      >
        {translate('editor.toolbar.layerEffectsTransformations')}
      </MenuAction>
      <MenuAction
        icon={<TablerIcon icon="tabler:color-filter" />}
        disabled={args.disabled || !args.selectedLayerId}
        onClick={() => openLayerEffects('filters', 'blur')}
      >
        {translate('editor.toolbar.layerEffectsFilters')}
      </MenuAction>
    </>
  );
}

export function buildCanvasToolbarMoreContent(args: {
  documentController: EditorFloatingDocumentController;
  hasEffectsGroup: boolean;
  handlers: CanvasToolbarActionHandlers;
  selection: EditorToolbarSelectionState;
}) {
  const selectedLayerId = args.selection.selectedObjectId ?? null;
  const sourceImageSelected = args.selection.selectedObjectType === 'source-image';
  const selectionLocked = Boolean(args.selection.selectedObjectLocked);
  const canMutateSelection =
    args.selection.hasSelection && !sourceImageSelected && !selectionLocked;

  return (
    <div className="min-w-[13rem] space-y-1">
      <SelectionMutationMenu
        canDeleteSelection={
          args.documentController.canDeleteSelection && !sourceImageSelected && !selectionLocked
        }
        canMutateSelection={canMutateSelection}
        handlers={args.handlers}
      />
      <MenuDivider />
      <ArrangeMenu canMutateSelection={canMutateSelection} handlers={args.handlers} />
      <MenuDivider />
      <LayerEffectsMenu
        disabled={selectionLocked}
        selectedLayerId={selectedLayerId}
        handlers={args.handlers}
      />
    </div>
  );
}

export function createCanvasToolbarEffectsGroup(args: {
  handlers: CanvasToolbarActionHandlers;
  selection: EditorToolbarSelectionState;
}): FloatingToolbarGroup | null {
  const selectedLayerId = args.selection.selectedObjectId ?? null;
  if (!selectedLayerId || args.selection.selectedObjectLocked) {
    return null;
  }

  return {
    id: 'effects',
    kind: 'effects',
    title: CANVAS_TOOLBAR_GROUP_TITLES.effects,
    trigger: getCanvasToolbarGroupTrigger('effects', []) ?? (
      <WandSparkles size={15} strokeWidth={2} />
    ),
    content: (
      <div className="space-y-1">
        <LayerEffectsMenu selectedLayerId={selectedLayerId} handlers={args.handlers} />
      </div>
    ),
    width: CANVAS_TOOLBAR_GROUP_WIDTHS.effects,
  };
}
