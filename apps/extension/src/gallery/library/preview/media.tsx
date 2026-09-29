import {
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  LockKeyholeOpen,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { GalleryProjectOpenAction } from '../ui/project-presentation';
import { translate } from '../../../platform/i18n';
import {
  isGalleryMediaItem,
  isGalleryScenarioExportItem,
  isGalleryScenarioItem,
  isGalleryVideoProjectItem,
} from '../items';
import { isImageKind, isVideoKind, MediaThumb } from '../ui';
import { PreviewVideo } from './video-player';
import { PreviewScenarioStage } from './scenario-stage';
import type { PreviewPanelProps } from './types';
import { usePreviewImageZoom } from './usePreviewImageZoom';
import {
  usePreviewMediaTransition,
  usePreviewMediaTransitionAnimation,
} from './usePreviewMediaTransition';

function PreviewFloatingControl(props: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  pressed?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      aria-pressed={props.pressed}
      title={props.title ?? props.ariaLabel}
      disabled={props.disabled}
      onClick={props.onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border
        border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]
        text-[var(--sniptale-color-text-primary)] shadow-sm transition
        hover:border-[var(--sniptale-color-border-strong)]
        hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]
        aria-pressed:border-[var(--sniptale-color-border-strong)]
        aria-pressed:bg-[var(--sniptale-color-surface-panel)]
        aria-pressed:text-[var(--sniptale-color-accent-emphasis)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]
        disabled:cursor-not-allowed disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}

function PreviewInspectorControls(
  props: Pick<PreviewPanelProps, 'inspectorCollapsed' | 'onClose' | 'onInspectorToggle'>
) {
  const inspectorLabel = props.inspectorCollapsed
    ? translate('gallery.preview.showInspector')
    : translate('gallery.preview.hideInspector');

  return (
    <>
      <PreviewFloatingControl ariaLabel={inspectorLabel} onClick={props.onInspectorToggle}>
        {props.inspectorCollapsed ? (
          <PanelRightOpen className="h-4 w-4" />
        ) : (
          <PanelRightClose className="h-4 w-4" />
        )}
      </PreviewFloatingControl>
      <PreviewFloatingControl ariaLabel={translate('common.actions.close')} onClick={props.onClose}>
        <X className="h-4 w-4" />
      </PreviewFloatingControl>
    </>
  );
}

