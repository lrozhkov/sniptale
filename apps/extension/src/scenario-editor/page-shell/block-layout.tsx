import { Columns2, StretchHorizontal, MoveVertical } from 'lucide-react';
import { type ReactNode } from 'react';
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
import { useGuideLayoutAssistance } from './layout-assistance';
import { useGuideBlockResize } from './block-resize';

/** Ordered blocks resize in flow; minimum height reserves space without clipping prose. */
export function GuideBlockLayout({
  block,
  layout,
  disabled,
  onWidth,
  onHeight,
  t,
  children,
}: {
  block: GuideBlock;
  layout: GuideStep['layout'];
  disabled: boolean;
  onWidth: (width: GuideBlockWidth) => void;
  onHeight?: ((height: number) => void) | undefined;
  t: Translate;
  children: ReactNode;
}) {
  const width = resolveGuideBlockWidth(layout, block);
  const height = 'minHeight' in block ? (block.minHeight ?? 0) : 0;
  const { snap } = useGuideLayoutAssistance();
  const size = useGuideBlockResize({
    id: block.id,
    width,
    height,
    disabled,
    snap,
    onCommit: (axis, value) => (axis === 'width' ? onWidth(value) : onHeight?.(value)),
  });
  const visible = size.preview?.axis === 'width' ? size.preview.value : width;
  const visibleHeight = size.preview?.axis === 'height' ? size.preview.value : height;
  const actionLabel = t(
    visible === 100 ? 'scenario.editor.guideHalfWidth' : 'scenario.editor.guideFullWidth'
  );
  const pointerBindings = {
    onPointerMove: size.move,
    onPointerUp: size.finish,
    onPointerCancel: size.cancel,
    onLostPointerCapture: size.cancel,
  };
  return (
    <div
      ref={size.element}
      className="guide-block"
      data-block-id={block.id}
      data-kind={block.kind}
      data-width={visible}
      data-width-preview={size.preview !== null || undefined}
      style={guideBlockWidthStyle(visible, visibleHeight)}
    >
      {children}
      {size.preview !== null && (
        <output
          className="guide-width-preview"
          aria-label={t(
            size.preview.axis === 'width'
              ? 'scenario.editor.guideBlockWidth'
              : 'scenario.editor.guideBlockHeight'
          )}
        >
          {size.preview.value}
          {size.preview.axis === 'width' ? '%' : 'px'}
        </output>
      )}
      <ContentToolbarButton
        className="guide-block-width"
        title={[actionLabel, `${visible}%`, t('scenario.editor.guideResizeWidth')].join(' · ')}
        aria-label={actionLabel}
        disabled={disabled}
        {...pointerBindings}
        onPointerDown={(event) => size.begin(event, 'width')}
        onClick={(event) => {
          const swallowed = size.swallowClick.current && event.detail !== 0;
          size.swallowClick.current = false;
          if (!disabled && !swallowed) onWidth(width === 100 ? 'half' : 'full');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            size.cancel();
          }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          size.cancel();
          if (disabled) return;
          const next = Math.max(
            GUIDE_LIMITS.minBlockWidthPercent,
            Math.min(100, width + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1))
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
      {onHeight && (
        <ContentToolbarButton
          className="guide-block-height"
          disabled={disabled}
          aria-label={t('scenario.editor.guideBlockHeight')}
          title={t('scenario.editor.guideResizeHeight')}
          {...pointerBindings}
          onPointerDown={(event) => size.begin(event, 'height')}
          onDoubleClick={() => {
            if (!disabled) {
              size.cancel();
              onHeight(0);
            }
          }}
          onKeyDown={(event) => {
            if (!['Escape', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            size.cancel();
            if (disabled || event.key === 'Escape') return;
            const current = size.element.current?.getBoundingClientRect().height ?? height;
            onHeight(
              event.key === 'Home'
                ? 0
                : Math.round(
                    Math.max(
                      0,
                      Math.min(
                        GUIDE_LIMITS.maxDimension,
                        current + (event.key === 'ArrowUp' ? -1 : 1) * (event.shiftKey ? 50 : 10)
                      )
                    )
                  )
            );
          }}
        >
          <MoveVertical size={15} aria-hidden="true" />
        </ContentToolbarButton>
      )}
    </div>
  );
}
