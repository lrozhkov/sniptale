import { useContext, useEffect, useState, type CSSProperties } from 'react';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
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
  const scoped = useContext(CommandPressScope);
  if (scoped) {
    return (
      <ContentToolbarButton
        type="button"
        tone="close"
        title={label}
        dataUi="content.toolbar.drawing-options.deselect"
        className="!h-7 !min-h-7 !w-7 !min-w-7 !rounded-[4px] !p-0"
        onClick={props.onClick}
      >
        <X aria-hidden size={16} />
      </ContentToolbarButton>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-ui="content.toolbar.drawing-options.deselect"
      className={[
        'sniptale-dismiss-button',
        'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0',
        'transition-colors',
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
  const scoped = useContext(CommandPressScope);
  const groupLabel = translate(
    props.canUngroup ? 'editor.toolbar.ungroupLayers' : 'editor.toolbar.groupLayers'
  );
  return (
    <>
      {props.showMerge ? (
        <ContentToolbarButton
          type="button"
          tone={scoped ? 'utility' : 'default'}
          dataUi="drawing.selection.actions.merge"
          aria-label={translate('editor.toolbar.mergeLayers')}
          title={translate('editor.toolbar.mergeLayers')}
          disabled={!props.canMerge}
          className={`aspect-square !h-7 !min-h-7 !w-7 !min-w-7 !p-0 ${scoped ? '!rounded-[4px]' : '!rounded-md'}`}
          onClick={props.onMerge}
        >
          <Layers3 aria-hidden size={16} />
        </ContentToolbarButton>
      ) : null}
      <ContentToolbarButton
        type="button"
        tone={scoped ? 'utility' : 'default'}
        dataUi={`drawing.selection.actions.${props.canUngroup ? 'ungroup' : 'group'}`}
        aria-label={groupLabel}
        title={groupLabel}
        disabled={!props.canGroup && !props.canUngroup}
        className={`aspect-square !h-7 !min-h-7 !w-7 !min-w-7 !p-0 ${scoped ? '!rounded-[4px]' : '!rounded-md'}`}
        onClick={props.canUngroup ? props.onUngroup : props.onGroup}
      >
        {props.canUngroup ? <Ungroup aria-hidden size={16} /> : <Group aria-hidden size={16} />}
      </ContentToolbarButton>
    </>
  );
}

/** Disposable selection disclosure. Keep this owner mounted across selected-object changes. */
export function useDrawingSelectionDisclosure(hasSelection: boolean) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!hasSelection) setExpanded(false);
  }, [hasSelection]);
  return { expanded, onExpandedChange: setExpanded };
}

/** Controlled presentation; selection lifetime belongs to the consuming surface. */
export interface DrawingSelectionDisclosure {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export function DrawingSelectionActions(props: {
  disclosure: DrawingSelectionDisclosure;
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
  const scoped = useContext(CommandPressScope);
  const { expanded, onExpandedChange } = props.disclosure;
  const RevealIcon = props.vertical
    ? expanded
      ? ChevronsUp
      : ChevronsDown
    : expanded
      ? ChevronsLeft
      : ChevronsRight;
  const revealLabel = translate(
    expanded
      ? 'content.toolbar.drawingHideSelectionActions'
      : 'content.toolbar.drawingShowSelectionActions'
  );
  const moves = [
    { direction: 'front', icon: ChevronsUp, label: translate('editor.toolbar.frontLayer') },
    { direction: 'forward', icon: ArrowUp, label: translate('editor.toolbar.raiseSelection') },
    { direction: 'backward', icon: ArrowDown, label: translate('editor.toolbar.lowerSelection') },
    { direction: 'back', icon: ChevronsDown, label: translate('editor.toolbar.backLayer') },
  ] as const;
  return (
    <div
      data-ui="drawing.selection.actions"
      style={{ '--sniptale-toolbar-button-size': '28px' } as CSSProperties}
      className={`flex shrink-0 items-center gap-2 ${props.vertical ? 'w-7 flex-col' : 'h-7 flex-row'}`}
    >
      <ContentToolbarButton
        type="button"
        tone={scoped ? 'utility' : 'default'}
        size="narrow"
        dataUi="drawing.selection.actions.reveal"
        aria-expanded={expanded}
        aria-label={revealLabel}
        title={revealLabel}
        className={`!h-7 !min-h-7 !p-0 ${scoped ? '!rounded-[4px]' : '!rounded-md'}`}
        onClick={() => onExpandedChange(!expanded)}
      >
        <RevealIcon aria-hidden size={14} />
      </ContentToolbarButton>
      {expanded ? (
        <>
          {moves.map(({ direction, icon: Icon, label }) => (
            <ContentToolbarButton
              key={direction}
              type="button"
              tone={scoped ? 'utility' : 'default'}
              dataUi={`drawing.selection.actions.${direction}`}
              aria-label={label}
              title={label}
              disabled={!props.canReorder}
              className={`aspect-square !h-7 !min-h-7 !w-7 !min-w-7 !p-0 ${scoped ? '!rounded-[4px]' : '!rounded-md'}`}
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
            tone={scoped ? 'utility' : 'default'}
            dataUi="drawing.selection.actions.duplicate"
            aria-label={translate('editor.toolbar.duplicateLayer')}
            title={translate('editor.toolbar.duplicateLayer')}
            disabled={!props.canDuplicate}
            className={`aspect-square !h-7 !min-h-7 !w-7 !min-w-7 !p-0 ${scoped ? '!rounded-[4px]' : '!rounded-md'}`}
            onClick={props.onDuplicate}
          >
            <Copy aria-hidden size={16} />
          </ContentToolbarButton>
        </>
      ) : null}
      <ContentToolbarButton
        type="button"
        tone="danger"
        dataUi="drawing.selection.actions.delete"
        aria-label={translate('content.toolbar.drawingDelete')}
        title={translate('content.toolbar.drawingDelete')}
        disabled={!props.canDelete}
        className={`aspect-square !h-7 !min-h-7 !w-7 !min-w-7 !p-0 ${scoped ? '!rounded-[4px]' : '!rounded-md'}`}
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
