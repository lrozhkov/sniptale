import type { AudioStagedHandle, ProjectAudioTextJobScope } from '../../contracts/ai/audio';
import {
  getVideoProject,
  prepareProjectAsset,
  deleteProjectAsset,
  type PreparedProjectAsset,
} from '../../composition/persistence/projects';
import { isCurrentVideoProjectSnapshot } from '../../composition/persistence/projects/revision';
import { discardAudioStaging } from '../../composition/persistence/assets/audio-staging';
import {
  assertLibraryAudioBindingSource,
  readLibraryAudioBindingSource,
} from '../../composition/persistence/projects/library-asset-binding';
import type { VideoProject } from '../../features/video/project/types/model';
import { captureVideoProjectVoiceTextBasis } from '../../features/video/project/text/voice-scope';
import {
  parseVideoProjectVoiceTextSnapshot,
  type VideoProjectVoiceTextSnapshot,
} from '../../features/video/project/text/voice-take';
import { createVideoProjectAsset } from '../../features/video/project/factories/creation';
import {
  addVideoProjectVoiceTake,
  type VideoProjectVoicePlacement,
} from '../../features/video/project/text/authoring';
import { applyVideoProjectMutationPatch } from '../../features/video/project/mutation';
import { inspectReviewAudio } from '../video-review/audio-import';

/** The mounted editor owns Save and aborts its operation signal when its session ends. */
export interface ProjectVoiceReadAccess {
  getProject(): VideoProject | null;
  save(): Promise<void>;
}

/** The mounted consumer seals its history action synchronously around this update. */
export interface ProjectVoiceTakeAccess extends ProjectVoiceReadAccess {
  update(updater: (project: VideoProject) => VideoProject): void;
}

interface VoiceAttachment {
  access: ProjectVoiceTakeAccess;
  placement: string;
  prepared?: PreparedProjectAsset;
  cleanup?: PreparedProjectAsset;
  receipt?: { clipId: string; assetId: string; signature: string };
}

type LibrarySource = Awaited<ReturnType<typeof readLibraryAudioBindingSource>>;

/** Disposable audition data with explicit source authority and no durable placement. */
export interface ProjectVoiceTakePreview {
  origin: ProjectVoiceReadAccess;
  projectId: string;
  filename: string;
  source:
    | { kind: 'speech'; scope: ProjectAudioTextJobScope; staged: AudioStagedHandle }
    | { kind: 'local'; library?: { source: LibrarySource; projectAssetId: string } };
  textSnapshot: VideoProjectVoiceTextSnapshot;
  blob: Blob;
  duration: number;
  url: string;
  expiresAt: number;
  attachment?: VoiceAttachment;
  accepting?: Promise<void>;
  closed?: boolean;
}

function localProjectKey(project: VideoProject): string {
  return JSON.stringify({ ...project, updatedAt: 0 });
}

