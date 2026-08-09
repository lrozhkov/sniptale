// policyStateId: aggregate-editor-presence - exact document-bound editor presence authorizes promotion coordination.
import type { EditableAggregateRef } from '../../../contracts/aggregate-promotion';

export interface AggregateEditorPresence {
  aggregate: EditableAggregateRef;
  documentId: string;
  port: chrome.runtime.Port;
  senderUrl: string;
}

const presenceByAggregate = new Map<string, Map<string, AggregateEditorPresence>>();

export function registerAggregateEditorPresence(presence: AggregateEditorPresence): () => void {
  const key = serializeRef(presence.aggregate);
  const documents = presenceByAggregate.get(key) ?? new Map<string, AggregateEditorPresence>();
  const existing = documents.get(presence.documentId);
  if (existing && existing.port !== presence.port) existing.port.disconnect();
  documents.set(presence.documentId, presence);
  presenceByAggregate.set(key, documents);
  return () => {
    if (documents.get(presence.documentId)?.port !== presence.port) return;
    documents.delete(presence.documentId);
    if (documents.size === 0) presenceByAggregate.delete(key);
  };
}

export function listAggregateEditorPresence(ref: EditableAggregateRef): AggregateEditorPresence[] {
  return [...(presenceByAggregate.get(serializeRef(ref))?.values() ?? [])];
}

export function clearAggregateEditorPresenceForTests(): void {
  presenceByAggregate.clear();
}

function serializeRef(ref: EditableAggregateRef): string {
  return JSON.stringify([ref.kind, ref.id]);
}
