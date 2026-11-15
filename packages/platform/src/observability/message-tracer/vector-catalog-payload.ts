import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
export const VECTOR_CATALOG_TRACE_FAILURE_CODE = 'vector-catalog-runtime-failure';
export function isVectorCatalogTrace(messageType: string): boolean {
  return messageType === MessageType.EDITOR_VECTOR_CATALOG_COMMAND;
}
/** Catalog queries, chosen destinations and artwork never enter message diagnostics. */
export function sanitizeVectorCatalogTracePayload(messageType: string, payload: unknown): unknown {
  if (!isVectorCatalogTrace(messageType)) return payload;
  const summary: Record<string, unknown> = { type: MessageType.EDITOR_VECTOR_CATALOG_COMMAND };
  if (typeof payload !== 'object' || payload === null) return summary;
  const operation: unknown = Object.getOwnPropertyDescriptor(payload, 'operation')?.value;
  if (
    typeof operation === 'string' &&
    ['collections', 'search', 'collection', 'assets', 'check', 'cancel'].includes(operation)
  )
    summary['operation'] = operation;
  const success: unknown = Object.getOwnPropertyDescriptor(payload, 'success')?.value;
  if (typeof success === 'boolean') summary['success'] = success;
  if (Object.hasOwn(payload, 'error')) summary['error'] = VECTOR_CATALOG_TRACE_FAILURE_CODE;
  return summary;
}
