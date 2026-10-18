import { applyVideoProjectMutationPatch } from '../mutation';
import type { VideoProject } from '../types/model';
import { reviewTextOrigins } from '../../review/text-document';
import { isTextSourceClip } from './projection';
import type { VideoProjectTextDocument } from './types';
import { parseVideoProjectTextDocuments, hasValidVideoProjectTextReferences } from './validation';

/** Applies native recognized text without replacing manual text or another source instance. */
export function applyVideoProjectRecognition(
  project: VideoProject,
  entry: VideoProjectTextDocument,
  range: { start: number; end: number },
  mode: 'add' | 'replace'
): VideoProject | null {
  if (
    entry.binding.kind !== 'source' ||
    !project.clips.some((clip) => isTextSourceClip(clip, entry.binding)) ||
    project.textDocuments?.some((document) => document.id === entry.id) ||
    entry.document.fragments.some(
      (fragment) => fragment.start < range.start || fragment.end > range.end
    )
  )
    return null;
  const binding = entry.binding;
  const retained = (project.textDocuments ?? []).map((document) => {
    if (
      mode !== 'replace' ||
      document.binding.kind !== 'source' ||
      document.binding.assetId !== binding.assetId ||
      document.binding.sourceInstanceId !== binding.sourceInstanceId
    )
      return document;
    return {
      ...document,
      document: {
        ...document.document,
        fragments: document.document.fragments.filter((fragment) => {
          const origins = reviewTextOrigins(fragment);
          return !(
            fragment.variantId &&
            origins.length &&
            origins.every(
              (origin) =>
                origin.kind === 'original' && origin.start >= range.start && origin.end <= range.end
            )
          );
        }),
      },
    };
  });
  const documents = parseVideoProjectTextDocuments([...retained, entry]);
  if (!documents) return null;
  const candidate = applyVideoProjectMutationPatch(project, { textDocuments: documents });
  return hasValidVideoProjectTextReferences(candidate) ? candidate : null;
}
