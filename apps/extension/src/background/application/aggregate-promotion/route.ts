import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import { parseAggregateRef } from '../../../contracts/aggregate-promotion';
import { coordinateAggregatePromotion } from './coordinator';

type AggregatePromotionResponse = RuntimeMessageResponse<{ result?: 'promoted' }>;

export function routeAggregatePromotionMessage(
  message: unknown,
  sendResponse: ResponseSender<AggregatePromotionResponse>
): boolean {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return false;
  const record = message as Record<string, unknown>;
  const aggregate = parseAggregateRef(record['aggregate']);
  if (record['type'] !== MessageType.PROMOTE_AGGREGATE_TO_LIBRARY || !aggregate) return false;
  coordinateAggregatePromotion(aggregate).then(
    () => sendResponse({ result: 'promoted', success: true }),
    (error) =>
      sendResponse({
        error: error instanceof Error ? error.message : 'Could not save this project.',
        success: false,
      })
  );
  return true;
}
