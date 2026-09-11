import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';

type ParsedPresentationDocument = ReturnType<typeof parseEffectV1Source>;
const MAX_DOCUMENTS = 32;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
// Disposable presentation data only; import/apply integrity checks remain independent.
const documents = new Map<string, ParsedPresentationDocument>();
let sourceBytes = 0;

/** Reuses immutable parsed metadata across catalog variants and inspector renders. */
export function readEffectPresentationDocument(source: string): ParsedPresentationDocument {
  const cached = documents.get(source);
  if (cached) {
    documents.delete(source);
    documents.set(source, cached);
    return cached;
  }
  const parsed = parseEffectV1Source(source);
  freezePresentationValue(parsed);
  const bytes = source.length * 2;
  if (bytes > MAX_SOURCE_BYTES) return parsed;
  while (documents.size >= MAX_DOCUMENTS || sourceBytes + bytes > MAX_SOURCE_BYTES) {
    const oldest = documents.keys().next().value;
    if (oldest === undefined) break;
    documents.delete(oldest);
    sourceBytes -= oldest.length * 2;
  }
  documents.set(source, parsed);
  sourceBytes += bytes;
  return parsed;
}

function freezePresentationValue(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezePresentationValue(child);
  Object.freeze(value);
}
