export type EditableAggregateKind = 'image' | 'scenario' | 'video-project';

export interface AggregateRef {
  id: string;
  kind: EditableAggregateKind;
}

/** Derived gallery presentation for one authoritative aggregate workspace revision. */
export interface AggregatePresentationEntry {
  aggregateId: string;
  aggregateKind: EditableAggregateKind;
  presentationRevision: number;
  previewBlob?: Blob;
  thumbnailBlob: Blob;
  updatedAt: number;
}

export function createAggregatePresentationKey(ref: AggregateRef): [EditableAggregateKind, string] {
  return [ref.kind, ref.id];
}

export function serializeAggregateRef(ref: AggregateRef): string {
  return `${ref.kind}:${ref.id}`;
}
