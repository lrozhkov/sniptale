import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import {
  resolveQuickEditWatermarkBounds,
  type QuickEditWatermarkSettings,
} from '../../features/video/project/scene/watermark';
import {
  createReviewWatermarkRenderer,
  type ReviewWatermarkRenderer,
} from '../../workflows/video-review/render-watermark';
import { translate, useAppLocale } from '../../platform/i18n';

type Settings = QuickEditWatermarkSettings;
type Bounds = ReviewWatermarkRenderer['bounds'];
type Gesture = {
  pointerId: number;
  node: HTMLButtonElement;
  initial: Settings;
  current: Settings;
  bounds: Bounds;
  x: number;
  y: number;
  width: number;
  height: number;
  moved: boolean;
};

type OverlayProps = {
  settings: Settings | undefined;
  output: { width: number; height: number };
  editable: boolean;
  /** Canonical measured cache bounds from the sole manual renderer; null is pending. */
  manual?: { bounds: Bounds | null } | undefined;
  /** Reprepare unchanged resources after an explicit user retry. */
  retryGeneration?: number | undefined;
  onReady?(): void;
  onPreview(settings: Settings | null): void;
  onChange(settings: Settings): void;
  onError(message: string | null): void;
};

/** Final-canvas preview; persistent edits remain with the caller. */
export function ReviewWatermarkOverlay(props: OverlayProps) {
  useAppLocale();
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement | null>(null);
  const bindHandle = useCallback((node: HTMLButtonElement | null) => {
    const previous = handle.current;
    // Playback removes the hitbox; preserve editor keyboard scope before DOM detachment.
    if (!node && previous && previous.ownerDocument.activeElement === previous)
      host.current?.focus({ preventScroll: true });
    handle.current = node;
  }, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const settings = draft ?? props.settings;
  const resourceKey = watermarkResourceKey(props.settings);
  const width = props.output.width;
  const height = props.output.height;
  const resource = useWatermarkResource(props, resourceKey);
  const measuredBounds = props.manual ? props.manual.bounds : resource?.bounds;
  const bounds =
    measuredBounds && settings && measuredBounds.width > 0 && measuredBounds.height > 0
      ? resolveQuickEditWatermarkBounds(settings, props.output, measuredBounds)
      : null;
  useWatermarkPaint(canvas, resource, bounds, props.output, settings?.layout);
  const events = useWatermarkGesture(props, host, settings, bounds, resourceKey, setDraft);
  return (
    <div
      ref={host}
      tabIndex={-1}
      className="pointer-events-none absolute inset-0"
      data-ui="gallery.videoReview.watermark"
    >
      {!props.manual ? (
        <canvas
          ref={canvas}
          width={width}
          height={height}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      ) : null}
      {props.editable && settings?.layout === 'single' && settings.mode !== 'none' && bounds && (
        <button
          ref={bindHandle}
          type="button"
          aria-label={translate('gallery.videoReview.watermark')}
          className={[
            'pointer-events-auto absolute touch-none border-0 bg-transparent p-0 cursor-move',
            draft
              ? 'outline-none'
              : [
                  'hover:outline hover:outline-1 hover:outline-[var(--sniptale-color-border-strong)]',
                  'focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-[var(--sniptale-color-border-strong)]',
                ].join(' '),
          ].join(' ')}
          style={{
            left: `${(bounds.x / width) * 100}%`,
            top: `${(bounds.y / height) * 100}%`,
            width: `${(bounds.width / width) * 100}%`,
            height: `${(bounds.height / height) * 100}%`,
          }}
          {...events}
        />
      )}
    </div>
  );
}

function watermarkResourceKey(settings: Settings | undefined) {
  // Placement changes reuse immutable painted pixels, including during a long drag.
  return JSON.stringify(
    settings && { ...settings, placement: { margin: settings.placement.margin } }
  );
}

function useWatermarkResource(props: OverlayProps, resourceKey: string | undefined) {
  const latest = useRef(props);
  latest.current = props;
  const { width, height } = props.output;
  const manual = !!props.manual;
  const [resource, setResource] = useState<ReviewWatermarkRenderer | null>(null);
  useEffect(() => {
    if (manual) return;
    let active = true;
    let prepared: ReviewWatermarkRenderer | null = null;
    const controller = new AbortController();
    setResource(null);
    void createReviewWatermarkRenderer(
      latest.current.settings,
      { width, height },
      controller.signal
    ).then(
      (renderer) => {
        if (!active) {
          renderer.dispose();
          return;
        }
        prepared = renderer;
        setResource(renderer);
        latest.current.onError(null);
        latest.current.onReady?.();
      },
      () => {
        if (active) latest.current.onError(translate('gallery.videoReview.watermarkRenderFailed'));
      }
    );
    return () => {
      active = false;
      controller.abort();
      prepared?.dispose();
    };
  }, [resourceKey, width, height, props.retryGeneration, manual]);
  return resource;
}

function useWatermarkPaint(
  canvas: RefObject<HTMLCanvasElement | null>,
  resource: ReviewWatermarkRenderer | null,
  bounds: Bounds | null,
  { width, height }: OverlayProps['output'],
  layout: Settings['layout'] | undefined
) {
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (!resource || !bounds) return;
    context.save();
    if (layout === 'single')
      context.translate(bounds.x - resource.bounds.x, bounds.y - resource.bounds.y);
    resource.draw(context);
    context.restore();
  }, [canvas, resource, bounds, width, height, layout]);
}

