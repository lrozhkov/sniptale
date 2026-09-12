import { Columns2, StretchHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  GUIDE_LIMITS,
  type GuideBlock,
  type GuideBlockWidth,
  type GuideStep,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { resolveGuideBlockWidth } from '../../features/scenario/project/public';
import { guideBlockWidthStyle } from './document-appearance';
import type { Translate } from '../../platform/i18n';

type WidthGesture = {
  x: number;
  initial: number;
  width: number;
  basis: number;
  dragging: boolean;
  target: HTMLElement;
  pointerId: number;
};
const clampWidth = (width: number) =>
  Math.max(GUIDE_LIMITS.minBlockWidthPercent, Math.min(100, Math.round(width)));

/** Width preview belongs to this block; only a finished gesture publishes a document edit. */
export function GuideBlockLayout({
  block,
  layout,
  disabled,
  onWidth,
  t,
  children,
}: {
  block: GuideBlock;
  layout: GuideStep['layout'];
  disabled: boolean;
  onWidth: (width: GuideBlockWidth) => void;
  t: Translate;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const width = resolveGuideBlockWidth(layout, block);
  const [preview, setPreview] = useState<number | null>(null);
  const gesture = useRef<WidthGesture | null>(null);
  const swallowClick = useRef(false);
  const release = () => {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;
    document.documentElement.removeAttribute('data-guide-width-resizing');
    if (current.target.hasPointerCapture(current.pointerId))
      current.target.releasePointerCapture(current.pointerId);
  };
  const cancel = () => {
    if (gesture.current) swallowClick.current = true;
    release();
    setPreview(null);
  };
  useEffect(() => {
    cancel();
    return release;
  }, [block.id, width, disabled]);
  const visible = preview ?? width;
  const actionLabel = t(
    visible === 100 ? 'scenario.editor.guideHalfWidth' : 'scenario.editor.guideFullWidth'
  );
  return (
    <div
      ref={element}
      className="guide-block"
      data-block-id={block.id}
      data-kind={block.kind}
      data-width={visible}
      data-width-preview={preview !== null || undefined}
      style={guideBlockWidthStyle(visible)}
    >
      {children}
      {preview !== null && (
        <output className="guide-width-preview" aria-label={t('scenario.editor.guideBlockWidth')}>
          {visible}%
        </output>
      )}
      <ContentToolbarButton
        className="guide-block-width"
        title={[actionLabel, `${visible}%`, t('scenario.editor.guideResizeWidth')].join(' · ')}
        aria-label={actionLabel}
        disabled={disabled}
        onPointerDown={(event) => {
          if (event.button !== 0 || disabled || gesture.current) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
          swallowClick.current = false;
          const parent = element.current?.parentElement;
          if (!parent) return;
          const basis =
            parent.getBoundingClientRect().width +
            (parseFloat(getComputedStyle(parent).columnGap) || 0);
          if (basis <= 0) return;
          gesture.current = {
            x: event.clientX,
            initial: width,
            width,
            basis,
            dragging: false,
            target: event.currentTarget,
            pointerId: event.pointerId,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const delta = event.clientX - current.x;
          if (!current.dragging && Math.abs(delta) < 5) return;
          current.dragging = true;
          current.width = clampWidth(current.initial + (delta / current.basis) * 100);
          swallowClick.current = true;
          document.documentElement.setAttribute('data-guide-width-resizing', '');
          setPreview(current.width);
        }}
        onPointerUp={(event) => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId) return;
          release();
          setPreview(null);
          if (current.dragging && current.width !== width) onWidth(current.width);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onClick={(event) => {
          const swallowed = swallowClick.current && event.detail !== 0;
          swallowClick.current = false;
          if (disabled || swallowed) return;
          onWidth(width === 100 ? 'half' : 'full');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && gesture.current) {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          cancel();
          if (disabled) return;
          const next = clampWidth(
            width + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1)
          );
          if (next !== width) onWidth(next);
        }}
      >
        {visible === 100 ? (
          <Columns2 size={15} aria-hidden="true" />
        ) : (
          <StretchHorizontal size={15} aria-hidden="true" />
        )}
      </ContentToolbarButton>
    </div>
  );
}
