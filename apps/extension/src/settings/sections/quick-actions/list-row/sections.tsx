import type { ReactNode } from 'react';
import { Camera, Pencil, Trash2 } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import {
  getQuickActionDisplayName,
  isBundledQuickAction,
} from '../../../../features/quick-actions-presets/catalog';
import { formatHotkey } from '../../../../features/keyboard-shortcuts/hotkey-format';
import type { HotkeyConfig, ViewportPreset } from '../../../../contracts/settings';
import { afterCaptureLabels, quickActionIconMap, screenshotModeLabels } from '../section/constants';
import { getDelayLabel, getEmulationLabel } from '../section/helpers';
import type { QuickActionsSectionState } from '../section';
import {
  getSettingsHoverActionsClassName,
  settingsDangerIconButtonClassName,
  settingsInfoIconButtonClassName,
  settingsListRowClassName,
  SettingsDragHandle,
  SettingsSwitch,
} from '../../../section-surface/panel-controls';

export const quickActionRowClassName = settingsListRowClassName;

const quickActionIconShellClassName = [
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
  'border-[var(--sniptale-color-border-accent-soft)]',
  'bg-[var(--sniptale-color-accent-soft)] text-[var(--sniptale-color-accent)]',
].join(' ');

function DynamicListIcon(props: { className?: string; name: string }) {
  const Icon = quickActionIconMap[props.name] ?? Camera;
  return <Icon className={props.className} />;
}

export function QuickActionRowShell(props: {
  actionId: string;
  children: ReactNode;
  className: string;
  onDragLeave: QuickActionsSectionState['handleDragLeave'];
  onDragOver: QuickActionsSectionState['handleDragOver'];
  onDrop: QuickActionsSectionState['handleDrop'];
  onHoverChange: (value: string | null) => void;
}) {
  return (
    <div
      onDragOver={(event) => props.onDragOver(event, props.actionId)}
      onDragLeave={props.onDragLeave}
      onDrop={(event) => props.onDrop(event, props.actionId)}
      onMouseEnter={() => props.onHoverChange(props.actionId)}
      onMouseLeave={() => props.onHoverChange(null)}
      className={props.className}
    >
      {props.children}
    </div>
  );
}

export function QuickActionRowActions(props: {
  action: QuickActionsSectionState['actions'][number];
  hotkey?: HotkeyConfig | null;
  isHovered: boolean;
  onDeleteConfirm: () => void;
  onEdit: () => void;
  onToggleStatus: () => Promise<void>;
}) {
  return (
    <div className={getSettingsHoverActionsClassName(props.isHovered)}>
      {props.hotkey ? <QuickActionRowHotkey hotkey={props.hotkey} /> : null}
      <QuickActionStatusToggle action={props.action} onToggleStatus={props.onToggleStatus} />
      {!isBundledQuickAction(props.action) ? <QuickActionEditButton onEdit={props.onEdit} /> : null}
      {!isBundledQuickAction(props.action) ? (
        <QuickActionDeleteButton onDeleteConfirm={props.onDeleteConfirm} />
      ) : null}
    </div>
  );
}

export function QuickActionRowHandle(props: {
  actionId: string;
  onDragEnd: QuickActionsSectionState['handleDragEnd'];
  onDragStart: QuickActionsSectionState['handleDragStart'];
}) {
  return (
    <div
      draggable
      onDragStart={(event) => props.onDragStart(event, props.actionId)}
      onDragEnd={props.onDragEnd}
      className="flex-shrink-0"
    >
      <SettingsDragHandle />
    </div>
  );
}

export function QuickActionRowSummary(props: {
  action: QuickActionsSectionState['actions'][number];
  viewportPresets: ViewportPreset[] | undefined;
}) {
  const { action } = props;
  const displayName = getQuickActionDisplayName(action);

  return (
    <>
      <div className={quickActionIconShellClassName}>
        <DynamicListIcon name={action.icon} className="mx-auto h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0 truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {displayName}
          </div>
          {isBundledQuickAction(action) ? (
            <span
              className={
                'inline-flex shrink-0 items-center rounded-full border border-[var(--sniptale-color-border-soft)] ' +
                'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_52%,transparent)] ' +
                'px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ' +
                'text-[var(--sniptale-color-text-dim)]'
              }
            >
              {translate('settings.quickActions.bundledBadge')}
            </span>
          ) : null}
        </div>
        <QuickActionRowMeta action={action} viewportPresets={props.viewportPresets} />
      </div>
    </>
  );
}

function QuickActionRowHotkey(props: { hotkey: HotkeyConfig }) {
  return (
    <span
      className={
        'rounded bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_52%,transparent)] ' +
        'px-1.5 py-0.5 font-mono text-xs text-[var(--sniptale-color-text-dim)]'
      }
    >
      {formatHotkey(props.hotkey)}
    </span>
  );
}

function QuickActionRowMeta(props: {
  action: QuickActionsSectionState['actions'][number];
  viewportPresets: ViewportPreset[] | undefined;
}) {
  const { action } = props;

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--sniptale-color-text-dim)]">
      <span>{screenshotModeLabels[action.screenshotMode]}</span>
      {action.emulation && action.emulation !== 'native' ? (
        <>
          <span className="text-[var(--sniptale-color-text-dim)]">•</span>
          <span>{getEmulationLabel(props.viewportPresets, action.emulation)}</span>
        </>
      ) : null}
      {action.delay !== null && action.delay !== undefined ? (
        <>
          <span className="text-[var(--sniptale-color-text-dim)]">•</span>
          <span>{getDelayLabel(action.delay)}</span>
        </>
      ) : null}
      {action.imageFormat ? (
        <>
          <span className="text-[var(--sniptale-color-text-dim)]">•</span>
          <span>{action.imageFormat.toUpperCase()}</span>
        </>
      ) : null}
      <span className="text-[var(--sniptale-color-text-dim)]">•</span>
      <span>{afterCaptureLabels[action.afterCapture ?? 'download_default']}</span>
    </div>
  );
}

function QuickActionStatusToggle(props: {
  action: QuickActionsSectionState['actions'][number];
  onToggleStatus: () => Promise<void>;
}) {
  return (
    <SettingsSwitch
      checked={props.action.status}
      onClick={props.onToggleStatus}
      title={
        props.action.status
          ? translate('settings.quickActions.statusOff')
          : translate('settings.quickActions.statusOn')
      }
    />
  );
}

function QuickActionEditButton(props: { onEdit: () => void }) {
  return (
    <button
      onClick={props.onEdit}
      className={settingsInfoIconButtonClassName}
      title={translate('common.actions.edit')}
    >
      <Pencil size={14} />
    </button>
  );
}

function QuickActionDeleteButton(props: { onDeleteConfirm: () => void }) {
  return (
    <button
      onClick={props.onDeleteConfirm}
      className={settingsDangerIconButtonClassName}
      title={translate('common.actions.delete')}
    >
      <Trash2 size={14} />
    </button>
  );
}
