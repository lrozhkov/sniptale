import { useCallback, useEffect, useRef, useState } from 'react';
import { readLibraryAudioBindingSource } from '../../composition/persistence/projects/library-asset-binding';
import { readVideoWorkspace } from '../../composition/persistence/review-workspaces/store';
import { reviewWorkspaceHasAudioClip } from '../../composition/persistence/review-workspaces/asset-refs';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import { createReviewTimeMap } from '../../features/video/review/timeline';
import {
  createReviewMusicAttachment,
  type ReviewMusicSelection,
} from '../../workflows/video-review/music-library';
import {
  importedAudioClip,
  reviewAudioRestriction,
  UnsupportedAudioFileError,
} from '../../workflows/video-review/audio-import';
import { translate } from '../../platform/i18n';
import type { useReviewEditorState } from './use-editor-state';

type EditorState = ReturnType<typeof useReviewEditorState>;
type MusicImportState = Pick<
  EditorState,
  | 'session'
  | 'video'
  | 'busy'
  | 'canStart'
  | 'time'
  | 'source'
  | 'playbackRange'
  | 'flushAdvanced'
  | 'audio'
>;
type Intent = {
  session: EditorState['session'];
  aggregateId: string;
  sourceStart: number;
  sourceEnd: number | null;
  controller: AbortController;
};
type Operation = {
  selection: ReviewMusicSelection;
  clipId: string;
  attachment: ReturnType<typeof createReviewMusicAttachment>;
};

/** Music insertion reserves only the free span after the captured playhead or selection start. */
export function reviewMusicPlacement(
  start: number | null,
  end: number,
  clips: readonly QuickEditAudioClip[]
) {
  if (
    start === null ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end - start < 0.05
  )
    throw new Error(translate('gallery.videoReview.musicNoSpace'));
  let limit = end;
  for (const clip of clips) {
    if (clip.timelineStart <= start && clip.timelineStart + clip.duration > start)
      throw new Error(translate('gallery.videoReview.musicNoSpace'));
    if (clip.timelineStart > start) limit = Math.min(limit, clip.timelineStart);
  }
  if (limit - start < 0.05) throw new Error(translate('gallery.videoReview.musicNoSpace'));
  return { start, end: limit };
}

function admissionMessage(reason: UnsupportedAudioFileError['reason']) {
  if (reason === 'type') return translate('gallery.videoReview.musicUnsupported');
  if (reason === 'size') return translate('gallery.videoReview.musicTooLarge');
  return translate('gallery.videoReview.musicTooLong');
}

function musicFailureMessage(failure: unknown) {
  if (failure instanceof UnsupportedAudioFileError) return admissionMessage(failure.reason);
  if (failure instanceof Error) {
    const actionable = [
      translate('gallery.videoReview.musicNoSpace'),
      translate('gallery.videoReview.musicChanged'),
      translate('gallery.videoReview.musicRetryPrevious'),
    ];
    if (actionable.includes(failure.message)) return failure.message;
  }
  return translate('gallery.videoReview.musicFailed');
}

/** A retained publication can resume only the same explicit insertion. */
function retainedMusicOperation(previous: Operation | null, selection: ReviewMusicSelection) {
  if (!previous?.attachment.hasRetainedAsset()) return null;
  const existing = previous.selection;
  if (existing.kind === 'library' && selection.kind === 'library' && existing.id === selection.id)
    return previous;
  if (existing.kind === 'file' && selection.kind === 'file' && existing.file === selection.file)
    return previous;
  throw new Error(translate('gallery.videoReview.musicRetryPrevious'));
}

function createMusicOperation(
  target: Intent,
  selection: ReviewMusicSelection,
  assertCurrent: (target: Intent) => void,
  attachmentContext: () => Pick<
    Parameters<typeof commitMusicClip>[0],
    'sourceDuration' | 'flushAdvanced'
  >
): Operation {
  const clipId = `audio-${crypto.randomUUID()}`;
  return {
    selection,
    clipId,
    attachment: createReviewMusicAttachment({
      selection,
      aggregateId: target.aggregateId,
      clipId,
      signal: target.controller.signal,
      assertCurrentTarget: () => assertCurrent(target),
      attach: (assetId, duration) =>
        commitMusicClip({
          ...attachmentContext(),
          target,
          clipId,
          assetId,
          duration,
          assertCurrent,
        }),
      hasDurableReference: (assetId) => hasDurableMusicClip(target, clipId, assetId),
    }),
  };
}

