import { inspectLocalVoiceSource } from './local-voice-source';
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
  type readLibraryAudioBindingSource,
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
  members: readonly ProjectVoiceTakePreview[];
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
  /** Microphone callers capture the canonical basis when recording starts. */
  recordingBasisHash?: string;
  signal: AbortSignal;
}): Promise<ProjectVoiceTakePreview> {
  const { access, documentId, fragmentId, selection, signal } = args;
  signal.throwIfAborted();
  const project = access.getProject();
  if (!project) throw new Error('stale');
  if (
    (args.kind === 'microphone' && selection.kind !== 'file') ||
    (args.recordingBasisHash !== undefined && args.kind !== 'microphone')
  )
    throw new Error('invalid-request');
  const initial = localProjectKey(project);
  const captured = await captureVideoProjectVoiceTextBasis(project, documentId, fragmentId);
  signal.throwIfAborted();
  const admitted = access.getProject();
  if (!admitted || localProjectKey(admitted) !== initial) throw new Error('stale');
  if (args.recordingBasisHash !== undefined && args.recordingBasisHash !== captured.basisHash)
    throw new Error('stale');
  const { source, file, duration } = await inspectLocalVoiceSource(selection, signal);
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

/** Each take keeps an explicit independent Montage destination. */
export interface ProjectVoiceTakeSelection {
  preview: ProjectVoiceTakePreview;
  placement: VideoProjectVoicePlacement;
}

type VoiceBatchItem = ProjectVoiceTakeSelection & { attachment: VoiceAttachment };

function bindVoiceBatch(
  access: ProjectVoiceTakeAccess,
  selected: readonly ProjectVoiceTakeSelection[]
) {
  if (!selected.length || new Set(selected.map((item) => item.preview)).size !== selected.length)
    throw new Error('invalid-request');
  for (const { preview } of selected) {
    if (preview.closed || preview.origin !== access) throw new Error('stale');
    if (preview.accepting) throw new Error('busy');
  }
  const members =
    selected.find(({ preview }) => preview.attachment)?.preview.attachment?.members ??
    selected.map(({ preview }) => preview);
  if (
    members.length !== selected.length ||
    members.some((preview, index) => preview !== selected[index]?.preview)
  )
    throw new Error('stale');
  const items: VoiceBatchItem[] = selected.map(({ preview, placement }) => {
    const destination = structuredClone(placement);
    const key = JSON.stringify([
      destination.start,
      destination.trackId,
      destination.timelineLaneId,
      destination.originalAudioMute,
    ]);
    const attachment = preview.attachment ?? { access, placement: key, members };
    if (
      attachment.access !== access ||
      attachment.placement !== key ||
      attachment.members !== members
    )
      throw new Error('stale');
    return { preview, placement: destination, attachment };
  });
  for (const item of items) item.preview.attachment = item.attachment;
  return items;
}

/** Accepts all takes in one update; failed Save retries the complete receipt without reinsertion. */
export async function acceptProjectVoiceTakes(
  access: ProjectVoiceTakeAccess,
  selected: readonly ProjectVoiceTakeSelection[],
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted();
  const items = bindVoiceBatch(access, selected);
  const pending = Promise.resolve().then(() => applyVoiceAttachments(access, items, signal));
  for (const { preview } of items) preview.accepting = pending;
  try {
    await pending;
  } finally {
    for (const { preview } of items) if (preview.accepting === pending) delete preview.accepting;
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

async function releaseVoiceBatch(items: readonly VoiceBatchItem[]) {
  let failed = false;
  for (const { preview, attachment } of items) {
    try {
      await releaseUnacceptedVoice(attachment);
      if (preview.attachment === attachment) delete preview.attachment;
    } catch {
      failed = true;
    }
  }
  if (failed) throw new Error('storage-failed');
}

async function applyVoiceAttachments(
  access: ProjectVoiceTakeAccess,
  items: readonly VoiceBatchItem[],
  signal: AbortSignal
) {
  for (const { attachment } of items)
    if (attachment.cleanup) await releaseUnacceptedVoice(attachment);
  try {
    const accepted = items.filter(({ attachment }) => attachment.receipt);
    if (accepted.length && accepted.length !== items.length) throw new Error('stale');
    if (!accepted.length) await insertVoiceAttachments(access, items, signal);
    const projectId = items[0]!.preview.projectId;
    const matches = (project: VideoProject | null) =>
      project?.id === projectId &&
      items.every(
        ({ attachment }) =>
          attachment.receipt &&
          voiceReceiptSignature(project, attachment) === attachment.receipt.signature
      );
    if (!matches(access.getProject())) throw new Error('stale');
    await access.save();
    signal.throwIfAborted();
    const saved = await getVideoProject(projectId);
    signal.throwIfAborted();
    if (
      saved.status !== 'ready' ||
      saved.lifecycle?.trashedAt !== undefined ||
      !matches(saved.project) ||
      !matches(access.getProject())
    )
      throw new Error('stale');
  } catch (error) {
    if (!items.some(({ attachment }) => attachment.receipt)) {
      try {
        await releaseVoiceBatch(items);
      } catch {
        // Unresolved compensation retains exact handles for explicit retry or cleanup.
      }
    }
    throw error;
  }
}

function planVoiceBatch(project: VideoProject, items: readonly VoiceBatchItem[]) {
  let next = project;
  const planned = items.map((item) => {
    const { preview, attachment, placement } = item;
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
    const added = addVideoProjectVoiceTake(next, asset, preview.textSnapshot, placement);
    if (!added) throw new Error('selection');
    next = added.project;
    return { ...item, asset, clip: added.clip };
  });
  return { project: next, items: planned };
}

async function insertVoiceAttachments(
  access: ProjectVoiceTakeAccess,
  items: readonly VoiceBatchItem[],
  signal: AbortSignal
) {
  signal.throwIfAborted();
  const initial = access.getProject();
  if (!initial) throw new Error('stale');
  const basis = localProjectKey(initial);
  const assertCurrent = () => {
    signal.throwIfAborted();
    const current = access.getProject();
    if (
      !current ||
      localProjectKey(current) !== basis ||
      items.some(
        ({ preview }) =>
          preview.closed || preview.projectId !== current.id || Date.now() >= preview.expiresAt
      )
    )
      throw new Error('stale');
    return current;
  };
  assertCurrent();
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
  const planned = planVoiceBatch(current, items);
  for (const { preview, attachment, asset } of planned.items) {
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
  }
  for (const { attachment } of items) {
    await attachment.prepared!.publish();
    assertCurrent();
  }
  if (!(await isCurrentVideoProjectSnapshot(saved.project, saved.workspaceRevision)))
    throw new Error('stale');
  assertCurrent();
  for (const { preview } of items) {
    await assertLocalSource(preview);
    assertCurrent();
  }
  access.update((project) => {
    if (localProjectKey(project) !== basis) throw new Error('stale');
    const next = applyVideoProjectMutationPatch(project, {
      assets: planned.project.assets,
      tracks: planned.project.tracks,
      clips: planned.project.clips,
      duration: planned.project.duration,
    });
    const receipts = planned.items.map(({ clip, asset, attachment }) => {
      const receipt = { clipId: clip.id, assetId: asset.id, signature: '' };
      const signature = voiceReceiptSignature(next, { ...attachment, receipt });
      return { ...receipt, signature };
    });
    planned.items.forEach(({ attachment }, index) => {
      attachment.receipt = receipts[index]!;
    });
    return next;
  });
  if (items.some(({ attachment }) => !attachment.receipt)) throw new Error('stale');
}
