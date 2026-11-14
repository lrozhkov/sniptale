import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import { annotatableImageCheckerboardStyle } from '@sniptale/ui/annotatable-image-surface';
import { CompactRange } from '../chrome/ui';
import { translate } from '../../platform/i18n';
import type { ImageRaster } from '../../contracts/ai/image';
export type ImageComparisonMode = 'none' | 'split' | 'opacity';
const opacityRangeStyle: CSSProperties & Record<`--${string}`, string> = {
  '--sniptale-range-shell-height': '32px',
  '--sniptale-range-track-height': '3px',
  '--sniptale-range-thumb-size': '16px',
};
/** Owns viewer-only zoom and pan. The source raster and editor viewport are unchanged. */
export function ImagePreviewRaster(props: {
  image: ImageRaster;
  zoom: number | null;
  onZoom(value: number | null): void;
  label: string;
  original: ImageRaster | null;
  comparison: ImageComparisonMode;
  frame: { width: number; height: number } | undefined;
  imageKey: string;
}) {
  const { onZoom } = props;
  const clipId = useId();
  const [split, setSplit] = useState(0.5);
  const seeking = useRef<number | null>(null);
  const slider = useRef<HTMLDivElement>(null);
  const [opacity, setOpacity] = useState(50);
  const comparing = props.comparison === 'split' && Boolean(props.original);
  const blending = props.comparison === 'opacity' && Boolean(props.original);
  const compositing = comparing || blending;
  const frame = compositing ? (props.frame ?? props.image) : props.image;
  useEffect(() => {
    setSplit(0.5);
    setOpacity(50);
  }, [props.imageKey]);
  const viewport = useRef<HTMLDivElement>(null);
  const pivot = useRef<{ x: number; y: number; imageX: number; imageY: number } | null>(null);
  const pan = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () =>
      setSize((previous) =>
        previous.width === element.clientWidth && previous.height === element.clientHeight
          ? previous
          : { width: element.clientWidth, height: element.clientHeight }
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const fit = Math.min(size.width / frame.width, size.height / frame.height) || 1;
  const scale = props.zoom ?? fit;
  const width = frame.width * scale;
  const height = frame.height * scale;
  const left = Math.max(0, (size.width - width) / 2);
  const top = Math.max(0, (size.height - height) / 2);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const anchor = pivot.current;
    element.scrollLeft = anchor
      ? anchor.imageX * scale + left - anchor.x
      : (element.scrollWidth - element.clientWidth) / 2;
    element.scrollTop = anchor
      ? anchor.imageY * scale + top - anchor.y
      : (element.scrollHeight - element.clientHeight) / 2;
    pivot.current = null;
  }, [scale, left, top, props.image.dataUrl, size.width, size.height]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      if (!delta) return;
      const zoom = Math.min(
        8,
        Math.max(
          Math.min(0.1, fit),
          scale * Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.002)
        )
      );
      if (zoom === scale) return;
      const bounds = element.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      pivot.current = {
        x,
        y,
        imageX: (element.scrollLeft + x - left) / scale,
        imageY: (element.scrollTop + y - top) / scale,
      };
      onZoom(zoom);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [fit, scale, left, top, onZoom]);
  useEffect(() => {
    const cancel = () => {
      const pointerId = pan.current?.id ?? seeking.current;
      pan.current = null;
      seeking.current = null;
      setDragging(false);
      if (
        pointerId !== null &&
        pointerId !== undefined &&
        viewport.current?.hasPointerCapture(pointerId)
      )
        viewport.current.releasePointerCapture(pointerId);
    };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, []);
  const seek = (clientX: number) => {
    const element = viewport.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    setSplit(Math.min(1, Math.max(0, (clientX - bounds.left + element.scrollLeft - left) / width)));
  };
  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={viewport}
        tabIndex={0}
        aria-label={props.label}
        data-ui="editor.ai.preview.viewport"
        className={[
          'absolute inset-0 overflow-auto overscroll-contain touch-none outline-none',
          'focus-visible:shadow-[inset_0_0_0_1px_var(--sniptale-color-border-strong)]',
          comparing ? 'cursor-col-resize' : dragging ? 'cursor-grabbing' : 'cursor-grab',
        ].join(' ')}
        style={annotatableImageCheckerboardStyle}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0 && event.button !== 1) return;
          event.preventDefault();
          if (comparing && event.button === 0 && !event.shiftKey) {
            seeking.current = event.pointerId;
            seek(event.clientX);
            slider.current?.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          pan.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (
            comparing &&
            (seeking.current === event.pointerId ||
              (!pan.current && event.pointerType === 'mouse' && !event.buttons))
          ) {
            seek(event.clientX);
            return;
          }
          const drag = pan.current;
          if (!drag || drag.id !== event.pointerId) return;
          event.currentTarget.scrollLeft = drag.left + drag.x - event.clientX;
          event.currentTarget.scrollTop = drag.top + drag.y - event.clientY;
        }}
        onPointerUp={(event) => {
          if (seeking.current === event.pointerId) {
            seeking.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            return;
          }
          if (pan.current?.id !== event.pointerId) return;
          pan.current = null;
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          seeking.current = null;
          pan.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          seeking.current = null;
          pan.current = null;
          setDragging(false);
        }}
      >
        <div
          className="relative select-none overflow-hidden"
          style={{ width: Math.max(size.width, width), height: Math.max(size.height, height) }}
        >
          <svg
            role="img"
            aria-label={props.label}
            viewBox={`0 0 ${frame.width} ${frame.height}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute block"
            style={{ left, top }}
            width={width}
            height={height}
          >
            {compositing && props.original ? (
              <>
                <defs>
                  <clipPath id={clipId}>
                    <rect
                      x={frame.width * split}
                      y="0"
                      width={frame.width * (1 - split)}
                      height={frame.height}
                    />
                  </clipPath>
                </defs>
                <image
                  href={props.original.dataUrl}
                  width={frame.width}
                  height={frame.height}
                  preserveAspectRatio="xMidYMid meet"
                />
              </>
            ) : null}
            <image
              href={props.image.dataUrl}
              width={frame.width}
              height={frame.height}
              preserveAspectRatio="xMidYMid meet"
              clipPath={comparing ? `url(#${clipId})` : undefined}
              opacity={blending ? opacity / 100 : 1}
              data-ui="editor.ai.preview-image"
            />
          </svg>
          {comparing ? (
            <>
              <span
                className={[
                  'pointer-events-none absolute rounded-[4px] bg-[var(--sniptale-color-surface-panel)] px-2',
                  'py-1 text-[11px]',
                ].join(' ')}
                style={{ left: left + 8, top: top + 8 }}
              >
                {translate('editor.ai.original')}
              </span>
              <span
                className={[
                  'pointer-events-none absolute rounded-[4px] bg-[var(--sniptale-color-surface-panel)] px-2',
                  'py-1 text-[11px]',
                ].join(' ')}
                style={{ right: Math.max(0, size.width - left - width) + 8, top: top + 8 }}
              >
                {translate('editor.ai.result')}
              </span>
              <div
                ref={slider}
                role="slider"
                tabIndex={0}
                aria-label={translate('editor.ai.compareDivider')}
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(split * 100)}
                data-ui="editor.ai.preview.divider"
                className={[
                  'group absolute z-10 flex w-8 -translate-x-1/2 cursor-col-resize items-center',
                  'justify-center outline-none',
                ].join(' ')}
                style={{ left: left + width * split, top, height }}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const step = event.shiftKey ? 0.1 : 0.01;
                  setSplit((value) =>
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? 1
                        : Math.min(
                            1,
                            Math.max(0, value + (event.key === 'ArrowLeft' ? -step : step))
                          )
                  );
                }}
              >
                <span
                  className={[
                    'pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white',
                    'shadow-[1px_0_2px_rgb(0_0_0_/_0.5)]',
                  ].join(' ')}
                />
                <span
                  className={[
                    'pointer-events-none relative flex h-7 w-7 items-center justify-center rounded-[4px]',
                    'group-focus-visible:ring-2 group-focus-visible:ring-[var(--sniptale-color-text-primary)]',
                    'border border-[var(--sniptale-color-border-strong)]',
                    'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary-strong)]',
                  ].join(' ')}
                >
                  <ChevronsLeftRight size={16} />
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>
      {blending ? (
        <div
          className={[
            'absolute bottom-2 right-2 z-20 flex max-w-[calc(100%-16px)] items-center gap-2',
            'rounded-[4px] border border-[var(--sniptale-color-border-soft)]',
            'bg-[var(--sniptale-color-surface-panel)] px-2 text-xs',
          ].join(' ')}
          data-ui="editor.ai.preview.opacity"
        >
          <span className="shrink-0 text-[var(--sniptale-color-text-secondary)]">
            {translate('editor.ai.opacity')}
          </span>
          <CompactRange
            min={0}
            max={100}
            step={1}
            value={opacity}
            aria-label={translate('editor.ai.opacity')}
            className={[
              '!w-32 !min-w-12 shrink focus-visible:outline-1',
              'focus-visible:outline-[var(--sniptale-color-border-strong)]',
            ].join(' ')}
            style={opacityRangeStyle}
            onChange={(event) => setOpacity(Number(event.currentTarget.value))}
          />
          <output className="w-[4ch] shrink-0 text-right tabular-nums">{opacity}%</output>
        </div>
      ) : null}
    </div>
  );
}
