import type { VideoProjectCommentDocument } from './types';
import { parseVideoProjectCommentDocuments } from './validation';

/** Copies source-bound content into independent documents, preserving local note-to-bubble links. */
export function duplicateVideoProjectCommentDocuments(
  documents: readonly VideoProjectCommentDocument[],
  instances: ReadonlyMap<string, string>
): VideoProjectCommentDocument[] | null {
  const copies = documents.flatMap((document) => {
    if (document.binding.kind !== 'source') return [];
    const sourceInstanceId = instances.get(document.binding.sourceInstanceId);
    return sourceInstanceId
      ? [
          {
            ...structuredClone(document),
            id: crypto.randomUUID(),
            binding: { ...document.binding, sourceInstanceId },
          },
        ]
      : [];
  });
  const next = [...documents, ...copies];
  return parseVideoProjectCommentDocuments(next) ? next : null;
}