async function restoreAttachedMusic(target: Intent, clipId: string, assetId: string) {
  const clips = target.session.getSnapshot().document.advancedContent.audio.music;
  if (!clips.some((clip) => clip.id === clipId && clip.assetId === assetId))
    await target.session.reload();
}

/** One disposable drawer owns its retained attachment retry and local preview resources. */
export function useReviewMusicImport(state: MusicImportState) {
  const current = useRef(state);
  current.current = state;
  const intent = useRef<Intent | null>(null);
  const operation = useRef<Operation | null>(null);
  const pending = useRef(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { releasePreview, stopPreview, listen, playingId, loadingId } = useMusicLibraryPreview({
    target: () => intent.current,
    assertCurrent: (target) => assertCurrent(target),
    pauseMain: () => current.current.video.current?.pause(),
    setError,
  });
  const cancel = useCallback(() => {
    intent.current?.controller.abort();
    intent.current = null;
    operation.current = null;
    releasePreview();
  }, [releasePreview]);
  const close = () => {
    cancel();
    setAnchor(null);
    stopPreview();
    setError(null);
  };
  useEffect(() => {
    setAnchor(null);
    stopPreview();
    return cancel;
  }, [state.session, stopPreview, cancel]);
  const assertCurrent = (target: Intent) => {
    target.controller.signal.throwIfAborted();
    if (
      intent.current !== target ||
      current.current.session !== target.session ||
      target.session.getSnapshot().snapshot.workspace.aggregateId !== target.aggregateId
    )
      throw new Error(translate('gallery.videoReview.musicChanged'));
  };
  const submit = async (selection: ReviewMusicSelection) => {
    const target = intent.current;
    if (!target || pending.current) return;
    pending.current = true;
    setError(null);
    stopPreview();
    try {
      assertCurrent(target);
      const active =
        retainedMusicOperation(operation.current, selection) ??
        createMusicOperation(target, selection, assertCurrent, () => ({
          sourceDuration: current.current.source.duration,
          flushAdvanced: current.current.flushAdvanced,
        }));
      operation.current = active;
      const asset = await active.attachment.run();
      assertCurrent(target);
      await restoreAttachedMusic(target, active.clipId, asset.assetId);
      assertCurrent(target);
      current.current.audio.setSelectedId(active.clipId, 'music');
      close();
    } catch (failure) {
      if (intent.current === target && !target.controller.signal.aborted)
        setError(musicFailureMessage(failure));
      throw failure;
    } finally {
      pending.current = false;
    }
  };
  return {
    open: (trigger: HTMLElement) => {
      if (current.current.busy || !current.current.canStart() || pending.current) return;
      close();
      const latest = current.current;
      latest.video.current?.pause();
      intent.current = {
        session: latest.session,
        aggregateId: latest.session.getSnapshot().snapshot.workspace.aggregateId,
        sourceStart: latest.playbackRange?.start ?? latest.time,
        sourceEnd: latest.playbackRange?.end ?? null,
        controller: new AbortController(),
      };
      setAnchor(trigger);
    },
    drawer: anchor
      ? {
          anchor,
          onClose: close,
          onSelect: (id: string) => submit({ kind: 'library', id }),
          onUpload: (file: File) => submit({ kind: 'file', file }),
          onPreview: listen,
          onStopPreview: stopPreview,
          onRetry: operation.current ? () => submit(operation.current!.selection) : undefined,
          playingId,
          loadingId,
          error,
          unavailable: (item: MediaLibraryItem) => {
            const reason = reviewAudioRestriction(item);
            return reason ? admissionMessage(reason) : null;
          },
        }
      : null,
  };
}

async function hasDurableMusicClip(target: Intent, clipId: string, assetId: string) {
  const saved = await readVideoWorkspace(target.aggregateId);
  return !!saved && reviewWorkspaceHasAudioClip(saved.workspace, clipId, assetId);
}

async function commitMusicClip(args: {
  target: Intent;
  clipId: string;
  assetId: string;
  duration: number;
  sourceDuration: number;
  assertCurrent(target: Intent): void;
  flushAdvanced(): Promise<void>;
}) {
  const { target, clipId, assetId, duration, assertCurrent } = args;
  assertCurrent(target);
  await args.flushAdvanced();
  assertCurrent(target);
  if (await hasDurableMusicClip(target, clipId, assetId)) {
    await target.session.reload();
    assertCurrent(target);
    return;
  }
  assertCurrent(target);
  const snapshot = target.session.getSnapshot();
  const before = snapshot.document.advancedContent;
  if (before.audio.music.some((clip) => clip.id === clipId))
    throw new Error(translate('gallery.videoReview.musicChanged'));
  const map = createReviewTimeMap(args.sourceDuration, snapshot.document.edits);
  const start = map.sourceToTimeline(target.sourceStart);
  const end =
    target.sourceEnd === null
      ? map.getDuration()
      : (map.sourceToTimeline(target.sourceEnd) ??
        map
          .getSegments()
          .find(
            (segment) =>
              segment.sourceStart <= target.sourceEnd! && segment.sourceEnd >= target.sourceEnd!
          )?.resultEnd);
  const placement = reviewMusicPlacement(start, end ?? map.getDuration(), before.audio.music);
  const clip = {
    ...importedAudioClip(assetId, duration, placement.start, placement.end),
    id: clipId,
  };
  try {
    await target.session.commitDurable({
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'advancedContent',
      before,
      after: { ...before, audio: { ...before.audio, music: [...before.audio.music, clip] } },
    });
  } catch (failure) {
    if (await hasDurableMusicClip(target, clipId, assetId)) await target.session.reload();
    throw failure;
  }
}

/** Preview owns exactly one native audio node, URL and stale-read generation. */
function useMusicLibraryPreview(args: {
  target(): Intent | null;
  assertCurrent(target: Intent): void;
  pauseMain(): void;
  setError(message: string | null): void;
}) {
  const preview = useRef<{ node: HTMLAudioElement; url: string } | null>(null);
  const previewGeneration = useRef(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const releasePreview = useCallback(() => {
    previewGeneration.current += 1;
    const active = preview.current;
    preview.current = null;
    if (active) {
      active.node.pause();
      active.node.removeAttribute('src');
      active.node.load();
      URL.revokeObjectURL(active.url);
    }
  }, []);
  const stopPreview = useCallback(() => {
    releasePreview();
    setPlayingId(null);
    setLoadingId(null);
  }, [releasePreview]);
  const listen = async (id: string) => {
    stopPreview();
    const target = args.target();
    if (!target) return;
    const generation = previewGeneration.current;
    args.pauseMain();
    setLoadingId(id);
    args.setError(null);
    try {
      const source = await readLibraryAudioBindingSource(id);
      if (generation !== previewGeneration.current || args.target() !== target) return;
      args.assertCurrent(target);
      const reason = reviewAudioRestriction({ mimeType: source.file.type, size: source.file.size });
      if (reason) throw new UnsupportedAudioFileError(reason);
      const url = URL.createObjectURL(source.file);
      const node = new Audio(url);
      preview.current = { node, url };
      node.onended = () => {
        if (generation === previewGeneration.current) stopPreview();
      };
      node.onerror = () => {
        if (generation === previewGeneration.current) {
          stopPreview();
          args.setError(translate('gallery.videoReview.musicFailed'));
        }
      };
      await node.play();
      if (generation !== previewGeneration.current) {
        node.pause();
        return;
      }
      setPlayingId(id);
      setLoadingId(null);
    } catch (failure) {
      if (generation === previewGeneration.current) {
        stopPreview();
        args.setError(
          failure instanceof UnsupportedAudioFileError
            ? admissionMessage(failure.reason)
            : translate('gallery.videoReview.musicFailed')
        );
      }
      throw failure;
    }
  };
  return { releasePreview, stopPreview, listen, playingId, loadingId };
}
