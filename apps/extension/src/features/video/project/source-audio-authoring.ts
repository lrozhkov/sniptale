import { applyVideoProjectMutationPatch } from './mutation';
import type { VideoProject } from './types/model';
import {
  parseVideoProjectSourceAudioDocuments,
  hasValidVideoProjectSourceAudioReferences,
  type VideoProjectSourceAudioDocument,
} from './source-audio';

type SourceAudioMutation =
  | { ok: true; project: VideoProject; document: VideoProjectSourceAudioDocument | null }
  | { ok: false; reason: 'stale' | 'locked' | 'invalid' };

/** Every bound placement must permit an edit, including hidden placements. */
export function isProjectSourceAudioEditable(
  project: VideoProject,
  binding: VideoProjectSourceAudioDocument['binding']
): boolean {
  return project.clips.every(
    (clip) =>
      (clip.type !== 'VIDEO' && clip.type !== 'AUDIO') ||
      clip.assetId !== binding.assetId ||
      (clip.sourceInstanceId ?? clip.id) !== binding.sourceInstanceId ||
      project.tracks.some((track) => track.id === clip.trackId && !track.locked)
  );
}

/** Changes only envelopes; clearing the last range retains independent recognition metadata. */
export function applyProjectSourceAudioEdit(
  project: VideoProject,
  basis: VideoProjectSourceAudioDocument,
  patch: Pick<VideoProjectSourceAudioDocument, 'ranges' | 'mutes'> | null
): SourceAudioMutation {
  if (!project.sourceAudioDocuments?.includes(basis)) return { ok: false, reason: 'stale' };
  if (!isProjectSourceAudioEditable(project, basis.binding)) return { ok: false, reason: 'locked' };
  const envelope = patch ?? (basis.speech ? { ranges: [], mutes: [] } : null);
  if (
    envelope &&
    JSON.stringify(envelope.ranges) === JSON.stringify(basis.ranges) &&
    JSON.stringify(envelope.mutes) === JSON.stringify(basis.mutes)
  )
    return { ok: true, project, document: basis };
  const documents = envelope
    ? project.sourceAudioDocuments.map((document) =>
        document === basis ? { ...basis, ranges: envelope.ranges, mutes: envelope.mutes } : document
      )
    : project.sourceAudioDocuments.filter((document) => document !== basis);
  return admit(project, documents, envelope ? basis.id : null);
}

/** Adds an explicit source binding with caller-supplied identity through the ordinary mutation port. */
export function addProjectSourceAudioDocument(
  project: VideoProject,
  document: VideoProjectSourceAudioDocument
): SourceAudioMutation {
  if (!isProjectSourceAudioEditable(project, document.binding))
    return { ok: false, reason: 'locked' };
  return admit(project, [...(project.sourceAudioDocuments ?? []), document], document.id);
}

function admit(
  project: VideoProject,
  input: VideoProjectSourceAudioDocument[],
  id: string | null
): SourceAudioMutation {
  const documents = parseVideoProjectSourceAudioDocuments(input);
  if (
    !documents ||
    !hasValidVideoProjectSourceAudioReferences({ ...project, sourceAudioDocuments: documents })
  )
    return { ok: false, reason: 'invalid' };
  const next = applyVideoProjectMutationPatch(project, { sourceAudioDocuments: documents });
  return {
    ok: true,
    project: next,
    document: id === null ? null : documents.find((document) => document.id === id)!,
  };
}

/** Copies source documents only after the montage command supplies its complete instance map. */
export function duplicateProjectSourceAudioDocuments(
  documents: VideoProjectSourceAudioDocument[],
  instances: ReadonlyMap<string, string>,
  createId: () => string
): VideoProjectSourceAudioDocument[] | null {
  const copies = documents.flatMap((document) => {
    const sourceInstanceId = instances.get(document.binding.sourceInstanceId);
    return sourceInstanceId
      ? [
          {
            ...structuredClone(document),
            id: createId(),
            binding: { ...document.binding, sourceInstanceId },
          },
        ]
      : [];
  });
  return parseVideoProjectSourceAudioDocuments([...documents, ...copies]);
}
