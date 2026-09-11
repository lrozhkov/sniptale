import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import type { GuideImageBlock } from '@sniptale/runtime-contracts/scenario/types/guide';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { changeGuideImageGeometry, moveGuideImageGesture } from './image-geometry';

type ImageProps = {
  block: GuideImageBlock;
  url: string | null | undefined;
  disabled: boolean;
  t: Translate;
  onEdit?: () => void;
  onChange: (block: GuideImageBlock, group?: string | null) => void;
};
type Gesture = {
  origin: GuideImageBlock;
  draft: GuideImageBlock;
  kind: 'pan' | 'resize';
  pointerId: number | null;
  element: HTMLElement;
  x: number;
  y: number;
  width: number;
  height: number;
};
function releaseGesture(controller: { active: Gesture | null; timer: number | null }) {
  const active = controller.active;
  controller.active = null;
  if (controller.timer !== null) window.clearTimeout(controller.timer);
  controller.timer = null;
  if (
    active?.pointerId !== null &&
    active?.pointerId !== undefined &&
    active.element.hasPointerCapture(active.pointerId)
  ) {
    active.element.releasePointerCapture(active.pointerId);
  }
}

/** One owner keeps pointer and modifier-wheel drafts out of durable history until commitment. */
function useImageGesture({ block, disabled, onChange }: ImageProps, editing: boolean) {
  const frame = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  useLayoutEffect(() => {
    change.current = onChange;
  }, [onChange]);
  const controller = useRef<{ active: Gesture | null; timer: number | null }>({
    active: null,
    timer: null,
  });
  const [preview, setPreview] = useState<GuideImageBlock | null>(null);
  const finish = (commit: boolean, pointerId?: number) => {
    if (pointerId !== undefined && controller.current.active?.pointerId !== pointerId) return;
    const draft = controller.current.active?.draft;
    releaseGesture(controller.current);
    setPreview(null);
    if (commit && !disabled && draft && draft !== block) onChange(draft, null);
  };
  useEffect(() => {
    const owner = controller.current;
    const element = frame.current;
    setPreview(null);
    const wheel = (event: WheelEvent) => {
      if (!editing || disabled || !event.ctrlKey || !element || owner.active?.pointerId != null)
        return;
      event.preventDefault();
      event.stopPropagation();
      const active = owner.active ?? {
        origin: block,
        draft: block,
        kind: 'pan',
        pointerId: null,
        element,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
      active.draft = changeGuideImageGeometry(active.draft, {
        kind: 'zoom',
        scale:
          active.draft.contentTransform.scale *
          Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002),
      });
      owner.active = active;
      setPreview(active.draft);
      if (owner.timer !== null) window.clearTimeout(owner.timer);
      owner.timer = window.setTimeout(() => {
        const next = owner.active?.draft;
        releaseGesture(owner);
        setPreview(null);
        if (next) change.current(next, null);
      }, 250);
    };
    element?.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element?.removeEventListener('wheel', wheel);
      releaseGesture(owner);
    };
  }, [block, disabled, editing]);
  const begin = (event: PointerEvent<HTMLElement>, kind: 'pan' | 'resize') => {
    if (!editing || disabled || event.button !== 0 || controller.current.active) return;
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    controller.current.active = {
      origin: block,
      draft: block,
      kind,
      pointerId: event.pointerId,
      element: event.currentTarget,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
    };
    setPreview(block);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const active = controller.current.active;
    if (!active || active.pointerId !== event.pointerId) return;
    active.draft = moveGuideImageGesture(
      active.origin,
      active.kind,
      event.clientX - active.x,
      event.clientY - active.y,
      active.width,
      active.height
    );
    setPreview(active.draft);
  };
  return { frame, shown: preview ?? block, begin, move, finish };
}

