import { useEffect, useRef, useState } from 'react';
import { sameReviewSpeechTarget, type ReviewSpeechTarget } from '../../contracts/ai/audio';
import type { ReviewSpeechTranscript } from '../../features/video/review/speech-transcript';
import { reviewSpeechTextSignature } from '../../features/video/review/speech-transcript';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import {
  cleanupReviewSpeechPreview,
  type ReviewSpeechPreview,
} from '../../workflows/video-review/speech-publication';
function disposePreviews(items: readonly ReviewSpeechPreview[]): void {
  for (const preview of items) void cleanupReviewSpeechPreview(preview).catch(() => undefined);
}

/** Owns original audition URLs and disposable generated audio, including stale and expired results. */
export function useSpeechPreviews(args: {
  assetId: string | undefined;
  original?: Blob | undefined;
  target: ReviewSpeechTarget;
  authorities: readonly {
    target: ReviewSpeechTarget;
    transcript: ReviewSpeechTranscript | undefined;
    geometry: string | null;
  }[];
  onError(): void;
}) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [previews, setPreviews] = useState<ReviewSpeechPreview[]>([]);
  const currentPreviews = useRef<ReviewSpeechPreview[]>([]);
  const [version, refresh] = useState(0);
  const onError = useRef(args.onError);
  onError.current = args.onError;
  useEffect(
    () => () => {
      disposePreviews(currentPreviews.current);
      currentPreviews.current = [];
    },
    []
  );
  const originalAssetId = args.assetId;
  const original = args.original;
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setOriginalUrl(null);
    if (original || originalAssetId)
      void (original ? Promise.resolve(original) : resolveReviewAssetBytes(originalAssetId!))
        .then((blob) => {
          if (!active || !blob) return;
          url = URL.createObjectURL(blob);
          setOriginalUrl(url);
        })
        .catch(() => {
          if (active) onError.current();
        });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [originalAssetId, original]);

  const { authorities } = args;
  useEffect(() => {
    const removed = currentPreviews.current.filter((preview) => {
      const authority = authorities.find((entry) =>
        sameReviewSpeechTarget(entry.target, preview.scope.target)
      );
      const current = authority?.transcript;
      const phrase = current?.phrases.find((entry) => entry.id === preview.replacement.phraseId);
      return (
        !current ||
        preview.geometry !== authority?.geometry ||
        !phrase ||
        !current?.profile ||
        preview.expiresAt <= Date.now() ||
        phrase.revision !== preview.replacement.revision ||
        phrase.start !== preview.replacement.start ||
        phrase.end !== preview.replacement.end ||
        reviewSpeechTextSignature(phrase.text, current.profile) !==
          preview.replacement.textSignature
      );
    });
    if (removed.length) {
      disposePreviews(removed);
      currentPreviews.current = currentPreviews.current.filter((entry) => !removed.includes(entry));
      setPreviews(currentPreviews.current);
    }
    const expires = Math.min(...currentPreviews.current.map((preview) => preview.expiresAt));
    if (!Number.isFinite(expires)) return;
    const timer = window.setTimeout(
      () => refresh((value) => value + 1),
      Math.max(1, expires - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [authorities, previews, version]);

  const remove = (items: readonly ReviewSpeechPreview[]) => {
    currentPreviews.current = currentPreviews.current.filter((item) => !items.includes(item));
    disposePreviews(items);
    setPreviews(currentPreviews.current);
  };
  return {
    originalUrl,
    previews,
    remove,
    discard: (preview: ReviewSpeechPreview) => disposePreviews([preview]),
    invalidate: (ids?: readonly string[]) =>
      remove(
        currentPreviews.current.filter(
          (item) =>
            sameReviewSpeechTarget(item.scope.target, args.target) &&
            (!ids || ids.includes(item.replacement.phraseId))
        )
      ),
    add: (preview: ReviewSpeechPreview) => {
      const samePhrase = (item: ReviewSpeechPreview) =>
        item.replacement.phraseId === preview.replacement.phraseId &&
        sameReviewSpeechTarget(item.scope.target, preview.scope.target);
      disposePreviews(currentPreviews.current.filter(samePhrase));
      currentPreviews.current = [
        ...currentPreviews.current.filter((item) => !samePhrase(item)),
        preview,
      ];
      setPreviews(currentPreviews.current);
    },
  };
}