/** Decodes a local selection without saving, publishing, or acquiring AI staging authority. */
export async function prepareProjectLocalTextVoice(args: {
  access: ProjectVoiceReadAccess;
  documentId: string;
  fragmentId: string;
  selection:
    | { kind: 'file'; file: File }
    | { kind: 'library'; id: string; auditionedSource?: LibrarySource };
  kind: 'microphone' | 'gallery';
  signal: AbortSignal;
}): Promise<ProjectVoiceTakePreview> {
  const { access, documentId, fragmentId, selection, signal } = args;
  signal.throwIfAborted();
  const project = access.getProject();
  if (!project) throw new Error('stale');
  if (args.kind === 'microphone' && selection.kind !== 'file') throw new Error('invalid-request');
  const initial = localProjectKey(project);
  const captured = await captureVideoProjectVoiceTextBasis(project, documentId, fragmentId);
  signal.throwIfAborted();
  const source =
    selection.kind === 'library'
      ? (selection.auditionedSource ?? (await readLibraryAudioBindingSource(selection.id)))
      : null;
  if (selection.kind === 'library' && source?.mediaId !== selection.id)
    throw new Error('invalid-request');
  const file = source?.file ?? (selection.kind === 'file' ? selection.file : null);
  if (!file) throw new Error('invalid-request');
  const duration = await inspectReviewAudio(file, signal);
  signal.throwIfAborted();
  const current = access.getProject();
  if (!current || localProjectKey(current) !== initial) throw new Error('stale');
  const { basis, basisHash } = captured;
  const { fragment } = basis;
  const textSnapshot = parseVideoProjectVoiceTextSnapshot({
    version: 1,
    documentId,
    binding: basis.binding,
    basisHash,
    text: {
      kind: args.kind,
      textId: fragment.id,
      revision: fragment.revision,
      timingRevision: fragment.timingRevision,
      text: fragment.text,
      start: fragment.start,
      end: fragment.end,
      timeDomain: fragment.timeDomain,
    },
  });
  if (!textSnapshot) throw new Error('invalid-request');
  const blob = file.type ? file : new File([file], file.name, { type: 'audio/mpeg' });
  return {
    origin: access,
    projectId: basis.projectId,
    filename: file.name,
    source: {
      kind: 'local',
      ...(source
        ? { library: { source, projectAssetId: source.entry?.id ?? crypto.randomUUID() } }
        : {}),
    },
    textSnapshot,
    blob,
    duration,
    url: URL.createObjectURL(blob),
    expiresAt: Infinity,
  };
}

async function assertLocalSource(preview: ProjectVoiceTakePreview) {
  if (preview.source.kind === 'local' && preview.source.library) {
    const { source, projectAssetId } = preview.source.library;
    await assertLibraryAudioBindingSource(source, projectAssetId);
  }
}

/** Cleanup retains exact staging authority after deletion, independently of preview freshness. */
export async function cleanupProjectVoiceTakePreview(
  preview: ProjectVoiceTakePreview
): Promise<void> {
  preview.closed = true;
  await preview.accepting?.catch(() => undefined);
  if (preview.attachment && !preview.attachment.receipt) {
    await releaseUnacceptedVoice(preview.attachment);
    delete preview.attachment;
  }
  URL.revokeObjectURL(preview.url);
  if (preview.source.kind === 'speech')
    await discardAudioStaging(preview.source.staged, preview.source.scope);
}

/** Accepts once; a failed Save retries its receipt without another paid job or insertion. */
export async function acceptProjectVoiceTake(
  access: ProjectVoiceTakeAccess,
  preview: ProjectVoiceTakePreview,
  placement: VideoProjectVoicePlacement,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted();
  if (preview.closed || preview.origin !== access) throw new Error('stale');
  if (preview.accepting) throw new Error('busy');
  const pending = applyVoiceAttachment(access, preview, placement, signal);
  preview.accepting = pending;
  try {
    await pending;
  } finally {
    delete preview.accepting;
  }
}

function voiceReceiptSignature(project: VideoProject | null, attachment: VoiceAttachment) {
  const receipt = attachment.receipt;
  if (!project || !receipt) return '';
  const clip = project.clips.find((entry) => entry.id === receipt.clipId);
  const asset = project.assets.find((entry) => entry.id === receipt.assetId);
  return clip && asset ? JSON.stringify([clip, asset]) : '';
}

async function releaseUnacceptedVoice(attachment: VoiceAttachment) {
  if (attachment.receipt) return;
  if (attachment.prepared) {
    // Cancellation can commit before its acknowledgement fails. Never publish this handle again.
    attachment.cleanup = attachment.prepared;
    delete attachment.prepared;
  }
  const cleanup = attachment.cleanup;
  if (!cleanup) return;
  await cleanup.cancel();
  await deleteProjectAsset(cleanup.id);
  delete attachment.cleanup;
}

