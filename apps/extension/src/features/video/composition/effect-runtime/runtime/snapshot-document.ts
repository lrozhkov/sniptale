import {
  validateEffectV1Document,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import { parseBoundedEffectJson } from '../../../project/effect-bundle/json-structure';

class EffectRuntimeSnapshotDocumentError extends Error {
  constructor() {
    super('Effect runtime snapshot document is invalid');
    this.name = 'EffectRuntimeSnapshotDocumentError';
  }
}

// Snapshot lifetime bounds this derived cache; it never keeps a discarded project alive.
const documents = new WeakMap<object, { source: string; document: EffectV1Document }>();

export function parseEffectRuntimeSnapshotDocument(snapshot: {
  readonly source: string;
}): EffectV1Document {
  const { source } = snapshot;
  const cached = documents.get(snapshot);
  if (cached?.source === source) return cached.document;
  documents.delete(snapshot);
  let input: unknown;
  try {
    input = parseBoundedEffectJson(new TextEncoder().encode(source));
  } catch {
    throw new EffectRuntimeSnapshotDocumentError();
  }
  const validation = validateEffectV1Document(input);
  if (!validation.ok || !validation.document) {
    throw new EffectRuntimeSnapshotDocumentError();
  }
  freezeDocument(validation.document);
  documents.set(snapshot, { source, document: validation.document });
  return validation.document;
}

function freezeDocument(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeDocument(child);
  Object.freeze(value);
}
