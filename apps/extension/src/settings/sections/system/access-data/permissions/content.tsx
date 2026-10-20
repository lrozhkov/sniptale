import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { AlertCircle, Check } from 'lucide-react';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';

import { translate } from '../../../../../platform/i18n';
import { settingsSectionClassName, SettingsSubpageTabs } from '../../../../section-surface';
import { getPermissionContent, type PermissionInfo, type PermissionState } from './permissions-lib';
import { RequiredManifestPermissionDisclosureList } from './required-disclosure-list';
import { DISABLED_PERMISSION_BORDER_CLASS_NAME } from './content.constants.ts';

const requestButtonClassName = [
  getControlSecondaryButtonClassName({ density: 'compact' }),
  DISABLED_PERMISSION_BORDER_CLASS_NAME,
].join(' ');

const permissionCardClassName = [
  'flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2 transition-colors last:border-b-0',
  'border-[var(--sniptale-color-border-soft)] hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');

const revokeButtonClassName = getControlSecondaryButtonClassName({
  density: 'compact',
  tone: 'danger',
});

const permissionIconClassName = [
  'flex h-7 w-7 flex-shrink-0 items-center justify-center',
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
      <span className="text-xs font-normal leading-4">{content.badgeText}</span>
    </div>
  );
}

function RequestButton(props: { children?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <ProductActionButton
      compact
      tone="secondary"
      onClick={props.onClick}
      disabled={props.disabled}
      className={requestButtonClassName}
    >
      {props.children ?? translate('settings.permissions.allowButton')}
    </ProductActionButton>
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
        'inline-flex shrink-0 items-center gap-1 rounded-[4px] border p-1',
        'border-[var(--sniptale-color-border-strong)] bg-[var(--sniptale-color-surface-input)]',
      ].join(' ')}
      aria-label={translate('settings.permissions.siteAccessModeLabel')}
      role="group"
    >
      <ContentToolbarButton
        tone="property"
        type="button"
        onClick={() => props.onRevokePermission(props.permission.id)}
        active={askSelected}
        aria-pressed={askSelected}
        className={siteAccessModeButtonClassName}
      >
        {askSelected ? <Check size={13} aria-hidden="true" /> : null}
        {translate('settings.permissions.siteAccessAskMode')}
      </ContentToolbarButton>
      <ContentToolbarButton
        tone="property"
        type="button"
        onClick={() => props.onRequestPermission(props.permission.id)}
        active={allSitesGranted}
        aria-pressed={allSitesGranted}
        className={siteAccessModeButtonClassName}
      >
        {allSitesGranted ? <Check size={13} aria-hidden="true" /> : null}
        {translate('settings.permissions.siteAccessAllSitesMode')}
      </ContentToolbarButton>
    </div>
  );
}

const siteAccessModeButtonClassName = [
  '!h-8 !w-auto !min-w-0 gap-1.5 !rounded-[4px] !px-2.5',
  'whitespace-nowrap text-[13px] font-medium leading-[18px]',
].join(' ');

