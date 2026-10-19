import {
  AUDIO_STAGING_TTL_MS,
  type AudioStagedHandle,
  type ProjectAudioTextJobScope,
} from '../../contracts/ai/audio';
import {
  getVideoProject,
  prepareProjectAsset,
  deleteProjectAsset,
  type PreparedProjectAsset,
} from '../../composition/persistence/projects';
import { isCurrentVideoProjectSnapshot } from '../../composition/persistence/projects/revision';
import { readVideoProjectTextAudioTarget } from '../../composition/persistence/projects/text-audio-scope';
import {
  readAudioStaging,
  discardAudioStaging,
} from '../../composition/persistence/assets/audio-staging';
import type { VideoProject } from '../../features/video/project/types/model';
import { createVideoProjectTextAudioScope } from '../../features/video/project/text/voice-scope';
import {
  parseVideoProjectVoiceTextSnapshot,
  type VideoProjectVoiceTextSnapshot,
} from '../../features/video/project/text/voice-take';
import type { ReviewSpeechProfile } from '../../features/video/review/speech-transcript';
import { parseReviewSpeechProfile } from '../../features/video/review/speech-validation';
import { runReviewSpeechJob } from '../audio-jobs/client';
import { decodeReviewSpeechDuration } from '../video-review/speech-audio';
import { createVideoProjectAsset } from '../../features/video/project/factories/creation';
import {
  addVideoProjectVoiceTake,
  type VideoProjectVoicePlacement,
} from '../../features/video/project/text/authoring';
import { applyVideoProjectMutationPatch } from '../../features/video/project/mutation';

/** The mounted editor owns Save and aborts its operation signal when its session ends. */
export interface ProjectTextVoiceAccess {
  getProject(): VideoProject | null;
  save(): Promise<void>;
}

/** The mounted consumer seals its history action synchronously around this update. */
export interface ProjectTextVoiceApplyAccess extends ProjectTextVoiceAccess {
  update(updater: (project: VideoProject) => VideoProject): void;
}

interface VoiceAttachment {
  access: ProjectTextVoiceApplyAccess;
  placement: string;
  prepared?: PreparedProjectAsset;
  cleanup?: PreparedProjectAsset;
  receipt?: { clipId: string; assetId: string; signature: string };
}

/** One disclosed generation attempt; the caller starts a new capture after a paid terminal outcome. */
interface ProjectTextVoiceCapture {
  basis: Awaited<ReturnType<typeof createVideoProjectTextAudioScope>>['basis'];
  basisHash: string;
  profile: ReviewSpeechProfile;
  localProject: string;
  expiresAt: number;
  phase: 'captured' | 'preparing' | 'requested' | 'complete' | 'failed';
}

/** Disposable audition data; no placement or durable byte ownership is implied. */
interface ProjectTextVoicePreview {
  origin: ProjectTextVoiceAccess;
  scope: ProjectAudioTextJobScope;
  staged: AudioStagedHandle;
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
  // Save acknowledges timestamps without changing the disclosed authored content.
  return JSON.stringify({ ...project, updatedAt: 0 });
}

function assertLocal(access: ProjectTextVoiceAccess, capture: ProjectTextVoiceCapture) {
  const project = access.getProject();
  if (
    !project ||
    localProjectKey(project) !== capture.localProject ||
    Date.now() >= capture.expiresAt
  )
    throw new Error('stale');
}

/** Freezes text, all placements and speech parameters before the caller discloses a paid request. */
export async function captureProjectTextVoice(
  access: ProjectTextVoiceAccess,
  documentId: string,
  fragmentId: string,
  profile: ReviewSpeechProfile,
  signal: AbortSignal
): Promise<ProjectTextVoiceCapture> {
  signal.throwIfAborted();
  const parsedProfile = parseReviewSpeechProfile(profile);
  const project = access.getProject();
  if (!project) throw new Error('stale');
  if (!parsedProfile) throw new Error('invalid-request');
  const localProject = localProjectKey(project);
  const captured = await createVideoProjectTextAudioScope(project, 0, documentId, fragmentId);
  signal.throwIfAborted();
  const result: ProjectTextVoiceCapture = {
    basis: captured.basis,
    basisHash: captured.scope.basisHash,
    profile: parsedProfile,
    localProject,
    expiresAt: Date.now() + AUDIO_STAGING_TTL_MS,
    phase: 'captured',
  };
  assertLocal(access, result);
  return result;
}

