import {
  AUDIO_STAGING_TTL_MS,
  type AudioStagedHandle,
  type AudioTextJobScope,
} from '../../contracts/ai/audio';
import {
  discardAudioStaging,
  readAudioStaging,
} from '../../composition/persistence/assets/audio-staging';
import { withVoiceoverAttachmentLock } from '../../composition/persistence/projects/voiceover-publication-lock';
import {
  matchesReviewTextScope,
  type ReviewTextFragment,
  type ReviewVoiceTextSnapshot,
} from '../../features/video/review/text-document';
import { projectReviewTextFragment } from '../../features/video/review/text-projection';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { anchorReviewVoiceover } from '../../features/video/review/voiceover-edits';
import { parseReviewSpeechProfile } from '../../features/video/review/speech-validation';
import type { ReviewSpeechProfile } from '../../features/video/review/speech-transcript';
import {
  importReviewAudio,
  importedAudioClip,
  reviewAudioRestriction,
  type PreparedReviewAudio,
} from './audio-import';
import { runReviewSpeechJob } from './speech-client';
import { decodeReviewSpeechDuration } from './speech-audio';
import type { createVideoReviewSession } from './session';

type Session = ReturnType<typeof createVideoReviewSession>;

/** Disposable generated take; only its accepted ordinary clip acquires durable byte ownership. */
export interface ReviewTextVoicePreview {
  clipId: string;
  scope: AudioTextJobScope;
  textSnapshot: ReviewVoiceTextSnapshot;
  geometry: string;
  duration: number;
  resultStart: number;
  blob: Blob;
  url: string;
  staged: AudioStagedHandle;
  expiresAt: number;
  /** Retained only for local publication retry; never serialized into the workspace. */
  publication?: PreparedReviewAudio;
}

function textVoiceGeometry(session: Session): string {
  const state = session.getSnapshot();
  return JSON.stringify([
    state.snapshot.workspace.aggregateId,
    state.snapshot.workspace.sourceAssetId,
    state.snapshot.workspace.source,
    state.document.edits,
  ]);
}

function textFragment(session: Session, id: string): ReviewTextFragment {
  const fragment = session
    .getSnapshot()
    .document.advancedContent.text?.fragments.find((entry) => entry.id === id);
  if (!fragment) throw new Error('stale');
  return fragment;
}

function assertTextVoiceBasis(session: Session, preview: ReviewTextVoicePreview) {
  if (
    Date.now() >= preview.expiresAt ||
    preview.geometry !== textVoiceGeometry(session) ||
    !matchesReviewTextScope(
      textFragment(session, preview.scope.target.fragmentId),
      preview.scope
    ) ||
    textFragment(session, preview.scope.target.fragmentId).text !== preview.textSnapshot.text
  )
    throw new Error('stale');
}

/** Freezes the whole selection before one Save; preparation failure aborts the command. */
export async function prepareReviewTextVoiceBatch(
  session: Session,
  ids: readonly string[],
  signal: AbortSignal
) {
  signal.throwIfAborted();
  const fragments = ids.map((id) => structuredClone(textFragment(session, id)));
  if (!fragments.length || fragments.some((fragment) => !fragment.text.trim()))
    throw new Error('invalid-request');
  const geometry = textVoiceGeometry(session);
  const saved = await session.saveBuffered();
  signal.throwIfAborted();
  const map = buildReviewTimeMap(
    saved.workspace.source.duration,
    session.getSnapshot().document.edits
  );
  return fragments.map((fragment) => {
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
    const projection = projectReviewTextFragment(fragment, map);
    const clockLimit =
      fragment.timeDomain === 'source'
        ? saved.workspace.source.duration
        : (map.at(-1)?.resultEnd ?? 0);
    if (projection.excludedFromResult || fragment.end > clockLimit) throw new Error('duration');
    const resultStart = projection.ranges[0]!.start;
    return {
      fragment,
      scope,
      geometry,
      resultStart,
      resultDuration: map.at(-1)?.resultEnd ?? 0,
      expiresAt: Date.now() + AUDIO_STAGING_TTL_MS,
    };
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

/** Accepts the natural take duration as one ordinary clip, preserving neighboring text and audio. */
export async function applyReviewTextVoice(
  session: Session,
  preview: ReviewTextVoicePreview,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted();
  const previous = preview.publication;
  if (previous) {
    const published = await withVoiceoverAttachmentLock(previous.assetId, async () => {
      if (await session.hasRetainedAssetReference(previous.assetId)) {
        await previous.publish();
        return true;
      }
      await previous.cancel();
      return false;
    });
    if (published) return;
    delete preview.publication;
  }
  await session.flush();
  assertTextVoiceBasis(session, preview);
  const workspaceId = session.getSnapshot().snapshot.workspace.aggregateId;
  await importReviewAudio({
    file: new File(
      [preview.blob],
      `${preview.clipId}.${preview.staged.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`,
      {
        type: preview.blob.type,
      }
    ),
    signal,
    requiredReview: { aggregateId: workspaceId, clipId: preview.clipId },
    assertCurrentTarget: () => assertTextVoiceBasis(session, preview),
    onPrepared: (prepared) => {
      preview.publication = prepared;
    },
    hasDurableReference: (assetId) => session.hasRetainedAssetReference(assetId),
    attach: async (assetId, duration) => {
      signal.throwIfAborted();
      assertTextVoiceBasis(session, preview);
      const state = session.getSnapshot();
      const before = state.document.advancedContent;
      const map = buildReviewTimeMap(
        state.snapshot.workspace.source.duration,
        state.document.edits
      );
      const end = map.at(-1)?.resultEnd ?? 0;
      if (Math.abs(duration - preview.duration) > 0.001 || preview.resultStart + duration > end)
        throw new Error('duration');
      if (before.audio.voiceover.some((clip) => clip.id === preview.clipId))
        throw new Error('stale');
      const clip = anchorReviewVoiceover(
        {
          ...importedAudioClip(assetId, duration, preview.resultStart, end),
          id: preview.clipId,
          textSnapshot: structuredClone(preview.textSnapshot),
        },
        map
      );
      await session.commitDurable({
        id: crypto.randomUUID(),
        at: Date.now(),
        target: 'advancedContent',
        before,
        after: {
          ...before,
          audio: {
            ...before.audio,
            voiceoverSegments: [...map],
            voiceover: [
              ...before.audio.voiceover.map((item) => anchorReviewVoiceover(item, map)),
              clip,
            ],
          },
        },
      });
    },
  });
}

/** Releases disposable output; accepted or ambiguous byte references remain with their existing recovery owner. */
export async function cleanupReviewTextVoicePreview(
  session: Session,
  preview: ReviewTextVoicePreview
) {
  URL.revokeObjectURL(preview.url);
  await discardAudioStaging(preview.staged, preview.scope);
  const prepared = preview.publication;
  if (prepared)
    await withVoiceoverAttachmentLock(prepared.assetId, async () => {
      if (!(await session.hasRetainedAssetReference(prepared.assetId))) await prepared.cancel();
    });
}
