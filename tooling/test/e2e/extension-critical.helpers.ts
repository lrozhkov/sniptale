import type { Page } from '@playwright/test';
import { translate } from '../../../apps/extension/src/platform/i18n';
import { createExactBrowserFrameHarnessPayload } from '../harness/editor/scenarios/browser-frame-exact';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  VideoExportFormat,
  VideoProjectExportPhase,
} from '../../../apps/extension/src/features/video/project/types';
import type {
  SniptaleHarnessApiBehaviorOverrides,
  SniptaleHarnessBootstrap,
} from '../harness/browser-mocks.types';

export const POPUP_HARNESS_PATH = '/tooling/test/harness/popup.html';
export const EDITOR_HARNESS_PATH = '/tooling/test/harness/editor.html';
export const GALLERY_HARNESS_PATH = '/tooling/test/harness/gallery.html';
export const SETTINGS_HARNESS_PATH = '/tooling/test/harness/settings.html';
export const VIDEO_EDITOR_HARNESS_PATH = '/tooling/test/harness/video-editor.html';
export const SCENARIO_EDITOR_VISUAL_HARNESS_PATH =
  '/tooling/test/harness/scenario-editor-visual.html';
export const OFFSCREEN_HARNESS_PATH = '/tooling/test/harness/offscreen.html';
export const GALLERY_EXPORT_BACKUP_LABEL = translate('gallery.app.exportBackup', 'ru');
export const GALLERY_CONFIRM_EXPORT_BACKUP_LABEL = translate(
  'gallery.backupExportModal.export',
  'ru'
);
export const GALLERY_IMPORT_BACKUP_LABEL = translate('gallery.app.importBackup', 'ru');
export const GALLERY_IMPORT_DUPLICATE_LABEL = translate('gallery.importModal.duplicateTitle', 'ru');
export const GALLERY_OPEN_IN_EDITOR_LABEL = translate('gallery.preview.openInEditor', 'ru');
export const SETTINGS_QUICK_ACTIONS_LABEL = translate('settings.navigation.quickactions', 'ru');
export const SETTINGS_ADD_ACTION_LABEL = translate('settings.quickActions.addButton', 'ru');
export const SETTINGS_SAVE_LABEL = translate('common.actions.save', 'ru');
export const SETTINGS_NAME_PLACEHOLDER = translate('settings.quickActions.namePlaceholder', 'ru');
export const POPUP_EXPORT_TAB_LABEL = translate('popup.tabs.export', 'ru');
export const POPUP_VIDEO_TAB_LABEL = translate('popup.tabs.video', 'ru');
export const POPUP_VIDEO_PAUSE_LABEL = translate('popup.video.pauseButton', 'ru');
export const POPUP_VIDEO_RESUME_LABEL = translate('popup.video.resumeButton', 'ru');
export const POPUP_VIDEO_STOP_LABEL = translate('popup.video.stopButton', 'ru');
export const POPUP_VIDEO_CANCEL_LABEL = translate('popup.video.cancelButton', 'ru');
export const VIDEO_EDITOR_EXPORT_BUTTON_LABEL = translate('videoEditor.app.exportButton', 'ru');
export const VIDEO_EDITOR_EXPORT_SUBMIT_LABEL = translate('videoEditor.exportDialog.submit', 'ru');
export const VIDEO_EDITOR_PROGRESS_CANCEL_LABEL = translate('videoEditor.progress.cancel', 'ru');
export const VIDEO_EDITOR_EXPORT_FAILURE_TITLE = translate(
  'videoEditor.exportDialog.failureTitle',
  'ru'
);
export const VIDEO_EDITOR_EXPORT_FAILURE_CLOSE_LABEL = translate(
  'videoEditor.exportDialog.failureClose',
  'ru'
);
export const VIDEO_EDITOR_EXPORT_FAILURE_RETRY_LABEL = translate(
  'videoEditor.exportDialog.failureRetry',
  'ru'
);
export const VIDEO_EDITOR_EFFECT_ADD_LABEL = translate(
  'videoEditor.effectsLibrary.applyButton',
  'ru'
);
export const VIDEO_EDITOR_EFFECT_IMPORT_LABEL = translate(
  'videoEditor.effectsLibrary.importPack',
  'ru'
);
export const VIDEO_EDITOR_EFFECT_DISABLE_LABEL = translate(
  'videoEditor.effectsLibrary.disablePack',
  'ru'
);
export const VIDEO_EDITOR_EFFECT_ENABLE_LABEL = translate(
  'videoEditor.effectsLibrary.enablePack',
  'ru'
);
export const VIDEO_EDITOR_PLAY_LABEL = translate('videoEditor.timeline.play', 'ru');
export const VIDEO_EDITOR_PAUSE_LABEL = translate('videoEditor.timeline.pause', 'ru');
export const QUICK_ACTIONS_KEY = 'sniptale_quick_actions';
export const QUICK_ACTIONS_DISPLAY_MODE_KEY = 'sniptale_quick_actions_display_mode';