function PreviewZoomControls(props: {
  controls: ReturnType<typeof usePreviewImageZoom>['controls'];
  disabled: boolean;
}) {
  return (
    <div className="group relative">
      <div className="flex items-center gap-1.5">
        <PreviewFloatingControl
          ariaLabel={translate('gallery.preview.zoomOut')}
          disabled={props.disabled || !props.controls.canZoomOut}
          onClick={props.controls.zoomOut}
        >
          <Minus className="h-4 w-4" />
        </PreviewFloatingControl>
        <button
          type="button"
          onClick={props.controls.resetZoom}
          disabled={props.disabled}
          title={translate('gallery.preview.resetZoom')}
          className="h-9 min-w-14 rounded-[8px] border border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]
          px-3 py-2 text-xs font-semibold text-[var(--sniptale-color-text-primary)] shadow-sm
          transition hover:border-[var(--sniptale-color-border-strong)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]
          disabled:cursor-not-allowed disabled:opacity-40"
        >
          {Math.round(props.controls.zoom * 100)}%
        </button>
        <PreviewFloatingControl
          ariaLabel={translate('gallery.preview.zoomIn')}
          disabled={props.disabled || !props.controls.canZoomIn}
          onClick={props.controls.zoomIn}
        >
          <Plus className="h-4 w-4" />
        </PreviewFloatingControl>
        <PreviewFloatingControl
          ariaLabel={translate('gallery.preview.zoomLockToggle')}
          title={translate(
            props.controls.zoomLocked ? 'gallery.preview.unlockZoom' : 'gallery.preview.lockZoom'
          )}
          onClick={props.controls.toggleZoomLock}
          pressed={props.controls.zoomLocked}
          disabled={props.disabled}
        >
          {props.controls.zoomLocked ? (
            <LockKeyhole className="h-4 w-4" />
          ) : (
            <LockKeyholeOpen className="h-4 w-4" />
          )}
        </PreviewFloatingControl>
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 top-full pt-1 opacity-0 transition-opacity
        group-hover:pointer-events-auto group-hover:opacity-100
        group-focus-within:pointer-events-auto group-focus-within:opacity-100
        [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
      >
        <div
          className="rounded-[8px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] px-2 py-1 shadow-sm"
        >
          <input
            data-ui="gallery.preview.zoomSlider"
            type="range"
            aria-label={translate('gallery.preview.zoomSlider')}
            aria-valuetext={`${Math.round(props.controls.zoom * 100)}%`}
            min={props.controls.minimumZoom}
            max={props.controls.maximumZoom}
            step="any"
            value={props.controls.zoom}
            disabled={props.disabled}
            onChange={(event) => props.controls.setZoom(event.currentTarget.valueAsNumber)}
            className="block h-5 w-full cursor-pointer accent-[var(--sniptale-color-accent)]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]
              disabled:cursor-not-allowed disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );
}

function PreviewNavigationControls({
  navigation,
}: {
  navigation: PreviewPanelProps['navigation'];
}) {
  if (!navigation) {
    return <div />;
  }

  return (
    <div className="flex items-center gap-1.5">
      <PreviewFloatingControl
        ariaLabel={translate('gallery.preview.previous')}
        disabled={!navigation.hasPrevious}
        onClick={navigation.onPrevious}
      >
        <ChevronLeft className="h-[18px] w-[18px]" />
      </PreviewFloatingControl>
      <span
        className="min-w-14 rounded-[8px] border border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]
          px-2 py-2 text-center text-xs font-medium"
      >
        {navigation.current} / {navigation.total}
      </span>
      <PreviewFloatingControl
        ariaLabel={translate('gallery.preview.next')}
        disabled={!navigation.hasNext}
        onClick={navigation.onNext}
      >
        <ChevronRight className="h-[18px] w-[18px]" />
      </PreviewFloatingControl>
    </div>
  );
}

function PreviewMediaControls(
  props: Pick<PreviewPanelProps, 'inspectorCollapsed' | 'onClose' | 'onInspectorToggle'> & {
    isImagePreview: boolean;
    zoomCommandsEnabled: boolean;
    imageZoom: ReturnType<typeof usePreviewImageZoom>;
    navigation: PreviewPanelProps['navigation'];
  }
) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
      <div className="pointer-events-auto shrink-0">
        <PreviewNavigationControls navigation={props.navigation} />
      </div>
      <div className="pointer-events-auto ml-auto flex max-w-full flex-wrap items-center justify-end gap-1.5">
        {props.isImagePreview ? (
          <PreviewZoomControls
            controls={props.imageZoom.controls}
            disabled={!props.zoomCommandsEnabled}
          />
        ) : null}
        <PreviewInspectorControls {...props} />
      </div>
    </div>
  );
}

function PreviewMediaSurface(props: {
  children: ReactNode;
  containerRef: ReturnType<typeof usePreviewImageZoom>['viewport']['containerRef'];
  imageZoom: ReturnType<typeof usePreviewImageZoom>;
  isImagePreview: boolean;
  transitionRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={(element) => {
        props.containerRef.current = element;
        props.transitionRef.current = element;
      }}
      onPointerDown={props.imageZoom.viewport.handlePointerDown}
      onPointerMove={props.imageZoom.viewport.handlePointerMove}
      onPointerUp={props.imageZoom.viewport.handlePointerEnd}
      onPointerCancel={props.imageZoom.viewport.handlePointerEnd}
      className={`h-full w-full overscroll-contain px-4 pb-4 pt-16
        @max-[500px]/preview-media:pt-28 @max-[330px]/preview-media:pt-40
        ${props.isImagePreview ? 'touch-none overflow-auto' : 'overflow-hidden'}
        ${
          props.imageZoom.controls.isZoomedFromFit
            ? props.imageZoom.viewport.isPanning
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : ''
        }`}
    >
      <div
        data-ui={props.isImagePreview ? 'preview.media.scrollable' : 'preview.media.contained'}
        className={
          props.isImagePreview
            ? 'grid h-max min-h-full w-max min-w-full place-items-center'
            : 'grid h-full min-h-0 w-full min-w-0 place-items-center'
        }
      >
        {props.children}
      </div>
    </div>
  );
}

