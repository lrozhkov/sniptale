import type { HotkeyConfig, ViewportPreset } from '../../../../contracts/settings';
import type { QuickActionsSectionState } from '../section';
import { getQuickActionRowStateClassName } from './state-class';
import {
  quickActionRowClassName,
  QuickActionRowActions,
  QuickActionRowHandle,
  QuickActionRowShell,
  QuickActionRowSummary,
} from './sections';

type QuickActionRowProps = {
  action: QuickActionsSectionState['actions'][number];
  hoveredId: string | null;
  onDeleteConfirm: () => void;
  onDragEnd: QuickActionsSectionState['handleDragEnd'];
  onDragLeave: QuickActionsSectionState['handleDragLeave'];
  onDragOver: QuickActionsSectionState['handleDragOver'];
  onDragStart: QuickActionsSectionState['handleDragStart'];
  onDrop: QuickActionsSectionState['handleDrop'];
  onEdit: () => void;
  onHoverChange: (value: string | null) => void;
  onToggleStatus: () => Promise<void>;
  draggedId: string | null;
  dragOverId: string | null;
  viewportPresets: ViewportPreset[] | undefined;
};

export function QuickActionRow(props: QuickActionRowProps) {
  const { action } = props;
  const rowStateClassName = getQuickActionRowStateClassName({
    action,
    draggedId: props.draggedId,
    dragOverId: props.dragOverId,
  });
  const isHovered = props.hoveredId === action.id;

  return (
    <QuickActionRowShell
      actionId={action.id}
      className={`${quickActionRowClassName} ${rowStateClassName}`}
      onDragLeave={props.onDragLeave}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onHoverChange={props.onHoverChange}
    >
      <div className="flex w-full min-w-0 items-center gap-3">
        <QuickActionRowHandle
          actionId={action.id}
          onDragEnd={props.onDragEnd}
          onDragStart={props.onDragStart}
        />
        <QuickActionRowSummary action={action} viewportPresets={props.viewportPresets} />
        <QuickActionRowActions
          action={action}
          isHovered={isHovered}
          onDeleteConfirm={props.onDeleteConfirm}
          onEdit={props.onEdit}
          onToggleStatus={props.onToggleStatus}
          {...(() => {
            const hotkey = action.hotkey as HotkeyConfig | null | undefined;
            return hotkey === undefined ? {} : { hotkey };
          })()}
        />
      </div>
    </QuickActionRowShell>
  );
}
