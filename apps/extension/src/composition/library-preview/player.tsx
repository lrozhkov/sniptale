import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { translate } from '../../platform/i18n';
import { useLibraryPlayback } from './playback';
import { LibraryMediaTransport, LibraryViewControls } from './transport';
import { useLibraryViewport } from './viewport';
type PlayerProps = {
  src: string | null;
  filename: string;
  kind?: 'video' | 'image';
  children: ReactNode;
  footer?: ReactNode;
  videoRef?: RefObject<HTMLVideoElement | null>;
  renderTimeline?: (playback: ReturnType<typeof useLibraryPlayback>) => ReactNode;
  renderOverlay?: (playback: ReturnType<typeof useLibraryPlayback>) => ReactNode;
  onReadyChange?: (ready: boolean) => void;
};
/** Disposable library playback owns its media element; it never edits project timing. */
export function LibraryMediaPlayer(props: PlayerProps) {
  const playback = useLibraryPlayback(
    props.src,
    props.videoRef,
    props.onReadyChange,
    props.kind !== 'image'
  );
  const { failed, setFailed } = playback;
  const state = useLibraryViewport(props.src, setFailed);
  const { frame, fullscreen, viewport, pan, zoom, fullscreenButton, exitFullscreen } = state;
  const [decodeFailed, setDecodeFailed] = useState(false);
  useEffect(() => setDecodeFailed(false), [props.src]);
  const [imageReady, setImageReady] = useState(false);
  useEffect(() => setImageReady(false), [props.src]);
  const ready = props.kind === 'image' ? imageReady : playback.ready;
  return (
    <div
      ref={frame}
      className={
        fullscreen
          ? 'relative flex h-full flex-col gap-2 bg-[var(--sniptale-color-surface-panel)] p-3'
          : 'relative flex min-h-0 min-w-0 flex-1 flex-col gap-2'
      }
      data-ui="library-media-player"
    >
      <div
        ref={viewport}
        {...pan.handlers}
        style={{
          cursor: zoom > 1 ? (pan.dragging ? 'grabbing' : 'grab') : undefined,
          touchAction: zoom > 1 ? 'none' : undefined,
        }}
        className="min-h-0 flex-1 overflow-auto rounded-lg bg-[var(--sniptale-color-surface-panel)]"
        data-ui="library-media-viewport"
      >
        <LibraryMediaPicture
          {...props}
          playback={playback}
          zoom={zoom}
          imageSize={state.imageSize}
          onImageReady={(node) => {
            state.onImageLoad(node);
            setImageReady(true);
          }}
          onDecodeFailed={() => {
            setDecodeFailed(true);
            setImageReady(false);
          }}
        />
      </div>
      {decodeFailed ? (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate(
            props.kind === 'image'
              ? 'videoEditor.sidebar.mediaPreviewImageDecodeFailed'
              : 'videoEditor.sidebar.mediaPreviewVideoDecodeFailed'
          )}
        </p>
      ) : failed ? (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.mediaPreviewActionFailed')}
        </p>
      ) : null}
      <LibraryMediaTransport
        playback={playback}
        timeline={props.renderTimeline?.(playback)}
        image={props.kind === 'image'}
        onExitFullscreen={fullscreen ? exitFullscreen : undefined}
        fullscreenButtonRef={fullscreenButton}
      >
        <LibraryViewControls state={state} ready={ready} image={props.kind === 'image'} />
      </LibraryMediaTransport>
      {props.footer && (
        <div className="min-h-0 shrink-0" data-ui="library-media-footer">
          {props.footer}
        </div>
      )}
    </div>
  );
}

function LibraryMediaPicture(
  props: PlayerProps & {
    playback: ReturnType<typeof useLibraryPlayback>;
    zoom: number;
    imageSize: { width: number; height: number } | null;
    onImageReady(node: HTMLImageElement): void;
    onDecodeFailed(): void;
  }
) {
  const { video, sync, loadMetadata } = props.playback;
  if (!props.src) return props.children;
  return (
    <div
      style={
        props.kind === 'image' && props.imageSize
          ? {
              width: '100%',
              minWidth: props.imageSize.width,
              height: '100%',
              minHeight: props.imageSize.height,
            }
          : { width: `${props.zoom * 100}%`, height: `${props.zoom * 100}%` }
      }
      className="relative flex items-center justify-center"
      data-ui="library-media-picture"
    >
      {props.kind === 'image' ? (
        <img
          key={props.src}
          src={props.src}
          alt={props.filename}
          draggable={false}
          className="block h-full w-full object-contain"
          style={
            props.imageSize ? { ...props.imageSize, maxWidth: 'none', flex: 'none' } : undefined
          }
          onLoad={(event) => props.onImageReady(event.currentTarget)}
          onError={props.onDecodeFailed}
        />
      ) : (
        <video
          key={props.src}
          ref={video}
          className="block h-full w-full object-contain"
          src={props.src}
          preload="auto"
          playsInline
          aria-label={props.filename}
          onLoadedMetadata={loadMetadata}
          onDurationChange={sync}
          onLoadedData={sync}
          onCanPlay={sync}
          onSeeking={sync}
          onSeeked={sync}
          onTimeUpdate={sync}
          onPlay={sync}
          onPause={sync}
          onEnded={sync}
          onVolumeChange={sync}
          onError={() => {
            sync();
            props.onDecodeFailed();
          }}
        />
      )}
      {props.renderOverlay?.(props.playback)}
    </div>
  );
}
