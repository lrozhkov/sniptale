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

export function parseEffectRuntimeSnapshotDocument(source: string): EffectV1Document {
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
  return validation.document;
}
