import { DelayedLoadingFallback } from '@sniptale/ui/loading-delay';
import { useEffect, useState, type RefObject, type PointerEvent } from 'react';
import { sameQuickEditCamera } from '../../features/video/review/advanced/motion-blur';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import { resolveOverlayComments } from '../../features/video/review/comments';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../features/video/preview/quick-preferences';
import { translate } from '../../platform/i18n';
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
        sourceToResult: PreviewInput['sourceToResult'];
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
    ...(props.captions ? { captions: props.captions } : {}),
    ...(props.annotationEffects ? { annotationEffects: props.annotationEffects } : {}),
    outerFadePlan: props.outerFadePlan,
    source: { width: props.source.width, height: props.source.height },
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
  size: { width: number; height: number }
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
    host: publication,
    sourceIdentity: props.url,
    ...(props.readAsset ? { readAsset: props.readAsset } : {}),
    sourceFrameRate: props.preview?.sourceFrameRate,
    backgroundPending: props.backgroundPending,
    scene: stagePresentationScene(props),
    canonical: watermarkOutput,
    css: size,
    preferences: props.preview?.preferences ?? DEFAULT_QUICK_PREVIEW_PREFERENCES,
    playing: props.preview?.playing ?? false,
    interacting,
    visible: true,
    pausedSourceTime: props.comments?.time ?? props.video.current?.currentTime ?? 0,
    pausedResultTime: props.scene?.focus?.time ?? 0,
    sourceToResult: props.preview?.sourceToResult ?? ((time) => time),
    cameraTransform: pausedCameraOverride(
      props.scene,
      props.preview?.playing ?? false,
      props.source
    ),
    cut: props.cutPreview,
    webcam: props.webcam,
  });
  const onRaster = props.preview?.onRaster;
  useEffect(() => {
    onRaster?.(presentation.status.actualRaster);
  }, [onRaster, presentation.status.actualRaster]);
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
  captions,
  onCaptionSelect,
}: {
  presentation: ReturnType<typeof useReviewPreviewPresentation>;
  showFrameRate: boolean;
  captions?: PresentationProps['captions'];
  onCaptionSelect?: PresentationProps['onCaptionSelect'];
}) {
  const manual = presentation.active;
  const replacing =
    manual && presentation.status.phase === 'pending' && presentation.status.actualRaster !== null;
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
      {manual && presentation.status.phase !== 'ready' ? (
        <DelayedLoadingFallback
          key={presentation.status.phase}
          delayMs={presentation.status.phase === 'failed' ? 0 : 1000}
          fallback={
            <div
              role={presentation.status.phase === 'failed' ? 'alert' : 'status'}
              className={[
                'absolute inset-x-0 top-0 z-40 flex items-center gap-2',
                'bg-[var(--sniptale-color-surface-panel)] px-3 py-1 text-xs',
              ].join(' ')}
            >
              <span>
                {translate(
                  presentation.status.phase === 'failed'
                    ? 'gallery.videoReview.previewFailed'
                    : replacing
                      ? 'gallery.videoReview.previewUpdating'
                      : 'gallery.videoReview.previewLoading'
                )}
              </span>
              {presentation.status.phase === 'failed' ? (
                <ReviewButton
                  label={translate('gallery.videoReview.retry')}
                  onClick={presentation.retry}
                />
              ) : null}
            </div>
          }
        />
      ) : null}
      {showFrameRate ? (
        <output
          data-ui="gallery.videoReview.previewFPS"
          className={[
            'pointer-events-none absolute bottom-2 left-2 z-40 rounded px-1.5 py-0.5 text-xs',
            'tabular-nums bg-[var(--sniptale-color-surface-panel)]',
          ].join(' ')}
          title={translate(
            manual
              ? 'gallery.videoReview.previewPresentedFrameRate'
              : 'gallery.videoReview.previewNativeFrameRate'
          )}
        >
          {(manual
            ? presentation.status.presentedFPS
            : presentation.status.nativeVideoFPS
          )?.toFixed(1) ?? '—'}{' '}
          FPS
        </output>
      ) : null}
    </>
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
