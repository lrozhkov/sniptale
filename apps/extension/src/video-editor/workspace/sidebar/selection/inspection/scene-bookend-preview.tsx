import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type {
  BookendImagePresentation,
  BookendVideoPresentation,
} from '../../../../../features/video/project/scene/bookend-media';
import { resolveMediaFitFrame } from '../../../../../features/video/project/window-geometry';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import { createPreviewPresentationSession } from '../../../../../features/video/composition/canvas/preview-presentation';
import { translate } from '../../../../../platform/i18n';
import {
  getVideoEditorAssetSourceFingerprint,
  loadVideoEditorAssetBlob,
} from '../../../../runtime/session/asset-urls';
import { WorkspacePreviewContext } from '../../../../runtime/controller/composition/contexts';
import {
  createBookendPreviewFrameQueue,
  type BookendPreviewFrameInput,
} from './scene-bookend-preview-render';

type ReadySource = { key: string; url: string; time: number };

/** Disposable media and retained GPU pixels never seek or mutate the main transport. */
export function SceneBookendPreview(props: {
  asset: VideoProject['assets'][number];
  settings: BookendImagePresentation | BookendVideoPresentation;
  output: { width: number; height: number };
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const [readySource, setReadySource] = useState<ReadySource | null>(null);
  const [paintedKey, setPaintedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    image = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null),
    fallback = useRef<HTMLDivElement>(null),
    gpuHost = useRef<HTMLDivElement>(null);
  const queue = useRef<ReturnType<typeof createBookendPreviewFrameQueue> | null>(null);
  const renderer = useContext(WorkspacePreviewContext)?.preferences.preferences.renderer ?? 'gpu';
  const assetRef = useRef(props.asset);
  assetRef.current = props.asset;
  const sourceKey = JSON.stringify([
    props.asset.id,
    props.asset.type,
    getVideoEditorAssetSourceFingerprint(props.asset),
    attempt,
  ]);
  const url = loaded?.key === sourceKey ? loaded.url : null;
  const trimStart = 'trim' in props.settings ? props.settings.trim.start : 0;
  const ready =
    !failed &&
    readySource?.key === sourceKey &&
    readySource.url === url &&
    readySource.time === trimStart;
  const sourceIdentity = useRef({ key: sourceKey, url });
  sourceIdentity.current = { key: sourceKey, url };
  const latest = useRef<BookendPreviewFrameInput>({
    source: {
      kind: 'image',
      element: null,
      key: sourceKey,
      url,
      time: trimStart,
      size: { width: props.asset.metadata.width ?? 0, height: props.asset.metadata.height ?? 0 },
      ready,
    },
    framing: props.settings,
    logical: props.output,
    renderer,
  });
  latest.current = {
    source: {
      kind: props.asset.type === 'IMAGE' ? 'image' : 'video',
      element: props.asset.type === 'IMAGE' ? image.current : video.current,
      key: sourceKey,
      url,
      time: trimStart,
      ready,
      size: { width: props.asset.metadata.width ?? 0, height: props.asset.metadata.height ?? 0 },
    },
    framing: {
      fit: props.settings.fit,
      fillColor: props.settings.fillColor,
      crop: { panX: props.settings.crop.panX, panY: props.settings.crop.panY },
    },
    logical: { width: props.output.width, height: props.output.height },
    renderer,
  };
  useLayoutEffect(() => {
    const frame = stage.current;
    if (!frame) return;
    const presenter = createPreviewPresentationSession({
      fallback: () => fallback.current,
      host: () => gpuHost.current,
      role: 'inspector',
      background: 'transparent',
    });
    presenter.mount();
    const owner = createBookendPreviewFrameQueue({
      stage: frame,
      presenter,
      read: () => latest.current,
      onPresented: (input) => setPaintedKey(input.source.key),
      onError: () => setFailed(true),
    });
    queue.current = owner;
    return () => {
      queue.current = null;
      owner.dispose();
      presenter.dispose();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    queue.current?.cancel();
    setLoaded(null);
    setReadySource(null);
    setFailed(false);
    void loadVideoEditorAssetBlob(assetRef.current)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setFailed(true);
          return;
        }
        url = URL.createObjectURL(blob);
        setLoaded({ key: sourceKey, url });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      queue.current?.cancel();
      if (url) URL.revokeObjectURL(url);
    };
  }, [sourceKey]);
  const markReady = useCallback(
    (media: HTMLVideoElement | HTMLImageElement) => {
      if (
        !url ||
        sourceIdentity.current.key !== sourceKey ||
        sourceIdentity.current.url !== url ||
        (media.currentSrc || media.src) !== url ||
        (media !== image.current && media !== video.current)
      )
        return;
      if (media instanceof HTMLVideoElement) {
        if (
          media.seeking ||
          media.readyState < 2 ||
          Math.abs(media.currentTime - trimStart) > 0.001
        )
          return;
      } else if (!media.complete || media.naturalWidth < 1 || media.naturalHeight < 1) return;
      setReadySource({ key: sourceKey, url, time: trimStart });
    },
    [sourceKey, url, trimStart]
  );
  useEffect(() => {
    queue.current?.cancel();
    const media = video.current;
    if (!url || !media || media.readyState < 1 || (media.currentSrc || media.src) !== url) return;
    if (media.currentTime !== trimStart) media.currentTime = trimStart;
    else markReady(media);
  }, [trimStart, sourceKey, url, markReady]);
  useEffect(() => {
    if (ready) queue.current?.request();
    else queue.current?.cancel();
  }, [
    ready,
    sourceKey,
    url,
    trimStart,
    renderer,
    props.asset.metadata.width,
    props.asset.metadata.height,
    props.output.width,
    props.output.height,
    props.settings.fit,
    props.settings.fillColor,
    props.settings.crop.panX,
    props.settings.crop.panY,
  ]);
  useEffect(() => {
    const frame = stage.current;
    if (!frame) return;
    const draw = () => {
      if (latest.current.source.ready) queue.current?.request();
    };
    const observer = new ResizeObserver(draw);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const frame = resolveMediaFitFrame({
    source: props.asset.metadata,
    output: props.output,
    fit: props.settings.fit,
    crop: props.settings.crop,
  });
  const style = {
    position: 'absolute' as const,
    left: `${(frame.x / props.output.width) * 100}%`,
    top: `${(frame.y / props.output.height) * 100}%`,
    width: `${(frame.width / props.output.width) * 100}%`,
    height: `${(frame.height / props.output.height) * 100}%`,
    maxWidth: 'none',
  };
  return (
    <div
      className="min-w-0 space-y-1"
      aria-busy={!failed && (!ready || paintedKey !== sourceKey)}
      data-ui="video-editor.scene-bookends.preview"
    >
      <div className="flex h-28 items-center justify-center rounded-[4px] bg-[var(--sniptale-color-surface-muted)]">
        <div
          ref={stage}
          className="relative overflow-hidden rounded-[4px]"
          style={{
            width: `min(100%, ${(112 * props.output.width) / props.output.height}px)`,
            aspectRatio: props.output.width / props.output.height,
            backgroundColor: props.settings.fillColor,
            visibility: paintedKey === sourceKey && !failed ? 'visible' : 'hidden',
          }}
        >
          <div
            ref={fallback}
            data-ui="video-editor.scene-bookends.preview.fallback"
            className="absolute inset-0"
          >
            {url &&
              !failed &&
              (props.asset.type === 'IMAGE' ? (
                <img
                  key={url}
                  ref={image}
                  src={url}
                  alt={props.asset.name}
                  style={style}
                  onLoad={(event) => markReady(event.currentTarget)}
                  onError={() => setFailed(true)}
                />
              ) : (
                <video
                  key={url}
                  ref={video}
                  src={url}
                  muted
                  playsInline
                  preload="auto"
                  aria-label={props.asset.name}
                  style={style}
                  onLoadedMetadata={(event) => {
                    event.currentTarget.currentTime = trimStart;
                  }}
                  onLoadedData={(event) => markReady(event.currentTarget)}
                  onSeeked={(event) => markReady(event.currentTarget)}
                  onError={() => setFailed(true)}
                />
              ))}
          </div>
          <div
            ref={gpuHost}
            data-ui="video-editor.scene-bookends.preview.gpu-host"
            className="pointer-events-none absolute inset-0"
          />
        </div>
      </div>
      {failed && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-xs">
            {translate('videoEditor.sidebar.bookendPreviewFailed')}
          </p>
          <ContentToolbarButton
            type="button"
            size="compact"
            tone="outline"
            className="flex max-w-full items-center gap-1.5"
            onClick={() => {
              queue.current?.reset();
              setAttempt((value) => value + 1);
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{translate('common.actions.retry')}</span>
          </ContentToolbarButton>
        </div>
      )}
    </div>
  );
}
