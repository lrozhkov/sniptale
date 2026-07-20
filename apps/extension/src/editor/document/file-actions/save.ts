import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { SavePreset } from '../../../contracts/settings';
import {
  createScenarioEditorEmbedApplyMessage,
  readEditorEmbedMode,
} from '../../../features/editor/contracts/embed';
import { translate } from '../../../platform/i18n';
import { sendRuntimeMessage } from '../../../platform/runtime-messaging';
import { readEditorAssetId, readEditorSessionId } from '@sniptale/runtime-contracts/editor/session';
import { loadEditorExportSettings } from '../../persistence/export-settings';
import { loadSettings } from '../../../composition/persistence/settings';
import { generateFilename } from '@sniptale/foundation/utils/filename';
import type { EditorRenderedImageOptions } from '../model/render-options';
import { saveToGalleryAsset } from './gallery-update';
import type { EditorRenderedImagePort } from './ports';
import { assertBackgroundResponse, EditorStoragePromptError } from './save-errors';

export { EditorStoragePromptError } from './save-errors';

type SaveEditorRenderedImageController = EditorRenderedImagePort;

export interface SaveEditorRenderedImageOptions {
  actionType?: 'download_default' | 'ask_system';
  filename?: string;
  outputSize?: EditorRenderedImageOptions['outputSize'];
  presetId?: string | null;
}

export interface EditorSaveOptions {
  defaultImagePresetId: string | null;
  presets: SavePreset[];
}

async function executeSave(
  dataUrl: string,
  options: SaveEditorRenderedImageOptions,
  settings: Awaited<ReturnType<typeof loadSettings>>,
  imageFormat: Awaited<ReturnType<typeof loadEditorExportSettings>>['imageFormat']
): Promise<void> {
  const filename = options.filename ?? generateFilename('edited', imageFormat);
  const presetId =
    options.presetId ??
    (options.actionType === 'download_default'
      ? (settings.defaultImagePresetId ?? undefined)
      : undefined);

  const result = await sendRuntimeMessage({
    type: MessageType.EXECUTE_SAVE,
    ...(options.actionType === undefined ? {} : { actionType: options.actionType }),
    dataUrl,
    filename,
    ...(presetId === undefined ? {} : { presetId }),
  });
  await assertBackgroundResponse(result, translate('editor.runtime.saveImageFailed'));
}

function applyEmbedSave(controller: SaveEditorRenderedImageController, dataUrl: string): void {
  const document = controller.exportDocument();
  window.parent.postMessage(
    createScenarioEditorEmbedApplyMessage(dataUrl, document),
    window.location.origin
  );
}

export async function loadEditorSaveOptions(): Promise<EditorSaveOptions> {
  const settings = await loadSettings();

  return {
    presets: (settings.presets ?? []).filter((preset) => preset.enabled),
    defaultImagePresetId: settings.defaultImagePresetId ?? null,
  };
}

export function isEditorStoragePromptError(error: unknown): error is EditorStoragePromptError {
  return error instanceof EditorStoragePromptError && error.shouldOfferStorageManager;
}

export async function saveEditorRenderedImage(
  controller: SaveEditorRenderedImageController,
  options: SaveEditorRenderedImageOptions = {}
): Promise<void> {
  const [settings, exportSettings] = await Promise.all([
    loadSettings(),
    loadEditorExportSettings(),
  ]);
  const dataUrl = controller.renderToDataUrl({
    format: exportSettings.imageFormat,
    quality: exportSettings.imageQuality,
    ...(options.outputSize ? { outputSize: options.outputSize } : {}),
  });
  const embedMode = readEditorEmbedMode(window.location.search);
  const actionType = options.actionType ?? 'download_default';
  const assetId = readEditorAssetId(window.location.search);
  const editorSessionId = readEditorSessionId(window.location.search);

  if (embedMode === 'scenario') {
    applyEmbedSave(controller, dataUrl);
    return;
  }

  if (assetId && editorSessionId && actionType === 'download_default' && !options.presetId) {
    await saveToGalleryAsset({
      assetId,
      dataUrl,
      editorSessionId,
      filename: options.filename,
    });
    return;
  }

  await executeSave(dataUrl, { ...options, actionType }, settings, exportSettings.imageFormat);
}