function PreviewMediaContent(
  props: Pick<PreviewPanelProps, 'item' | 'previewUrl' | 'trashMode'> & {
    imageStyle: ReturnType<typeof usePreviewImageZoom>['image']['style'];
    imageReady: ReturnType<typeof usePreviewImageZoom>['image']['ready'];
    isImagePreview: boolean;
    onImageLoad: ReturnType<typeof usePreviewImageZoom>['image']['handleImageLoad'];
    onMediaError: () => void;
  }
) {
  if (props.isImagePreview) {
    return (
      <img
        src={props.previewUrl ?? undefined}
        alt={props.item.filename}
        onLoad={props.onImageLoad}
        onError={props.onMediaError}
        style={{ ...props.imageStyle, visibility: props.imageReady ? 'visible' : 'hidden' }}
        draggable={false}
        className="block max-h-none max-w-none shrink-0 select-none"
      />
    );
  }

  if (isGalleryMediaItem(props.item) && props.previewUrl && isVideoKind(props.item.kind)) {
    return (
      <div onErrorCapture={props.onMediaError}>
        <PreviewVideo
          key={props.previewUrl}
          src={props.previewUrl}
          trashMode={Boolean(props.trashMode)}
        />
      </div>
    );
  }

  if (isGalleryMediaItem(props.item) && props.previewUrl && props.item.kind === 'audio') {
    return (
      <audio
        src={props.previewUrl}
        onError={props.onMediaError}
        controls
        controlsList={props.trashMode ? 'nodownload' : undefined}
        onContextMenu={props.trashMode ? (event) => event.preventDefault() : undefined}
        className="w-full max-w-xl"
      />
    );
  }

  if (isGalleryScenarioItem(props.item) || isGalleryScenarioExportItem(props.item)) {
    return <PreviewScenarioStage item={props.item} trashMode={Boolean(props.trashMode)} />;
  }

  if (isGalleryVideoProjectItem(props.item)) {
    return <MediaThumb item={props.item} fit="contain" />;
  }

  return null;
}

function PreviewMediaLoadFeedback(props: { status: 'loading' | 'missing' | 'error' | 'invalid' }) {
  const messageKey = {
    loading: 'gallery.preview.mediaLoading',
    missing: 'gallery.preview.mediaMissing',
    error: 'gallery.preview.mediaUnavailable',
    invalid: 'gallery.preview.mediaInvalid',
  } as const;
  return (
    <p
      data-ui="gallery.preview.mediaStatus"
      role={props.status === 'loading' ? 'status' : 'alert'}
      aria-live={props.status === 'loading' ? 'polite' : 'assertive'}
      className="max-w-md rounded-[8px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] px-4 py-3 text-center text-sm
        text-[var(--sniptale-color-text-primary)]"
    >
      {translate(messageKey[props.status])}
    </p>
  );
}

function PreviewRestoreAction(props: Pick<PreviewPanelProps, 'onRestoreTrash' | 'restoreBusy'>) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'failed'>('idle');
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return (
    <div className="space-y-2 rounded-[8px] bg-[var(--sniptale-color-surface-panel)] p-2 shadow-sm">
      <button
        type="button"
        data-ui="gallery.preview.restore"
        disabled={pending.current || props.restoreBusy || !props.onRestoreTrash}
        aria-busy={status === 'pending'}
        onClick={async () => {
          if (pending.current || props.restoreBusy || !props.onRestoreTrash) return;
          pending.current = true;
          setStatus('pending');
          try {
            const restored = await props.onRestoreTrash();
            if (mounted.current) setStatus(restored ? 'idle' : 'failed');
          } catch {
            if (mounted.current) setStatus('failed');
          } finally {
            pending.current = false;
          }
        }}
        className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border
          border-[var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-accent-soft)]
          px-3 text-sm font-semibold text-[var(--sniptale-color-accent-emphasis)]
          transition-colors hover:bg-[var(--sniptale-color-surface-hover)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]
          disabled:cursor-not-allowed disabled:opacity-55"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {translate(status === 'pending' ? 'gallery.app.restoringItem' : 'gallery.app.restoreItem')}
      </button>
      {status === 'failed' ? (
        <p role="alert" className="max-w-64 text-xs text-[var(--sniptale-color-danger)]">
          {translate('gallery.app.restoreItemFailed')}
        </p>
      ) : null}
    </div>
  );
}

