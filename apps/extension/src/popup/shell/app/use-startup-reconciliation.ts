import { useEffect } from 'react';
import type { AppLocale } from '@sniptale/platform/i18n/config';

export function usePopupStartupReconciliation(setLocale: (locale: AppLocale) => void): void {
  useEffect(() => {
    performance.mark('sniptale-popup-react-shell-rendered');
    let disposeLocale: (() => void) | undefined;
    let disposeTheme: (() => void) | undefined;
    let disposed = false;
    void import('../../../ui/theme').then(({ initializeExtensionPageTheme }) => {
      const cleanup = initializeExtensionPageTheme();
      if (disposed) cleanup();
      else disposeTheme = cleanup;
    });
    void import('../../../platform/i18n/locale/state').then(
      ({ ensureLocaleHydrated, getCurrentLocale, subscribeToLocaleChanges }) => {
        if (disposed) return;
        disposeLocale = subscribeToLocaleChanges(setLocale);
        void ensureLocaleHydrated().then(
          () => {
            if (!disposed) setLocale(getCurrentLocale());
          },
          () => {
            if (!disposed) setLocale(getCurrentLocale());
          }
        );
      }
    );
    return () => {
      disposed = true;
      disposeTheme?.();
      disposeLocale?.();
    };
  }, [setLocale]);
}