export type HarnessRuntimeMessage = {
  type?: string;
  actionId?: string;
  actionType?: string;
  captureMode?: CaptureMode;
  dataUrl?: string;
  input?: {
    contentSha256?: string;
    jobId?: string;
    projectId?: string;
    retainedByteLength?: number;
  };
  jobId?: string;
  projectId?: string;
  settings?: Record<string, unknown>;
  tabId?: number;
};

export const E2E_RUNTIME_SUCCESS_API_BEHAVIOR: SniptaleHarnessApiBehaviorOverrides = {
  runtimeFallback: 'typed-success',
};

export function createQuickAction(name: string) {
  return {
    id: 'critical-edit-visible',
    status: true,
    name,
    icon: 'PencilLine',
    origin: 'user' as const,
    bundledId: null,
    hotkey: null,
    screenshotMode: 'visible' as const,
    emulation: 'native',
    delay: null,
    afterCapture: 'edit' as const,
    imageFormat: 'png' as const,
    imageQuality: null,
    exitAfterCapture: true,
  };
}

export async function applyHarnessBootstrap(page: Page, bootstrap: SniptaleHarnessBootstrap) {
  await page.addInitScript((value) => {
    window.__sniptaleHarnessBootstrap = value;
  }, bootstrap);
}

export async function applyGalleryScreenshotBootstrap(
  page: Page,
  asset: {
    id: string;
    filename: string;
    createdAt: number;
    size: number;
    width: number;
    height: number;
    sourceUrl: string;
    sourceTitle: string;
    tags: string[];
    blobText: string;
  }
) {
  await page.addInitScript((value) => {
    window.__sniptaleHarnessBootstrap = {
      ...(window.__sniptaleHarnessBootstrap ?? {}),
      mediaLibrary: [
        {
          entry: {
            id: value.id,
            kind: 'screenshot',
            source: { kind: 'screenshot' },
            filename: value.filename,
            originalFilename: value.filename,
            createdAt: value.createdAt,
            updatedAt: value.createdAt,
            size: value.size,
            mimeType: 'image/png',
            width: value.width,
            height: value.height,
            duration: null,
            sourceUrl: value.sourceUrl,
            sourceTitle: value.sourceTitle,
            sourceFavicon: null,
            tags: value.tags,
            blob: new Blob([value.blobText], { type: 'image/png' }),
          },
        },
      ],
    };
  }, asset);
}

export async function getHarnessStorageState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => window.__sniptaleHarness?.getStorageState() ?? {});
}

export async function countMediaLibraryEntries(page: Page): Promise<number> {
  return page.evaluate(async () => {
    return (await window.__sniptaleHarness?.getMediaLibraryState())?.length ?? 0;
  });
}

export async function countRuntimeMessagesByType(page: Page, type: string): Promise<number> {
  return page.evaluate((messageType) => {
    return (
      window.__sniptaleHarness?.getRuntimeMessages().filter((message) => {
        return (
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === messageType
        );
      }).length ?? 0
    );
  }, type);
}

export async function getRuntimeMessagesByType(
  page: Page,
  type: string
): Promise<HarnessRuntimeMessage[]> {
  return page.evaluate((messageType) => {
    return (
      window.__sniptaleHarness?.getRuntimeMessages().filter((message) => {
        return (
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === messageType
        );
      }) ?? []
    );
  }, type) as Promise<HarnessRuntimeMessage[]>;
}

export async function emitHarnessRuntimeMessage(page: Page, message: unknown): Promise<void> {
  await page.evaluate((runtimeMessage) => {
    window.__sniptaleHarness?.emitRuntimeMessage(runtimeMessage);
  }, message);
}

export async function emitTrustedOffscreenHarnessRuntimeMessage(
  page: Page,
  message: { type: string } & Record<string, unknown>
): Promise<void> {
  await page.evaluate((runtimeMessage) => {
    window.__sniptaleHarness?.emitTrustedOffscreenRuntimeMessage(runtimeMessage);
  }, message);
}

export function createRecordingRuntimeState(status: VideoRecordingStatus) {
  return {
    status,
    duration: status === VideoRecordingStatus.COUNTDOWN ? 0 : 12,
    countdownEndsAt: status === VideoRecordingStatus.COUNTDOWN ? Date.now() + 3_000 : null,
    captureMode: CaptureMode.TAB,
    captureSource: {
      mode: CaptureMode.TAB,
      streamId: 'stream-1',
      tabId: 1,
      tabTitle: 'Harness tab',
      tabUrl: 'https://example.com/',
    },
    viewportPreset: null,
    error: null,
  };
}

export function createVideoExportStatus(
  phase: VideoProjectExportPhase,
  progress: number,
  message = `Harness ${phase.toLowerCase()}`
) {
  return {
    phase,
    progress,
    message,
  };
}

export {
  createExactBrowserFrameHarnessPayload,
  VideoExportFormat,
  VideoMessageType,
  VideoProjectExportPhase,
  CaptureMode,
  VideoRecordingStatus,
};
