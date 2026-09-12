import { Columns2, StretchHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { GuideBlock, GuideStep } from '@sniptale/runtime-contracts/scenario/types/guide';
import { resolveGuideBlockWidth } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';

type Width = 'full' | 'half';
type WidthGesture = { x: number; width: Width; target: HTMLElement; pointerId: number };

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
  onWidth: (width: Width) => void;
  t: Translate;
  children: ReactNode;
}) {
  const width = resolveGuideBlockWidth(layout, block);
  const [preview, setPreview] = useState<Width | null>(null);
  const gesture = useRef<WidthGesture | null>(null);
  const swallowClick = useRef(false);
  const release = () => {
    const current = gesture.current;
    gesture.current = null;
    if (current?.target.hasPointerCapture(current.pointerId))
      current.target.releasePointerCapture(current.pointerId);
  };
  const cancel = () => {
    release();
    setPreview(null);
  };
  useEffect(() => {
    cancel();
    return release;
  }, [block.id, width, disabled]);
  const visible = preview ?? width;
  return (
    <div
      className="guide-block"
      data-block-id={block.id}
      data-kind={block.kind}
      data-width={visible}
    >
      {children}
      <ContentToolbarButton
        className="guide-block-width"
        title={t(
          visible === 'half' ? 'scenario.editor.guideFullWidth' : 'scenario.editor.guideHalfWidth'
        )}
        disabled={disabled}
        onPointerDown={(event) => {
          if (event.button !== 0 || disabled) return;
          event.stopPropagation();
          swallowClick.current = false;
          gesture.current = {
            x: event.clientX,
            width,
            target: event.currentTarget,
            pointerId: event.pointerId,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const delta = event.clientX - current.x;
          if (Math.abs(delta) < 24) {
            current.width = width;
            setPreview(null);
            return;
          }
          current.width = delta < 0 ? 'half' : 'full';
          swallowClick.current = true;
          setPreview(current.width);
        }}
        onPointerUp={(event) => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId) return;
          cancel();
          if (swallowClick.current && current.width !== width) onWidth(current.width);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onClick={(event) => {
          const swallowed = swallowClick.current && event.detail !== 0;
          swallowClick.current = false;
          if (swallowed) return;
          onWidth(width === 'half' ? 'full' : 'half');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && gesture.current) {
            event.preventDefault();
            event.stopPropagation();
            swallowClick.current = true;
            cancel();
          }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          cancel();
          const next = event.key === 'ArrowLeft' ? 'half' : 'full';
          if (next !== width) onWidth(next);
        }}
      >
        {visible === 'half' ? (
          <StretchHorizontal size={15} aria-hidden="true" />
        ) : (
          <Columns2 size={15} aria-hidden="true" />
        )}
      </ContentToolbarButton>
    </div>
  );
}
