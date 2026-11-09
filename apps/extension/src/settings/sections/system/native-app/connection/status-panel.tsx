import { Cable, RefreshCw } from 'lucide-react';

import type { NativeAppRuntimeStatus } from '../../../../../contracts/native-app/runtime';
import type { NativePlatform } from '../../../../../contracts/native-app';
import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { StatusRow } from '../../../../../ui/compact-inspector-controls';
import {
  settingsMetaLabelClassName,
  settingsNeutralBadgeClassName,
  settingsPanelClassName,
  settingsSuccessBadgeClassName,
} from '../../../../section-surface';
import { getNativeConnectionStateLabel } from './state-labels';
import { normalizeNativeAppError, normalizeNativeSettingsWarning } from './error-copy';
import type { NativeRuntimeOperation } from '../types';

function getStatusBadgeClassName(status: NativeAppRuntimeStatus | null): string {
  return status?.connectionState === 'connected'
    ? settingsSuccessBadgeClassName
    : settingsNeutralBadgeClassName;
}

function formatNativePlatform(platform: NativePlatform): string {
  const platformLabel =
    platform.kind === 'windows'
      ? translate('settings.nativeApp.platformWindows')
      : platform.kind === 'macos'
        ? translate('settings.nativeApp.platformMacos')
        : translate('settings.nativeApp.platformLinux');
  return `${platformLabel} ${platform.version}`;
}

function NativeStatusActions(props: {
  onAction: (operation: NativeRuntimeOperation) => void;
  status: NativeAppRuntimeStatus | null;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <ProductActionButton
        type="button"
        compact
        tone="secondary"
        onClick={() => props.onAction('reconnect')}
      >
        <RefreshCw className="h-4 w-4" />
        {translate('settings.nativeApp.reconnect')}
      </ProductActionButton>
      {props.status?.connectionState === 'trust-required' ? (
        <ProductActionButton
          type="button"
          compact
          tone="primary"
          onClick={() => props.onAction('trust-client')}
        >
          {translate('settings.nativeApp.trustClient')}
        </ProductActionButton>
      ) : null}
      {props.status?.appIdentity && props.status.connectionState !== 'trust-required' ? (
        <ProductActionButton
          type="button"
          compact
          tone="secondary"
          onClick={() => props.onAction('forget-client')}
        >
          {translate('settings.nativeApp.forgetClient')}
        </ProductActionButton>
      ) : null}
    </div>
  );
}

function NativeStatusWarnings({ status }: { status: NativeAppRuntimeStatus | null }) {
  if (!status?.warnings.length) {
    return null;
  }
  const warningMessages = Array.from(
    new Set(status.warnings.map((warning) => normalizeNativeSettingsWarning(warning)))
  );
  return (
    <div className="space-y-2">
      <p className={settingsMetaLabelClassName}>{translate('settings.nativeApp.warnings')}</p>
      {warningMessages.map((warning) => (
        <p
          key={warning}
          className="text-[13px] leading-[18px] text-[var(--sniptale-color-warning)]"
        >
          {warning}
        </p>
      ))}
    </div>
  );
}

function NativeOperationError({ status }: { status: NativeAppRuntimeStatus | null }) {
  const operationError = status?.lastOperationError;
  if (!operationError) {
    return null;
  }
  const messageKey =
    operationError.operation === 'screenshot'
      ? 'settings.nativeApp.operationErrorScreenshot'
      : 'settings.nativeApp.operationErrorGeneric';
  return (
    <div className="space-y-1 text-[13px] leading-[18px] text-[var(--sniptale-color-danger)]">
      <p className={settingsMetaLabelClassName}>
        {translate('settings.nativeApp.operationErrorTitle')}
      </p>
      <p>{normalizeNativeAppError(null, messageKey)}</p>
    </div>
  );
}

function NativeStatusDetails({ status }: { status: NativeAppRuntimeStatus | null }) {
  if (!status?.install) {
    return null;
  }
  const limits = status.capabilities?.limits;
  return (
    <div className="sniptale-parameter-stack w-full max-w-[720px]">
      <StatusRow
        label={translate('settings.nativeApp.autostartStatus')}
        value={
          status.install.autostart.enabled
            ? translate('settings.nativeApp.enabled')
            : translate('settings.nativeApp.disabled')
        }
      />
      <StatusRow
        label={translate('settings.nativeApp.capabilityLimits')}
        value={limits ? `${limits.maxWidth}x${limits.maxHeight} · ${limits.maxFps} FPS` : '-'}
      />
    </div>
  );
}

export function NativeStatusPanel(props: {
  onAction: (operation: NativeRuntimeOperation) => void;
  status: NativeAppRuntimeStatus | null;
}) {
  const { status } = props;
  return (
    <div className={[settingsPanelClassName, 'space-y-3'].join(' ')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-[var(--sniptale-color-text-secondary)]" />
            <h2 className="text-[14px] leading-5 font-semibold text-[var(--sniptale-color-text-primary-strong)]">
              {translate('settings.nativeApp.statusTitle')}
            </h2>
            <span className={getStatusBadgeClassName(status)}>
              {translate(getNativeConnectionStateLabel(status?.connectionState))}
            </span>
          </div>
          <p className="max-w-3xl text-[13px] leading-[18px] text-[var(--sniptale-color-text-secondary)]">
            {status?.install
              ? `${formatNativePlatform(status.install.platform)} · ${status.install.appVersion}`
              : translate('settings.nativeApp.statusMissing')}
          </p>
          {status?.connectionState === 'controlled-by-other-profile' ||
          status?.connectionState === 'selection-required' ? (
            <p className="text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-warning)]">
              {translate('settings.nativeApp.controlledByOtherProfile')}
            </p>
          ) : null}
          {status?.error?.message ? (
            <p className="text-[13px] leading-[18px] text-[var(--sniptale-color-danger)]">
              {normalizeNativeAppError(status.error.message, 'settings.nativeApp.actionError')}
            </p>
          ) : null}
        </div>
        <NativeStatusActions onAction={props.onAction} status={status} />
      </div>
      {status?.connectionState === 'trust-required' && status.appIdentity ? (
        <div className="space-y-1 text-[13px] leading-[18px]">
          <p>{translate('settings.nativeApp.trustDescription')}</p>
          <p className="break-all text-[var(--sniptale-color-text-secondary)]">
            {status.appIdentity.clientId}
          </p>
        </div>
      ) : null}
      <NativeStatusDetails status={status} />
      <NativeOperationError status={status} />
      <NativeStatusWarnings status={status} />
    </div>
  );
}
