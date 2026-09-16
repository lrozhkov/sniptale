import { useImageDimensions } from './image-dimensions';
import { useGuideLayoutAssistance } from './layout-assistance';
import { GuideResourceTrigger } from './resource-drawer';
import { Check, Crop, Pencil, Magnet } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import type { GuideImageBlock } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import {
  changeGuideImageGeometry,
  constrainGuideImage,
  moveGuideImageGesture,
  hasSameGuideImageGestureBase,
  commitGuideImageGesture,
} from './image-geometry';

type ImageProps = {
  block: GuideImageBlock;
  url: string | null | undefined;
  disabled: boolean;
  t: Translate;
  onEdit?: () => void;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  libraryTarget?: { stepId: string; blockId: string };
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
function useImageGesture(
  { block, disabled, onChange }: ImageProps,
  editing: boolean,
  constrain: (block: GuideImageBlock) => GuideImageBlock,
  cropBounds: boolean
) {
  const frame = useRef<HTMLDivElement>(null);
  const latest = useRef({ block, disabled, editing, onChange, constrain });
  const controller = useRef<{ active: Gesture | null; timer: number | null }>({
    active: null,
    timer: null,
  });
  const [preview, setPreview] = useState<GuideImageBlock | null>(null);
  useLayoutEffect(() => {
    latest.current = { block, disabled, editing, onChange, constrain };
    const active = controller.current.active;
    if (active && (disabled || !editing || !hasSameGuideImageGestureBase(active.origin, block))) {
      releaseGesture(controller.current);
      setPreview(null);
    }
  }, [block, disabled, editing, onChange, constrain]);
  const finish = useCallback((commit: boolean, pointerId?: number) => {
    const active = controller.current.active;
    if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
    releaseGesture(controller.current);
    setPreview(null);
    const current = latest.current;
    if (!commit || current.disabled || !current.editing) return;
    const next = commitGuideImageGesture(current.block, active.origin, active.draft);
    if (next && next !== current.block) current.onChange(next, null);
    return next;
  }, []);
  useEffect(() => {
    const owner = controller.current;
    const element = frame.current;
    const wheel = (event: WheelEvent) => {
      const current = latest.current;
      if (
        !current.editing ||
        current.disabled ||
        !event.ctrlKey ||
        !element ||
        owner.active?.pointerId != null
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const active = owner.active ?? {
        origin: current.block,
        draft: current.block,
        kind: 'pan',
        pointerId: null,
        element,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
      active.draft = current.constrain(
        changeGuideImageGeometry(active.draft, {
          kind: 'zoom',
          scale:
            active.draft.contentTransform.scale *
            Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002),
        })
      );
      owner.active = active;
      setPreview(active.draft);
      if (owner.timer !== null) window.clearTimeout(owner.timer);
      owner.timer = window.setTimeout(() => finish(true), 250);
    };
    element?.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element?.removeEventListener('wheel', wheel);
      releaseGesture(owner);
    };
  }, [finish]);
  useEffect(() => {
    finish(false);
  }, [cropBounds, finish]);
  const begin = (event: PointerEvent<HTMLElement>, kind: 'pan' | 'resize') => {
    if (!editing || disabled || event.button !== 0) return;
    let origin = block;
    if (controller.current.active?.pointerId === null) origin = finish(true) ?? block;
    if (controller.current.active) return;
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    controller.current.active = {
      origin,
      draft: origin,
      kind,
      pointerId: event.pointerId,
      element: event.currentTarget,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
    };
    setPreview(origin);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const active = controller.current.active;
    if (!active || active.pointerId !== event.pointerId) return;
    active.draft = latest.current.constrain(
      moveGuideImageGesture(
        active.origin,
        active.kind,
        event.clientX - active.x,
        event.clientY - active.y,
        active.width,
        active.height
      )
    );
    setPreview(active.draft);
  };
  return { frame, shown: preview ?? block, begin, move, finish };
}

/** Inline image framing keeps annotation/resource identity and commits only accepted geometry. */
export function GuideImageSurface(props: ImageProps) {
  const { block, url, disabled, editing, onEditingChange, t } = props;
  const trigger = useRef<HTMLButtonElement>(null);
  const dimensions = useImageDimensions(editing ? url : undefined);
  const { cropBounds, setCropBounds } = useGuideLayoutAssistance();
  const constrain = useCallback(
    (next: GuideImageBlock) =>
      cropBounds && dimensions ? constrainGuideImage(next, dimensions) : next,
    [cropBounds, dimensions]
  );
  const gesture = useImageGesture(
    { ...props, disabled: disabled || !url },
    editing,
    constrain,
    cropBounds
  );
  const close = () => {
    gesture.finish(false);
    onEditingChange(false);
    trigger.current?.focus();
  };
  return (
    <figure
      className="guide-image-surface"
      data-editing={editing}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && editing) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="guide-image-tools">
        {editing && (
          <ContentToolbarButton
            title={t('scenario.editor.guideCropBounds')}
            aria-label={t('scenario.editor.guideCropBounds')}
            aria-pressed={cropBounds}
            disabled={disabled || !dimensions}
            onClick={() => {
              gesture.finish(false);
              setCropBounds(!cropBounds);
              if (!cropBounds && dimensions) {
                const next = constrainGuideImage(block, dimensions);
                if (!hasSameGuideImageGestureBase(block, next)) props.onChange(next, null);
              }
            }}
          >
            <Magnet size={16} aria-hidden="true" />
          </ContentToolbarButton>
        )}

        {props.libraryTarget && (
          <GuideResourceTrigger
            t={t}
            disabled={disabled}
            target={{ kind: 'replace-image', ...props.libraryTarget }}
            title={t('scenario.editor.guideReplaceImage')}
          />
        )}
        {props.onEdit && (
          <ContentToolbarButton
            type="button"
            title={t('scenario.editor.guideEditImage')}
            aria-label={t('scenario.editor.guideEditImage')}
            data-edit-image
            disabled={disabled || !url}
            onClick={props.onEdit}
          >
            <Pencil size={16} aria-hidden="true" />
          </ContentToolbarButton>
        )}
        <ContentToolbarButton
          ref={trigger}
          data-frame-image
          type="button"
          disabled={disabled || !url}
          title={t(
            editing ? 'scenario.editor.guideImageDone' : 'scenario.editor.guideEditImageFrame'
          )}
          aria-label={t(
            editing ? 'scenario.editor.guideImageDone' : 'scenario.editor.guideEditImageFrame'
          )}
          aria-expanded={editing}
          onClick={() => (editing ? close() : onEditingChange(true))}
        >
          {editing ? <Check size={16} aria-hidden="true" /> : <Crop size={16} aria-hidden="true" />}
        </ContentToolbarButton>
      </div>
      <GuideImageViewport {...props} editing={editing} gesture={gesture} constrain={constrain} />
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

/** The viewport binds pointer/keyboard framing to the existing gesture owner. */
function GuideImageViewport({
  block,
  url,
  disabled,
  onChange,
  t,
  editing,
  gesture,
  constrain,
}: ImageProps & {
  editing: boolean;
  gesture: ReturnType<typeof useImageGesture>;
  constrain: (block: GuideImageBlock) => GuideImageBlock;
}) {
  const shown = gesture.shown;
  return (
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
          constrain(
            changeGuideImageGeometry(block, {
              kind: 'pan',
              x: block.contentTransform.x + direction[0]! * 0.02,
              y: block.contentTransform.y + direction[1]! * 0.02,
            })
          ),
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
        <ProductActionButton
          tone="secondary"
          compact
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
              constrain(
                changeGuideImageGeometry(block, {
                  kind: 'frame',
                  width: block.frame.width + delta[0]!,
                  height: block.frame.height + delta[1]!,
                })
              ),
              `image-frame:${block.id}`
            );
          }}
        >
          ↘
        </ProductActionButton>
      )}
    </div>
  );
}
