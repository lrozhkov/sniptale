import { useEffect, useRef } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { DelayedLoadingFallback } from '@sniptale/ui/loading-delay';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../platform/i18n';

const AUTO_BLUR_PROGRESS_DELAY_MS = 500;
const AUTO_BLUR_PROGRESS_OVERLAY_CLASS_NAME = [
  'fixed inset-0 z-[2147483647] flex items-center justify-center p-5',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-overlay)_62%,transparent)]',
  'backdrop-blur-[2px]',
].join(' ');
const AUTO_BLUR_PROGRESS_CARD_CLASS_NAME = [
  'grid w-[min(360px,calc(100vw-40px))] justify-items-center gap-3 rounded-[18px] border',
  'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
  'px-6 py-5 text-center shadow-[var(--sniptale-shadow-lg)]',
].join(' ');

function AutoBlurProgressSurface(props: { onCancel: () => void }) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const cancelButton = overlayRef.current?.querySelector<HTMLButtonElement>('button') ?? null;
    cancelButton?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      aria-labelledby="sniptale-auto-blur-progress-title"
      aria-modal="true"
      className={AUTO_BLUR_PROGRESS_OVERLAY_CLASS_NAME}
      data-ui="content.auto-blur.full-page-progress"
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          overlayRef.current?.querySelector<HTMLButtonElement>('button')?.focus({
            preventScroll: true,
          });
          return;
        }
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          props.onCancel();
        }
      }}
      role="dialog"
      ref={overlayRef}
      style={{ pointerEvents: 'auto' }}
    >
      <div className={AUTO_BLUR_PROGRESS_CARD_CLASS_NAME}>
        <LoaderCircle
          aria-hidden="true"
          className="h-7 w-7 animate-spin text-[var(--sniptale-color-accent)]"
        />
        <div className="grid gap-1">
          <div
            className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]"
            id="sniptale-auto-blur-progress-title"
          >
            {translate('content.autoBlur.fullPageScanTitle')}
          </div>
          <div className="text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
            {translate('content.autoBlur.fullPageScanHint')}
          </div>
        </div>
        <ProductActionButton onClick={props.onCancel} tone="secondary">
          <X aria-hidden="true" className="h-4 w-4" />
          {translate('content.autoBlur.cancelScan')}
        </ProductActionButton>
      </div>
    </div>
  );
}

export function AutoBlurProgressOverlay(props: { active: boolean; onCancel: () => void }) {
  if (!props.active) return null;

  return (
    <DelayedLoadingFallback
      delayMs={AUTO_BLUR_PROGRESS_DELAY_MS}
      fallback={<AutoBlurProgressSurface onCancel={props.onCancel} />}
    />
  );
}
