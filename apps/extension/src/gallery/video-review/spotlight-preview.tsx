import { useEffect, useRef, useState } from 'react';
import { ReviewFocusArea } from './focus-area';
import { evaluateQuickEditSpotlightAtTime } from '../../features/video/review/advanced/focus';
import type {
  QuickEditSpotlight,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import { paintZoomPreview, type ZoomPreviewLayout } from './zoom-preview-paint';
import type { ZoomPreviewFrame } from './use-zoom-preview-source';
import { ReviewSpotlightOverlay } from './spotlight-overlay';

/** Local drag drafts commit once; cancellation leaves history unchanged. */
export function ReviewSpotlightPreview(props: {
  region: QuickEditZoomRegion;
  spotlight: QuickEditSpotlight;
  frame: ZoomPreviewFrame | null;
  output: { width: number; height: number };
  layout: ZoomPreviewLayout;
  cornerRadius: number;
  scale: number;
  disabled: boolean;
  onChange(value: QuickEditSpotlight): void;
  onPreview?: ((value: QuickEditSpotlight | null) => void) | undefined;
}) {
  const [draft, setDraft] = useState<QuickEditSpotlight | null>(null);
  const region = {
    ...props.region,
    spotlight: draft ?? props.spotlight,
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
  };
  const mask = evaluateQuickEditSpotlightAtTime({
    regions: [region],
    time: region.start,
    output: props.output,
    video: props.layout.videoRect,
    scale: props.scale,
  });
  return (
    <div className="relative">
      <SpotlightSourceFrame
        frame={props.frame}
        output={props.output}
        layout={props.layout}
        cornerRadius={props.cornerRadius}
      />
      <ReviewSpotlightOverlay output={props.output} frame={mask} />
      <ReviewFocusArea
        spotlight={props.spotlight}
        output={props.output}
        video={props.layout.videoRect}
        disabled={props.disabled}
        onChange={props.onChange}
        onPreview={(value) => {
          setDraft(value);
          props.onPreview?.(value);
        }}
      />
    </div>
  );
}

/** Source frame painting has its own frame/geometry lifecycle, separate from area gestures. */
function SpotlightSourceFrame(props: {
  frame: ZoomPreviewFrame | null;
  output: { width: number; height: number };
  layout: ZoomPreviewLayout;
  cornerRadius: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    paintZoomPreview(context, {
      accent: '#ffffff',
      camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
      cornerRadius: props.cornerRadius,
      frame: props.frame,
      height: props.output.height,
      width: props.output.width,
      layout: props.layout,
      view: 'result',
    });
  }, [props.frame, props.output, props.layout, props.cornerRadius]);
  return (
    <canvas
      ref={canvas}
      width={props.output.width}
      height={props.output.height}
      className="block w-full"
    />
  );
}
