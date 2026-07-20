import { getCurrentLocale, translate } from '../../../platform/i18n';
import type { AppLocale, TranslationKey } from '../../../platform/i18n';
import type {
  NativeAppCapabilities,
  NativeTrayActionDescriptor,
  NativeTrayActionRegistry,
  NativeTrayShortcutPriority,
} from '../../../contracts/native-app';
import type { QuickAction } from '../../../contracts/settings';
import { normalizeShortcutLabel } from '../../../features/keyboard-shortcuts/hotkeys';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type {
  NativeCaptureSettings,
  NativeTrayActionKey,
} from '@sniptale/runtime-contracts/video/types/types';
import { createNativeCanonicalRevision } from './revision';
import { nativeTrayActionCommands, type NativeTrayActionCommand } from './tray-action-commands';
import { createBrowserActiveShortcutPriority } from './tray-shortcut-priority';

const trayActionLabelKeys = {
  captureAllScreensScreenshot: 'settings.nativeApp.trayCaptureAllScreensScreenshot',
  captureRegionScreenshot: 'settings.nativeApp.trayCaptureRegionScreenshot',
  captureScreenScreenshot: 'settings.nativeApp.trayCaptureScreenScreenshot',
  captureWindowScreenshot: 'settings.nativeApp.trayCaptureWindowScreenshot',
  openGallery: 'settings.nativeApp.trayOpenGallery',
  openSettings: 'settings.nativeApp.trayOpenSettings',
  openVideoEditor: 'settings.nativeApp.trayOpenVideoEditor',
  pauseRecording: 'settings.nativeApp.trayPauseRecording',
  resumeRecording: 'settings.nativeApp.trayResumeRecording',
  startRegionRecording: 'settings.nativeApp.trayStartRegionRecording',
  startScreenRecording: 'settings.nativeApp.trayStartScreenRecording',
  startWindowRecording: 'settings.nativeApp.trayStartWindowRecording',
  stopRecording: 'settings.nativeApp.trayStopRecording',
} satisfies Record<NativeTrayActionKey, TranslationKey>;

async function createTrayRegistryRevision(args: {
  actions: NativeTrayActionDescriptor[];
  locale: string;
  shortcutPriority: NativeTrayShortcutPriority | null;
}): Promise<string> {
  return createNativeCanonicalRevision('native-tray', args);
}

type NativeTrayActionSetting = NativeCaptureSettings['trayActions']['openSettings'];
type NativeRecordingStartActionKey =
  | 'startScreenRecording'
  | 'startWindowRecording'
  | 'startRegionRecording';

const recordingStartActionKeys: NativeRecordingStartActionKey[] = [
  'startScreenRecording',
  'startWindowRecording',
  'startRegionRecording',
];

const recordingControlActionKeys = [
  'pauseRecording',
  'resumeRecording',
  'stopRecording',
] as const satisfies readonly NativeTrayActionKey[];

function createAction(
  key: NativeTrayActionKey,
  locale: AppLocale,
  setting: NativeTrayActionSetting,
  extra: Partial<NativeTrayActionDescriptor> = {},
  capabilities: NativeAppCapabilities | null = null
): NativeTrayActionDescriptor {
  const command = nativeTrayActionCommands[key];
  const { enabled = setting.enabled, ...extraDescriptor } = extra;
  const shortcutLabel = normalizeShortcutLabel(setting.shortcutLabel);
  const action: NativeTrayActionDescriptor = {
    enabled,
    id: command.id,
    kind: command.kind,
    label: translate(trayActionLabelKeys[key], locale),
    offlineCapable: setting.offlineCapable,
    ...(shortcutLabel ? { shortcutLabel } : {}),
    ...extraDescriptor,
  };
  if (isNativeTrayActionCommandSupported(command, capabilities)) {
    return action;
  }
  return {
    ...action,
    enabled: false,
    warning: translate('settings.nativeApp.trayUnsupportedMode', locale),
  };
}

