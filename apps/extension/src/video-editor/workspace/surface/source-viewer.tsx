import { registerPlaybackSpaceShortcut } from '../../runtime/session/playback/shortcuts';
import { useEffect, useState } from 'react';
import {
  Music,
  Pause,
  Play,
  ListEnd,
  BetweenHorizontalStart,
  Layers,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
} from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { SourceRangeTimeline } from '../../chrome/source-range-timeline';
import { translate } from '../../../platform/i18n';
import {
  VideoProjectAssetType,
  type VideoProjectAsset,
} from '../../../features/video/project/types';
import {
  useSourceMediaViewer,
  type SourceDraft,
  type SourceViewerProps,
  type SourceMediaViewerProps,
} from './source-viewer-state';

/** Disposable source marks belong to this project viewer, independently of montage history. */
export function VideoEditorSourceViewer(props: SourceViewerProps) {
  const [drafts, setDrafts] = useState<Record<string, SourceDraft>>({});
  if (!props.asset) return null;
  const asset = props.asset;
  const duration = asset.metadata.duration ?? 0;
  const draft = drafts[asset.id] ?? { cursor: 0, range: { start: 0, end: duration } };
  return (
    <SourceMediaViewer
      key={`${asset.id}:${props.assetUrl ?? ''}:${duration}`}
      {...props}
      asset={asset}
      draft={draft}
      onDraftChange={(next) => setDrafts((current) => ({ ...current, [asset.id]: next }))}
    />
  );
}

function sourceTime(value: number, fps: number): string {
  const frame = Math.max(0, Math.round(value * fps));
  const seconds = Math.floor(frame / fps);
  const minutes = Math.floor(seconds / 60);
  const secondsPart = String(seconds % 60).padStart(2, '0');
  const framePart = String(frame - Math.round(seconds * fps)).padStart(2, '0');
  return `${minutes}:${secondsPart}:${framePart}`;
}

function SourceMediaViewer(props: SourceMediaViewerProps) {
  const viewer = useSourceMediaViewer(props);
  const {
    viewerRef,
    ready,
    error,
    image,
    duration,
    validRange,
    usable,
    place,
    onKeyDown,
    retry,
    toggle,
  } = viewer;
  useEffect(() => {
    if (!props.active) return;
    return registerPlaybackSpaceShortcut(() => {
      if (!image) toggle();
    });
  }, [props.active, image, toggle]);
  const canPlace = usable && (image || validRange);
  return (
    <div
      ref={viewerRef}
      data-ui="video-editor.source-viewer"
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={translate('videoEditor.app.sourceViewer')}
      className={[
        'flex h-full min-h-0',
        'min-w-0 flex-col rounded-lg',
        'outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-accent)]',
      ].join(' ')}
    >
      <SourceMediaSurface asset={props.asset} assetUrl={props.assetUrl} media={viewer} />
      <div className="shrink-0 space-y-1 pt-1.5">
        {ready && !image && !validRange && !error && (
          <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
            {translate('videoEditor.app.sourceInvalidRange')}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
            {error}{' '}
            {!ready && (
              <ProductActionButton compact tone="secondary" onClick={retry}>
                {translate('videoEditor.app.sourceRetry')}
              </ProductActionButton>
            )}
          </p>
        )}
        <div
          className="flex min-w-0 items-center justify-center gap-3 px-3"
          data-ui="video-editor.source-placement"
        >
          {!image && <SourceTimingControls playback={viewer} fps={props.fps} />}
          <div className="flex shrink-0 items-center gap-1 border-l border-[var(--sniptale-color-border-soft)] pl-3">
            <ProductActionButton
              compact
              className="!h-9 !gap-1.5 !px-2.5"
              disabled={!canPlace}
              title={translate('videoEditor.app.materialsAppend')}
              onClick={() => place(props.onAppend)}
            >
              <ListEnd size={16} aria-hidden="true" />
              {translate('videoEditor.app.sourceAppend')}
            </ProductActionButton>
            <ProductActionButton
              compact
              className="!h-9 !gap-1.5 !px-2.5"
              tone="secondary"
              disabled={!canPlace}
              title={translate('videoEditor.app.materialsInsertHint')}
              onClick={() => place(props.onInsert)}
            >
              <BetweenHorizontalStart size={16} aria-hidden="true" />
              {translate('videoEditor.app.sourceInsert')}
            </ProductActionButton>
            <ProductActionButton
              compact
              className="!h-9 !gap-1.5 !px-2.5"
              tone="secondary"
              disabled={!canPlace}
              title={translate('videoEditor.app.materialsOverlay')}
              onClick={() => place(props.onOverlay)}
            >
              <Layers size={16} aria-hidden="true" />
              {translate('videoEditor.app.sourceOverlay')}
            </ProductActionButton>
          </div>
        </div>
        {!image && (
          <SourceRangeTimeline
            duration={duration}
            fps={props.fps}
            cursor={viewer.cursor}
            range={viewer.range}
            disabled={!usable || duration <= 0}
            onSeek={viewer.seek}
            onRange={(range) => {
              viewer.pause();
              props.onDraftChange({ ...props.draft, range });
            }}
          />
        )}
      </div>
    </div>
  );
}