/** Runs one explicitly approved request; failed paid attempts require a new capture and consent. */
export async function generateProjectTextVoice(
  access: ProjectTextVoiceAccess,
  capture: ProjectTextVoiceCapture,
  approvedProviderId: string,
  signal: AbortSignal
): Promise<ProjectTextVoicePreview> {
  signal.throwIfAborted();
  if (capture.phase !== 'captured' || !approvedProviderId.trim())
    throw new Error('invalid-request');
  assertLocal(access, capture);
  capture.phase = 'preparing';
  let requested = false;
  let staged: AudioStagedHandle | undefined;
  let scope: ProjectAudioTextJobScope | undefined;
  try {
    await access.save();
    signal.throwIfAborted();
    assertLocal(access, capture);
    const saved = await getVideoProject(capture.basis.projectId);
    signal.throwIfAborted();
    assertLocal(access, capture);
    if (
      saved.status !== 'ready' ||
      saved.lifecycle?.trashedAt !== undefined ||
      localProjectKey(saved.project) !== capture.localProject
    )
      throw new Error('stale');
    const canonical = await createVideoProjectTextAudioScope(
      saved.project,
      saved.workspaceRevision,
      capture.basis.documentId,
      capture.basis.fragment.id
    );
    if (canonical.scope.basisHash !== capture.basisHash) throw new Error('stale');
    scope = canonical.scope;
    await readVideoProjectTextAudioTarget(scope);
    signal.throwIfAborted();
    assertLocal(access, capture);
    const { modelId, ...parameters } = capture.profile;
    requested = true;
    capture.phase = 'requested';
    const result = await runReviewSpeechJob(
      {
        type: 'start',
        operation: 'speech',
        requestId: crypto.randomUUID(),
        modelId,
        approvedProviderId,
        scope,
        phraseId: capture.basis.fragment.id,
        textRevision: capture.basis.fragment.revision,
        text: capture.basis.fragment.text,
        profile: parameters,
      },
      { signal }
    );
    if (result.type !== 'audio') throw new Error('invalid-response');
    staged = result.staged;
    signal.throwIfAborted();
    assertLocal(access, capture);
    const blob = await readAudioStaging(staged, scope);
    signal.throwIfAborted();
    const duration = await decodeReviewSpeechDuration(blob);
    signal.throwIfAborted();
    await readVideoProjectTextAudioTarget(scope);
    signal.throwIfAborted();
    assertLocal(access, capture);
    const { fragment, binding, documentId } = capture.basis;
    const textSnapshot = parseVideoProjectVoiceTextSnapshot({
      version: 1,
      documentId,
      binding,
      basisHash: capture.basisHash,
      text: {
        kind: 'ai',
        textId: fragment.id,
        revision: fragment.revision,
        timingRevision: fragment.timingRevision,
        text: fragment.text,
        start: fragment.start,
        end: fragment.end,
        timeDomain: fragment.timeDomain,
        profile: capture.profile,
      },
    });
    if (!textSnapshot) throw new Error('invalid-request');
    const url = URL.createObjectURL(blob);
    capture.phase = 'complete';
    return {
      origin: access,
      scope,
      staged,
      blob,
      duration,
      textSnapshot,
      url,
      expiresAt: capture.expiresAt,
    };
  } catch (error) {
    capture.phase = requested ? 'failed' : 'captured';
    if (staged && scope) await discardAudioStaging(staged, scope).catch(() => undefined);
    throw error;
  }
}

/** Cleanup retains exact staging authority after deletion, independently of preview freshness. */
export async function cleanupProjectTextVoicePreview(
  preview: ProjectTextVoicePreview
): Promise<void> {
  preview.closed = true;
  await preview.accepting?.catch(() => undefined);
  if (preview.attachment && !preview.attachment.receipt) {
    await releaseUnacceptedVoice(preview.attachment);
    delete preview.attachment;
  }
  URL.revokeObjectURL(preview.url);
  await discardAudioStaging(preview.staged, preview.scope);
}

/** Accepts once; a failed Save retries its receipt without another paid job or insertion. */
export async function acceptProjectTextVoice(
  access: ProjectTextVoiceApplyAccess,
  preview: ProjectTextVoicePreview,
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
  access: ProjectTextVoiceApplyAccess,
  preview: ProjectTextVoicePreview,
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
      project?.id === preview.scope.projectId &&
      receipt &&
      voiceReceiptSignature(project, attachment) === receipt.signature;
    if (!matches(access.getProject())) throw new Error('stale');
    await access.save();
    signal.throwIfAborted();
    const saved = await getVideoProject(preview.scope.projectId);
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
  access: ProjectTextVoiceApplyAccess,
  preview: ProjectTextVoicePreview,
  attachment: VoiceAttachment,
  placement: VideoProjectVoicePlacement,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  const initial = access.getProject();
  if (
    preview.closed ||
    !initial ||
    initial.id !== preview.scope.projectId ||
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
    preview.textSnapshot.text.text.slice(0, 60),
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