function useWatermarkGesture(
  props: OverlayProps,
  host: RefObject<HTMLDivElement | null>,
  settings: Settings | undefined,
  bounds: Bounds | null,
  resourceKey: string | undefined,
  setDraft: (settings: Settings | null) => void
): ButtonHTMLAttributes<HTMLButtonElement> {
  const { gesture, finish } = useWatermarkGestureSession(props, resourceKey, setDraft);
  const { width, height } = props.output;
  return {
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onPointerDown: (event) => {
      event.stopPropagation();
      if (event.button !== 0 || gesture.current || !settings || !bounds) return;
      event.preventDefault();
      const rect = host.current?.getBoundingClientRect();
      if (!rect?.width || !rect.height) return;
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = {
        pointerId: event.pointerId,
        node: event.currentTarget,
        initial: settings,
        current: settings,
        bounds,
        x: event.clientX,
        y: event.clientY,
        width: rect.width,
        height: rect.height,
        moved: false,
      };
      setDraft(settings);
      props.onPreview(settings);
    },
    onPointerMove: (event) => {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      active.current = placeWatermark(
        active.initial,
        active.bounds,
        (active.bounds.x + active.bounds.width / 2) / width +
          (event.clientX - active.x) / active.width,
        (active.bounds.y + active.bounds.height / 2) / height +
          (event.clientY - active.y) / active.height,
        props.output
      );
      active.moved = true;
      setDraft(active.current);
      props.onPreview(active.current);
    },
    onPointerUp: (event) => {
      event.stopPropagation();
      if (gesture.current?.pointerId === event.pointerId) finish(true);
    },
    onPointerCancel: (event) => {
      event.stopPropagation();
      finish(false);
    },
    onLostPointerCapture: () => finish(false),
    onKeyDown: (event) =>
      moveWatermarkWithKeyboard(event, props, settings, bounds, !!gesture.current, finish),
    onKeyUp: (event) => event.stopPropagation(),
  };
}

function placeWatermark(
  value: Settings,
  painted: Bounds,
  x: number,
  y: number,
  { width, height }: OverlayProps['output']
) {
  const next = { ...value, placement: { ...value.placement, position: { x, y } } };
  const clamped = resolveQuickEditWatermarkBounds(next, { width, height }, painted);
  return {
    ...next,
    placement: {
      ...next.placement,
      position: {
        x: (clamped.x + clamped.width / 2) / width,
        y: (clamped.y + clamped.height / 2) / height,
      },
    },
  };
}

function moveWatermarkWithKeyboard(
  event: KeyboardEvent<HTMLButtonElement>,
  props: OverlayProps,
  settings: Settings | undefined,
  bounds: Bounds | null,
  dragging: boolean,
  finish: (commit: boolean) => void
) {
  const { width, height } = props.output;
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    finish(false);
    return;
  }
  const directions: Record<string, readonly [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const delta = directions[event.key];
  if (!delta || dragging || !settings || !bounds) return;
  event.preventDefault();
  const step = event.shiftKey ? 10 : 1;
  const next = placeWatermark(
    settings,
    bounds,
    (bounds.x + bounds.width / 2 + delta[0]! * step) / width,
    (bounds.y + bounds.height / 2 + delta[1]! * step) / height,
    props.output
  );
  props.onPreview(next);
  props.onChange(next);
  props.onPreview(null);
}

function useWatermarkGestureSession(
  props: OverlayProps,
  resourceKey: string | undefined,
  setDraft: (settings: Settings | null) => void
) {
  const latest = useRef(props);
  latest.current = props;
  const gesture = useRef<Gesture | null>(null);
  const { width, height } = props.output;
  const finish = useCallback(
    (commit: boolean) => {
      const active = gesture.current;
      if (!active) return;
      gesture.current = null;
      if (active.node.hasPointerCapture(active.pointerId))
        active.node.releasePointerCapture(active.pointerId);
      setDraft(null);
      if (commit && active.moved) latest.current.onChange(active.current);
      latest.current.onPreview(null);
    },
    [setDraft]
  );
  useEffect(
    () => () => {
      if (gesture.current) {
        gesture.current = null;
        latest.current.onPreview(null);
      }
    },
    []
  );
  useEffect(() => {
    if (!props.editable || props.settings?.layout !== 'single' || props.settings.mode === 'none')
      finish(false);
  }, [props.editable, props.settings?.layout, props.settings?.mode, finish]);
  useEffect(() => () => finish(false), [resourceKey, width, height, finish]);
  return { gesture, finish };
}
