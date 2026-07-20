import { AlertCircle } from 'lucide-react';

import { translate } from '../../../platform/i18n';
import { settingsSectionClassName, SettingsSectionHeader } from '../../section-surface';
import { getPermissionContent, type PermissionInfo, type PermissionState } from './permissions-lib';
import { RequiredManifestPermissionDisclosureList } from './required-disclosure-list';
import { DISABLED_PERMISSION_BORDER_CLASS_NAME } from './content.constants';

const requestButtonClassName = [
  'rounded-[14px] border px-4 py-2 text-sm font-medium transition-colors',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-success)_42%,var(--sniptale-color-border-soft)_58%)]',
  'bg-transparent text-[var(--sniptale-color-success)]',
  'hover:border-[var(--sniptale-color-success)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-success)_10%,transparent)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
  DISABLED_PERMISSION_BORDER_CLASS_NAME,
  'disabled:hover:bg-transparent disabled:hover:text-[var(--sniptale-color-success)]',
].join(' ');

const permissionCardClassName = [
  'flex items-center justify-between rounded-[18px] border p-5 transition-colors',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_82%,var(--sniptale-color-surface-canvas)_18%)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_34%,transparent)]',
  'hover:border-[var(--sniptale-color-border-strong)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_54%,transparent)]',
].join(' ');

const permissionIconClassName = [
  'flex-shrink-0 rounded-full border p-3 shadow-inner',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-muted)_78%,transparent)]',
  'text-[var(--sniptale-color-success)]',
].join(' ');

function StatusBadge({ state }: { state: PermissionState }) {
  const content = getPermissionContent({
    id: '',
    icon: AlertCircle,
    state,
    type: 'web',
  });

  if (state !== 'granted' && state !== 'denied') {
    return null;
  }

  const Icon = content.badgeIcon;

  return (
    <div className={`flex items-center gap-1 rounded-full border px-2.5 py-1 ${content.badgeTone}`}>
      {Icon ? <Icon size={10} /> : null}
      <span className="text-xs font-bold uppercase tracking-wider">{content.badgeText}</span>
    </div>
  );
}

function RequestButton(props: { children?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={props.onClick} disabled={props.disabled} className={requestButtonClassName}>
      {props.children ?? translate('settings.permissions.allowButton')}
    </button>
  );
}

function SiteAccessModeSelector(props: {
  onRequestPermission: (id: string) => void;
  onRevokePermission: (id: string) => void;
  permission: PermissionInfo;
}) {
  const allSitesGranted = props.permission.state === 'granted';
  const askSelected = !allSitesGranted;

  return (
    <div
      className={[
        'grid grid-cols-2 overflow-hidden rounded-[14px] border p-0.5 text-xs font-medium',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-muted)]',
      ].join(' ')}
    >
      <button
        type="button"
        disabled={askSelected}
        onClick={() => props.onRevokePermission(props.permission.id)}
        className={getSiteAccessModeButtonClassName(askSelected)}
      >
        {translate('settings.permissions.siteAccessAskMode')}
      </button>
      <button
        type="button"
        disabled={allSitesGranted}
        onClick={() => props.onRequestPermission(props.permission.id)}
        className={getSiteAccessModeButtonClassName(allSitesGranted)}
      >
        {translate('settings.permissions.siteAccessAllSitesMode')}
      </button>
    </div>
  );
}

function getSiteAccessModeButtonClassName(selected: boolean): string {
  return [
    'min-h-8 px-3 transition-colors disabled:cursor-default',
    selected
      ? 'rounded-[12px] bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)] shadow-sm'
      : 'text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-text-primary)]',
  ].join(' ');
}

function PermissionCard(props: {
  onRequestPermission: (id: string) => void;
  onRevokePermission: (id: string) => void;
  permission: PermissionInfo;
}) {
  const content = getPermissionContent(props.permission);
  const PermissionIcon = props.permission.icon;

  return (
    <div className={permissionCardClassName}>
      <div className="flex items-center gap-4">
        <div className={permissionIconClassName}>
          <PermissionIcon size={20} />
        </div>
        <div>
          <h3 className="mb-0.5 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {content.name}
          </h3>
          <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
            {content.description}
          </p>
        </div>
      </div>

      <div className="flex-shrink-0">
        {props.permission.type === 'origin' ? (
          <SiteAccessModeSelector
            permission={props.permission}
            onRequestPermission={props.onRequestPermission}
            onRevokePermission={props.onRevokePermission}
          />
        ) : props.permission.state === 'granted' || props.permission.state === 'denied' ? (
          <StatusBadge state={props.permission.state} />
        ) : props.permission.state === 'prompt' ? (
          <RequestButton onClick={() => props.onRequestPermission(props.permission.id)} />
        ) : (
          <div className={`flex items-center gap-1.5 text-sm ${content.badgeTone}`}>
            {content.badgeIcon ? <content.badgeIcon size={14} /> : null}
            <span>{content.badgeText}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PermissionStatusChecks(props: {
  onRequestPermission: (id: string) => void;
  onRevokePermission: (id: string) => void;
  permissions: PermissionInfo[];
}) {
  return (
    <section className="space-y-3" aria-label={translate('settings.permissions.statusChecksTitle')}>
      <div>
        <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('settings.permissions.statusChecksTitle')}
        </h2>
        <p className="mt-1 text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.permissions.statusChecksDescription')}
        </p>
      </div>
      {props.permissions.map((permission) => (
        <PermissionCard
          key={permission.id}
          permission={permission}
          onRequestPermission={props.onRequestPermission}
          onRevokePermission={props.onRevokePermission}
        />
      ))}
    </section>
  );
}

function RefreshPermissionStatusesButton(props: { onRefresh: () => void }) {
  return (
    <div className="mt-6 flex justify-end">
      <button
        onClick={props.onRefresh}
        className={
          'text-xs text-[var(--sniptale-color-text-dim)] ' +
          'transition-colors hover:text-[var(--sniptale-color-text-primary)]'
        }
      >
        {translate('settings.permissions.refreshButton')}
      </button>
    </div>
  );
}

export function PermissionsSectionContent(props: {
  onRefresh: () => void;
  onRequestPermission: (id: string) => void;
  onRevokePermission?: (id: string) => void;
  permissions: PermissionInfo[];
}) {
  return (
    <div className={settingsSectionClassName}>
      <SettingsSectionHeader
        description={translate('settings.permissions.subtitle')}
        kicker={translate('settings.navigation.permissions')}
      />

      <PermissionStatusChecks
        permissions={props.permissions}
        onRequestPermission={props.onRequestPermission}
        onRevokePermission={props.onRevokePermission ?? (() => undefined)}
      />

      <RefreshPermissionStatusesButton onRefresh={props.onRefresh} />

      <RequiredManifestPermissionDisclosureList />
    </div>
  );
}
