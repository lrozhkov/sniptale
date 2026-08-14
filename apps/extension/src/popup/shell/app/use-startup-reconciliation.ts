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
      ({ getCurrentLocale, subscribeToLocaleChanges }) => {
        if (disposed) return;
        setLocale(getCurrentLocale());
        disposeLocale = subscribeToLocaleChanges(setLocale);
      }
    );
    return () => {
      disposed = true;
      disposeTheme?.();
      disposeLocale?.();
    };
  }, [setLocale]);
}
