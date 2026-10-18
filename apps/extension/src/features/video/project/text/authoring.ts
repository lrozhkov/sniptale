import { applyVideoProjectMutationPatch } from '../mutation';
import type { VideoProject } from '../types/model';
import {
  addReviewTextFragment,
  createReviewCaptionSettings,
  createReviewTextDocument,
} from '../../review/text-document';
import type { ReviewCaptionSettings, ReviewTextDocument } from '../../review/text-types';
import { getMediaClipSourceTime } from '../timeline/rate';
import { isTextSourceClip } from './projection';
import type { VideoProjectTextDocument } from './types';
import { parseVideoProjectTextDocuments } from './validation';

type TextMutation =
  | { ok: true; project: VideoProject; entry: VideoProjectTextDocument }
  | { ok: false; reason: 'stale' | 'invalid' };

/** Admits one document edit against its current identity and the shared aggregate text budget. */
export function applyVideoProjectTextEdit(
  project: VideoProject,
  basis: VideoProjectTextDocument,
  patch: { document?: ReviewTextDocument; captions?: ReviewCaptionSettings }
): TextMutation {
  if (!project.textDocuments?.includes(basis)) return { ok: false, reason: 'stale' };
  const next = { ...basis, ...patch };
  const documents = project.textDocuments.map((entry) => (entry === basis ? next : entry));
  if (!parseVideoProjectTextDocuments(documents)) return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    project: applyVideoProjectMutationPatch(project, { textDocuments: documents }),
    entry: next,
  };
}

/** New manual text uses montage time; only an explicit existing project document can receive it. */
export function addVideoProjectManualText(
  project: VideoProject,
  args: {
    documentId: string;
    fragmentId: string;
    start: number;
    target?: VideoProjectTextDocument;
  }
): TextMutation {
  if (args.target && !project.textDocuments?.includes(args.target))
    return { ok: false, reason: 'stale' };
  if (args.target?.binding.kind === 'source') return { ok: false, reason: 'invalid' };
  const entry: VideoProjectTextDocument = args.target ?? {
    id: args.documentId,
    binding: { kind: 'project' },
    document: createReviewTextDocument(),
    captions: createReviewCaptionSettings(),
  };
  const result = addReviewTextFragment(entry.document, {
    id: args.fragmentId,
    start: args.start,
    end: Math.min(86_400, args.start + 3),
  });
  if (!result.ok) return { ok: false, reason: 'invalid' };
  if (args.target) return applyVideoProjectTextEdit(project, entry, { document: result.document });
  const next = { ...entry, document: result.document };
  const documents = [...(project.textDocuments ?? []), next];
  if (!parseVideoProjectTextDocuments(documents)) return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    project: applyVideoProjectMutationPatch(project, { textDocuments: documents }),
    entry: next,
  };
}

/** Source edits require one native playhead value across all active placements of the instance. */
export function videoProjectTextPlayhead(
  project: VideoProject,
  entry: VideoProjectTextDocument,
  projectTime: number
): number | null {
  if (entry.binding.kind === 'project') return projectTime;
  const values = project.clips.flatMap((clip) =>
    (clip.type === 'VIDEO' || clip.type === 'AUDIO') &&
    isTextSourceClip(clip, entry.binding) &&
    clip.startTime <= projectTime &&
    projectTime < clip.startTime + clip.duration
      ? [getMediaClipSourceTime(clip, projectTime)]
      : []
  );
  const first = values[0];
  if (first === undefined || values.some((value) => Math.abs(value - first) > 1e-7)) return null;
  return first;
}
