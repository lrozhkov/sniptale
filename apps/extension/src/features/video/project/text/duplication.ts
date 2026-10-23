import type { VideoProjectTextDocument } from './types';
import { parseVideoProjectTextDocuments } from './validation';

/** Copies authored documents for new instances, refusing the complete operation at its budget. */
export function duplicateVideoProjectTextDocuments(
  documents: readonly VideoProjectTextDocument[],
  instances: ReadonlyMap<string, string>
): VideoProjectTextDocument[] | null {
  const copies = documents.flatMap((entry) => {
    if (entry.binding.kind !== 'source') return [];
    const sourceInstanceId = instances.get(entry.binding.sourceInstanceId);
    return sourceInstanceId
      ? [
          {
            ...structuredClone(entry),
            id: crypto.randomUUID(),
            binding: { ...entry.binding, sourceInstanceId },
          },
        ]
      : [];
  });
  const next = [...documents, ...copies];
  return parseVideoProjectTextDocuments(next) ? next : null;
}
