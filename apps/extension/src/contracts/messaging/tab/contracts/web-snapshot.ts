import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isString,
} from '../../validators/index';
import { isWebSnapshotManifest } from '../../../../features/web-snapshot/manifest';
import type { TabRequestByType, TabResponseByType } from '../index';

type PartialTabRegistry = Partial<MessageContractRegistry<TabRequestByType, TabResponseByType>>;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export const tabWebSnapshotMessageContracts = {
  [MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT]: {
    parseRequest: createGuardParser(
      'tab EXPORT_POPUP_SAVE_WEB_SNAPSHOT message',
      createMessageGuard({
        type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
        required: {
          allowAnonymousCrossOriginAssets: isBoolean,
          allowAuthenticatedSameOriginAssets: isBoolean,
          requestId: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'tab EXPORT_POPUP_SAVE_WEB_SNAPSHOT response',
      createRuntimeResponseGuard({
        optional: { assetId: isString, manifest: isWebSnapshotManifest, warnings: isStringArray },
      })
    ),
  },
} satisfies PartialTabRegistry;
