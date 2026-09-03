import { useEffect } from 'react';

export function usePopupStartupReconciliation(setLocale: (locale: 'en' | 'ru') => void): void {
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
