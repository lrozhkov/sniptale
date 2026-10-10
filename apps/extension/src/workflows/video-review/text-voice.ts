import {
  AUDIO_STAGING_TTL_MS,
  type AudioStagedHandle,
  type AudioTextJobScope,
} from '../../contracts/ai/audio';
import {
  discardAudioStaging,
  readAudioStaging,
} from '../../composition/persistence/assets/audio-staging';
import { matchesReviewTextScope } from '../../features/video/review/text-document';
import { parseReviewSpeechProfile } from '../../features/video/review/speech-validation';
import type { ReviewSpeechProfile } from '../../features/video/review/speech-transcript';
import { reviewAudioRestriction } from './audio-import';
import {
  applyReviewTextTake,
  assertReviewTextTakeBasis as assertTextVoiceBasis,
  captureReviewTextTakeBasis,
  cleanupReviewTextTakePreview,
  readReviewTextTakeFragment as textFragment,
  reviewTextTakeGeometry as textVoiceGeometry,
  type ReviewTextTakePreview,
  type ReviewTextTakeOptions,
} from './text-take';
import { runReviewSpeechJob } from './speech-client';
import { decodeReviewSpeechDuration } from './speech-audio';
import type { createVideoReviewSession } from './session';

type Session = ReturnType<typeof createVideoReviewSession>;

/** Disposable generated take; only its accepted ordinary clip acquires durable byte ownership. */
export interface ReviewTextVoicePreview extends ReviewTextTakePreview {
  scope: AudioTextJobScope;
  staged: AudioStagedHandle;
}

/** Freezes the whole selection before one Save; preparation failure aborts the command. */
export async function prepareReviewTextVoiceBatch(
  session: Session,
  ids: readonly string[],
  signal: AbortSignal
) {
  signal.throwIfAborted();
  if (!ids.length) throw new Error('invalid-request');
  const captured = ids.map((id) => captureReviewTextTakeBasis(session, id));
  const saved = await session.saveBuffered();
  signal.throwIfAborted();
  return captured.map((basis) => {
    const { fragment, geometry } = basis;
    const scope: AudioTextJobScope = {
      workspaceId: saved.workspace.aggregateId,
      workspaceRevision: saved.workspace.revision,
      target: { kind: 'text', fragmentId: fragment.id },
      textRevision: fragment.revision,
      timingRevision: fragment.timingRevision,
      start: fragment.start,
      end: fragment.end,
      timeDomain: fragment.timeDomain,
    };
    if (
      geometry !== textVoiceGeometry(session) ||
      !matchesReviewTextScope(textFragment(session, fragment.id), scope) ||
      textFragment(session, fragment.id).text !== fragment.text
    )
      throw new Error('stale');
    return { ...basis, scope, expiresAt: Date.now() + AUDIO_STAGING_TTL_MS };
  });
}

/** Explicit start saves the entire workspace buffer before the one paid request, without enabling autosave. */
export async function generateReviewTextVoice(
  session: Session,
  fragmentId: string,
  selectedProfile: ReviewSpeechProfile,
  signal: AbortSignal,
  approvedProviderId: string,
  prepared?: Awaited<ReturnType<typeof prepareReviewTextVoiceBatch>>[number]
): Promise<ReviewTextVoicePreview> {
  signal.throwIfAborted();
  const profile = parseReviewSpeechProfile(selectedProfile);
  if (!profile || !approvedProviderId?.trim()) throw new Error('invalid-request');
  const { fragment, scope, geometry, resultStart, resultDuration, expiresAt } =
    prepared ?? (await prepareReviewTextVoiceBatch(session, [fragmentId], signal))[0]!;
  if (
    scope.target.fragmentId !== fragmentId ||
    Date.now() >= expiresAt ||
    session.getSnapshot().dirty ||
    session.getSnapshot().snapshot.workspace.revision !== scope.workspaceRevision ||
    geometry !== textVoiceGeometry(session) ||
    !matchesReviewTextScope(textFragment(session, fragmentId), scope) ||
    textFragment(session, fragmentId).text !== fragment.text
  )
    throw new Error('stale');
  const { modelId, ...parameters } = profile;
  const result = await runReviewSpeechJob(
    {
      type: 'start',
      approvedProviderId,
      requestId: crypto.randomUUID(),
      operation: 'speech',
      modelId,
      scope,
      phraseId: fragmentId,
      textRevision: fragment.revision,
      text: fragment.text,
      profile: parameters,
    },
    { signal }
  );
  if (result.type !== 'audio') throw new Error('invalid-response');
  try {
    const blob = await readAudioStaging(result.staged, scope);
    const duration = await decodeReviewSpeechDuration(blob);
    signal.throwIfAborted();
    const restriction = reviewAudioRestriction({ mimeType: blob.type, size: blob.size, duration });
    if (restriction) throw new Error(restriction === 'duration' ? 'duration' : 'invalid-response');
    const preview: ReviewTextVoicePreview = {
      clipId: `audio-${crypto.randomUUID()}`,
      scope,
      geometry,
      resultStart,
      duration,
      blob,
      url: '',
      staged: result.staged,
      expiresAt,
      textSnapshot: {
        kind: 'ai',
        textId: fragmentId,
        revision: fragment.revision,
        timingRevision: fragment.timingRevision,
        text: fragment.text,
        start: fragment.start,
        end: fragment.end,
        timeDomain: fragment.timeDomain,
        profile,
      },
    };
    assertTextVoiceBasis(session, preview);
    if (resultStart + duration > resultDuration) throw new Error('duration');
    preview.url = URL.createObjectURL(blob);
    return preview;
  } catch (error) {
    await discardAudioStaging(result.staged, scope).catch(() => undefined);
    throw error;
  }
}

/** Accepts AI output through the same ordinary take transaction as local recordings/files. */
export async function applyReviewTextVoice(
  session: Session,
  preview: ReviewTextVoicePreview,
  signal: AbortSignal,
  options?: ReviewTextTakeOptions
): Promise<void> {
  await applyReviewTextTake({
    session,
    preview,
    signal,
    filename: `${preview.clipId}.${preview.staged.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`,
    options,
  });
}

/** Remote staging stays with the AI adapter; accepted byte ownership stays with the common take owner. */
export async function cleanupReviewTextVoicePreview(
  session: Session,
  preview: ReviewTextVoicePreview
) {
  try {
    await cleanupReviewTextTakePreview(session, preview);
  } finally {
    await discardAudioStaging(preview.staged, preview.scope);
  }
}
