import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { translate } from '../../../platform/i18n';
import {
  VideoProjectAssetType,
  type VideoProjectAsset,
} from '../../../features/video/project/types';
import type {
  VideoEditorMaterialPlacementResult,
  VideoEditorMaterialSourceRange,
} from '../../contracts/insertion';

export interface SourceDraft {
  cursor: number;
  range: VideoEditorMaterialSourceRange;
}

type SourcePlacement = (
  assetId: string,
  range?: VideoEditorMaterialSourceRange
) => VideoEditorMaterialPlacementResult;

export interface SourceViewerProps {
  asset: VideoProjectAsset | null;
  assetUrl: string | undefined;
  active: boolean;
  fps: number;
  onAppend: SourcePlacement;
  onInsert: SourcePlacement;
  onOverlay: SourcePlacement;
  onPlaced: () => void;
}

export interface SourceMediaViewerProps extends SourceViewerProps {
  asset: VideoProjectAsset;
  draft: SourceDraft;
  onDraftChange: (draft: SourceDraft) => void;
}

export function useSourceMediaViewer(props: SourceMediaViewerProps) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const playAttempt = useRef(0);
  const [reload, setReload] = useState(0);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const image = props.asset.type === VideoProjectAssetType.IMAGE;
  const { duration, frame, lastFrame, cursor, range, validRange } = getSourceTiming(props);
  const usable = ready && Boolean(props.assetUrl) && props.active;

  const pause = () => {
    playAttempt.current += 1;
    mediaRef.current?.pause();
    setPlaying(false);
  };
  useEffect(() => {
    const media = mediaRef.current;
    if (props.active) viewerRef.current?.focus();
    if (!props.active) {
      playAttempt.current += 1;
      mediaRef.current?.pause();
      setPlaying(false);
    }
    return () => {
      playAttempt.current += 1;
      media?.pause();
    };
  }, [props.active]);

  const seek = (time: number) => {
    pause();
    const next = Math.max(0, Math.min(lastFrame, Math.round(time * props.fps) / props.fps));
    if (mediaRef.current) mediaRef.current.currentTime = next;
    props.onDraftChange({ ...props.draft, cursor: next });
  };
  const currentFrame = () =>
    sourceFrameTime(mediaRef.current?.currentTime ?? cursor, props.fps, lastFrame);
  const step = (direction: -1 | 1) => seek(currentFrame() + direction * frame);
  const toggle = () => {
    const media = mediaRef.current;
    if (!media || !usable) return;
    if (!media.paused) {
      pause();
      return;
    }
    if (media.ended || media.currentTime >= lastFrame) media.currentTime = 0;
    const attempt = ++playAttempt.current;
    setError(null);
    void media.play().catch(() => {
      if (attempt !== playAttempt.current) return;
      setPlaying(false);
      setError(translate('videoEditor.app.sourcePlayFailed'));
    });
  };
  const mark = (edge: 'in' | 'out') => {
    pause();
    const markAt = currentFrame();
    const next = markSourceRange(range, markAt, duration, frame, edge);
    props.onDraftChange({ ...props.draft, cursor: markAt, range: next });
  };
  const place = (action: SourcePlacement) => {
    if (!usable || (!image && !validRange)) return;
    pause();
    const result = action(props.asset.id, image ? undefined : range);
    if (result.status === 'placed') {
      setError(null);
      props.onPlaced();
      return;
    }
    setError(getSourcePlacementError(result.reason));
  };
  const mediaEvents = {
    onLoadedData: () => {
      setReady(true);
      setError(null);
      if (mediaRef.current) mediaRef.current.currentTime = cursor;
    },
    onError: () => {
      pause();
      setReady(false);
      setError(translate('videoEditor.app.sourceMediaFailed'));
    },
    onPlay: () => {
      if (props.active) setPlaying(true);
      else mediaRef.current?.pause();
    },
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: () => {
      const time = mediaRef.current?.currentTime;
      if (time !== undefined && time >= duration && mediaRef.current) {
        mediaRef.current.pause();
        mediaRef.current.currentTime = lastFrame;
      }
      if (time !== undefined && Number.isFinite(time))
        props.onDraftChange({ ...props.draft, cursor: Math.min(lastFrame, time) });
    },
  };
  return {
    viewerRef,
    mediaRef,
    reload,
    ready,
    playing,
    error,
    image,
    duration,
    frame,
    lastFrame,
    cursor,
    range,
    validRange,
    usable,
    seek,
    step,
    toggle,
    mark,
    place,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) =>
      handleSourceShortcut(event, usable && !image, {
        Space: toggle,
        KeyK: toggle,
        KeyI: () => mark('in'),
        KeyO: () => mark('out'),
        Home: () => seek(0),
        End: () => seek(lastFrame),
        Comma: () => step(-1),
        Period: () => step(1),
      }),
    mediaEvents,
    onImageLoad: () => setReady(true),
    retry: () => {
      setError(null);
      setReload((value) => value + 1);
      mediaRef.current?.load();
    },
  };
}

/** A mark crossing the other edge selects one displayed frame instead of an inverted interval. */
function markSourceRange(
  range: VideoEditorMaterialSourceRange,
  cursor: number,
  duration: number,
  frame: number,
  edge: 'in' | 'out'
): VideoEditorMaterialSourceRange {
  const next =
    edge === 'in'
      ? { start: Math.min(cursor, Math.max(0, duration - frame)), end: range.end }
      : { start: range.start, end: Math.min(duration, cursor + frame) };
  if (next.end - next.start + 1e-9 < frame) {
    if (edge === 'in') next.end = Math.min(duration, next.start + frame);
    else next.start = Math.max(0, next.end - frame);
  }
  return next;
}

function getSourcePlacementError(
  reason: Extract<VideoEditorMaterialPlacementResult, { status: 'rejected' }>['reason']
): string {
  return translate(
    reason === 'locked-track'
      ? 'videoEditor.app.materialsLocked'
      : reason === 'invalid-cut'
        ? 'videoEditor.app.materialsInvalidCut'
        : reason === 'invalid-range'
          ? 'videoEditor.app.sourceInvalidRange'
          : 'videoEditor.app.materialsUnavailable'
  );
}

/** Source focus retains native text/range editing and button activation before transport shortcuts. */
function handleSourceShortcut(
  event: KeyboardEvent<HTMLDivElement>,
  enabled: boolean,
  actions: Readonly<Record<string, (() => void) | undefined>>
): void {
  if (!enabled || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (
    event.target instanceof Element &&
    event.target.closest('input, textarea, select, [contenteditable="true"]')
  )
    return;
  if (event.code === 'Space' && event.target instanceof Element && event.target.closest('button'))
    return;
  const action = actions[event.code];
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  action();
}

function getSourceTiming(props: Pick<SourceMediaViewerProps, 'asset' | 'draft' | 'fps'>) {
  const duration = props.asset.metadata.duration ?? 0;
  const frame = 1 / props.fps;
  const lastFrame = Math.max(0, (Math.ceil(duration * props.fps) - 1) / props.fps);
  const cursor = sourceFrameTime(props.draft.cursor, props.fps, lastFrame);
  const range = props.draft.range;
  const validRange =
    range.start >= 0 && range.end <= duration && range.end - range.start + 1e-9 >= frame;
  return { duration, frame, lastFrame, cursor, range, validRange };
}

function sourceFrameTime(time: number, fps: number, lastFrame: number): number {
  // Chromium exposes native seek times in microseconds, including values just below a frame edge.
  return Math.max(0, Math.min(lastFrame, Math.floor((time + 1e-6) * fps) / fps));
}
