import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Shapes, X } from 'lucide-react';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import {
  bindFloatingInteractionPositionListeners,
  mergeFloatingInteractionLayerStyle,
} from '@sniptale/ui/floating-interactions/placement';
import { isComposedEventWithinAnyElement } from '@sniptale/ui/dom-events';
import type {
  EffectBundleCatalogEntry,
  EffectBundleCatalogListItem,
} from '../../features/video/project/effect-bundle/catalog';
import { readCatalogPresentation } from '../../features/video/project/effect-bundle/catalog/presentation';
import { translate, useAppLocale } from '../../platform/i18n';
import { ReviewButton, reviewIconButtonClassName, reviewTextButtonClassName } from './controls';

type PickerProps = {
  anchor: HTMLElement;
  target: HTMLElement | ShadowRoot | DocumentFragment;
  catalogs: readonly EffectBundleCatalogListItem[];
  phase: 'loading' | 'ready' | 'failed';
  pending: boolean;
  failure: string | null;
  retryable?: boolean;
  onChoose(catalog: EffectBundleCatalogEntry, documentId: string): void;
  onReload(): void;
  onRetry(): void;
  onClose(): void;
};

/** One anchored picker owns placement, dismissal, keyboard focus and restoration. */
export function ReviewAnnotationEffectsPicker(props: PickerProps) {
  const { anchor } = props;
  const locale = useAppLocale();
  const surface = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const [maxHeight, setMaxHeight] = useState(240);
  useLayoutEffect(() => {
    const doc = anchor.ownerDocument;
    const ownerWindow = doc.defaultView;
    if (!ownerWindow) return;
    const place = () => {
      const bounds = anchor.getBoundingClientRect();
      const viewport = ownerWindow.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? ownerWindow.innerWidth;
      const height = viewport?.height ?? ownerWindow.innerHeight;
      let visible =
        anchor.isConnected &&
        bounds.right > left &&
        bounds.left < left + width &&
        bounds.bottom > top &&
        bounds.top < top + height;
      for (let parent = anchor.parentElement; parent && visible; parent = parent.parentElement) {
        const style = ownerWindow.getComputedStyle(parent);
        const clippedX = /auto|scroll|hidden|clip/.test(style.overflowX);
        const clippedY = /auto|scroll|hidden|clip/.test(style.overflowY);
        if (!clippedX && !clippedY) continue;
        const clip = parent.getBoundingClientRect();
        if (clippedX && (bounds.right <= clip.left || bounds.left >= clip.right)) visible = false;
        if (clippedY && (bounds.bottom <= clip.top || bounds.top >= clip.bottom)) visible = false;
      }
      if (!visible) {
        latest.current.onClose();
        return;
      }
      const menuWidth = Math.max(1, Math.min(360, width - 24));
      const below = top + height - bounds.bottom - 18;
      const above = bounds.top - top - 18;
      const upwards = above > below;
      const available = Math.max(1, upwards ? above : below);
      const measured = surface.current?.getBoundingClientRect().height ?? available;
      setMaxHeight(available);
      setPosition(
        mergeFloatingInteractionLayerStyle({
          position: 'fixed',
          width: menuWidth,
          left: Math.max(left + 12, Math.min(bounds.left, left + width - menuWidth - 12)),
          top: upwards
            ? Math.max(top + 12, bounds.top - Math.min(measured, available) - 6)
            : Math.max(top + 12, bounds.bottom + 6),
        })
      );
    };
    const unbind = bindFloatingInteractionPositionListeners(anchor, place);
    const resize = new ResizeObserver(place);
    resize.observe(anchor);
    if (surface.current) resize.observe(surface.current);
    ownerWindow.visualViewport?.addEventListener('resize', place);
    ownerWindow.visualViewport?.addEventListener('scroll', place);
    const outside = (event: PointerEvent) => {
      if (!isComposedEventWithinAnyElement(event, [anchor, surface.current]))
        latest.current.onClose();
    };
    doc.addEventListener('pointerdown', outside, true);
    surface.current?.querySelector<HTMLElement>('[role="dialog"]')?.focus();
    return () => {
      unbind?.();
      resize.disconnect();
      ownerWindow.visualViewport?.removeEventListener('resize', place);
      ownerWindow.visualViewport?.removeEventListener('scroll', place);
      doc.removeEventListener('pointerdown', outside, true);
      if (anchor.isConnected) anchor.focus();
    };
  }, [anchor]);
  const choices = props.catalogs.flatMap((catalog) =>
    catalog.status === 'ready' && catalog.entry.enabled
      ? catalog.entry.documents
          .filter((item) => item.enabled !== false && item.kind === 'standalone')
          .map((document) => ({ catalog: catalog.entry, document }))
      : []
  );
  return (
    <ContentPopoverAdapter
      isOpen
      anchorEl={props.anchor}
      portalTarget={props.target}
      popoverRef={surface}
      dataUi="gallery.videoReview.annotationEffectsPicker"
      style={position}
      className="sniptale-content-popover--compact !bg-[var(--sniptale-color-surface-panel)]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={translate('gallery.videoReview.annotationEffectsChoose')}
        tabIndex={-1}
        className="overflow-y-auto p-2 outline-none"
        style={{ maxHeight }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          ];
          const index = controls.findIndex(
            (item) => item === event.currentTarget.ownerDocument.activeElement
          );
          event.preventDefault();
          controls[
            index < 0
              ? event.shiftKey
                ? controls.length - 1
                : 0
              : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
          ]?.focus();
        }}
      >
        <div className="flex items-center justify-between gap-2 pb-2">
          <span className="text-sm font-semibold">
            {translate('gallery.videoReview.annotationEffectsChoose')}
          </span>
          <ReviewButton
            label={translate('common.actions.close')}
            className={reviewIconButtonClassName}
            onClick={props.onClose}
          >
            <X size={14} aria-hidden />
          </ReviewButton>
        </div>
        {props.phase === 'loading' ? (
          <p role="status" className="px-2 py-3 text-xs">
            {translate('gallery.videoReview.annotationEffectsLoading')}
          </p>
        ) : null}
        {props.phase === 'failed' ? (
          <div role="alert" className="p-2 text-xs">
            <p>{translate('gallery.videoReview.annotationEffectsCatalogFailed')}</p>
            <ReviewButton
              label={translate('gallery.videoReview.retry')}
              className={reviewTextButtonClassName}
              onClick={props.onReload}
            />
          </div>
        ) : null}
        {props.phase === 'ready' && !choices.length ? (
          <p className="px-2 py-3 text-xs">
            {translate('gallery.videoReview.annotationEffectsCatalogEmpty')}
          </p>
        ) : null}
        {choices.map(({ catalog, document }) => {
          const presentation = readCatalogPresentation(document);
          const name =
            presentation?.label[locale] ?? presentation?.label.en ?? catalog.label[locale];
          return (
            <button
              type="button"
              key={`${catalog.packId}:${document.id}`}
              disabled={props.pending}
              className={[
                'flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs',
                'text-[var(--sniptale-color-text-primary)]',
                'hover:bg-[var(--sniptale-color-surface-hover)] focus-visible:outline',
                'focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-accent)]',
                'disabled:opacity-50',
              ].join(' ')}
              onClick={() => props.onChoose(catalog, document.id)}
            >
              <Shapes size={16} aria-hidden />
              <span className="min-w-0 break-words">{name}</span>
            </button>
          );
        })}
        {props.pending ? (
          <p role="status" className="px-2 py-3 text-xs">
            {translate('gallery.videoReview.annotationEffectsAdding')}
          </p>
        ) : null}
        {props.failure ? (
          <div role="alert" className="p-2 text-xs">
            <p>{props.failure}</p>
            {props.retryable !== false ? (
              <ReviewButton
                label={translate('gallery.videoReview.retry')}
                className={reviewTextButtonClassName}
                disabled={props.pending}
                onClick={props.onRetry}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </ContentPopoverAdapter>
  );
}
