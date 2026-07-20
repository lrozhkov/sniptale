import type { NativeCaptureMode, NativeRecordingMode } from '../../../contracts/native-app';
import type { TranslationKey } from '../../../platform/i18n';
import type { NativeTrayActionKey } from '@sniptale/runtime-contracts/video/types/types';

export type TrayActionRowConfig = {
  capability?:
    | { kind: 'screenshot'; mode: NativeCaptureMode }
    | { kind: 'recording'; mode: NativeRecordingMode };
  description: TranslationKey;
  key: NativeTrayActionKey;
  label: TranslationKey;
};

export type TrayActionGroupConfig = {
  actions: TrayActionRowConfig[];
  title: TranslationKey;
};

export const nativeRecordingStartActionKeys = [
  'startScreenRecording',
  'startWindowRecording',
  'startRegionRecording',
] as const satisfies readonly NativeTrayActionKey[];

const nativeRecordingControlActionKeys = [
  'pauseRecording',
  'resumeRecording',
  'stopRecording',
] as const satisfies readonly NativeTrayActionKey[];

export function isNativeRecordingControlActionKey(key: NativeTrayActionKey): boolean {
  return (nativeRecordingControlActionKeys as readonly NativeTrayActionKey[]).includes(key);
}

export const trayActionGroups: TrayActionGroupConfig[] = [
  {
    title: 'settings.nativeApp.trayGroupScreenshots',
    actions: [
      {
        capability: { kind: 'screenshot', mode: 'screen' },
        key: 'captureScreenScreenshot',
        label: 'settings.nativeApp.trayCaptureScreenScreenshot',
        description: 'settings.nativeApp.trayCaptureScreenDescription',
      },
      {
        capability: { kind: 'screenshot', mode: 'active-window' },
        key: 'captureWindowScreenshot',
        label: 'settings.nativeApp.trayCaptureWindowScreenshot',
        description: 'settings.nativeApp.trayCaptureWindowDescription',
      },
      {
        capability: { kind: 'screenshot', mode: 'all-screens' },
        key: 'captureAllScreensScreenshot',
        label: 'settings.nativeApp.trayCaptureAllScreensScreenshot',
        description: 'settings.nativeApp.trayCaptureAllScreensDescription',
      },
      {
        capability: { kind: 'screenshot', mode: 'region' },
        key: 'captureRegionScreenshot',
        label: 'settings.nativeApp.trayCaptureRegionScreenshot',
        description: 'settings.nativeApp.trayCaptureRegionDescription',
      },
    ],
  },
  {
    title: 'settings.nativeApp.trayGroupRecording',
    actions: [
      {
        capability: { kind: 'recording', mode: 'screen' },
        key: 'startScreenRecording',
        label: 'settings.nativeApp.trayStartScreenRecording',
        description: 'settings.nativeApp.trayStartScreenDescription',
      },
      {
        capability: { kind: 'recording', mode: 'active-window' },
        key: 'startWindowRecording',
        label: 'settings.nativeApp.trayStartWindowRecording',
        description: 'settings.nativeApp.trayStartWindowDescription',
      },
      {
        capability: { kind: 'recording', mode: 'region' },
        key: 'startRegionRecording',
        label: 'settings.nativeApp.trayStartRegionRecording',
        description: 'settings.nativeApp.trayStartRegionDescription',
      },
      {
        key: 'pauseRecording',
        label: 'settings.nativeApp.trayPauseRecording',
        description: 'settings.nativeApp.trayPauseDescription',
      },
      {
        key: 'resumeRecording',
        label: 'settings.nativeApp.trayResumeRecording',
        description: 'settings.nativeApp.trayResumeDescription',
      },
      {
        key: 'stopRecording',
        label: 'settings.nativeApp.trayStopRecording',
        description: 'settings.nativeApp.trayStopDescription',
      },
    ],
  },
  {
    title: 'settings.nativeApp.trayGroupApp',
    actions: [
      {
        key: 'openSettings',
        label: 'settings.nativeApp.trayOpenSettings',
        description: 'settings.nativeApp.trayOpenSettingsDescription',
      },
      {
        key: 'openGallery',
        label: 'settings.nativeApp.trayOpenGallery',
        description: 'settings.nativeApp.trayOpenGalleryDescription',
      },
      {
        key: 'openVideoEditor',
        label: 'settings.nativeApp.trayOpenVideoEditor',
        description: 'settings.nativeApp.trayOpenVideoEditorDescription',
      },
    ],
  },
];

export function listNativeTrayActionFieldKeys(): NativeTrayActionKey[] {
  return trayActionGroups.flatMap((group) => group.actions.map((action) => action.key));
}
