import { Plus, Zap } from 'lucide-react';

import { translate } from '../../../platform/i18n';
import type { ViewportPreset } from '../../../contracts/settings';
import { getQuickActionCountLabel } from './section/helpers';
import { QuickActionRow } from './list-row';
import { DelayedSettingsCardLoadingState } from '../../section-surface/loading-state';
import {
  settingsAddButtonClassName,
  settingsEmptyStateClassName,
} from '../../section-surface/panel-controls';
import { type QuickActionsSectionState } from './section';

function QuickActionsListEmptyState(props: { editingId: string | null; isLoading: boolean }) {
  if (props.isLoading) {
    return <DelayedSettingsCardLoadingState />;
  }

  if (props.editingId) {
    return null;
  }

  return (
    <div className={`${settingsEmptyStateClassName} mb-6`}>
      <Zap size={32} className="mx-auto mb-3 text-[var(--sniptale-color-text-dim)]" />
      <p className="mb-1 text-sm text-[var(--sniptale-color-text-muted)]">
        {translate('settings.quickActions.emptyTitle')}
      </p>
      <p className="text-xs text-[var(--sniptale-color-text-dim)]">
        {translate('settings.quickActions.emptyDescriptionPrefix')} "
        {translate('common.actions.add')}"{' '}
        {translate('settings.quickActions.emptyDescriptionSuffix')}
      </p>
    </div>
  );
}

export function QuickActionsList(props: {
  state: QuickActionsSectionState;
  viewportPresets: ViewportPreset[] | undefined;
}) {
  const { state, viewportPresets } = props;

  return (
    <>
      <QuickActionsListHeader actionCount={state.actions.length} />

      {state.actions.length === 0 ? (
        <QuickActionsListEmptyState editingId={state.editingId} isLoading={state.isLoading} />
      ) : (
        <div className="mb-6 space-y-2">
          {state.actions.map((action) => (
            <QuickActionRow
              key={action.id}
              action={action}
              hoveredId={state.hoveredId}
              draggedId={state.draggedId}
              dragOverId={state.dragOverId}
              onDeleteConfirm={() => state.setConfirmDelete(action)}
              onEdit={() => state.handleEdit(action)}
              onHoverChange={state.setHoveredId}
              onToggleStatus={() => state.handleToggleStatus(action.id)}
              onDragStart={state.handleDragStart}
              onDragEnd={state.handleDragEnd}
              onDragOver={state.handleDragOver}
              onDragLeave={state.handleDragLeave}
              onDrop={state.handleDrop}
              viewportPresets={viewportPresets}
            />
          ))}
        </div>
      )}

      <button
        onClick={state.handleAdd}
        disabled={state.isLoading}
        className={`${settingsAddButtonClassName} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <Plus size={16} />
        {translate('settings.quickActions.addButton')}
      </button>
    </>
  );
}

function QuickActionsListHeader(props: { actionCount: number }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--sniptale-color-text-dim)]">
        {translate('settings.quickActions.savedActionsLabel')}
      </span>
      <span className="text-xs text-[var(--sniptale-color-text-dim)]">
        {props.actionCount} {getQuickActionCountLabel(props.actionCount)}
      </span>
    </div>
  );
}
