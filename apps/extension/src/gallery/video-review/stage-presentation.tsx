import { LoaderCircle } from 'lucide-react';
import type { ReviewAnnotationEditing } from './annotation-effects-overlay';
import type { PreviewRendererStatus } from '../../features/video/preview/preferences';
import { DelayedLoadingFallback } from '@sniptale/ui/loading-delay';
import {
  useEffect,
  useState,
  useMemo,
  useSyncExternalStore,
  type RefObject,
  type PointerEvent,
} from 'react';
import { sameQuickEditCamera } from '../../features/video/review/advanced/motion-blur';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import { resolveOverlayComments } from '../../features/video/review/comments';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../features/video/preview/quick-preferences';
import { translate, useAppLocale } from '../../platform/i18n';
import type {
  ReviewPreviewFrameStatisticsSource,
  ReviewPreviewPresentationStatus,
} from './preview-presentation-state';
import { ReviewButton } from './controls';
import { useReviewPreviewPresentation } from './use-preview-presentation';
import type { ReviewStageScene } from './stage-geometry';
import type {
  CanvasComment,
  ReviewAnnotation,
  ReviewSource,
} from '../../features/video/review/types';

type PreviewInput = Parameters<typeof useReviewPreviewPresentation>[0];
/** Presentation input is independent of the stage component that consumes this adapter. */
type PresentationProps = {
  annotationEditing?: Pick<ReviewAnnotationEditing, 'editor'> | undefined;
  cursorMotions?: import('../../features/video/project/cursor-motion').CursorMotion[] | undefined;
  captions?: PreviewInput['scene']['captions'];
  annotationEffects?: PreviewInput['scene']['annotationEffects'];
  readAsset?: PreviewInput['readAsset'];
  backgroundPending?: boolean | undefined;
  onCaptionSelect?: ((id: string) => void) | undefined;
  video: PreviewInput['video'];
  url: string;
  source: ReviewSource;
  scene?: ReviewStageScene;
  outerFadePlan?: PreviewInput['scene']['outerFadePlan'];
  watermark?: { settings?: PreviewInput['scene']['watermark'] } | undefined;
  webcam?: PreviewInput['webcam'];
  comments?: {
    items: readonly CanvasComment[];
    annotations: readonly ReviewAnnotation[];
    time: number;
  };
  keyCues?: PreviewInput['scene']['keys'] | undefined;
  clickCues?: PreviewInput['scene']['clicks'] | undefined;
  preview?:
    | {
        preferences: PreviewInput['preferences'];
        playing: boolean;
        onPresentationActive?: PreviewInput['onPresentationActive'];
        interacting?: boolean;
        sourceToResult: PreviewInput['sourceToResult'];
        readPosition?: PreviewInput['readPosition'];
        seekRevision?: number | undefined;
        onRendererStatus?: ((status: PreviewRendererStatus | null) => void) | undefined;
        onRaster?: ((size: { width: number; height: number } | null) => void) | undefined;
        sourceFrameRate?: number | undefined;
      }
    | undefined;
  cutPreview?: PreviewInput['cut'];
};

