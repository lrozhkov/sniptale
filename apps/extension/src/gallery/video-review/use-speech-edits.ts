import { useEffect, useRef, useState } from 'react';
import type { AIModelSelectionBootstrapPayload } from '../../contracts/messaging/ai-settings-runtime';
import type {
  ReviewSpeechProfile,
  ReviewSpeechTranscript,
} from '../../features/video/review/speech-transcript';
import {
  editReviewSpeechPhrase,
  splitReviewSpeechPhrase,
  mergeReviewSpeechPhrases,
  restoreReviewSpeechReplacements,
  reviewSpeechTextSignature,
} from '../../features/video/review/speech-transcript';
import { parseReviewSpeechProfile } from '../../features/video/review/speech-validation';
import {
  saveReviewSpeechTranscript,
  type ReviewSpeechSession,
} from '../../workflows/video-review/speech-publication';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewSpeechFlushRegistration } from './speech-edit-guard';
type Change = (transcript: ReviewSpeechTranscript) => ReviewSpeechTranscript;
type Edit = { change: Change; textPhrase?: string; attempted: boolean };
const emptyTranscript = (): ReviewSpeechTranscript => ({
  version: 1,
  phrases: [],
  replacements: [],
});
/** Serializes durable edits and keeps failed or invalid drafts protected across navigation. */
export function useSpeechEdits(args: {
  session: ReviewSpeechSession;
  clipId: string;
  durable: ReviewSpeechTranscript | undefined;
  catalog: AIModelSelectionBootstrapPayload | undefined;
  beforeAction: ReviewBeforeAction;
  flushAdvanced(): Promise<void>;
  registerSpeechFlush(owner: ReviewSpeechFlushRegistration): () => void;
  invalidate(ids?: readonly string[]): void;
  onError(error: unknown): void;
}) {
  const [profile, setProfile] = useState<ReviewSpeechProfile | undefined>(args.durable?.profile);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  const edits = useRef<Edit[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearTypingTimer = () => {
    clearTimeout(typingTimer.current);
    typingTimer.current = undefined;
  };
  const drainTask = useRef<Promise<void> | null>(null);
  const invalidProfile = useRef(false);
  const persistedProfile = useRef(JSON.stringify(args.durable?.profile));
  const [version, refresh] = useState(0);
  const latestArgs = useRef(args);
  latestArgs.current = args;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(typingTimer.current);
    };
  }, []);
  const durableProfile = args.durable?.profile;
  useEffect(() => {
    const signature = JSON.stringify(durableProfile);
    if (
      (signature === persistedProfile.current && profile) ||
      edits.current.length ||
      invalidProfile.current
    )
      return;
    persistedProfile.current = signature;
    const catalog = args.catalog;
    const model = catalog?.models.find((entry) => entry.id === catalog.defaultModelId);
    setProfile(
      durableProfile ??
        (model?.audio?.speech ? { modelId: model.id, ...model.audio.speech } : undefined)
    );
  }, [args.catalog, durableProfile, profile, saving, version]);
  const drain = (): Promise<void> => {
    clearTypingTimer();
    if (drainTask.current) return drainTask.current;
    const task = (async () => {
      if (mounted.current) {
        setSaving(true);
        args.onError(null);
      }
      try {
        await latestArgs.current.flushAdvanced();
        while (edits.current.length) {
          const current = args.session
            .getSnapshot()
            .document.advancedContent.audio.voiceover.find((entry) => entry.id === args.clipId);
          if (!current) throw new Error('stale');
          const head = edits.current[0]!;
          head.attempted = true;
          const next = head.change(current.transcript ?? emptyTranscript());
          await saveReviewSpeechTranscript(args.session, args.clipId, next);
          edits.current.shift();
          if (mounted.current) refresh((value) => value + 1);
        }
        if (invalidProfile.current) throw new Error('invalid');
      } catch (cause) {
        if (mounted.current) args.onError(cause);
        throw cause;
      } finally {
        if (mounted.current) setSaving(false);
      }
    })().finally(() => {
      drainTask.current = null;
    });
    drainTask.current = task;
    return task;
  };
  const latestFlush = useRef(drain);
  latestFlush.current = drain;
  const { registerSpeechFlush } = args;
  useEffect(
    () =>
      registerSpeechFlush({
        hasPending: () => edits.current.length > 0 || invalidProfile.current,
        flush: () => latestFlush.current(),
      }),
    [registerSpeechFlush]
  );
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (edits.current.length || invalidProfile.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);
  const edit = (change: Change, ids?: readonly string[], textPhrase?: string) => {
    try {
      change(transcript);
    } catch (cause) {
      args.onError(cause);
      return;
    }
    args.invalidate(ids);
    const tail = edits.current.at(-1);
    if (textPhrase && tail?.textPhrase === textPhrase && !tail.attempted) tail.change = change;
    else edits.current.push({ change, ...(textPhrase ? { textPhrase } : {}), attempted: false });
    refresh((value) => value + 1);
    clearTypingTimer();
    if (textPhrase) {
      typingTimer.current = setTimeout(() => {
        typingTimer.current = undefined;
        latestArgs.current.beforeAction(() => void latestFlush.current().catch(() => undefined));
      }, 300);
    } else args.beforeAction(() => void drain().catch(() => undefined));
  };
  let transcript = args.durable ?? emptyTranscript();
  try {
    for (const entry of edits.current) transcript = entry.change(transcript);
  } catch {
    /* Failed draft remains retryable; durable transcript stays visible. */
  }

  return {
    transcript,
    profile,
    saving,
    dirty: edits.current.length > 0 || invalidProfile.current,
    hasPending: () => edits.current.length > 0 || invalidProfile.current,
    discardDraft: () => {
      if (drainTask.current) return;
      clearTypingTimer();
      edits.current = [];
      invalidProfile.current = false;
      setProfile(args.durable?.profile);
      args.onError(null);
      refresh((value) => value + 1);
    },
    retrySave: () => args.beforeAction(() => void drain().catch(() => undefined)),
    changeProfile: (next: ReviewSpeechProfile) => {
      setProfile(next);
      args.invalidate();
      invalidProfile.current = !parseReviewSpeechProfile(next);
      if (!invalidProfile.current) edit((current) => ({ ...current, profile: next }));
      else args.onError(new Error('invalid'));
    },
    editPhrase: (id: string, patch: { text?: string; start?: number; end?: number }) =>
      edit(
        (current) => {
          const result = editReviewSpeechPhrase(current, id, patch);
          if (!result.ok) throw new Error(result.reason);
          return result.transcript;
        },
        [id],
        patch.text !== undefined && patch.start === undefined && patch.end === undefined
          ? id
          : undefined
      ),
    split: (id: string, position: number, time: number) => {
      const phrase = transcript.phrases.find((entry) => entry.id === id);
      if (!phrase || position <= 0 || position >= phrase.text.length) return;
      const nextId = crypto.randomUUID();
      edit(
        (current) => {
          const result = splitReviewSpeechPhrase(current, id, {
            id: nextId,
            time,
            leftText: phrase.text.slice(0, position).trim(),
            rightText: phrase.text.slice(position).trim(),
          });
          if (!result.ok) throw new Error(result.reason);
          return result.transcript;
        },
        [id]
      );
    },
    merge: (leftId: string, rightId: string) =>
      edit(
        (current) => {
          const result = mergeReviewSpeechPhrases(current, leftId, rightId);
          if (!result.ok) throw new Error(result.reason);
          return result.transcript;
        },
        [leftId, rightId]
      ),
    restore: (ids: readonly string[]) =>
      edit((current) => restoreReviewSpeechReplacements(current, ids)),
    isChanged: (id: string) => {
      const phrase = transcript.phrases.find((entry) => entry.id === id);
      if (!phrase) return false;
      const replacement = transcript.replacements.find((entry) => entry.phraseId === id);
      return replacement
        ? !profile ||
            replacement.revision !== phrase.revision ||
            replacement.textSignature !== reviewSpeechTextSignature(phrase.text, profile)
        : phrase.text !== phrase.originalText;
    },
  };
}
