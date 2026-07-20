import { useState } from 'react';

import { translate } from '../../../platform/i18n';
import type { NativeAppCapabilities } from '../../../contracts/native-app';
import type {
  NativeCaptureSettings,
  NativeTrayActionKey,
} from '@sniptale/runtime-contracts/video/types/types';
import { settingsMetaLabelClassName } from '../../section-surface';
import { SettingsSwitch } from '../../section-surface/panel-controls';
import { HotkeyRecorder } from './hotkey-recorder';
import { getDuplicateShortcutKeys, isDuplicateShortcut } from './shortcut-conflicts';
import {
  isNativeRecordingControlActionKey,
  listNativeTrayActionFieldKeys,
  nativeRecordingStartActionKeys,
  trayActionGroups,
  type TrayActionGroupConfig,
  type TrayActionRowConfig,
} from './tray-action-config';

type TrayActionPatch = Partial<NativeCaptureSettings['trayActions']['openSettings']>;

function NativeTrayActionRow(props: {
  action: TrayActionRowConfig;
  capabilities: NativeAppCapabilities | null;
  conflict: boolean;
  disabled: boolean;
  recordingControlsAvailable: boolean;
  setting: NativeCaptureSettings['trayActions'][NativeTrayActionKey];
  updateTrayAction: (key: NativeTrayActionKey, patch: TrayActionPatch) => void;
}) {
  const label = translate(props.action.label);
  const supported = isTrayActionSupported(props.action, props.capabilities);
  const isRecordingControl = isNativeRecordingControlActionKey(props.action.key);
  const actionEnabled = isRecordingControl
    ? props.recordingControlsAvailable
    : props.setting.enabled;
  const disabled =
    props.disabled || !supported || (isRecordingControl && !props.recordingControlsAvailable);

  return (
    <div
      className={[
        'grid gap-3 border-t border-[var(--sniptale-color-border-subtle)] py-3',
        'md:grid-cols-[minmax(0,1fr)_88px_minmax(12rem,16rem)]',
      ].join(' ')}
    >
      <NativeTrayActionCopy action={props.action} label={label} supported={supported} />
      {isRecordingControl ? (
        <div aria-hidden="true" className="hidden md:block" />
      ) : (
        <NativeTrayActionEnabledToggle
          actionKey={props.action.key}
          checked={props.setting.enabled}
          disabled={disabled}
          updateTrayAction={props.updateTrayAction}
        />
      )}
      <HotkeyRecorder
        disabled={disabled || !actionEnabled}
        label={`${label}: ${translate('settings.nativeApp.shortcutLabel')}`}
        value={props.setting.shortcutLabel}
        onChange={(shortcutLabel) => props.updateTrayAction(props.action.key, { shortcutLabel })}
      />
      {props.conflict ? (
        <p className="text-xs leading-5 text-[var(--sniptale-color-danger)] md:col-start-3">
          {translate('settings.nativeApp.shortcutDuplicate')}
        </p>
      ) : null}
    </div>
  );
}

function NativeTrayActionCopy(props: {
  action: TrayActionRowConfig;
  label: string;
  supported: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-[var(--sniptale-color-text-primary)]">{props.label}</p>
      <p className="text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
        {translate(props.action.description)}
      </p>
      {!props.supported ? (
        <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-danger)]">
          {translate('settings.nativeApp.trayUnsupportedMode')}
        </p>
      ) : null}
    </div>
  );
}

function NativeTrayActionEnabledToggle(props: {
  actionKey: NativeTrayActionKey;
  checked: boolean;
  disabled: boolean;
  updateTrayAction: (key: NativeTrayActionKey, patch: TrayActionPatch) => void;
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-2 text-xs',
        'text-[var(--sniptale-color-text-muted)] md:justify-center',
      ].join(' ')}
    >
      <span className="md:hidden">{translate('settings.nativeApp.enabled')}</span>
      <SettingsSwitch
        aria-label={translate('settings.nativeApp.enabled')}
        checked={props.checked}
        disabled={props.disabled}
        size="sm"
        onClick={() => props.updateTrayAction(props.actionKey, { enabled: !props.checked })}
      />
    </div>
  );
}

