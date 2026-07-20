import { useEffect, useState, type ReactNode } from 'react';

export const DEFAULT_LOADING_FALLBACK_DELAY_MS = 350;

export interface DelayedLoadingFallbackProps {
  fallback: ReactNode;
  delayMs?: number;
}

export function DelayedLoadingFallback({
  fallback,
  delayMs = DEFAULT_LOADING_FALLBACK_DELAY_MS,
}: DelayedLoadingFallbackProps) {
  const [isVisible, setIsVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setIsVisible(true);
      return;
    }

    setIsVisible(false);
    const timeoutId = window.setTimeout(() => {
      setIsVisible(true);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs]);

  return isVisible ? <>{fallback}</> : null;
}
