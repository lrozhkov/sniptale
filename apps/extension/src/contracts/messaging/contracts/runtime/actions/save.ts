import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isCaptureActionType,
  isImageDataUrl,
  isString,
} from '../../../validators/index';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';
import { runtimeActionWebSnapshotSaveMessageContracts } from './save.web-snapshot.ts';
import type { SaveAssetResponse } from '../../response-types';
import {
  isContentPrivilegedActionCapability,
  isRecentCaptureEditorAssetCapability,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';

const isSaveAssetResponseShape = createRuntimeResponseGuard<SaveAssetResponse>({
  optional: {
    assetId: isString,
    editorAssetCapability: isRecentCaptureEditorAssetCapability,
  },
});

function isSaveAssetResponse(value: unknown): value is SaveAssetResponse {
  if (!isSaveAssetResponseShape(value)) return false;
  return !('editorAssetCapability' in value) || 'assetId' in value;
}

export const runtimeActionSaveMessageContracts = {
  [MessageType.EXECUTE_SAVE]: {
    parseRequest: createGuardParser(
      'runtime EXECUTE_SAVE message',
      createMessageGuard({
        type: MessageType.EXECUTE_SAVE,
        required: { dataUrl: isImageDataUrl, filename: isString },
        optional: {
          actionType: isCaptureActionType,
          contentIntent: isContentPrivilegedActionCapability,
          presetId: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXECUTE_SAVE response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [MessageType.SAVE_SCREENSHOT_TO_GALLERY]: {
    parseRequest: createGuardParser(
      'runtime SAVE_SCREENSHOT_TO_GALLERY message',
      createMessageGuard({
        type: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
        required: { dataUrl: isImageDataUrl, filename: isString },
        optional: {
          contentIntent: isContentPrivilegedActionCapability,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime SAVE_SCREENSHOT_TO_GALLERY response',
      isSaveAssetResponse
    ),
  },
  ...runtimeActionWebSnapshotSaveMessageContracts,
} satisfies PartialRuntimeRegistry;
