import { ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
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
import { PreviewNavigationZone } from './navigation-zones';
import {
  usePreviewMediaTransition,
  usePreviewMediaTransitionAnimation,
} from './usePreviewMediaTransition';

function PreviewInspectorControls(
  props: Pick<
    PreviewPanelProps,
    'inspectorCollapsed' | 'onClose' | 'onInspectorToggle' | 'trashMode'
  >
) {
  const inspectorLabel = props.inspectorCollapsed
    ? translate('gallery.preview.showInspector')
    : translate('gallery.preview.hideInspector');

  return (
    <>
      {!props.trashMode ? (
        <PreviewFloatingControl ariaLabel={inspectorLabel} onClick={props.onInspectorToggle}>
          {props.inspectorCollapsed ? (
            <PanelRightOpen className="h-4 w-4" />
          ) : (
            <PanelRightClose className="h-4 w-4" />
          )}
        </PreviewFloatingControl>
      ) : null}
      <PreviewFloatingControl ariaLabel={translate('common.actions.close')} onClick={props.onClose}>
        <X className="h-4 w-4" />
      </PreviewFloatingControl>
    </>
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
      className="@container/preview-media relative flex min-w-0 flex-1 flex-col overflow-hidden
        bg-[radial-gradient(
          circle_at_top,
          color-mix(in_srgb,var(--sniptale-color-accent-soft)_80%,transparent),
          color-mix(in_srgb,var(--sniptale-color-surface-panel)_38%,var(--sniptale-color-surface-canvas)_62%)_40%,
          var(--sniptale-color-surface-canvas)_100%
        )]"
    >
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
        {!props.trashMode ? (
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
        {props.navigation ? (
          <PreviewNavigationZone direction="next" navigation={props.navigation} />
        ) : null}
      </div>
    </div>
  );
}
