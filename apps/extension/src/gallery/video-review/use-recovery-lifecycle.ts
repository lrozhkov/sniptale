import { useEffect, type RefObject } from 'react';
/** The mounted ref stays caller-owned and clears before the final serialized flush. */
export function useRecoveryLifecycle(flush: () => Promise<void>, mounted: RefObject<boolean>) {
  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => {
      void flush().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);
    window.addEventListener('pageshow', onVisibility);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
      window.removeEventListener('pageshow', onVisibility);
      void flush().catch(() => undefined);
    };
  }, [flush, mounted]);
}
