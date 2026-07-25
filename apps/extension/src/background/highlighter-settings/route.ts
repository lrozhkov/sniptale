import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { ContentSenderBinding } from '../routing-contracts/capabilities/content-action/capability-store';
import { setDefaultBorderPresetWithOutcome } from '../../composition/persistence/highlighter';
import { createRouteErrorResponse, respondAsyncSuccess } from '../routing-contracts/response';

type HighlighterSettingsMutationResponse = RuntimeMessageResponse<{ result?: string }>;

function isHighlighterSettingsMutationMessage(message: unknown): message is {
  operation: 'set-default-border-preset';
  presetId: string;
  type: typeof MessageType.HIGHLIGHTER_SETTINGS_MUTATION;
} {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === MessageType.HIGHLIGHTER_SETTINGS_MUTATION &&
    (message as { operation?: unknown }).operation === 'set-default-border-preset' &&
    typeof (message as { presetId?: unknown }).presetId === 'string'
  );
}

export function routeHighlighterSettingsMutationMessage(args: {
  message: unknown;
  senderBinding: ContentSenderBinding | null;
  sendResponse: ResponseSender<HighlighterSettingsMutationResponse>;
}): boolean {
  if (!isHighlighterSettingsMutationMessage(args.message)) return false;
  if (!args.senderBinding) {
    args.sendResponse(createRouteErrorResponse('Unauthorized highlighter settings mutation'));
    return true;
  }

  respondAsyncSuccess(
    setDefaultBorderPresetWithOutcome(args.message.presetId).then((outcome) => {
      if (outcome === 'rejected') {
        throw new Error('Highlighter preset target was rejected');
      }
    }),
    args.sendResponse
  );
  return true;
}
