import {
  openGalleryPage,
  openImageEditorPage,
  openSettingsPage,
  openVideoEditorPage,
} from '../../../platform/navigation/extension-pages';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { translate } from '../../../platform/i18n';
import { loadPopupExportPreferences } from '../../../composition/persistence/popup-export-preferences';
import { loadSettings } from '../../../composition/persistence/settings';
import {
  loadVideoSettings,
  loadVideoUiState,
} from '../../../composition/persistence/capture-settings';
import { type Settings } from '../../../contracts/settings';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  CaptureMode,
  type VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import { startRecording } from '../../media/lifecycle';
import { issueFullPageExportContentIntentGrant } from '../../routing-contracts/capabilities/content-action/grants';
import {
  CONTEXT_MENU_EXPORT_COPY_JSON_ID,
  CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID,
  CONTEXT_MENU_EXPORT_START_ID,
  CONTEXT_MENU_GALLERY_ID,
  CONTEXT_MENU_IMAGE_EDITOR_ID,
  CONTEXT_MENU_SCREENSHOTS_PREPARE_ID,
  CONTEXT_MENU_SETTINGS_ID,
  CONTEXT_MENU_VIDEO_AREA_ID,
  CONTEXT_MENU_VIDEO_EDITOR_ID,
  CONTEXT_MENU_VIDEO_PRESET_ID,
  CONTEXT_MENU_VIDEO_TAB_ID,
  CONTEXT_MENU_VIDEO_WINDOW_ID,
} from './constants';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';
import { isPageLinkContextMenuItem } from './page-link/constants';

type ContextMenuToastType = 'info' | 'success' | 'warning' | 'error';

function buildContextMenuExportOptions() {
  return loadPopupExportPreferences().then((preferences) => ({
    includeBasicLogs: preferences.includeBasicLogs,
    includeCssDiagnostics: preferences.includeCssDiagnostics,
    includeFiles: preferences.includeFiles,
    includeFullPageScreenshot: preferences.includeFullPageScreenshot,
    includeHarDomLogs: preferences.includeHarDomLogs,
    includeImages: preferences.includeImages,
    includeJson: preferences.includeJson,
    includeMarkdown: preferences.includeMarkdown,
  }));
}

function createContextMenuToastMessage(args: {
  message: string;
  title?: string;
  type?: ContextMenuToastType;
}): {
  type: MessageType.SHOW_TOAST;
  payload: { message: string; title?: string; type?: ContextMenuToastType };
} {
  return {
    type: MessageType.SHOW_TOAST,
    payload: {
      message: args.message,
      ...(args.title ? { title: args.title } : {}),
      ...(args.type ? { type: args.type } : {}),
    },
  };
}

export async function showContextMenuToast(
  tabId: number,
  args: { message: string; title?: string; type?: ContextMenuToastType }
): Promise<void> {
  await getBackgroundRuntimeMessaging().sendTabMessage(tabId, createContextMenuToastMessage(args));
}

export function resolveContextMenuVideoPreset(
  settings: Settings
): Promise<VideoViewportPresetSelection | null> {
  return loadVideoUiState().then((videoUiState) => {
    const presets = settings.viewportPresets ?? [];
    const defaultPresetId = settings.defaultVideoPresetId ?? null;
    const preferredPresetId = videoUiState.viewportPresetId ?? defaultPresetId;
    const fallbackPresetId = presets.some((preset) => preset.id === defaultPresetId)
      ? defaultPresetId
      : null;
    const resolvedPresetId = presets.some((preset) => preset.id === preferredPresetId)
      ? preferredPresetId
      : fallbackPresetId;
    const preset = presets.find((entry) => entry.id === resolvedPresetId);

    return preset
      ? {
          id: preset.id,
          width: preset.width,
          height: preset.height,
          label: preset.label,
        }
      : null;
  });
}

export async function startContextMenuVideoRecording(
  tabId: number,
  captureMode: CaptureMode
): Promise<void> {
  const [videoSettings, settings] = await Promise.all([loadVideoSettings(), loadSettings()]);
  const viewportPreset =
    captureMode === CaptureMode.VIEWPORT_EMULATION
      ? await resolveContextMenuVideoPreset(settings)
      : undefined;

  if (captureMode === CaptureMode.VIEWPORT_EMULATION && !viewportPreset) {
    throw new Error(translate('popup.video.choosePresetError'));
  }

  const popupOwnerUrl = runtimeInfo.getURL('apps/extension/src/popup/index.html');
  if (viewportPreset) {
    await startRecording(tabId, videoSettings, captureMode, viewportPreset, popupOwnerUrl);
    return;
  }

  await startRecording(tabId, videoSettings, captureMode, undefined, popupOwnerUrl);
}

export async function startContextMenuExport(tabId: number): Promise<void> {
  const options = await buildContextMenuExportOptions();
  const requestId = crypto.randomUUID();
  const response = await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    ...(options.includeFullPageScreenshot
      ? {
          contentIntentGrant: issueFullPageExportContentIntentGrant(tabId),
        }
      : {}),
    type: MessageType.EXPORT_POPUP_START,
    options,
    requestId,
  });

  if (!response?.success) {
    throw new Error(response?.error || translate('popup.export.startExportError'));
  }

  await showContextMenuToast(tabId, {
    message: translate('popup.export.startProgressMessage'),
    title: translate('popup.export.exportButton'),
    type: 'info',
  });
}

export async function copyContextMenuExportPreview(
  tabId: number,
  format: 'json' | 'markdown'
): Promise<void> {
  const previewResponse = await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });

  if (!previewResponse?.success || !previewResponse.preview) {
    throw new Error(previewResponse?.error || translate('popup.export.prepareExportError'));
  }

  const text =
    format === 'json'
      ? previewResponse.preview.jsonPreview
      : previewResponse.preview.markdownPreview;
  const copyResponse = await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: MessageType.COPY_TEXT_TO_CLIPBOARD,
    text,
  });

  if (!copyResponse?.success) {
    throw new Error(copyResponse?.error || translate('popup.export.prepareExportError'));
  }

  await showContextMenuToast(tabId, {
    message: translate('popup.export.copied'),
    title:
      format === 'json'
        ? translate('popup.export.copyJsonButton')
        : translate('popup.export.copyMarkdownButton'),
    type: 'success',
  });
}

export async function handlePageContextMenuAction(menuId: string): Promise<boolean> {
  switch (menuId) {
    case CONTEXT_MENU_IMAGE_EDITOR_ID:
      await openImageEditorPage();
      return true;

    case CONTEXT_MENU_VIDEO_EDITOR_ID:
      await openVideoEditorPage();
      return true;

    case CONTEXT_MENU_GALLERY_ID:
      await openGalleryPage();
      return true;

    case CONTEXT_MENU_SETTINGS_ID:
      await openSettingsPage();
      return true;

    default:
      return false;
  }
}

export function isTabBoundContextMenuAction(menuId: string): boolean {
  return (
    menuId === CONTEXT_MENU_SCREENSHOTS_PREPARE_ID ||
    menuId === CONTEXT_MENU_VIDEO_TAB_ID ||
    menuId === CONTEXT_MENU_VIDEO_AREA_ID ||
    menuId === CONTEXT_MENU_VIDEO_PRESET_ID ||
    menuId === CONTEXT_MENU_VIDEO_WINDOW_ID ||
    menuId === CONTEXT_MENU_EXPORT_START_ID ||
    menuId === CONTEXT_MENU_EXPORT_COPY_JSON_ID ||
    menuId === CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID ||
    isPageLinkContextMenuItem(menuId)
  );
}
