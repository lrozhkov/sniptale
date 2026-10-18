import { createSha256Digest } from '@sniptale/platform/security/digest';
import { isProjectAudioTextJobScope, parseAudioJobScope } from '../../../../contracts/ai/audio';
import type { VideoProject } from '../types/model';
import { projectVideoProjectTextFragment, projectVideoProjectTextSourceSpans } from './projection';
import { hasValidVideoProjectTextReferences, parseVideoProjectTextDocuments } from './validation';

function captureVoiceBasis(project: VideoProject, documentId: string, fragmentId: string) {
  const entries = project.textDocuments?.filter((entry) => entry.id === documentId) ?? [];
  const entry = entries[0];
  if (!entry || entries.length !== 1) throw new Error('stale');
  if (
    !parseVideoProjectTextDocuments([entry]) ||
    !hasValidVideoProjectTextReferences({ ...project, textDocuments: [entry] }) ||
    !Number.isFinite(project.createdAt) ||
    project.createdAt < 0
  )
    throw new Error('invalid-request');
  const selected = entry.document.fragments.find((fragment) => fragment.id === fragmentId);
  if (!selected) throw new Error('stale');
  if (!selected.text.trim()) throw new Error('invalid-request');
  if (selected.text.length > 4096) throw new Error('too-large');
  const basis = {
    projectId: project.id,
    projectCreatedAt: project.createdAt,
    documentId: entry.id,
    binding: structuredClone(entry.binding),
    fragment: structuredClone(selected),
    projection: structuredClone(projectVideoProjectTextFragment(project, entry, selected)),
    sourceSpans: structuredClone(projectVideoProjectTextSourceSpans(project, entry, selected)),
  };
  basis.projection.ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  basis.sourceSpans.sort(
    (left, right) =>
      left.startTime - right.startTime ||
      left.endTime - right.endTime ||
      left.sourceStart - right.sourceStart ||
      left.sourceEnd - right.sourceEnd ||
      (left.clipId < right.clipId ? -1 : left.clipId > right.clipId ? 1 : 0)
  );
  return basis;
}

function serializeVoiceBasis(basis: ReturnType<typeof captureVoiceBasis>): string {
  const { fragment, binding, projection, sourceSpans } = basis;
  return JSON.stringify({
    projectId: basis.projectId,
    projectCreatedAt: basis.projectCreatedAt,
    documentId: basis.documentId,
    binding:
      binding.kind === 'project'
        ? { kind: binding.kind }
        : {
            kind: binding.kind,
            assetId: binding.assetId,
            sourceInstanceId: binding.sourceInstanceId,
          },
    fragment: {
      id: fragment.id,
      text: fragment.text,
      revision: fragment.revision,
      timingRevision: fragment.timingRevision,
      start: fragment.start,
      end: fragment.end,
      timeDomain: fragment.timeDomain,
    },
    projection: {
      excludedFromResult: projection.excludedFromResult,
      partiallyExcluded: projection.partiallyExcluded,
      ranges: projection.ranges.map(({ start, end }) => ({ start, end })),
    },
    sourceSpans: sourceSpans.map(({ clipId, sourceStart, sourceEnd, startTime, endTime }) => ({
      clipId,
      sourceStart,
      sourceEnd,
      startTime,
      endTime,
    })),
  });
}

/** Captures one authored speech basis without granting access to any source bytes. */
export async function createVideoProjectTextAudioScope(
  project: VideoProject,
  projectRevision: number,
  documentId: string,
  fragmentId: string
) {
  const basis = captureVoiceBasis(project, documentId, fragmentId);
  const projectUpdatedAt = project.updatedAt;
  const basisHash = await createSha256Digest(serializeVoiceBasis(basis));
  const scope = parseAudioJobScope({
    projectId: basis.projectId,
    projectRevision,
    projectUpdatedAt,
    target: { kind: 'project-text', documentId: basis.documentId, fragmentId: basis.fragment.id },
    basisHash,
  });
  if (!scope || !isProjectAudioTextJobScope(scope)) throw new Error('invalid-request');
  return { scope, basis };
}
