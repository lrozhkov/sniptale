import { Camera, Zap } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import type { ViewportPreset } from '../../../../contracts/settings';
import {
  getQuickActionDisplayName,
  isBundledQuickAction,
} from '../../../../features/quick-actions-presets/catalog';
import { formatHotkey } from '../../../../features/keyboard-shortcuts/hotkey-format';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../section-surface';
import { afterCaptureLabels, quickActionIconMap, screenshotModeLabels } from './section/constants';
import { getDelayLabel, getViewportPresetLabel } from './section/helpers';
import type { QuickActionsSectionState } from './controller';

export function QuickActionsList(props: {
  state: QuickActionsSectionState;
  viewportPresets: ViewportPreset[] | undefined;
}) {
  const items: readonly SettingsCollectionItem[] = props.state.actions.map((action) => {
    const Icon = quickActionIconMap[action.icon] ?? Camera;
    const meta = [
      screenshotModeLabels[action.screenshotMode],
      action.viewportPresetId
        ? getViewportPresetLabel(props.viewportPresets, action.viewportPresetId)
        : null,
      action.delay === null || action.delay === undefined ? null : getDelayLabel(action.delay),
      action.imageFormat?.toUpperCase() ?? null,
      afterCaptureLabels[action.afterCapture ?? 'download_default'],
      action.hotkey ? formatHotkey(action.hotkey) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      id: action.id,
      title: getQuickActionDisplayName(action),
      meta,
      preview: <Icon className="h-4 w-4 text-[var(--sniptale-color-accent)]" />,
      enabled: action.status,
      busy: props.state.isLoading,
      isBuiltIn: isBundledQuickAction(action),
      capabilities: {
        edit: !isBundledQuickAction(action),
        toggle: true,
        delete: !isBundledQuickAction(action),
        reorder: true,
      },
    };
  });
  const byId = new Map(props.state.actions.map((action) => [action.id, action]));
  const onAction = (intent: SettingsCollectionAction) => {
    const action = byId.get(intent.itemId);
    if (!action) return;
    if (intent.type === 'toggle') void props.state.handleToggleStatus(action.id);
    if (intent.type === 'edit') props.state.handleEdit(action);
    if (intent.type === 'delete') props.state.setConfirmDelete(action);
  };
  return (
    <SettingsCollection
      ariaLabel={translate('settings.quickActions.savedActionsLabel')}
      items={items}
      state={props.state.isLoading ? 'loading' : 'ready'}
      emptyState={
        props.state.editingId ? null : (
          <div>
            <Zap size={32} className="mx-auto mb-3" />
            <p>{translate('settings.quickActions.emptyTitle')}</p>
            <p>{translate('settings.quickActions.emptyDescriptionPrefix')}</p>
          </div>
        )
      }
      addAction={{
        label: translate('settings.quickActions.addButton'),
        disabled: props.state.isLoading,
        onInvoke: props.state.handleAdd,
      }}
      onAction={onAction}
      onMove={(intent: SettingsCollectionMoveIntent) =>
        void props.state.handleMoveBefore(intent.itemId, intent.beforeItemId)
      }
    />
  );
}
