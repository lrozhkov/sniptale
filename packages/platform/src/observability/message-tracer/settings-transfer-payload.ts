import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeSettingsTransferTracePayload(
  messageType: string,
  payload: unknown
): unknown {
  if (!messageType.startsWith(MessageType.SETTINGS_TRANSFER)) return payload;
  if (!isRecord(payload)) return { payloadPresent: payload !== null && payload !== undefined };

  const summary: Record<string, unknown> = { type: MessageType.SETTINGS_TRANSFER };
  if (typeof payload['operation'] === 'string') summary['operation'] = payload['operation'];
  if (typeof payload['success'] === 'boolean') summary['success'] = payload['success'];
  if (typeof payload['errorCode'] === 'string') summary['errorCode'] = payload['errorCode'];
  if (typeof payload['fileText'] === 'string')
    summary['fileTextLength'] = payload['fileText'].length;
  if (Array.isArray(payload['selectedNodeIds'])) {
    summary['selectedNodeCount'] = payload['selectedNodeIds'].length;
  }
  if (isRecord(payload['inspection'])) {
    const inspection = payload['inspection'];
    summary['conflictCount'] = Array.isArray(inspection['conflicts'])
      ? inspection['conflicts'].length
      : 0;
  }
  if (isRecord(payload['report'])) {
    const report = payload['report'];
    for (const key of ['added', 'updated', 'copiedRemapped', 'unchanged', 'skipped']) {
      if (typeof report[key] === 'number') summary[key] = report[key];
    }
  }
  return summary;
}
