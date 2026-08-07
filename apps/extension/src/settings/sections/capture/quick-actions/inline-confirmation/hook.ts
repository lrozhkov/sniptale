import { useCallback, useEffect, useState } from 'react';

const INLINE_CONFIRMATION_TIMEOUT_MS = 2500;

/**
 * Keeps a short-lived inline confirmation message near the current settings flow
 * instead of escalating small successful actions into global toast feedback.
 */
export function useSettingsInlineConfirmation() {
  const [message, setMessage] = useState<string | null>(null);

  const showConfirmation = useCallback((nextMessage: string) => {
    setMessage(nextMessage);
  }, []);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage(null);
    }, INLINE_CONFIRMATION_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [message]);

  return {
    confirmationMessage: message,
    showConfirmation,
  };
}
