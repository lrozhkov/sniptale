import { useEffect, useRef, useState } from 'react';
import { mutateVideoSettings } from '../../../../../composition/persistence/capture-settings';
import {
  openMediaPermissionSettingsPage,
  SETTINGS_MEDIA_ACCESS_QUERY_PARAM,
} from '../../../../../platform/navigation/extension-pages';
import { PermissionsSectionContent } from './content';
import { useSettingsPermissions } from './useSettingsPermissions';

function useTargetedMediaPermissionEnable(requestPermission: (id: string) => Promise<boolean>) {
  const [mediaEnableFailed, setMediaEnableFailed] = useState(false);
  const mounted = useRef(false);
  const requestPermissionRef = useRef(requestPermission);
  requestPermissionRef.current = requestPermission;
  const intentRead = useRef(false);
  const pendingIntent = useRef<'microphone' | 'camera' | null>(null);

  useEffect(() => {
    mounted.current = true;
    if (!intentRead.current) {
      intentRead.current = true;
      const url = new URL(window.location.href);
      const values = url.searchParams.getAll(SETTINGS_MEDIA_ACCESS_QUERY_PARAM);
      if (values.length > 0) {
        url.searchParams.delete(SETTINGS_MEDIA_ACCESS_QUERY_PARAM);
        window.history.replaceState(window.history.state, '', url);
      }
      const [permission] = values;
      if (values.length === 1 && (permission === 'microphone' || permission === 'camera')) {
        pendingIntent.current = permission;
      }
    }
    const requestWhenFocused = () => {
      const permission = pendingIntent.current;
      if (!permission || document.visibilityState !== 'visible' || !document.hasFocus()) return;
      pendingIntent.current = null;
      void requestPermissionRef
        .current(permission)
        .then(async (granted) => {
          if (!granted || !mounted.current) return;
          await mutateVideoSettings((current) => {
            if (!mounted.current) throw new Error('Media enable request surface closed.');
            return permission === 'microphone'
              ? { ...current, microphoneEnabled: true }
              : { ...current, webcamEnabled: true };
          });
        })
        .catch(() => {
          if (mounted.current) setMediaEnableFailed(true);
        });
    };
    window.addEventListener('focus', requestWhenFocused);
    document.addEventListener('visibilitychange', requestWhenFocused);
    requestWhenFocused();
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', requestWhenFocused);
      document.removeEventListener('visibilitychange', requestWhenFocused);
    };
  }, []);

  return mediaEnableFailed;
}

export function PermissionsSection() {
  const [view, setView] = useState<'optional' | 'required'>('optional');
  const [mediaNavigationFailed, setMediaNavigationFailed] = useState(false);
  const mounted = useRef(false);
  const navigating = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { permissions, requestPermission, revokePermission, refreshPermissions } =
    useSettingsPermissions();
  const mediaEnableFailed = useTargetedMediaPermissionEnable(requestPermission);

  const openMediaSettings = async (permission: 'microphone' | 'camera') => {
    if (navigating.current) return;
    navigating.current = true;
    setMediaNavigationFailed(false);
    try {
      await openMediaPermissionSettingsPage(permission);
    } catch {
      if (mounted.current) setMediaNavigationFailed(true);
    } finally {
      navigating.current = false;
    }
  };

  return (
    <PermissionsSectionContent
      permissions={permissions}
      onRefresh={refreshPermissions}
      onRequestPermission={requestPermission}
      onRevokePermission={revokePermission}
      onOpenMediaSettings={(permission) => void openMediaSettings(permission)}
      mediaNavigationFailed={mediaNavigationFailed}
      mediaEnableFailed={mediaEnableFailed}
      view={view}
      onViewChange={setView}
    />
  );
}
