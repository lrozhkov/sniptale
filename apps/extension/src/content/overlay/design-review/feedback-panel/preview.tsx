import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import { useResolvedPortalTheme } from '@sniptale/ui/theme/safe-portal';
import { ensureContentUiMountTarget, useContentUiScale } from '../../../platform/dom-host';
import { translate } from '../../../../platform/i18n';
import type { BrowserDomAnnotationRecord } from '../../../parser/page-preparation/annotations';
import { getDesignReviewActionOption, getDesignReviewActionTone } from '../action-catalog';
import { getDesignReviewRecordAction } from '../records';

function positionPreview(anchor: HTMLElement, layer: HTMLElement, scale: number): void {
  const rect = anchor.getBoundingClientRect();
  const clip = anchor.parentElement?.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = (viewport?.offsetLeft ?? 0) + 12;
  const top = (viewport?.offsetTop ?? 0) + 12;
  const right = left + (viewport?.width ?? window.innerWidth) - 24;
  const bottom = top + (viewport?.height ?? window.innerHeight) - 24;
  const clipped = clip && clip.height > 0 && (rect.bottom <= clip.top || rect.top >= clip.bottom);
  layer.style.visibility =
    !anchor.isConnected || clipped || rect.bottom <= top || rect.top >= bottom
      ? 'hidden'
      : 'visible';
  layer.style.width = `${Math.max(0, Math.min(300, (right - left) / scale))}px`;
  layer.style.maxHeight = `${Math.max(0, (bottom - top) / scale)}px`;
  const size = layer.getBoundingClientRect();
  const gap = 12 * scale;
  const fitsRight = rect.right + gap + size.width <= right;
  const fitsLeft = rect.left - gap - size.width >= left;
  let x = fitsRight ? rect.right + gap : rect.left - gap - size.width;
  let y = rect.top;
  if (!fitsRight && !fitsLeft) {
    if (rect.top - gap - size.height >= top) {
      x = rect.left;
      y = rect.top - gap - size.height;
    } else if (rect.bottom + gap + size.height <= bottom) {
      x = rect.left;
      y = rect.bottom + gap;
    }
  }
  layer.style.left = `${Math.max(left, Math.min(x, right - size.width))}px`;
  layer.style.top = `${Math.max(top, Math.min(y, bottom - size.height))}px`;
}

export function FeedbackPreview(props: {
  record: BrowserDomAnnotationRecord;
  anchor: HTMLElement;
  summary: string;
  label: string;
}) {
  const action = getDesignReviewRecordAction(props.record);
  const option = getDesignReviewActionOption(action);
  const Icon = option.icon;
  const ref = useRef<HTMLElement>(null);
  const scale = useContentUiScale();
  const theme = useResolvedPortalTheme(props.anchor);
  useLayoutEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const update = () => positionPreview(props.anchor, layer, scale);
    const unbind = bindFloatingInteractionPositionListeners(props.anchor, update);
    const observer = new ResizeObserver(update);
    observer.observe(props.anchor);
    observer.observe(layer);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    // Panel dragging and host layout shifts do not necessarily resize the anchor.
    let frame = 0;
    const track = () => {
      update();
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    return () => {
      unbind?.();
      observer.disconnect();
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      cancelAnimationFrame(frame);
    };
  }, [props.anchor, scale]);
  return createPortal(
    <aside
      ref={ref}
      data-theme={theme ?? undefined}
      data-floating-ui-capture-transient="true"
      className={[
        'pointer-events-none fixed z-[2147483647] rounded-[12px] border p-4 shadow-2xl',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      data-ui="content.design-review.feedback-preview"
      style={{ scale, transformOrigin: 'top left', overflow: 'hidden' }}
    >
      <div
        className={`flex items-center gap-2 text-sm font-bold ${getDesignReviewActionTone(action)}`}
      >
        <Icon size={18} />
        {translate(option.labelKey)}
      </div>
      <div className="mt-2 text-xs text-[var(--sniptale-color-text-secondary)]">{props.label}</div>
      <div className="mt-1 truncate font-mono text-[10px] text-[var(--sniptale-color-text-dim)]">
        {props.record.evidence.targetPath}
      </div>
      <div className="my-3 border-t border-solid border-[color:var(--sniptale-color-border-soft)]" />
      <p className="whitespace-pre-wrap break-words text-xs leading-5">{props.summary}</p>
      <div className="mt-3 text-right text-[10px] text-[var(--sniptale-color-text-dim)]">
        {translate('content.designReview.panelClickHint')}
      </div>
    </aside>,
    ensureContentUiMountTarget()
  );
}