async function applyVoiceAttachment(
  access: ProjectVoiceTakeAccess,
  preview: ProjectVoiceTakePreview,
  placement: VideoProjectVoicePlacement,
  signal: AbortSignal
) {
  const placementKey = JSON.stringify([
    placement.start,
    placement.trackId,
    placement.timelineLaneId,
  ]);
  const attachment: VoiceAttachment = preview.attachment ?? { access, placement: placementKey };
  if (attachment.access !== access || attachment.placement !== placementKey)
    throw new Error('stale');
  preview.attachment = attachment;
  if (attachment.cleanup) await releaseUnacceptedVoice(attachment);
  try {
    if (!attachment.receipt) {
      await insertVoiceAttachment(access, preview, attachment, placement, signal);
    }
    const receipt = attachment.receipt;
    const matches = (project: VideoProject | null) =>
      project?.id === preview.projectId &&
      receipt &&
      voiceReceiptSignature(project, attachment) === receipt.signature;
    if (!matches(access.getProject())) throw new Error('stale');
    await access.save();
    signal.throwIfAborted();
    const saved = await getVideoProject(preview.projectId);
    signal.throwIfAborted();
    if (
      saved.status !== 'ready' ||
      saved.lifecycle?.trashedAt !== undefined ||
      !matches(saved.project) ||
      !matches(access.getProject())
    )
      throw new Error('stale');
  } catch (error) {
    if (!attachment.receipt) {
      try {
        await releaseUnacceptedVoice(attachment);
        delete preview.attachment;
      } catch {
        // An unresolved publication keeps its handle for explicit retry or cleanup.
      }
    }
    throw error;
  }
}

async function insertVoiceAttachment(
  access: ProjectVoiceTakeAccess,
  preview: ProjectVoiceTakePreview,
  attachment: VoiceAttachment,
  placement: VideoProjectVoicePlacement,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  const initial = access.getProject();
  if (
    preview.closed ||
    !initial ||
    initial.id !== preview.projectId ||
    Date.now() >= preview.expiresAt
  )
    throw new Error('stale');
  const basis = localProjectKey(initial);
  const assertCurrent = () => {
    signal.throwIfAborted();
    const current = access.getProject();
    if (
      preview.closed ||
      !current ||
      localProjectKey(current) !== basis ||
      Date.now() >= preview.expiresAt
    )
      throw new Error('stale');
    return current;
  };
  await access.save();
  const current = assertCurrent();
  const saved = await getVideoProject(current.id);
  assertCurrent();
  if (
    saved.status !== 'ready' ||
    saved.lifecycle?.trashedAt !== undefined ||
    localProjectKey(saved.project) !== basis
  )
    throw new Error('stale');
  const asset = createVideoProjectAsset(
    preview.filename,
    'AUDIO',
    { kind: 'project-asset', projectAssetId: attachment.prepared?.id ?? crypto.randomUUID() },
    {
      width: 0,
      height: 0,
      duration: preview.duration,
      mimeType: preview.blob.type,
      size: preview.blob.size,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const planned = addVideoProjectVoiceTake(current, asset, preview.textSnapshot, placement);
  if (!planned) throw new Error('selection');
  if (asset.source.kind !== 'project-asset') throw new Error('invalid-request');
  await assertLocalSource(preview);
  assertCurrent();
  attachment.prepared ??= await prepareProjectAsset(
    preview.blob,
    preview.blob.type,
    asset.name,
    asset.source.projectAssetId,
    undefined,
    undefined,
    { publishToLibrary: false }
  );
  assertCurrent();
  await attachment.prepared.publish();
  assertCurrent();
  if (!(await isCurrentVideoProjectSnapshot(saved.project, saved.workspaceRevision)))
    throw new Error('stale');
  assertCurrent();
  await assertLocalSource(preview);
  assertCurrent();
  access.update((project) => {
    if (localProjectKey(project) !== basis) throw new Error('stale');
    const next = applyVideoProjectMutationPatch(project, {
      assets: planned.project.assets,
      tracks: planned.project.tracks,
      clips: planned.project.clips,
      duration: planned.project.duration,
    });
    attachment.receipt = { clipId: planned.clip.id, assetId: asset.id, signature: '' };
    attachment.receipt.signature = voiceReceiptSignature(next, attachment);
    return next;
  });
  if (!attachment.receipt) throw new Error('stale');
}