/** Assemble authored stage layers into the renderer scene, including editor-visible comments. */
function stagePresentationScene(
  props: Pick<
    PresentationProps,
    | 'cursorMotions'
    | 'source'
    | 'captions'
    | 'annotationEffects'
    | 'scene'
    | 'outerFadePlan'
    | 'watermark'
    | 'webcam'
    | 'comments'
    | 'keyCues'
    | 'clickCues'
  >
): Parameters<typeof useReviewPreviewPresentation>[0]['scene'] {
  return {
    ...(props.cursorMotions ? { cursorMotions: props.cursorMotions } : {}),
    ...(props.captions ? { captions: props.captions } : {}),
    ...(props.annotationEffects ? { annotationEffects: props.annotationEffects } : {}),
    outerFadePlan: props.outerFadePlan,
    source: { width: props.source.width, height: props.source.height },
    ...(props.scene?.sourceFilters ? { sourceFilters: props.scene.sourceFilters } : {}),
    ...(props.scene?.canvas ? { canvas: props.scene.canvas } : {}),
    background: props.scene?.background ?? { enabled: false },
    ...(props.scene?.windowHeader ? { windowHeader: props.scene.windowHeader } : {}),
    ...(props.watermark ? { watermark: props.watermark.settings } : {}),
    ...(props.webcam ? { webcam: props.webcam.settings } : {}),
    zoomRegions: props.scene?.focus?.regions ?? [],
    comments: resolveOverlayComments({
      canvasComments: [...(props.comments?.items ?? [])],
      annotations: [...(props.comments?.annotations ?? [])],
    }),
    keys: props.keyCues ?? [],
    clicks: props.clickCues ?? [],
  };
}

/** Paused target editing overrides interpolation only when its camera actually differs. */
function pausedCameraOverride(
  scene: PresentationProps['scene'],
  playing: boolean,
  source: ReviewSource
) {
  if (playing || !scene) return undefined;
  const evaluated = evaluateQuickEditCameraAtTime(
    scene.focus?.regions ?? [],
    scene.focus?.time ?? 0,
    { ...scene, source }
  );
  return sameQuickEditCamera(scene.camera, evaluated) ? undefined : scene.camera;
}

/** Convert stage geometry and gesture state into one manual presentation request. */
export function useStagePresentation(
  props: PresentationProps,
  publication: RefObject<HTMLDivElement | null>,
  watermarkOutput: { width: number; height: number },
  size: { width: number; height: number },
  onGeometry?: PreviewInput['onGeometry']
) {
  const [interacting, setInteracting] = useState(false);
  useEffect(() => {
    const finish = () => setInteracting(false);
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    globalThis.window.addEventListener('pointerup', finish);
    globalThis.window.addEventListener('pointercancel', finish);
    globalThis.window.addEventListener('blur', finish);
    globalThis.window.addEventListener('keydown', cancel);
    return () => {
      globalThis.window.removeEventListener('pointerup', finish);
      globalThis.window.removeEventListener('pointercancel', finish);
      globalThis.window.removeEventListener('blur', finish);
      globalThis.window.removeEventListener('keydown', cancel);
    };
  }, []);
  const presentation = useReviewPreviewPresentation({
    video: props.video,
    ...(onGeometry ? { onGeometry } : {}),
    host: publication,
    sourceIdentity: props.url,
    ...(props.preview?.onPresentationActive
      ? { onPresentationActive: props.preview.onPresentationActive }
      : {}),
    ...(props.readAsset ? { readAsset: props.readAsset } : {}),
    sourceFrameRate: props.preview?.sourceFrameRate,
    backgroundPending: props.backgroundPending,
    scene: stagePresentationScene(props),
    canonical: watermarkOutput,
    css: size,
    preferences: props.preview?.preferences ?? DEFAULT_QUICK_PREVIEW_PREFERENCES,
    playing: props.preview?.playing ?? false,
    interacting: interacting || !!props.preview?.interacting,
    annotationMovement: props.annotationEditing?.editor.movement,
    annotationGesture: props.annotationEditing?.editor.lane?.instances.find(
      (entry) => entry.id === props.annotationEditing?.editor.gestureId
    ),
    visible: true,
    pausedSourceTime: props.comments?.time ?? props.video.current?.currentTime ?? 0,
    pausedResultTime: props.scene?.focus?.time ?? 0,
    sourceToResult: props.preview?.sourceToResult ?? ((time) => time),
    readPosition: props.preview?.readPosition,
    seekRevision: props.preview?.seekRevision,
    cameraTransform: pausedCameraOverride(
      props.scene,
      props.preview?.playing ?? false,
      props.source
    ),
    cut: props.cutPreview,
    webcam: props.webcam,
  });
  const onRendererStatus = props.preview?.onRendererStatus;
  const rendererBackend = presentation.status.renderer?.backend;
  const rendererFallback = presentation.status.renderer?.fallback;
  useEffect(() => {
    onRendererStatus?.(
      rendererBackend
        ? { backend: rendererBackend, ...(rendererFallback ? { fallback: rendererFallback } : {}) }
        : null
    );
  }, [onRendererStatus, rendererBackend, rendererFallback]);
  const onRaster = props.preview?.onRaster;
  const rasterWidth = presentation.status.actualRaster?.width;
  const rasterHeight = presentation.status.actualRaster?.height;
  useEffect(() => {
    onRaster?.(
      rasterWidth === undefined || rasterHeight === undefined
        ? null
        : { width: rasterWidth, height: rasterHeight }
    );
  }, [onRaster, rasterWidth, rasterHeight]);
  return {
    presentation,
    beginInteraction(event: PointerEvent<HTMLDivElement>) {
      // Feedback navigation must not reprepare and unmount its own click target.
      if (
        event.target instanceof Element &&
        event.target.closest('[data-ui="gallery.videoReview.captionConflicts"]')
      )
        return;
      if (event.button === 0) setInteracting(true);
    },
  };
}

