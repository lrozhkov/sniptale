import {
  ChevronLeft,
  ChevronRight,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { translate } from '../../../platform/i18n';
import {
  isGalleryMediaItem,
  isGalleryScenarioExportItem,
  isGalleryScenarioItem,
  isGalleryVideoProjectItem,
} from '../items';
import { isImageKind, isVideoKind, MediaThumb } from '../ui';
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
}) {
  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      title={props.ariaLabel}
      disabled={props.disabled}
      onClick={props.onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border
        border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]
        text-[var(--sniptale-color-text-primary)] shadow-sm transition
        hover:border-[var(--sniptale-color-border-strong)]
        hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]
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
  canZoomIn: boolean;
  canZoomOut: boolean;
  resetZoom: () => void;
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <PreviewFloatingControl
        ariaLabel={translate('gallery.preview.zoomOut')}
        disabled={!props.canZoomOut}
        onClick={props.zoomOut}
      >
        <Minus className="h-4 w-4" />
      </PreviewFloatingControl>
      <button
        type="button"
        onClick={props.resetZoom}
        title={translate('gallery.preview.resetZoom')}
        className="h-9 min-w-14 rounded-[8px] border border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]
          px-3 py-2 text-xs font-semibold text-[var(--sniptale-color-text-primary)] shadow-sm
          transition hover:border-[var(--sniptale-color-border-strong)]"
      >
        {Math.round(props.zoom * 100)}%
      </button>
      <PreviewFloatingControl
        ariaLabel={translate('gallery.preview.zoomIn')}
        disabled={!props.canZoomIn}
        onClick={props.zoomIn}
      >
        <Plus className="h-4 w-4" />
      </PreviewFloatingControl>
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
    imageZoom: ReturnType<typeof usePreviewImageZoom>;
    navigation: PreviewPanelProps['navigation'];
  }
) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
      <div className="pointer-events-auto">
        <PreviewNavigationControls navigation={props.navigation} />
      </div>
      <div className="pointer-events-auto flex items-center gap-1.5">
        {props.isImagePreview ? (
          <PreviewZoomControls
            canZoomIn={props.imageZoom.controls.canZoomIn}
            canZoomOut={props.imageZoom.controls.canZoomOut}
            zoom={props.imageZoom.controls.zoom}
            zoomIn={props.imageZoom.controls.zoomIn}
            zoomOut={props.imageZoom.controls.zoomOut}
            resetZoom={props.imageZoom.controls.resetZoom}
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
  props: Pick<PreviewPanelProps, 'item' | 'previewUrl'> & {
    imageStyle: ReturnType<typeof usePreviewImageZoom>['image']['style'];
    imageReady: ReturnType<typeof usePreviewImageZoom>['image']['ready'];
    isImagePreview: boolean;
    onImageLoad: ReturnType<typeof usePreviewImageZoom>['image']['handleImageLoad'];
  }
) {
  if (props.isImagePreview) {
    return (
      <img
        src={props.previewUrl ?? undefined}
        alt={props.item.filename}
        onLoad={props.onImageLoad}
        style={{ ...props.imageStyle, visibility: props.imageReady ? 'visible' : 'hidden' }}
        draggable={false}
        className="block max-h-none max-w-none shrink-0 select-none"
      />
    );
  }

  if (isGalleryMediaItem(props.item) && props.previewUrl && isVideoKind(props.item.kind)) {
    return <PreviewVideo src={props.previewUrl} />;
  }

  if (isGalleryMediaItem(props.item) && props.previewUrl && props.item.kind === 'audio') {
    return <audio src={props.previewUrl} controls className="w-full max-w-xl" />;
  }

  if (isGalleryScenarioItem(props.item) || isGalleryScenarioExportItem(props.item)) {
    return <PreviewScenarioStage item={props.item} />;
  }

  if (isGalleryVideoProjectItem(props.item)) {
    return <MediaThumb item={props.item} />;
  }

  return null;
}

function PreviewVideo({ src }: { src: string }) {
  const [metadataReady, setMetadataReady] = useState(false);
  const durationProbeActiveRef = useRef(false);

  useEffect(() => {
    durationProbeActiveRef.current = false;
    setMetadataReady(false);
  }, [src]);

  const handleLoadedMetadata = (video: HTMLVideoElement) => {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setMetadataReady(true);
      return;
    }

    durationProbeActiveRef.current = true;
    video.currentTime = Number.MAX_SAFE_INTEGER;
  };

  const handleDurationChange = (video: HTMLVideoElement) => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return;
    }

    if (durationProbeActiveRef.current) {
      durationProbeActiveRef.current = false;
      video.currentTime = 0;
    }
    setMetadataReady(true);
  };

  return (
    <div className="relative flex h-full w-full min-h-0 min-w-0 items-center justify-center">
      <video
        src={src}
        controls
        preload="metadata"
        playsInline
        onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
        onDurationChange={(event) => handleDurationChange(event.currentTarget)}
        className="block h-auto max-h-full w-auto max-w-full bg-black object-contain"
      />
      {metadataReady ? null : (
        <div
          role="status"
          className="pointer-events-none absolute rounded-[8px]
            bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_84%,transparent)]
            px-3 py-2 text-xs text-[var(--sniptale-color-text-secondary)]"
        >
          {translate('gallery.preview.videoLoading')}
        </div>
      )}
    </div>
  );
}

export function PreviewMedia(
  props: Pick<
    PreviewPanelProps,
    'inspectorCollapsed' | 'item' | 'navigation' | 'onClose' | 'onInspectorToggle' | 'previewUrl'
  >
) {
  const transitionFrame = usePreviewMediaTransition({
    item: props.item,
    navigationPosition: props.navigation?.current,
    previewUrl: props.previewUrl,
  });
  const transitionRef = useRef<HTMLDivElement>(null);
  const isImagePreview =
    transitionFrame.previewUrl !== null &&
    isGalleryMediaItem(transitionFrame.item) &&
    (isImageKind(transitionFrame.item.kind) || transitionFrame.item.kind === 'web-archive');
  const imageZoom = usePreviewImageZoom(
    isImagePreview,
    transitionFrame.previewUrl,
    transitionFrame.naturalSize
  );
  usePreviewMediaTransitionAnimation(transitionRef, transitionFrame);

  return (
    <div
      className="relative flex min-w-0 flex-1 overflow-hidden
        bg-[radial-gradient(
          circle_at_top,
          color-mix(in_srgb,var(--sniptale-color-accent-soft)_80%,transparent),
          color-mix(in_srgb,var(--sniptale-color-surface-panel)_38%,var(--sniptale-color-surface-canvas)_62%)_40%,
          var(--sniptale-color-surface-canvas)_100%
        )]"
    >
      <PreviewMediaControls
        inspectorCollapsed={props.inspectorCollapsed}
        isImagePreview={isImagePreview}
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
        <PreviewMediaContent
          item={transitionFrame.item}
          previewUrl={transitionFrame.previewUrl}
          imageStyle={imageZoom.image.style}
          imageReady={imageZoom.image.ready}
          isImagePreview={isImagePreview}
          onImageLoad={imageZoom.image.handleImageLoad}
        />
      </PreviewMediaSurface>
    </div>
  );
}
