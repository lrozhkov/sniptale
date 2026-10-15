import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  quickEditWebcamFrameAt,
  quickEditWebcamBounds,
  type QuickEditWebcam,
  type QuickEditWebcamPlacement,
} from '../../features/video/review/advanced/webcam';
import { translate } from '../../platform/i18n';
import { ReviewButton } from './controls';
import { ReviewFocusArea } from './focus-area';
import { mountReviewWebcamPreview } from './webcam-preview';
import type { useReviewWebcamEditor } from './webcam-editor';

export type ReviewWebcamStageBinding = {
  settings: QuickEditWebcam;
  editor: Pick<
    ReturnType<typeof useReviewWebcamEditor>,
    | 'crop'
    | 'place'
    | 'placement'
    | 'resourceAttempt'
    | 'retry'
    | 'selectVisible'
    | 'selection'
    | 'time'
  >;
  disabled: boolean;
  onResourceReady?(): void;
};

/** Manual mode supplies readiness from its sole camera provider; this view owns only handles. */
export interface ReviewWebcamManualBinding {
  phase: 'loading' | 'ready' | 'failed';
  duration: number;
  ready: boolean;
  onPreviewPlacement(placement: QuickEditWebcamPlacement | null): void;
}

/** Camera is painted on the complete scene, above every Focus effect. */
export function ReviewWebcamOverlay(props: {
  binding: ReviewWebcamStageBinding;
  manual?: ReviewWebcamManualBinding | undefined;
  onPreviewPlacement?: ((placement: QuickEditWebcamPlacement | null) => void) | undefined;
  main: RefObject<HTMLVideoElement | null>;
  output: { width: number; height: number };
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState<QuickEditWebcamPlacement | null>(null);
  const { editor, settings, disabled } = props.binding;
  const selected =
    editor.selection.kind === 'webcam' || editor.selection.kind === 'webcam-position';
  const placement = draft ?? (!disabled && selected ? editor.placement : undefined);
  const latest = useRef({ ...props, placement });
  latest.current = { ...props, placement };
  const [resource, setResource] = useState({ phase: 'loading', duration: 0 });
  const [ready, setReady] = useState(false);
  const manual = !!props.manual;
  useEffect(() => {
    if (manual) return;
    const main = props.main.current;
    if (!main) return;
    setReady(false);
    setResource({ phase: 'loading', duration: 0 });
    return mountReviewWebcamPreview(
      main,
      settings.assetId,
      () => ({
        canvas: canvas.current,
        output: latest.current.output,
        settings: latest.current.binding.settings,
        placement: latest.current.placement,
        crop:
          !latest.current.binding.disabled &&
          ['webcam', 'webcam-position'].includes(latest.current.binding.editor.selection.kind)
            ? latest.current.binding.editor.crop
            : undefined,
      }),
      {
        ready: (visible) => setReady((previous) => (previous === visible ? previous : visible)),
        loaded: (duration) => {
          setResource({ phase: 'ready', duration });
          latest.current.binding.onResourceReady?.();
        },
        failed: () => {
          setReady(false);
          setResource({ phase: 'failed', duration: 0 });
        },
      }
    );
  }, [settings.assetId, props.main, editor.resourceAttempt, manual]);
  const shownResource = props.manual ?? resource;
  const shownReady = props.manual?.ready ?? ready;
  useEffect(
    () => () =>
      (latest.current.onPreviewPlacement ?? latest.current.manual?.onPreviewPlacement)?.(null),
    []
  );
  const previewPlacement = (value: QuickEditWebcamPlacement | null) => {
    setDraft(value);
    (props.onPreviewPlacement ?? props.manual?.onPreviewPlacement)?.(value);
  };
  const frame = quickEditWebcamFrameAt(settings, editor.time, shownResource.duration);
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      data-ui="gallery.videoReview.webcamOverlay"
    >
      {!props.manual ? (
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      ) : null}
      {shownResource.phase !== 'ready' ? (
        <div
          role={shownResource.phase === 'failed' ? 'alert' : 'status'}
          className="pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-2
            bg-[var(--sniptale-color-surface-panel)] p-2 text-xs"
        >
          <span>
            {translate(
              shownResource.phase === 'failed'
                ? 'gallery.videoReview.webcamFailed'
                : 'gallery.videoReview.webcamLoading'
            )}
          </span>
          {shownResource.phase === 'failed' ? (
            <ReviewButton label={translate('gallery.videoReview.retry')} onClick={editor.retry} />
          ) : null}
        </div>
      ) : null}
      {frame && shownReady && !disabled ? (
        <ReviewFocusArea
          area={quickEditWebcamBounds(
            placement ?? frame.placement,
            props.output,
            settings.appearance.shape
          )}
          aspectRatio={settings.appearance.shape === 'circle' ? 1 : undefined}
          output={props.output}
          video={{ x: 0, y: 0, width: props.output.width, height: props.output.height }}
          label={translate('gallery.videoReview.webcamSettings')}
          onInteract={() => {
            if (!selected) editor.selectVisible();
          }}
          onPreview={previewPlacement}
          onChange={(value) => latest.current.binding.editor.place(value)}
        />
      ) : null}
    </div>
  );
}