/** Presentation feedback is independent of authored scene layers and handles. */
export function ReviewStagePresentationFeedback({
  presentation,
  showFrameRate,
  waitingReason,
  captions,
  onCaptionSelect,
}: {
  presentation: Omit<
    ReturnType<typeof useReviewPreviewPresentation>,
    'frameStatistics' | 'status'
  > & {
    frameStatistics?: ReviewPreviewFrameStatisticsSource | undefined;
    status: ReturnType<typeof useReviewPreviewPresentation>['status'] &
      Partial<Pick<ReviewPreviewPresentationStatus, 'presentedFPS' | 'nativeVideoFPS'>>;
  };
  showFrameRate: boolean;
  waitingReason?: string | undefined;
  captions?: PresentationProps['captions'];
  onCaptionSelect?: PresentationProps['onCaptionSelect'];
}) {
  const manual = presentation.active;
  const cameraFailed = manual && presentation.webcamManual.phase === 'failed';
  const failed = cameraFailed || presentation.status.phase === 'failed';
  const replacing =
    manual && presentation.status.phase === 'pending' && presentation.status.actualRaster !== null;
  const waiting = [
    waitingReason,
    manual && !failed && presentation.status.phase !== 'ready'
      ? translate(
          replacing ? 'gallery.videoReview.previewUpdating' : 'gallery.videoReview.previewLoading'
        )
      : null,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <>
      {manual &&
        presentation.status.phase === 'ready' &&
        !!presentation.status.captionConflicts?.length && (
          <div
            role="alert"
            data-ui="gallery.videoReview.captionConflicts"
            onPointerDown={(event) => event.stopPropagation()}
            className={[
              'absolute inset-x-0 top-0 z-40 max-h-32 overflow-y-auto',
              'bg-[var(--sniptale-color-surface-panel)] px-3 py-1 text-xs',
            ].join(' ')}
          >
            <p>{translate('gallery.videoReview.captionConflict')}</p>
            <p>{translate('gallery.videoReview.captionConflictHint')}</p>
            {presentation.status.captionConflicts.some((entry) => entry.conservative) && (
              <p>{translate('gallery.videoReview.captionConflictPossible')}</p>
            )}
            {[...new Set(presentation.status.captionConflicts.map((entry) => entry.fragmentId))]
              .slice(0, 5)
              .map((id) => {
                const fragment = captions?.document?.fragments.find((entry) => entry.id === id);
                return fragment && onCaptionSelect ? (
                  <ReviewButton
                    key={id}
                    className="max-w-full justify-start"
                    label={translate('gallery.videoReview.captionConflictJump').replace(
                      '{text}',
                      fragment.text.slice(0, 80)
                    )}
                    onClick={() => onCaptionSelect(id)}
                  >
                    <span className="min-w-0 truncate">
                      {fragment.text.slice(0, 80)}
                      {fragment.text.length > 80 ? '…' : ''}
                    </span>
                  </ReviewButton>
                ) : null;
              })}
          </div>
        )}
      {failed ? (
        <div
          role="alert"
          data-ui="gallery.videoReview.previewFailure"
          className={[
            'absolute inset-x-0 top-0 z-40 flex max-h-full items-start gap-3 overflow-y-auto border-b',
            'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel-glass)] p-3',
            'text-sm text-[var(--sniptale-color-text-primary)] shadow-[var(--sniptale-shadow-sm)]',
            'backdrop-blur-[var(--sniptale-glass-blur)]',
          ].join(' ')}
        >
          <span className="min-w-0 flex-1 self-center">
            {translate(
              cameraFailed
                ? 'gallery.videoReview.webcamFailed'
                : 'gallery.videoReview.previewFailed'
            )}
          </span>
          <ReviewButton
            className="shrink-0"
            label={translate('gallery.videoReview.retry')}
            onClick={presentation.retry}
          />
        </div>
      ) : null}
      <div
        data-ui="gallery.videoReview.previewPerformance"
        className={[
          'absolute bottom-2 left-2 z-40 flex items-center gap-1.5 rounded',
          'bg-[var(--sniptale-color-surface-panel)] px-1.5 py-0.5 text-xs tabular-nums empty:hidden',
        ].join(' ')}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {waiting ? (
          <DelayedLoadingFallback
            delayMs={1000}
            fallback={
              <span
                role="status"
                data-ui="gallery.videoReview.previewWaiting"
                className="inline-flex items-center"
                title={waiting}
                aria-label={waiting}
              >
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
              </span>
            }
          />
        ) : null}
        {showFrameRate ? (
          <ReviewPreviewFrameRate
            source={presentation.frameStatistics}
            manual={manual}
            presentedFPS={presentation.status.presentedFPS ?? null}
            nativeVideoFPS={presentation.status.nativeVideoFPS ?? null}
          />
        ) : null}
      </div>
    </>
  );
}