function SourceTransportButton(props: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ContentToolbarButton
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
      className="!h-9 !w-9 !min-w-9 !px-0"
      onClick={props.onClick}
    >
      {props.children}
    </ContentToolbarButton>
  );
}

function SourceMediaSurface({
  asset,
  assetUrl,
  media,
}: {
  asset: VideoProjectAsset;
  assetUrl: string | undefined;
  media: Pick<
    ReturnType<typeof useSourceMediaViewer>,
    'image' | 'reload' | 'ready' | 'error' | 'mediaRef' | 'mediaEvents' | 'onImageLoad'
  >;
}) {
  const { image, reload, ready, error, mediaRef, mediaEvents, onImageLoad } = media;
  return (
    <div
      className={[
        'relative flex min-h-0',
        'flex-1 items-center justify-center',
        'overflow-hidden rounded-lg bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
    >
      {assetUrl &&
        (image ? (
          <img
            key={reload}
            src={assetUrl}
            alt={asset.name}
            className="h-full w-full object-contain"
            onLoad={onImageLoad}
            onError={mediaEvents.onError}
          />
        ) : asset.type === VideoProjectAssetType.AUDIO ? (
          <>
            <Music
              size={48}
              aria-hidden="true"
              className="text-[var(--sniptale-color-text-muted)]"
            />
            <audio
              ref={(node) => {
                mediaRef.current = node;
              }}
              src={assetUrl}
              preload="auto"
              {...mediaEvents}
            />
          </>
        ) : (
          <video
            ref={(node) => {
              mediaRef.current = node;
            }}
            src={assetUrl}
            preload="auto"
            playsInline
            className="h-full w-full object-contain"
            {...mediaEvents}
          />
        ))}
      {!ready && !error && (
        <p role="status" className="absolute px-4 text-center text-xs">
          {translate(
            assetUrl ? 'videoEditor.app.sourceLoading' : 'videoEditor.app.materialsUnavailable'
          )}
        </p>
      )}
    </div>
  );
}

function SourceTimingControls({
  playback,
  fps,
}: {
  playback: Pick<
    ReturnType<typeof useSourceMediaViewer>,
    | 'range'
    | 'cursor'
    | 'duration'
    | 'frame'
    | 'lastFrame'
    | 'usable'
    | 'playing'
    | 'seek'
    | 'step'
    | 'toggle'
  >;
  fps: number;
}) {
  const { cursor, lastFrame, usable, playing, seek, step, toggle } = playback;
  return (
    <>
      <div className="flex shrink-0 items-center gap-1">
        <SourceTransportButton
          label={translate('videoEditor.timeline.seekToStart')}
          disabled={!usable}
          onClick={() => seek(0)}
        >
          <SkipBack size={14} />
        </SourceTransportButton>
        <SourceTransportButton
          label={translate('videoEditor.timeline.previousFrame')}
          disabled={!usable}
          onClick={() => step(-1)}
        >
          <StepBack size={14} />
        </SourceTransportButton>
        <SourceTransportButton
          label={translate(playing ? 'videoEditor.timeline.pause' : 'videoEditor.timeline.play')}
          disabled={!usable}
          onClick={toggle}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </SourceTransportButton>
        <SourceTransportButton
          label={translate('videoEditor.timeline.nextFrame')}
          disabled={!usable}
          onClick={() => step(1)}
        >
          <StepForward size={14} />
        </SourceTransportButton>
        <SourceTransportButton
          label={translate('videoEditor.timeline.seekToEnd')}
          disabled={!usable}
          onClick={() => seek(lastFrame)}
        >
          <SkipForward size={14} />
        </SourceTransportButton>
        <output data-source-counter="true" className="px-1 text-xs tabular-nums">
          {sourceTime(cursor, fps)}
        </output>
      </div>
    </>
  );
}