function PermissionStateText({ content }: { content: ReturnType<typeof getPermissionContent> }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs font-normal leading-4 ${content.badgeTone}`}>
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
        <ProductActionButton
          compact
          tone="danger"
          type="button"
          className={revokeButtonClassName}
          onClick={props.onRevoke}
        >
          {translate('settings.permissions.revokeButton')}
        </ProductActionButton>
      </div>
    );
  }

  return props.state === 'prompt' ? (
    <RequestButton onClick={props.onRequest} />
  ) : (
    <PermissionStateText content={props.content} />
  );
}

function PermissionControl(props: {
  permission: PermissionInfo;
  content: ReturnType<typeof getPermissionContent>;
  onRequestPermission: (id: string) => void;
  onRevokePermission: (id: string) => void;
  onOpenMediaSettings?: ((permission: 'microphone' | 'camera') => void) | undefined;
}) {
  const permission = props.permission;
  if (permission.type === 'file' || permission.type === 'chrome') {
    return (
      <OptionalPermissionControl
        content={props.content}
        state={permission.state}
        onRequest={() => props.onRequestPermission(permission.id)}
        onRevoke={() => props.onRevokePermission(permission.id)}
      />
    );
  }
  if (permission.type === 'origin') {
    return (
      <SiteAccessModeSelector
        permission={permission}
        onRequestPermission={props.onRequestPermission}
        onRevokePermission={props.onRevokePermission}
      />
    );
  }
  const mediaPermission =
    permission.type === 'web' && (permission.id === 'microphone' || permission.id === 'camera')
      ? permission.id
      : null;
  if (mediaPermission && permission.state === 'denied') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge state={permission.state} />
        <ProductActionButton
          compact
          tone="secondary"
          type="button"
          className={requestButtonClassName}
          data-ui={`settings.permissions.${mediaPermission}.open-browser-settings`}
          onClick={() => props.onOpenMediaSettings?.(mediaPermission)}
        >
          {translate('settings.permissions.openBrowserSettingsButton')}
        </ProductActionButton>
      </div>
    );
  }
  if (permission.state === 'granted' || permission.state === 'denied') {
    return <StatusBadge state={permission.state} />;
  }
  if (mediaPermission || permission.state === 'prompt') {
    return <RequestButton onClick={() => props.onRequestPermission(permission.id)} />;
  }
  return <PermissionStateText content={props.content} />;
}

function PermissionCard(props: {
  onOpenMediaSettings?: ((permission: 'microphone' | 'camera') => void) | undefined;
  onRequestPermission: (id: string) => void;
  onRevokePermission: (id: string) => void;
  permission: PermissionInfo;
}) {
  const content = getPermissionContent(props.permission);
  const PermissionIcon = props.permission.icon;

  return (
    <div
      className={permissionCardClassName}
      data-ui={`settings.permissions.${props.permission.id}`}
    >
      <div className="flex min-w-[min(100%,20rem)] flex-1 items-center gap-3">
        <div className={permissionIconClassName}>
          <PermissionIcon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="mb-0.5 text-[13px] font-medium leading-[18px] text-[var(--sniptale-color-text-primary)]">
            {content.name}
          </h3>
          <p className="text-xs font-normal leading-4 text-[var(--sniptale-color-text-secondary)]">
            {content.description}
          </p>
        </div>
      </div>

      <div className="flex-shrink-0">
        <PermissionControl {...props} content={content} />
      </div>
    </div>
  );
}

function PermissionStatusChecks(props: {
  onOpenMediaSettings?: ((permission: 'microphone' | 'camera') => void) | undefined;
  onRequestPermission: (id: string) => void;
  onRevokePermission: (id: string) => void;
  permissions: PermissionInfo[];
}) {
  return (
    <section className="space-y-3" aria-label={translate('settings.permissions.statusChecksTitle')}>
      <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.permissions.statusChecksDescription')}
      </p>
      <div className="overflow-hidden rounded-[8px] border border-[var(--sniptale-color-border-soft)]">
        {props.permissions.map((permission) => (
          <PermissionCard
            key={permission.id}
            permission={permission}
            onRequestPermission={props.onRequestPermission}
            onRevokePermission={props.onRevokePermission}
            onOpenMediaSettings={props.onOpenMediaSettings}
          />
        ))}
      </div>
    </section>
  );
}

function RefreshPermissionStatusesButton(props: { onRefresh: () => void }) {
  return (
    <div className="mt-3 flex justify-end">
      <ProductActionButton
        compact
        tone="secondary"
        onClick={props.onRefresh}
        className={
          'text-xs text-[var(--sniptale-color-text-dim)] ' +
          'transition-colors hover:text-[var(--sniptale-color-text-primary)]'
        }
      >
        {translate('settings.permissions.refreshButton')}
      </ProductActionButton>
    </div>
  );
}

export function PermissionsSectionContent(props: {
  onOpenMediaSettings?: ((permission: 'microphone' | 'camera') => void) | undefined;
  mediaNavigationFailed?: boolean;
  mediaEnableFailed?: boolean;
  onRefresh: () => void;
  onRequestPermission: (id: string) => void;
  onRevokePermission?: (id: string) => void;
  permissions: PermissionInfo[];
  view?: 'optional' | 'required';
  onViewChange?: (view: 'optional' | 'required') => void;
}) {
  const view = props.view ?? 'optional';
  return (
    <div className={`${settingsSectionClassName} max-w-4xl`}>
      <SettingsSubpageTabs
        placement="inline"
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
            onOpenMediaSettings={props.onOpenMediaSettings}
          />
          {props.mediaNavigationFailed ? (
            <p role="alert" className="mt-2 text-xs text-[var(--sniptale-color-text-secondary)]">
              {translate('settings.permissions.openBrowserSettingsFailed')}
            </p>
          ) : null}
          {props.mediaEnableFailed ? (
            <p role="alert" className="mt-2 text-xs text-[var(--sniptale-color-text-secondary)]">
              {translate('settings.permissions.enableRecordingDeviceFailed')}
            </p>
          ) : null}
          <RefreshPermissionStatusesButton onRefresh={props.onRefresh} />
        </>
      ) : (
        <RequiredManifestPermissionDisclosureList />
      )}
    </div>
  );
}