function NativeTrayActionGroup(props: {
  capabilities: NativeAppCapabilities | null;
  conflictKeys: Set<NativeTrayActionKey>;
  disabled: boolean;
  group: TrayActionGroupConfig;
  recordingControlsAvailable: boolean;
  settings: NativeCaptureSettings;
  updateTrayAction: (key: NativeTrayActionKey, patch: TrayActionPatch) => void;
}) {
  return (
    <div>
      <p className={settingsMetaLabelClassName}>{translate(props.group.title)}</p>
      <div className="mt-2 border-b border-[var(--sniptale-color-border-subtle)]">
        {props.group.actions.map((action) => (
          <NativeTrayActionRow
            key={action.key}
            action={action}
            capabilities={props.capabilities}
            conflict={props.conflictKeys.has(action.key)}
            disabled={props.disabled}
            recordingControlsAvailable={props.recordingControlsAvailable}
            setting={props.settings.trayActions[action.key]}
            updateTrayAction={props.updateTrayAction}
          />
        ))}
      </div>
    </div>
  );
}

export function NativeTrayActionFields(props: {
  capabilities: NativeAppCapabilities | null;
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateTrayAction: (key: NativeTrayActionKey, patch: TrayActionPatch) => void;
}) {
  const shortcuts = useTrayShortcutUpdates(props.settings, props.updateTrayAction);
  const recordingControlsAvailable = hasAvailableRecordingStartAction(
    props.settings,
    props.capabilities
  );

  return (
    <div className="space-y-5">
      <div>
        <p className={settingsMetaLabelClassName}>{translate('settings.nativeApp.trayTitle')}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
          {translate('settings.nativeApp.trayDescription')}
        </p>
      </div>
      {trayActionGroups.map((group) => (
        <NativeTrayActionGroup
          key={group.title}
          capabilities={props.capabilities}
          conflictKeys={shortcuts.conflictKeys}
          disabled={props.disabled}
          group={group}
          recordingControlsAvailable={recordingControlsAvailable}
          settings={props.settings}
          updateTrayAction={shortcuts.updateTrayAction}
        />
      ))}
    </div>
  );
}

function useTrayShortcutUpdates(
  settings: NativeCaptureSettings,
  updateTrayAction: (key: NativeTrayActionKey, patch: TrayActionPatch) => void
) {
  const [conflictKey, setConflictKey] = useState<NativeTrayActionKey | null>(null);
  const keys = listNativeTrayActionFieldKeys();
  const persistedConflictKeys = getDuplicateShortcutKeys(keys, settings);
  return {
    conflictKeys: conflictKey
      ? new Set<NativeTrayActionKey>([...persistedConflictKeys, conflictKey])
      : persistedConflictKeys,
    updateTrayAction: (key: NativeTrayActionKey, patch: TrayActionPatch) => {
      if (
        patch.shortcutLabel &&
        isDuplicateShortcut({ currentKey: key, keys, settings, shortcutLabel: patch.shortcutLabel })
      ) {
        setConflictKey(key);
        return;
      }
      if (patch.shortcutLabel !== undefined) {
        setConflictKey(null);
      }
      updateTrayAction(key, patch);
    },
  };
}

function isTrayActionSupported(
  action: TrayActionRowConfig,
  capabilities: NativeAppCapabilities | null
): boolean {
  if (!capabilities || !action.capability) {
    return true;
  }
  if (action.capability.kind === 'screenshot') {
    return capabilities.capture.screenshotModes.includes(action.capability.mode);
  }
  return capabilities.capture.videoModes.includes(action.capability.mode);
}

function hasAvailableRecordingStartAction(
  settings: NativeCaptureSettings,
  capabilities: NativeAppCapabilities | null
): boolean {
  return (
    settings.video.enabled &&
    nativeRecordingStartActionKeys.some((key) => {
      const action = trayActionGroups
        .flatMap((group) => group.actions)
        .find((candidate) => candidate.key === key);
      return Boolean(
        action && settings.trayActions[key].enabled && isTrayActionSupported(action, capabilities)
      );
    })
  );
}
