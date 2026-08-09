export interface EditableAggregateRef {
  id: string;
  kind: 'image' | 'scenario' | 'video-project';
}

export const AGGREGATE_EDITOR_PRESENCE_PORT = 'aggregate-editor-presence';

export type AggregateEditorClientMessage =
  | { aggregate: EditableAggregateRef; type: 'register' }
  | { error?: string; requestId: string; success: boolean; type: 'promotion-result' };

export type AggregateEditorServerMessage = {
  aggregate: EditableAggregateRef;
  requestId: string;
  type: 'promote';
};

export function parseAggregateRef(value: unknown): EditableAggregateRef | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = record['kind'];
  return Object.keys(record).length === 2 &&
    typeof record['id'] === 'string' &&
    record['id'].length > 0 &&
    record['id'].length <= 256 &&
    (kind === 'image' || kind === 'scenario' || kind === 'video-project')
    ? { id: record['id'], kind }
    : null;
}

export function parseAggregateEditorClientMessage(
  value: unknown
): AggregateEditorClientMessage | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record['type'] === 'register') {
    const aggregate = parseAggregateRef(record['aggregate']);
    return aggregate && Object.keys(record).length === 2 ? { aggregate, type: 'register' } : null;
  }
  if (
    record['type'] !== 'promotion-result' ||
    typeof record['requestId'] !== 'string' ||
    typeof record['success'] !== 'boolean' ||
    (record['error'] !== undefined && typeof record['error'] !== 'string')
  ) {
    return null;
  }
  return {
    ...(typeof record['error'] === 'string' ? { error: record['error'] } : {}),
    requestId: record['requestId'],
    success: record['success'],
    type: 'promotion-result',
  };
}
