import { useEffect, useRef, type ReactNode } from 'react';
import {
  readPopupMediaAccessState,
  subscribeToPopupMediaAccessChanges,
  type PopupMediaAccessState,
  type PopupMediaPermissionName,
} from '../../../media-devices';

function useMediaAccessRefresh(
  permissionName: PopupMediaPermissionName,
  onGranted?: () => Promise<unknown>
) {
  const observationRevision = useRef(0);
  const observedAccess = useRef<PopupMediaAccessState>('unknown');
  const onGrantedRef = useRef(onGranted);
  onGrantedRef.current = onGranted;

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    const observe = (state: PopupMediaAccessState) => {
      if (disposed) return;
      observationRevision.current += 1;
      const previous = observedAccess.current;
      const current = state === 'unknown' && previous === 'granted' ? previous : state;
      observedAccess.current = current;
      if (current === 'granted' && (previous === 'prompt' || previous === 'denied')) {
        void Promise.resolve()
          .then(() => (disposed ? undefined : onGrantedRef.current?.()))
          .catch(() => undefined);
      }
    };
    const refresh = () => {
      const revision = observationRevision.current;
      void readPopupMediaAccessState(permissionName).then((state) => {
        if (revision === observationRevision.current) observe(state);
      });
    };
    refresh();
    void subscribeToPopupMediaAccessChanges(permissionName, observe).then((stop) => {
      if (disposed) stop();
      else unsubscribe = stop;
    });
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      unsubscribe?.();
      window.removeEventListener('focus', refresh);
    };
  }, [permissionName]);
}

export function MediaAccessBoundary({
  children,
  enabled = true,
  onGranted,
  permissionName,
}: {
  children: ReactNode;
  enabled?: boolean;
  onGranted?: (() => Promise<unknown>) | undefined;
  permissionName: PopupMediaPermissionName;
}) {
  useMediaAccessRefresh(permissionName, onGranted);
  return enabled ? children : null;
}
