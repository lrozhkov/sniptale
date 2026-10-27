import { runSpeechQueue } from '../audio-jobs/speech-queue';
import type { ReviewSpeechTarget } from '../../contracts/ai/audio';
import type { ReviewSpeechProfile } from '../../features/video/review/speech-transcript';
import { parseReviewSpeechProfile } from '../../features/video/review/speech-validation';
import {
  cleanupReviewSpeechPreview,
  generateReviewSpeech,
  getReviewSpeechTarget,
  reviewSpeechGeometry,
  type ReviewSpeechPreview,
  type ReviewSpeechSession,
} from './speech-publication';

interface ReviewSpeechQueueSelection {
  target: ReviewSpeechTarget;
  phraseId: string;
}
interface QueueItem extends ReviewSpeechQueueSelection {
  start: number;
  end: number;
  revision: number;
  text: string;
  geometry: string;
}
interface ReviewSpeechQueuePlan {
  workspaceId: string;
  profile: ReviewSpeechProfile;
  items: readonly QueueItem[];
}
interface ReviewSpeechQueueProgress {
  completed: number;
  total: number;
  current: ReviewSpeechQueueSelection;
}

/** Phrase ids are local to each transcript, including the original-audio transcript. */
function reviewSpeechQueueKey(selection: ReviewSpeechQueueSelection): string {
  return JSON.stringify([selection.target, selection.phraseId]);
}

/** Snapshot the exact user-selected work and common synthesis profile before any paid request. */
export function planReviewSpeechQueue(
  session: ReviewSpeechSession,
  selected: readonly ReviewSpeechQueueSelection[],
  profile: ReviewSpeechProfile
): ReviewSpeechQueuePlan {
  const parsed = parseReviewSpeechProfile(profile);
  if (!selected.length || !parsed) throw new Error('invalid');
  const unique = new Map(selected.map((entry) => [reviewSpeechQueueKey(entry), entry]));
  const items = Array.from(unique.values(), (selection): QueueItem => {
    const phrase = getReviewSpeechTarget(session, selection.target).transcript?.phrases.find(
      (entry) => entry.id === selection.phraseId
    );
    if (!phrase || !phrase.text.trim()) throw new Error('stale');
    return {
      target: structuredClone(selection.target),
      phraseId: phrase.id,
      start: phrase.start,
      end: phrase.end,
      revision: phrase.revision,
      text: phrase.text,
      geometry: reviewSpeechGeometry(session, selection.target),
    };
  });
  return {
    workspaceId: session.getSnapshot().snapshot.workspace.aggregateId,
    profile: structuredClone(parsed),
    items,
  };
}

/** Sequential, explicitly selected generation; completed results survive later failure or cancellation. */
export async function runReviewSpeechQueue(
  session: ReviewSpeechSession,
  plan: ReviewSpeechQueuePlan,
  signal: AbortSignal,
  events: {
    ready(preview: ReviewSpeechPreview): void;
    progress(progress: ReviewSpeechQueueProgress): void;
  }
): Promise<void> {
  await runSpeechQueue<QueueItem, ReviewSpeechPreview>(
    plan.items,
    signal,
    {
      validate: (item) => {
        const phrase = getReviewSpeechTarget(session, item.target).transcript?.phrases.find(
          (entry) => entry.id === item.phraseId
        );
        if (
          session.getSnapshot().snapshot.workspace.aggregateId !== plan.workspaceId ||
          reviewSpeechGeometry(session, item.target) !== item.geometry ||
          !phrase ||
          phrase.start !== item.start ||
          phrase.end !== item.end ||
          phrase.revision !== item.revision ||
          phrase.text !== item.text
        )
          throw new Error('stale');
      },
      generate: (item, activeSignal) =>
        generateReviewSpeech(session, item.target, item.phraseId, plan.profile, activeSignal),
      cleanup: cleanupReviewSpeechPreview,
    },
    events
  );
}