export function PreviewMedia(
  props: Pick<
    PreviewPanelProps,
    | 'inspectorCollapsed'
    | 'item'
    | 'navigation'
    | 'onClose'
    | 'onInspectorToggle'
    | 'previewUrl'
    | 'previewLoadStatus'
    | 'onEdit'
    | 'onRestoreTrash'
    | 'restoreBusy'
    | 'trashMode'
  >
) {
  const [decodeFailure, setDecodeFailure] = useState<{ id: string; url: string } | null>(null);
  const isMediaItem = isGalleryMediaItem(props.item);
  const isImageTarget =
    isMediaItem && (isImageKind(props.item.kind) || props.item.kind === 'web-archive');
  const status = isMediaItem
    ? (props.previewLoadStatus ?? (props.previewUrl ? 'ready' : 'loading'))
    : null;
  const transitionFrame = usePreviewMediaTransition({
    item: props.item,
    navigationPosition: props.navigation?.current,
    previewUrl: props.previewUrl,
  });
  const transitionRef = useRef<HTMLDivElement>(null);
  const frameIsCurrent =
    transitionFrame.item.id === props.item.id && transitionFrame.previewUrl === props.previewUrl;
  const isImagePreview =
    transitionFrame.previewUrl !== null &&
    isGalleryMediaItem(transitionFrame.item) &&
    (isImageKind(transitionFrame.item.kind) || transitionFrame.item.kind === 'web-archive') &&
    (props.previewLoadStatus === undefined || (status === 'ready' && frameIsCurrent));
  const imageZoom = usePreviewImageZoom(
    isImagePreview,
    transitionFrame.previewUrl,
    transitionFrame.naturalSize
  );
  usePreviewMediaTransitionAnimation(transitionRef, transitionFrame);
  const currentDecodeFailed =
    decodeFailure?.id === props.item.id && decodeFailure.url === props.previewUrl;
  const zoomCommandsEnabled =
    isImagePreview && imageZoom.image.ready && frameIsCurrent && !currentDecodeFailed;
  let feedbackStatus: 'loading' | 'missing' | 'error' | 'invalid' | null = null;
  if (isMediaItem) {
    if (currentDecodeFailed) {
      feedbackStatus = 'invalid';
    } else if (status === 'missing' || status === 'error') {
      feedbackStatus = status;
    } else if (
      status === 'loading' ||
      (props.previewLoadStatus !== undefined && !frameIsCurrent) ||
      (isImagePreview && !imageZoom.image.ready)
    ) {
      feedbackStatus = 'loading';
    }
  }
  const showFrame =
    !isMediaItem || props.previewLoadStatus === undefined
      ? !currentDecodeFailed
      : status === 'ready' && frameIsCurrent && !currentDecodeFailed;

  return (
    <div
      className="@container/preview-media relative flex min-w-0 flex-1 overflow-hidden
        bg-[radial-gradient(
          circle_at_top,
          color-mix(in_srgb,var(--sniptale-color-accent-soft)_80%,transparent),
          color-mix(in_srgb,var(--sniptale-color-surface-panel)_38%,var(--sniptale-color-surface-canvas)_62%)_40%,
          var(--sniptale-color-surface-canvas)_100%
        )]"
    >
      <div className="absolute bottom-4 left-4 z-20">
        {props.trashMode ? (
          <PreviewRestoreAction
            key={props.item.id}
            restoreBusy={Boolean(props.restoreBusy)}
            {...(props.onRestoreTrash ? { onRestoreTrash: props.onRestoreTrash } : {})}
          />
        ) : (
          <GalleryProjectOpenAction item={props.item} onOpen={() => props.onEdit()} />
        )}
      </div>
      <PreviewMediaControls
        inspectorCollapsed={props.inspectorCollapsed}
        isImagePreview={isImageTarget}
        zoomCommandsEnabled={zoomCommandsEnabled}
        navigation={props.navigation}
        onClose={props.onClose}
        onInspectorToggle={props.onInspectorToggle}
        imageZoom={imageZoom}
      />
      <PreviewMediaSurface
        containerRef={imageZoom.viewport.containerRef}
        imageZoom={imageZoom}
        isImagePreview={isImagePreview}
        transitionRef={transitionRef}
      >
        {showFrame ? (
          <PreviewMediaContent
            item={transitionFrame.item}
            trashMode={Boolean(props.trashMode)}
            previewUrl={transitionFrame.previewUrl}
            imageStyle={imageZoom.image.style}
            imageReady={imageZoom.image.ready}
            isImagePreview={isImagePreview}
            onImageLoad={imageZoom.image.handleImageLoad}
            onMediaError={() => {
              if (frameIsCurrent && props.previewUrl) {
                setDecodeFailure({ id: props.item.id, url: props.previewUrl });
              }
            }}
          />
        ) : null}
        {feedbackStatus ? <PreviewMediaLoadFeedback status={feedbackStatus} /> : null}
      </PreviewMediaSurface>
    </div>
  );
}