/** Inline image framing keeps annotation/resource identity and commits only accepted geometry. */
export function GuideImageSurface(props: ImageProps) {
  const { block, url, disabled, onChange, t } = props;
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const gesture = useImageGesture({ ...props, disabled: disabled || !url }, editing);
  const shown = gesture.shown;
  const close = () => {
    gesture.finish(false);
    setEditing(false);
    trigger.current?.focus();
  };
  return (
    <figure
      className="guide-image-surface"
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && editing) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      {props.onEdit && (
        <button type="button" data-edit-image disabled={disabled || !url} onClick={props.onEdit}>
          {t('scenario.editor.guideEditImage')}
        </button>
      )}
      <div
        ref={gesture.frame}
        className="guide-image-frame"
        role="group"
        data-editing={editing}
        style={{
          width: `min(100%, ${shown.frame.width}px)`,
          aspectRatio: `${shown.frame.width} / ${shown.frame.height}`,
        }}
        tabIndex={editing && !disabled ? 0 : -1}
        aria-label={t('scenario.editor.guideImagePosition')}
        onPointerDown={(event) => gesture.begin(event, 'pan')}
        onPointerMove={gesture.move}
        onPointerUp={(event) => gesture.finish(true, event.pointerId)}
        onPointerCancel={(event) => gesture.finish(false, event.pointerId)}
        onLostPointerCapture={(event) => gesture.finish(false, event.pointerId)}
        onKeyDown={(event) => {
          if (!editing || disabled || event.target !== event.currentTarget) return;
          const direction = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          }[event.key];
          if (!direction) return;
          event.preventDefault();
          event.stopPropagation();
          onChange(
            changeGuideImageGeometry(block, {
              kind: 'pan',
              x: block.contentTransform.x + direction[0]! * 0.02,
              y: block.contentTransform.y + direction[1]! * 0.02,
            }),
            `image-pan:${block.id}`
          );
        }}
      >
        {url ? (
          <img
            src={url}
            alt={block.alt}
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: shown.fit,
              translate: `${shown.contentTransform.x * 100}% ${shown.contentTransform.y * 100}%`,
              scale: shown.contentTransform.scale,
            }}
          />
        ) : (
          <p role="status">
            {t(
              url === null ? 'scenario.editor.workspacePreviewLoadError' : 'scenario.editor.loading'
            )}
          </p>
        )}
        {editing && url && (
          <button
            type="button"
            className="guide-image-resize"
            disabled={disabled}
            aria-label={t('scenario.editor.guideResizeImageFrame')}
            onPointerDown={(event) => gesture.begin(event, 'resize')}
            onKeyDown={(event) => {
              if (disabled) return;
              const delta = {
                ArrowLeft: [-10, 0],
                ArrowRight: [10, 0],
                ArrowUp: [0, -10],
                ArrowDown: [0, 10],
              }[event.key];
              if (!delta) return;
              event.preventDefault();
              event.stopPropagation();
              onChange(
                changeGuideImageGeometry(block, {
                  kind: 'frame',
                  width: block.frame.width + delta[0]!,
                  height: block.frame.height + delta[1]!,
                }),
                `image-frame:${block.id}`
              );
            }}
          >
            ↘
          </button>
        )}
      </div>
      {block.caption && <figcaption>{block.caption}</figcaption>}
      <button
        ref={trigger}
        type="button"
        disabled={disabled || !url}
        aria-expanded={editing}
        onClick={() => (editing ? close() : setEditing(true))}
      >
        {t(editing ? 'scenario.editor.guideImageDone' : 'scenario.editor.guideEditImageFrame')}
      </button>
      {editing && (
        <GuideImageControls
          {...props}
          onReset={() => {
            const image = gesture.frame.current?.querySelector('img');
            if (image?.naturalWidth && image.naturalHeight)
              onChange(
                changeGuideImageGeometry(block, {
                  kind: 'reset',
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                }),
                null
              );
          }}
        />
      )}
    </figure>
  );
}

function GuideImageControls({
  block,
  disabled,
  onChange,
  t,
  onReset,
}: ImageProps & { onReset: () => void }) {
  const geometry = (
    change: Parameters<typeof changeGuideImageGeometry>[1],
    group: string | null = null
  ) => onChange(changeGuideImageGeometry(block, change), group);
  return (
    <fieldset className="guide-image-controls" disabled={disabled}>
      <legend>{t('scenario.editor.guideEditImageFrame')}</legend>
      <p>{t('scenario.editor.guideImageGestureHint')}</p>
      <SegmentedSwitch
        activeId={block.fit}
        ariaLabel={t('scenario.editor.guideImageFit')}
        options={[
          { id: 'contain', label: t('scenario.editor.guideImageContain') },
          { id: 'cover', label: t('scenario.editor.guideImageCover') },
        ]}
        onChange={(fit) => geometry({ kind: 'fit', fit })}
      />
      <label>
        {t('scenario.editor.guideImageZoom')}
        <input
          type="number"
          min="10"
          max="10000"
          step="10"
          disabled={disabled}
          value={Math.round(block.contentTransform.scale * 100)}
          onChange={(event) => {
            if (Number.isFinite(event.target.valueAsNumber))
              geometry(
                { kind: 'zoom', scale: event.target.valueAsNumber / 100 },
                `image-zoom:${block.id}`
              );
          }}
        />
      </label>
      {(['width', 'height'] as const).map((dimension) => (
        <label key={dimension}>
          {t(
            dimension === 'width'
              ? 'scenario.editor.guideImageWidth'
              : 'scenario.editor.guideImageHeight'
          )}
          <input
            type="number"
            min="1"
            max={GUIDE_LIMITS.maxDimension}
            disabled={disabled}
            value={Math.round(block.frame[dimension])}
            onChange={(event) => {
              if (Number.isFinite(event.target.valueAsNumber))
                geometry(
                  { kind: 'frame', ...block.frame, [dimension]: event.target.valueAsNumber },
                  `image-${dimension}:${block.id}`
                );
            }}
          />
        </label>
      ))}
      <label>
        {t('scenario.editor.guideImageCaption')}
        <input
          value={block.caption}
          maxLength={GUIDE_LIMITS.maxTextLength}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...block, caption: event.target.value }, `image-caption:${block.id}`)
          }
        />
      </label>
      <label>
        {t('scenario.editor.guideImageAlt')}
        <input
          value={block.alt}
          maxLength={GUIDE_LIMITS.maxTextLength}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...block, alt: event.target.value }, `image-alt:${block.id}`)
          }
        />
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => geometry({ kind: 'zoom', scale: 1 })}
      >
        {t('scenario.editor.guideImageResetZoom')}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => geometry({ kind: 'pan', x: 0, y: 0 })}
      >
        {t('scenario.editor.guideImageCenter')}
      </button>
      <button type="button" onClick={onReset}>
        {t('scenario.editor.guideImageReset')}
      </button>
    </fieldset>
  );
}
