import {
  parseAnimationTemplateSource,
  type AnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';

class EffectRuntimeSnapshotDocumentError extends Error {
  constructor() {
    super('Effect runtime snapshot document is invalid');
    this.name = 'EffectRuntimeSnapshotDocumentError';
  }
}

// Snapshot lifetime bounds this derived cache; it never keeps a discarded project alive.
const documents = new WeakMap<object, { source: string; document: AnimationTemplate }>();

export function parseEffectRuntimeSnapshotDocument(snapshot: {
  readonly source: string;
}): AnimationTemplate {
  const { source } = snapshot;
  const cached = documents.get(snapshot);
  if (cached?.source === source) return cached.document;
  documents.delete(snapshot);
  const validation = parseAnimationTemplateSource(source);
  if (!validation.ok) throw new EffectRuntimeSnapshotDocumentError();
  freezeDocument(validation.template);
  documents.set(snapshot, { source, document: validation.template });
  return validation.template;
}

function freezeDocument(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeDocument(child);
  Object.freeze(value);
}
