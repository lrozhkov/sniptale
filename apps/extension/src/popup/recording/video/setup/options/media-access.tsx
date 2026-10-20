import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../../platform/i18n/popup';
import { openSettingsPage } from '../../../../../platform/navigation/extension-pages';
import {
  getPopupMediaAccessErrorKey,
  PopupMediaAccessError,
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
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState(false);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const mounted = useRef(false);
  const navigationPending = useRef(false);
  const observationRevision = useRef(0);
  const observedAccess = useRef<PopupMediaAccessState>('unknown');
  const onGrantedRef = useRef(onGranted);
  onGrantedRef.current = onGranted;

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    const observe = (state: PopupMediaAccessState) => {
      if (disposed) return;
      observationRevision.current += 1;
      const previous = observedAccess.current;
      const current = state === 'unknown' && previous === 'granted' ? previous : state;
      observedAccess.current = current;
      setAccess(current);
      setChecking(false);
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
      mounted.current = false;
      unsubscribe?.();
      window.removeEventListener('focus', refresh);
    };
  }, [permissionName]);

  const openPermissions = async () => {
    if (navigationPending.current) return;
    navigationPending.current = true;
    setPending(true);
    setNavigationFailed(false);
    try {
      await openSettingsPage({
        route: { section: 'access-data', view: 'permissions' },
        requestMediaAccess: permissionName,
      });
    } catch {
      if (mounted.current) setNavigationFailed(true);
    } finally {
      navigationPending.current = false;
      if (mounted.current) setPending(false);
    }
  };

  return { access, checking, pending, navigationFailed, openPermissions };
}

export function MediaAccessBoundary({
  children,
  enabled = true,
  label,
  onGranted,
  permissionName,
}: {
  children: ReactNode;
  deviceId: string | null;
  enabled?: boolean;
  label: string;
  onGranted?: (() => Promise<unknown>) | undefined;
  permissionName: PopupMediaPermissionName;
}) {
  const media = useMediaAccess(permissionName, onGranted);
  if (media.access === 'granted') return enabled ? children : null;
  const requiredKey =
    permissionName === 'microphone'
      ? 'popup.video.microphonePermissionRequired'
      : 'popup.video.cameraPermissionRequired';
  const failureKey =
    media.access !== 'prompt' && media.access !== 'unknown'
      ? getPopupMediaAccessErrorKey(new PopupMediaAccessError(permissionName, media.access))
      : null;
  const message = media.checking
    ? translate('popup.video.mediaCheckingAccess')
    : translate(failureKey ?? requiredKey);

  return (
    <div className="mt-2 min-w-0" data-ui={`popup.video.${permissionName}-access`}>
      <div className="flex min-w-0 items-start gap-2 text-[11px]">
        <span className="w-[88px] shrink-0 font-medium text-[var(--sniptale-color-text-secondary)]">
          {label}
        </span>
        <span className="min-w-0 text-[var(--sniptale-color-text-secondary)]" role="status">
          {message}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--sniptale-color-text-secondary)]">
        {translate('popup.video.mediaPermissionsHelp')}
      </p>
      <div className="mt-1 flex min-w-0 flex-wrap gap-1">
        <ProductActionButton
          compact
          tone="secondary"
          disabled={media.pending}
          onClick={() => void media.openPermissions()}
          data-ui={`popup.video.${permissionName}-open-permissions`}
        >
          <Settings className="h-3.5 w-3.5" aria-hidden="true" />
          {translate(
            media.pending
              ? 'popup.video.mediaOpeningPermissions'
              : 'popup.video.mediaOpenPermissions'
          )}
        </ProductActionButton>
      </div>
      {media.navigationFailed ? (
        <p className="text-[11px] text-[var(--sniptale-color-text-secondary)]" role="alert">
          {translate('popup.video.mediaPermissionsNavigationFailed')}
        </p>
      ) : null}
    </div>
  );
}
