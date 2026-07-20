import { X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

export type ProductToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ProductToastProps {
  message: string;
  tone?: ProductToastTone;
  duration?: number;
  onClose?: () => void;
  exiting?: boolean;
}

export interface ProductCountdownToastProps {
  count: number;
  labelPrefix: string;
  labelSuffix: string;
  cancelLabel?: string;
  onCancel?: () => void;
}

function ProductToastMessage({ message }: { message: string }) {
  return <span className="sniptale-toast-message">{message}</span>;
}

export function ProductToast({
  message,
  tone = 'info',
  duration = 2000,
  onClose,
  exiting = false,
}: ProductToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(exiting);

  useEffect(() => {
    setIsExiting(exiting);
  }, [exiting]);

  useEffect(() => {
    let exitTimer: ReturnType<typeof setTimeout> | null = null;
    const timer = setTimeout(() => {
      setIsExiting(true);

      exitTimer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, 300);
    }, duration);

    return () => {
      clearTimeout(timer);
      if (exitTimer) {
        clearTimeout(exitTimer);
      }
    };
  }, [duration, onClose]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`sniptale-toast sniptale-toast-${tone} ${isExiting ? 'sniptale-toast-exiting' : ''}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <ProductToastMessage message={message} />
    </div>
  );
}

export function ProductCountdownToast({
  count,
  labelPrefix,
  labelSuffix,
  cancelLabel,
  onCancel,
}: ProductCountdownToastProps) {
  const countdownNumberId = useId();

  useEffect(() => {
    const numberElement = document.getElementById(countdownNumberId);
    if (!numberElement) {
      return;
    }

    numberElement.classList.remove('sniptale-pulse');
    void numberElement.getBoundingClientRect();
    numberElement.classList.add('sniptale-pulse');
  }, [count, countdownNumberId]);

  return (
    <div className="sniptale-countdown-toast-container">
      <div className="sniptale-countdown-toast" role="status" aria-live="polite">
        <div className="sniptale-countdown-main">
          <span className="sniptale-countdown-copy">
            <span className="sniptale-countdown-label">{labelPrefix}</span>
            <span id={countdownNumberId} className="sniptale-countdown-number">
              {count}
            </span>
            <span className="sniptale-countdown-suffix">{labelSuffix}</span>
          </span>
        </div>
        {onCancel && cancelLabel ? (
          <button
            type="button"
            className="sniptale-countdown-cancel"
            onClick={onCancel}
            title={cancelLabel}
            aria-label={cancelLabel}
          >
            <X size={14} strokeWidth={2.2} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
