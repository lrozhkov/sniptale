import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../platform/i18n';
import { sendRuntimeMessage } from '../../../platform/runtime-messaging';
import { assertBackgroundResponse, EditorStoragePromptError } from './save-errors';

function readUpdateCapabilityToken(response: unknown): string | null {
  if (typeof response !== 'object' || response === null || !('updateCapabilityToken' in response)) {
    return null;
  }

  return typeof response.updateCapabilityToken === 'string' ? response.updateCapabilityToken : null;
}

async function requestGalleryImageUpdateCapability(
  assetId: string,
  editorSessionId: string
): Promise<string> {
  const capabilityResponse = await sendRuntimeMessage({
    type: MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY,
    assetId,
    editorSessionId,
  });
  await assertBackgroundResponse(
    capabilityResponse,
    translate('editor.runtime.saveToGalleryFailed')
  );

  const updateCapabilityToken = readUpdateCapabilityToken(capabilityResponse);
  if (!updateCapabilityToken) {
    throw new EditorStoragePromptError(translate('editor.runtime.saveToGalleryFailed'));
  }
  return updateCapabilityToken;
}

async function updateGalleryImageAssetWithCapability(args: {
  assetId: string;
  dataUrl: string;
  editorSessionId: string;
  filename: string | undefined;
  updateCapabilityToken: string;
}): Promise<void> {
  const result = await sendRuntimeMessage({
    type: MessageType.UPDATE_GALLERY_IMAGE_ASSET,
    assetId: args.assetId,
    dataUrl: args.dataUrl,
    editorSessionId: args.editorSessionId,
    updateCapabilityToken: args.updateCapabilityToken,
    ...(args.filename === undefined ? {} : { filename: args.filename }),
  });
  await assertBackgroundResponse(result, translate('editor.runtime.saveToGalleryFailed'));
}

export async function saveToGalleryAsset(args: {
  assetId: string;
  dataUrl: string;
  editorSessionId: string;
  filename: string | undefined;
}): Promise<void> {
  const updateCapabilityToken = await requestGalleryImageUpdateCapability(
    args.assetId,
    args.editorSessionId
  );
  await updateGalleryImageAssetWithCapability({
    assetId: args.assetId,
    dataUrl: args.dataUrl,
    editorSessionId: args.editorSessionId,
    filename: args.filename,
    updateCapabilityToken,
  });
}
