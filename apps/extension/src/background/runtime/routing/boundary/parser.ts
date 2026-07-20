import { parseBackgroundRuntimeMessage } from '../../../../contracts/messaging/parsers/boundary';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import type { RuntimeMessageEnvelope } from '../message-guards/guards/shared';
import { consumeRuntimeMessageFreshness, inspectRuntimeMessageFreshness } from './freshness';

export function parseRuntimeMessage(args: {
  logger: { warn: (...value: unknown[]) => void };
  message: unknown;
  sender: chrome.runtime.MessageSender;
  sendResponse: ResponseSender;
}): RuntimeMessageEnvelope | null {
  const freshnessInspection = inspectRuntimeMessageFreshness({
    message: args.message,
    sender: args.sender,
  });
  if (!freshnessInspection.authorized) {
    args.logger.warn('Rejected runtime message without valid freshness', {
      reason: freshnessInspection.reason,
    });
    args.sendResponse(createRouteErrorResponse(freshnessInspection.reason));
    return null;
  }

  try {
    const parsedMessage = parseBackgroundRuntimeMessage(freshnessInspection.message);
    if (!parsedMessage) {
      return null;
    }

    const freshnessConsumption = consumeRuntimeMessageFreshness({
      handle: freshnessInspection.consumeHandle,
    });
    if (!freshnessConsumption.authorized) {
      args.logger.warn('Rejected runtime message with replayed freshness', {
        reason: freshnessConsumption.reason,
      });
      args.sendResponse(createRouteErrorResponse(freshnessConsumption.reason));
      return null;
    }
    return parsedMessage;
  } catch {
    args.logger.warn('Rejected runtime message without a valid contract');
    args.sendResponse(createRouteErrorResponse('Unknown message type'));
    return null;
  }
}
