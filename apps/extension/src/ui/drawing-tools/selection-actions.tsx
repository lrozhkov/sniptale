import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Group,
  Layers3,
  Trash2,
  Ungroup,
  X,
} from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../platform/i18n';

function DrawingDeselectOption(props: { onClick: () => void }) {
  const label = translate('content.toolbar.drawingDeselect');
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-ui="content.toolbar.drawing-options.deselect"
      className={[
        'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent',
        'text-[var(--sniptale-color-text-secondary)] transition-colors',
        'hover:bg-[var(--sniptale-color-surface-hover)]',
        'focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-accent)]',
      ].join(' ')}
      onClick={props.onClick}
    >
      <X aria-hidden size={16} />
    </button>
  );
}

interface LayerCombinationActions {
  canGroup: boolean;
  canMerge: boolean;
  canUngroup: boolean;
  showMerge: boolean;
  onGroup: () => void;
  onMerge: () => void;
  onUngroup: () => void;
}

function DrawingLayerCombinationActions(props: LayerCombinationActions) {
  const groupLabel = translate(
    props.canUngroup ? 'editor.toolbar.ungroupLayers' : 'editor.toolbar.groupLayers'
  );
  return (
    <>
      {props.showMerge ? (
        <ContentToolbarButton
          type="button"
          dataUi="drawing.selection.actions.merge"
          aria-label={translate('editor.toolbar.mergeLayers')}
          title={translate('editor.toolbar.mergeLayers')}
          disabled={!props.canMerge}
          className="aspect-square !h-7 !min-h-7 !w-7 !min-w-7 !rounded-md !p-0"
          onClick={props.onMerge}
        >
          <Layers3 aria-hidden size={16} />
        </ContentToolbarButton>
      ) : null}
      <ContentToolbarButton
        type="button"
        dataUi={`drawing.selection.actions.${props.canUngroup ? 'ungroup' : 'group'}`}
        aria-label={groupLabel}
        title={groupLabel}
        disabled={!props.canGroup && !props.canUngroup}
        className="aspect-square !h-7 !min-h-7 !w-7 !min-w-7 !rounded-md !p-0"
        onClick={props.canUngroup ? props.onUngroup : props.onGroup}
      >
        {props.canUngroup ? <Ungroup aria-hidden size={16} /> : <Group aria-hidden size={16} />}
      </ContentToolbarButton>
    </>
  );
}

export function DrawingSelectionActions(props: {
  vertical?: boolean;
  canReorder: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  onMove: (direction: 'front' | 'forward' | 'backward' | 'back') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDeselect: () => void;
  layerCombination?: LayerCombinationActions;
}) {
  const moves = [
    { direction: 'front', icon: ChevronsUp, label: translate('editor.toolbar.frontLayer') },
    { direction: 'forward', icon: ArrowUp, label: translate('editor.toolbar.raiseSelection') },
    { direction: 'backward', icon: ArrowDown, label: translate('editor.toolbar.lowerSelection') },
    { direction: 'back', icon: ChevronsDown, label: translate('editor.toolbar.backLayer') },
  ] as const;
  return (
    <div
      data-ui="drawing.selection.actions"
      className={`flex shrink-0 items-center gap-2 ${props.vertical ? 'w-7 flex-col' : 'h-7 flex-row'}`}
    >
      {moves.map(({ direction, icon: Icon, label }) => (
        <ContentToolbarButton
          key={direction}
          type="button"
          dataUi={`drawing.selection.actions.${direction}`}
          aria-label={label}
          title={label}
          disabled={!props.canReorder}
          className="aspect-square !h-7 !min-h-7 !w-7 !min-w-7 !rounded-md !p-0"
          onClick={() => props.onMove(direction)}
        >
          <Icon aria-hidden size={16} />
        </ContentToolbarButton>
      ))}
      <span
        className={`shrink-0 bg-[var(--sniptale-color-border-soft)] ${props.vertical ? 'h-px w-5' : 'h-5 w-px'}`}
        aria-hidden
      />
      {props.layerCombination ? (
        <DrawingLayerCombinationActions {...props.layerCombination} />
      ) : null}
      <ContentToolbarButton
        type="button"
        dataUi="drawing.selection.actions.duplicate"
        aria-label={translate('editor.toolbar.duplicateLayer')}
        title={translate('editor.toolbar.duplicateLayer')}
        disabled={!props.canDuplicate}
        className="aspect-square !h-7 !min-h-7 !w-7 !min-w-7 !rounded-md !p-0"
        onClick={props.onDuplicate}
      >
        <Copy aria-hidden size={16} />
      </ContentToolbarButton>
      <ContentToolbarButton
        type="button"
        tone="danger"
        dataUi="drawing.selection.actions.delete"
        aria-label={translate('content.toolbar.drawingDelete')}
        title={translate('content.toolbar.drawingDelete')}
        disabled={!props.canDelete}
        className="aspect-square !h-7 !min-h-7 !w-7 !min-w-7 !rounded-md !p-0"
        onClick={props.onDelete}
      >
        <Trash2 aria-hidden size={16} />
      </ContentToolbarButton>
      <span
        className={`shrink-0 bg-[var(--sniptale-color-border-soft)] ${props.vertical ? 'h-px w-5' : 'h-5 w-px'}`}
        aria-hidden
      />
      <DrawingDeselectOption onClick={props.onDeselect} />
    </div>
  );
}
