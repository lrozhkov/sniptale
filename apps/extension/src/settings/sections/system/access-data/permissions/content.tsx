import { AlertCircle, Check } from 'lucide-react';
import {
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
} from '@sniptale/ui/control-language';

import { translate } from '../../../../../platform/i18n';
import { settingsSectionClassName, SettingsSubpageTabs } from '../../../../section-surface';
import { getPermissionContent, type PermissionInfo, type PermissionState } from './permissions-lib';
import { RequiredManifestPermissionDisclosureList } from './required-disclosure-list';
import { DISABLED_PERMISSION_BORDER_CLASS_NAME } from './content.constants.ts';

const requestButtonClassName = [
  getControlPrimaryButtonClassName({ density: 'compact' }),
  'min-w-[104px]',
  DISABLED_PERMISSION_BORDER_CLASS_NAME,
].join(' ');

const permissionCardClassName = [
  'flex items-center justify-between border-b px-4 py-3 transition-colors last:border-b-0',
  'border-[var(--sniptale-color-border-soft)] hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');

const revokeButtonClassName = [
  getControlSecondaryButtonClassName({ density: 'compact', tone: 'danger' }),
  'min-w-[104px]',
].join(' ');

const permissionIconClassName = [
  'flex h-8 w-8 flex-shrink-0 items-center justify-center',
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
        'grid grid-cols-2 gap-1 overflow-hidden rounded-[12px] border p-1 text-xs',
        'border-[var(--sniptale-color-border-strong)] bg-[var(--sniptale-color-surface-input)]',
      ].join(' ')}
      aria-label={translate('settings.permissions.siteAccessModeLabel')}
      role="group"
    >
      <button
        type="button"
        onClick={() => props.onRevokePermission(props.permission.id)}
        aria-pressed={askSelected}
        className={getSiteAccessModeButtonClassName(askSelected)}
      >
        {askSelected ? <Check size={13} aria-hidden="true" /> : null}
        {translate('settings.permissions.siteAccessAskMode')}
      </button>
      <button
        type="button"
        onClick={() => props.onRequestPermission(props.permission.id)}
        aria-pressed={allSitesGranted}
        className={getSiteAccessModeButtonClassName(allSitesGranted)}
      >
        {allSitesGranted ? <Check size={13} aria-hidden="true" /> : null}
        {translate('settings.permissions.siteAccessAllSitesMode')}
      </button>
    </div>
  );
}

function getSiteAccessModeButtonClassName(selected: boolean): string {
  return [
    'flex min-h-9 items-center justify-center gap-1.5 rounded-[8px] px-3 font-semibold transition-colors',
    selected
      ? [
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_16%,var(--sniptale-color-surface-panel)_84%)]',
          'text-[var(--sniptale-color-text-primary-strong)]',
          'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_58%,transparent)]',
        ].join(' ')
      : [
          'text-[var(--sniptale-color-text-muted-strong)]',
          'hover:bg-[var(--sniptale-color-surface-hover)] hover:text-[var(--sniptale-color-text-primary)]',
        ].join(' '),
  ].join(' ');
}

function PermissionStateText({ content }: { content: ReturnType<typeof getPermissionContent> }) {
  return (
    <div className={`flex items-center gap-1.5 text-sm ${content.badgeTone}`}>
      {content.badgeIcon ? <content.badgeIcon size={14} /> : null}
      <span>{content.badgeText}</span>
    </div>
  );
}

function OptionalPermissionControl(props: {
  content: ReturnType<typeof getPermissionContent>;
  onRequest: () => void;
  onRevoke: () => void;
  state: PermissionState;
}) {
  if (props.state === 'granted') {
    return (
      <div className="flex items-center gap-2">
        <StatusBadge state={props.state} />
        <button type="button" className={revokeButtonClassName} onClick={props.onRevoke}>
          {translate('settings.permissions.revokeButton')}
        </button>
      </div>
    );
  }

  return props.state === 'prompt' ? (
    <RequestButton onClick={props.onRequest} />
  ) : (
    <PermissionStateText content={props.content} />
  );
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
        {props.permission.type === 'file' || props.permission.type === 'chrome' ? (
          <OptionalPermissionControl
            content={content}
            state={props.permission.state}
            onRequest={() => props.onRequestPermission(props.permission.id)}
            onRevoke={() => props.onRevokePermission(props.permission.id)}
          />
        ) : props.permission.type === 'origin' ? (
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
          <PermissionStateText content={content} />
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
      <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.permissions.statusChecksDescription')}
      </p>
      <div className="overflow-hidden rounded-[12px] border border-[var(--sniptale-color-border-soft)]">
        {props.permissions.map((permission) => (
          <PermissionCard
            key={permission.id}
            permission={permission}
            onRequestPermission={props.onRequestPermission}
            onRevokePermission={props.onRevokePermission}
          />
        ))}
      </div>
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
  view?: 'optional' | 'required';
  onViewChange?: (view: 'optional' | 'required') => void;
}) {
  const view = props.view ?? 'optional';
  return (
    <div className={settingsSectionClassName}>
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.permissions.permissionKindTabsLabel')}
        items={[
          { id: 'optional', label: translate('settings.permissions.statusChecksTitle') },
          { id: 'required', label: translate('settings.permissions.requiredGrantsTitle') },
        ]}
        onChange={(nextView) => props.onViewChange?.(nextView as 'optional' | 'required')}
      />
      {view === 'optional' ? (
        <>
          <PermissionStatusChecks
            permissions={props.permissions}
            onRequestPermission={props.onRequestPermission}
            onRevokePermission={props.onRevokePermission ?? (() => undefined)}
          />
          <RefreshPermissionStatusesButton onRefresh={props.onRefresh} />
        </>
      ) : (
        <RequiredManifestPermissionDisclosureList />
      )}
    </div>
  );
}
