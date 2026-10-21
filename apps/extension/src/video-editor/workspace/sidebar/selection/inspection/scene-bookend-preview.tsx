import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type {
  BookendImagePresentation,
  BookendVideoPresentation,
} from '../../../../../features/video/project/scene/bookend-media';
import { resolveMediaFitFrame } from '../../../../../features/video/project/window-geometry';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import { translate } from '../../../../../platform/i18n';
import { loadVideoEditorAssetBlob } from '../../../../runtime/session/asset-urls';

/** A disposable paused source preview never seeks or changes the main playback element. */
export function SceneBookendPreview(props: {
  asset: VideoProject['assets'][number];
  settings: BookendImagePresentation | BookendVideoPresentation;
  output: { width: number; height: number };
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ asset: typeof props.asset; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setLoaded(null);
    setFailed(false);
    void loadVideoEditorAssetBlob(props.asset)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setFailed(true);
          return;
        }
        url = URL.createObjectURL(blob);
        setLoaded({ asset: props.asset, url });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [props.asset, attempt]);
  const trimStart = 'trim' in props.settings ? props.settings.trim.start : 0;
  useEffect(() => {
    if (video.current && video.current.readyState >= 1) video.current.currentTime = trimStart;
  }, [trimStart]);
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
  const url = loaded?.asset === props.asset ? loaded.url : null;
  return (
    <div
      className="min-w-0 space-y-1"
      aria-busy={!url && !failed}
      data-ui="video-editor.scene-bookends.preview"
    >
      <div className="flex h-28 items-center justify-center rounded-[4px] bg-[var(--sniptale-color-surface-muted)]">
        <div
          className="relative overflow-hidden rounded-[4px]"
          style={{
            width: `min(100%, ${(112 * props.output.width) / props.output.height}px)`,
            aspectRatio: props.output.width / props.output.height,
            backgroundColor: props.settings.fillColor,
          }}
        >
          {url &&
            !failed &&
            (props.asset.type === 'IMAGE' ? (
              <img src={url} alt={props.asset.name} style={style} onError={() => setFailed(true)} />
            ) : (
              <video
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
                onError={() => setFailed(true)}
              />
            ))}
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
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{translate('common.actions.retry')}</span>
          </ContentToolbarButton>
        </div>
      )}
    </div>
  );
}
