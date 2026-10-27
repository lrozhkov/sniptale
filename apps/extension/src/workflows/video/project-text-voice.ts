import {
  parseVoiceProviderSelection,
  type VoiceProviderSelection,
} from '@sniptale/runtime-contracts/voice-input';
import {
  AUDIO_STAGING_TTL_MS,
  type AudioStagedHandle,
  type ProjectAudioTextJobScope,
} from '../../contracts/ai/audio';
import { getVideoProject } from '../../composition/persistence/projects';
import { readVideoProjectTextAudioTarget } from '../../composition/persistence/projects/text-audio-scope';
import {
  readAudioStaging,
  discardAudioStaging,
} from '../../composition/persistence/assets/audio-staging';
import type { VideoProject } from '../../features/video/project/types/model';
import { createVideoProjectTextAudioScope } from '../../features/video/project/text/voice-scope';
import { parseVideoProjectVoiceTextSnapshot } from '../../features/video/project/text/voice-take';
import type { ReviewSpeechProfile } from '../../features/video/review/speech-transcript';
import { parseReviewSpeechProfile } from '../../features/video/review/speech-validation';
import { runReviewSpeechJob } from '../audio-jobs/client';
import { decodeReviewSpeechDuration } from '../video-review/speech-audio';
import {
  cleanupProjectVoiceTakePreview,
  type ProjectVoiceReadAccess,
  type ProjectVoiceTakePreview,
} from './project-voice-take';
import { runSpeechQueue, type SpeechQueueProgress } from '../audio-jobs/speech-queue';

/** One disclosed generation attempt; the caller starts a new capture after a paid terminal outcome. */
interface ProjectTextVoiceCapture {
  basis: Awaited<ReturnType<typeof createVideoProjectTextAudioScope>>['basis'];
  basisHash: string;
  profile: ReviewSpeechProfile;
  localProject: string;
  expiresAt: number;
  phase: 'captured' | 'preparing' | 'requested' | 'complete' | 'failed';
}

function localProjectKey(project: VideoProject): string {
  // Save acknowledges timestamps without changing the disclosed authored content.
  return JSON.stringify({ ...project, updatedAt: 0 });
}

function assertLocal(access: ProjectVoiceReadAccess, capture: ProjectTextVoiceCapture) {
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
  access: ProjectVoiceReadAccess,
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
  access: ProjectVoiceReadAccess,
  capture: ProjectTextVoiceCapture,
  approvedSelection: VoiceProviderSelection,
  signal: AbortSignal
): Promise<
  ProjectVoiceTakePreview & {
    source: { kind: 'speech'; scope: ProjectAudioTextJobScope; staged: AudioStagedHandle };
  }
> {
  signal.throwIfAborted();
  const approved = parseVoiceProviderSelection(approvedSelection);
  if (
    capture.phase !== 'captured' ||
    !approved?.approvedProviderId.trim() ||
    approved.modelId !== capture.profile.modelId
  )
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
        approvedProviderId: approved.approvedProviderId,
        approvedSelection: approved,
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
      projectId: scope.projectId,
      filename: textSnapshot.text.text.slice(0, 60),
      source: { kind: 'speech', scope, staged },
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

/** Fragment identities are scoped by their text document. */
interface ProjectTextVoiceSelection {
  documentId: string;
  fragmentId: string;
}
interface ProjectTextVoiceQueueItem extends ProjectTextVoiceSelection {
  capture: ProjectTextVoiceCapture;
}
interface ProjectTextVoiceQueuePlan {
  origin: ProjectVoiceReadAccess;
  items: readonly ProjectTextVoiceQueueItem[];
  phase: 'captured' | 'running' | 'complete' | 'failed';
}

/** Freeze the complete ordered selection and profile before disclosing any paid work. */
export async function captureProjectTextVoiceQueue(
  access: ProjectVoiceReadAccess,
  selected: readonly ProjectTextVoiceSelection[],
  profile: ReviewSpeechProfile,
  signal: AbortSignal
): Promise<ProjectTextVoiceQueuePlan> {
  signal.throwIfAborted();
  const parsed = parseReviewSpeechProfile(profile);
  if (!selected.length || !parsed) throw new Error('invalid-request');
  const unique = new Map(
    selected.map((item) => [JSON.stringify([item.documentId, item.fragmentId]), { ...item }])
  );
  const project = access.getProject();
  if (!project) throw new Error('stale');
  const localProject = localProjectKey(project);
  const items: ProjectTextVoiceQueueItem[] = [];
  for (const item of unique.values()) {
    const capture = await captureProjectTextVoice(
      access,
      item.documentId,
      item.fragmentId,
      parsed,
      signal
    );
    if (capture.localProject !== localProject) throw new Error('stale');
    items.push({ ...item, capture });
  }
  for (const item of items) assertLocal(access, item.capture);
  return { origin: access, items, phase: 'captured' };
}

/** One consent starts one sequence; a new attempt requires a new capture of unfinished work. */
export async function runProjectTextVoiceQueue(
  access: ProjectVoiceReadAccess,
  plan: ProjectTextVoiceQueuePlan,
  approvedSelection: VoiceProviderSelection,
  signal: AbortSignal,
  events: {
    ready(preview: ProjectVoiceTakePreview): void;
    progress(progress: SpeechQueueProgress<ProjectTextVoiceQueueItem>): void;
    failed?(cause: unknown): void;
  }
): Promise<void> {
  signal.throwIfAborted();
  const approved = parseVoiceProviderSelection(approvedSelection);
  if (
    plan.origin !== access ||
    plan.phase !== 'captured' ||
    !approved?.approvedProviderId.trim() ||
    plan.items.some((item) => item.capture.profile.modelId !== approved.modelId)
  )
    throw new Error('invalid-request');
  for (const item of plan.items) assertLocal(access, item.capture);
  plan.phase = 'running';
  try {
    await runSpeechQueue(
      plan.items,
      signal,
      {
        validate: (item) => assertLocal(access, item.capture),
        generate: (item, activeSignal) =>
          generateProjectTextVoice(access, item.capture, approved, activeSignal),
        cleanup: cleanupProjectVoiceTakePreview,
      },
      events
    );
    plan.phase = 'complete';
  } catch (cause) {
    plan.phase = 'failed';
    throw cause;
  }
}