const noFrameStatisticsSubscription = () => () => {};

/** FPS publications update only this output; renderer readiness stays with the stage. */
function ReviewPreviewFrameRate(props: {
  source: ReviewPreviewFrameStatisticsSource | undefined;
  manual: boolean;
  presentedFPS: number | null;
  nativeVideoFPS: number | null;
}) {
  useAppLocale();
  const fallback = useMemo(
    () => ({ presentedFPS: props.presentedFPS, nativeVideoFPS: props.nativeVideoFPS }),
    [props.presentedFPS, props.nativeVideoFPS]
  );
  const value = useSyncExternalStore(
    props.source?.subscribe ?? noFrameStatisticsSubscription,
    props.source?.read ?? (() => fallback)
  );
  return (
    <output
      data-ui="gallery.videoReview.previewFPS"
      title={translate(
        props.manual
          ? 'gallery.videoReview.previewPresentedFrameRate'
          : 'gallery.videoReview.previewNativeFrameRate'
      )}
    >
      {(props.manual ? value.presentedFPS : value.nativeVideoFPS)?.toFixed(1) ?? '—'} FPS
    </output>
  );
}

/** Header loading has its own recoverable notice above the rendered scene. */
export function ReviewHeaderFailure(props: { failed: boolean; retry(): void }) {
  if (!props.failed) return null;
  return (
    <div
      role="alert"
      className={[
        'absolute inset-x-0 top-0 z-20 flex items-center gap-2',
        'bg-[var(--sniptale-color-surface-panel)] p-2 text-xs',
      ].join(' ')}
    >
      <span>{translate('gallery.videoReview.windowHeaderFailed')}</span>
      <ReviewButton label={translate('gallery.videoReview.retry')} onClick={props.retry} />
    </div>
  );
}
