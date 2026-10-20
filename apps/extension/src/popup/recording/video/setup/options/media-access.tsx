import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  readPopupMediaAccessState,
  subscribeToPopupMediaAccessChanges,
  type PopupMediaAccessState,
  type PopupMediaPermissionName,
} from '../../../media-devices';

function useMediaAccess(
  permissionName: PopupMediaPermissionName,
  onGranted?: () => Promise<unknown>
) {
  const [access, setAccess] = useState<PopupMediaAccessState>('unknown');
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
      setAccess(current);
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

  return access;
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
  const access = useMediaAccess(permissionName, onGranted);
  return enabled && access === 'granted' ? children : null;
}