function isNativeTrayActionCommandSupported(
  command: NativeTrayActionCommand,
  capabilities: NativeAppCapabilities | null
): boolean {
  if (!capabilities) {
    return true;
  }
  if (command.kind === 'capture-screenshot') {
    return capabilities.capture.screenshotModes.includes(command.mode);
  }
  if (command.kind === 'start-recording') {
    return capabilities.capture.videoModes.includes(command.mode);
  }
  return true;
}

export async function createNativeTrayActionRegistry(
  native: NativeCaptureSettings,
  capabilities: NativeAppCapabilities | null = null,
  quickActions: QuickAction[] = []
): Promise<NativeTrayActionRegistry> {
  const locale = getCurrentLocale();
  const shortcutPriority = createBrowserActiveShortcutPriority(quickActions);
  const actions = [
    createAction('openSettings', locale, native.trayActions.openSettings, {}, capabilities),
    ...createScreenshotTrayActions(native, locale, capabilities),
    ...createRecordingTrayActions(native, locale, capabilities),
    ...createAppTailTrayActions(native, locale, capabilities),
  ];
  return {
    actions,
    revision: await createTrayRegistryRevision({ actions, locale, shortcutPriority }),
    ...(shortcutPriority ? { shortcutPriority } : {}),
  };
}

function createAppTailTrayActions(
  native: NativeCaptureSettings,
  locale: AppLocale,
  capabilities: NativeAppCapabilities | null
): NativeTrayActionDescriptor[] {
  return [
    createAction('openGallery', locale, native.trayActions.openGallery, {}, capabilities),
    createAction('openVideoEditor', locale, native.trayActions.openVideoEditor, {}, capabilities),
  ];
}

function createScreenshotTrayActions(
  native: NativeCaptureSettings,
  locale: AppLocale,
  capabilities: NativeAppCapabilities | null
): NativeTrayActionDescriptor[] {
  return [
    createAction(
      'captureScreenScreenshot',
      locale,
      native.trayActions.captureScreenScreenshot,
      {},
      capabilities
    ),
    createAction(
      'captureWindowScreenshot',
      locale,
      native.trayActions.captureWindowScreenshot,
      {},
      capabilities
    ),
    createAction(
      'captureAllScreensScreenshot',
      locale,
      native.trayActions.captureAllScreensScreenshot,
      {},
      capabilities
    ),
    createAction(
      'captureRegionScreenshot',
      locale,
      native.trayActions.captureRegionScreenshot,
      {},
      capabilities
    ),
  ];
}

function createRecordingTrayActions(
  native: NativeCaptureSettings,
  locale: AppLocale,
  capabilities: NativeAppCapabilities | null
): NativeTrayActionDescriptor[] {
  const recordingControlsEnabled = hasEnabledRecordingStartAction(native, capabilities);
  return [
    createRecordingStartAction('startScreenRecording', native, locale, capabilities),
    createRecordingStartAction('startWindowRecording', native, locale, capabilities),
    createRecordingStartAction('startRegionRecording', native, locale, capabilities),
    ...recordingControlActionKeys.map((key) =>
      createAction(
        key,
        locale,
        native.trayActions[key],
        { enabled: recordingControlsEnabled },
        capabilities
      )
    ),
  ];
}

function createRecordingStartAction(
  key: NativeRecordingStartActionKey,
  native: NativeCaptureSettings,
  locale: AppLocale,
  capabilities: NativeAppCapabilities | null
): NativeTrayActionDescriptor {
  return createAction(
    key,
    locale,
    native.trayActions[key],
    { enabled: native.video.enabled && native.trayActions[key].enabled },
    capabilities
  );
}

function hasEnabledRecordingStartAction(
  native: NativeCaptureSettings,
  capabilities: NativeAppCapabilities | null
): boolean {
  return (
    native.video.enabled &&
    recordingStartActionKeys.some((key) => {
      const command = nativeTrayActionCommands[key];
      return (
        native.trayActions[key].enabled && isNativeTrayActionCommandSupported(command, capabilities)
      );
    })
  );
}

export function createDefaultNativeTrayActionRegistry(
  capabilities: NativeAppCapabilities | null = null
): Promise<NativeTrayActionRegistry> {
  return createNativeTrayActionRegistry(
    DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings,
    capabilities
  );
}
