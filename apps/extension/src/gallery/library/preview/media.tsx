import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, type ReactNode, type RefObject } from 'react';
import { DelayedLoadingFallback } from '@sniptale/ui/loading-delay';
import { GalleryProjectOpenAction } from '../ui/project-presentation';
import { translate } from '../../../platform/i18n';
import {
  isGalleryMediaItem,
  isGalleryScenarioExportItem,
  isGalleryScenarioItem,
  isGalleryVideoProjectItem,
} from '../items';
import { isImageKind, isVideoKind, MediaThumb } from '../ui';
import { PreviewVideo } from '../../../composition/library-preview/video-player';
import { PreviewFloatingControl } from '../../../composition/library-preview/preview-floating-control';
import { PreviewZoomControls } from '../../../composition/library-preview/image-zoom-controls';
import { PreviewScenarioStage } from './scenario-stage';
import type { PreviewPanelProps } from './types';
import { usePreviewImageZoom } from '../../../composition/library-preview/usePreviewImageZoom';
import { PreviewInspectorControls } from './inspector-controls';
import './navigation-zones.css';
import { PreviewNavigationZone } from './navigation-zones';
import {
  usePreviewMediaTransition,
  usePreviewMediaTransitionAnimation,
} from './usePreviewMediaTransition';

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
        className="min-w-14 px-2 py-2 text-center text-xs font-medium
          tabular-nums text-[var(--sniptale-color-text-primary)]"
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
  props: Pick<
    PreviewPanelProps,
    'inspectorCollapsed' | 'onClose' | 'onInspectorToggle' | 'trashMode'
  > & {
    isImagePreview: boolean;
    zoomCommandsEnabled: boolean;
    imageZoom: ReturnType<typeof usePreviewImageZoom>;
    navigation: PreviewPanelProps['navigation'];
  }
) {
  return (
    <div
      data-ui="gallery.preview.toolbar"
      className="relative z-10 flex shrink-0 flex-wrap items-start justify-between gap-2 px-3 pb-2 pt-3"
    >
      <div className="shrink-0">
        <PreviewNavigationControls navigation={props.navigation} />
      </div>
      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1.5">
        {props.isImagePreview ? (
          <PreviewZoomControls
            controls={props.imageZoom.controls}
            disabled={!props.zoomCommandsEnabled}
          />
        ) : null}
        {props.inspectorCollapsed ? <PreviewInspectorControls {...props} /> : null}
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
      className={`min-h-0 min-w-0 flex-1 overscroll-contain p-4
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
    prepareVideo?: boolean;
    spacePlayback?: Parameters<typeof PreviewVideo>[0]['spacePlayback'];
    onVideoReady?: (() => void) | undefined;
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
      <div
        data-ui="gallery.preview.video-frame"
        className="h-full min-h-0 w-full min-w-0 overflow-hidden"
        onErrorCapture={props.onMediaError}
      >
        <PreviewVideo
          key={props.previewUrl}
          src={props.previewUrl}
          trashMode={Boolean(props.trashMode)}
          prepare={props.prepareVideo ?? false}
          {...(props.spacePlayback ? { spacePlayback: props.spacePlayback } : {})}
          onReady={props.onVideoReady}
          onMediaError={props.onMediaError}
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
    return (
      <div
        data-ui="gallery.preview.project-thumbnail"
        className="grid h-full max-h-[360px] w-full max-w-[640px] place-items-center
          overflow-hidden"
      >
        <MediaThumb item={props.item} fit="contain" />
      </div>
    );
  }

  return null;
}

function PreviewMediaLoadFeedback(props: {
  status: 'loading' | 'missing' | 'error' | 'invalid';
  filename: string;
}) {
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
      {props.status === 'loading' ? (
        <span className="mt-1 block break-words text-xs">{props.filename}</span>
      ) : null}
    </p>
  );
}

function PreviewMediaFrames(
  props: Pick<PreviewPanelProps, 'item' | 'previewUrl' | 'trashMode'> & {
    transition: ReturnType<typeof usePreviewMediaTransition>;
    imageZoom: ReturnType<typeof usePreviewImageZoom>;
  }
) {
  const { transition, imageZoom } = props;
  const frame = transition.frame;
  const isImagePreview = Boolean(
    frame?.previewUrl &&
    isGalleryMediaItem(frame.item) &&
    (isImageKind(frame.item.kind) || frame.item.kind === 'web-archive')
  );
  const layers = frame ? [frame] : [];
  if (transition.prepareVideo)
    layers.push({
      item: props.item,
      previewUrl: props.previewUrl,
      naturalSize: null,
      direction: 0,
      revision: 0,
      requestKey: 'prepared',
    });

  return (
    <>
      {layers.map((layer) => {
        const prepared = layer.requestKey === 'prepared';
        return (
          <div
            key={`${layer.item.id}:${layer.previewUrl ?? ''}`}
            data-ui="gallery.preview.frame"
            data-presented={!prepared}
            inert={prepared || transition.pending}
            aria-hidden={prepared || transition.pending}
            className={
              prepared
                ? 'pointer-events-none absolute inset-4 invisible'
                : 'col-start-1 row-start-1 h-full min-h-0 w-full min-w-0 grid place-items-center'
            }
          >
            <PreviewMediaContent
              item={layer.item}
              trashMode={Boolean(props.trashMode)}
              previewUrl={layer.previewUrl}
              imageStyle={imageZoom.image.style}
              imageReady={imageZoom.image.ready}
              isImagePreview={!prepared && isImagePreview}
              onImageLoad={imageZoom.image.handleImageLoad}
              onMediaError={prepared || !transition.pending ? transition.fail : () => undefined}
              prepareVideo={prepared}
              spacePlayback={prepared ? undefined : transition.pending ? 'blocked' : 'enabled'}
              onVideoReady={prepared ? transition.commitVideo : undefined}
            />
          </div>
        );
      })}
    </>
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
    | 'previewRequestRevision'
    | 'onPresented'
    | 'onEdit'
    | 'trashMode'
  >
) {
  const isMediaItem = isGalleryMediaItem(props.item);
  const isImageTarget =
    isMediaItem && (isImageKind(props.item.kind) || props.item.kind === 'web-archive');
  const transition = usePreviewMediaTransition({
    item: props.item,
    navigationPosition: props.navigation?.current,
    previewUrl: props.previewUrl,
    loadStatus: props.previewLoadStatus,
    requestRevision: props.previewRequestRevision,
    onPresented: props.onPresented,
  });
  const frame = transition.frame;
  const isImagePreview = Boolean(
    frame?.previewUrl &&
    isGalleryMediaItem(frame.item) &&
    (isImageKind(frame.item.kind) || frame.item.kind === 'web-archive')
  );
  const imageZoom = usePreviewImageZoom(
    isImagePreview,
    frame?.previewUrl ?? null,
    frame?.naturalSize ?? null,
    !transition.pending
  );
  const transitionRef = useRef<HTMLDivElement>(null);
  usePreviewMediaTransitionAnimation(transitionRef, frame);
  const feedbackStatus = transition.invalid
    ? 'invalid'
    : props.previewLoadStatus === 'missing' || props.previewLoadStatus === 'error'
      ? props.previewLoadStatus
      : transition.pending
        ? 'loading'
        : null;
  const zoomCommandsEnabled =
    isImagePreview && imageZoom.image.ready && !transition.pending && !transition.invalid;

  return (
    <div
      className="gallery-preview-media @container/preview-media relative flex min-w-0 flex-1 flex-col overflow-hidden
        bg-[radial-gradient(
          circle_at_top,
          color-mix(in_srgb,var(--sniptale-color-accent-soft)_80%,transparent),
          color-mix(in_srgb,var(--sniptale-color-surface-panel)_38%,var(--sniptale-color-surface-canvas)_62%)_40%,
          var(--sniptale-color-surface-canvas)_100%
        )]"
    >
      {props.navigation ? (
        <>
          <div
            aria-hidden="true"
            data-ui="gallery.preview.navigationRail.previous"
            className="pointer-events-none absolute inset-y-0 left-0 w-6
              bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_35%,transparent)]"
          />
          <div
            aria-hidden="true"
            data-ui="gallery.preview.navigationRail.next"
            className="pointer-events-none absolute inset-y-0 right-0 w-6
              bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_35%,transparent)]"
          />
        </>
      ) : null}
      <PreviewMediaControls
        trashMode={Boolean(props.trashMode)}
        inspectorCollapsed={props.inspectorCollapsed}
        isImagePreview={isImageTarget}
        zoomCommandsEnabled={zoomCommandsEnabled}
        navigation={props.navigation}
        onClose={props.onClose}
        onInspectorToggle={props.onInspectorToggle}
        imageZoom={imageZoom}
      />
      <div data-ui="gallery.preview.content-row" className="relative flex min-h-0 flex-1">
        {!props.trashMode && isGalleryScenarioItem(props.item) ? (
          <div className="absolute bottom-4 left-4 z-20">
            <GalleryProjectOpenAction item={props.item} onOpen={() => props.onEdit()} />
          </div>
        ) : null}
        {props.navigation ? (
          <PreviewNavigationZone direction="previous" navigation={props.navigation} />
        ) : null}
        <PreviewMediaSurface
          containerRef={imageZoom.viewport.containerRef}
          imageZoom={imageZoom}
          isImagePreview={isImagePreview}
          transitionRef={transitionRef}
        >
          <PreviewMediaFrames
            transition={transition}
            imageZoom={imageZoom}
            item={props.item}
            previewUrl={props.previewUrl}
            trashMode={Boolean(props.trashMode)}
          />
          {feedbackStatus ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-4">
              {feedbackStatus === 'loading' ? (
                <DelayedLoadingFallback
                  key={`${props.previewRequestRevision}:${props.item.id}:${props.previewUrl}`}
                  fallback={
                    <PreviewMediaLoadFeedback status="loading" filename={props.item.filename} />
                  }
                />
              ) : (
                <PreviewMediaLoadFeedback status={feedbackStatus} filename={props.item.filename} />
              )}
            </div>
          ) : null}
        </PreviewMediaSurface>
        {props.navigation ? (
          <PreviewNavigationZone direction="next" navigation={props.navigation} />
        ) : null}
      </div>
    </div>
  );
}
