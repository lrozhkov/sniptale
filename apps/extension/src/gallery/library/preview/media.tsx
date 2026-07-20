import { Minus, PanelRightClose, PanelRightOpen, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';
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

function PreviewFloatingControl(props: {
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      title={props.ariaLabel}
      onClick={props.onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border
        border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]
        text-[var(--sniptale-color-text-primary)] shadow-sm transition
        hover:border-[var(--sniptale-color-border-strong)]
        hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]"
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

function PreviewImageControls(
  props: Pick<PreviewPanelProps, 'inspectorCollapsed' | 'onClose' | 'onInspectorToggle'> & {
    resetZoom: () => void;
    zoom: number;
    zoomIn: () => void;
    zoomOut: () => void;
  }
) {
  return (
    <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
      <PreviewFloatingControl
        ariaLabel={translate('gallery.preview.zoomOut')}
        onClick={props.zoomOut}
      >
        <Minus className="h-4 w-4" />
      </PreviewFloatingControl>
      <button
        type="button"
        onClick={props.resetZoom}
        title={translate('gallery.preview.resetZoom')}
        className="rounded-full border border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]
          px-3 py-2 text-xs font-semibold text-[var(--sniptale-color-text-primary)] shadow-sm
          transition hover:border-[var(--sniptale-color-border-strong)]"
      >
        {Math.round(props.zoom * 100)}%
      </button>
      <PreviewFloatingControl
        ariaLabel={translate('gallery.preview.zoomIn')}
        onClick={props.zoomIn}
      >
        <Plus className="h-4 w-4" />
      </PreviewFloatingControl>
      <PreviewInspectorControls {...props} />
    </div>
  );
}

function PreviewMediaControls(
  props: Pick<PreviewPanelProps, 'inspectorCollapsed' | 'onClose' | 'onInspectorToggle'> & {
    isImagePreview: boolean;
    imageZoom: ReturnType<typeof usePreviewImageZoom>;
  }
) {
  if (!props.isImagePreview) {
    return (
      <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
        <PreviewInspectorControls {...props} />
      </div>
    );
  }

  return (
    <PreviewImageControls
      inspectorCollapsed={props.inspectorCollapsed}
      onClose={props.onClose}
      onInspectorToggle={props.onInspectorToggle}
      zoom={props.imageZoom.zoom}
      zoomIn={props.imageZoom.zoomIn}
      zoomOut={props.imageZoom.zoomOut}
      resetZoom={props.imageZoom.resetZoom}
    />
  );
}

function PreviewMediaSurface(props: {
  children: ReactNode;
  containerRef: ReturnType<typeof usePreviewImageZoom>['containerRef'];
  onWheel: ReturnType<typeof usePreviewImageZoom>['handleWheel'];
}) {
  return (
    <div
      ref={props.containerRef}
      onWheel={(event) => props.onWheel(event.nativeEvent)}
      className="flex h-full w-full items-center justify-center overflow-auto px-6 pb-6 pt-20"
    >
      {props.children}
    </div>
  );
}

function PreviewMediaContent(
  props: Pick<PreviewPanelProps, 'item' | 'previewUrl'> & {
    imageStyle: ReturnType<typeof usePreviewImageZoom>['imageStyle'];
    isImagePreview: boolean;
    onImageLoad: ReturnType<typeof usePreviewImageZoom>['handleImageLoad'];
  }
) {
  if (props.isImagePreview) {
    return (
      <img
        src={props.previewUrl ?? undefined}
        alt={props.item.filename}
        onLoad={props.onImageLoad}
        style={props.imageStyle}
        className="shrink-0 rounded-[16px]
          border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
          object-contain shadow-sm"
      />
    );
  }

  if (isGalleryMediaItem(props.item) && props.previewUrl && isVideoKind(props.item.kind)) {
    return (
      <video
        src={props.previewUrl}
        controls
        className="max-h-full max-w-full rounded-[16px]
          border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)]
          shadow-sm"
      />
    );
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

export function PreviewMedia(
  props: Pick<
    PreviewPanelProps,
    'inspectorCollapsed' | 'item' | 'onClose' | 'onInspectorToggle' | 'previewUrl'
  >
) {
  const isImagePreview =
    props.previewUrl !== null &&
    isGalleryMediaItem(props.item) &&
    (isImageKind(props.item.kind) || props.item.kind === 'web-archive');
  const imageZoom = usePreviewImageZoom(isImagePreview, props.previewUrl);

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
        onClose={props.onClose}
        onInspectorToggle={props.onInspectorToggle}
        imageZoom={imageZoom}
      />
      <PreviewMediaSurface containerRef={imageZoom.containerRef} onWheel={imageZoom.handleWheel}>
        <PreviewMediaContent
          item={props.item}
          previewUrl={props.previewUrl}
          imageStyle={imageZoom.imageStyle}
          isImagePreview={isImagePreview}
          onImageLoad={imageZoom.handleImageLoad}
        />
      </PreviewMediaSurface>
    </div>
  );
}
