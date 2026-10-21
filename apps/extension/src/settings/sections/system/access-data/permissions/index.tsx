import { useEffect, useRef, useState } from 'react';
import { mutateVideoSettings } from '../../../../../composition/persistence/capture-settings';
import {
  openMediaPermissionSettingsPage,
  SETTINGS_MEDIA_ACCESS_QUERY_PARAM,
  returnToMediaRecordingPopup,
} from '../../../../../platform/navigation/extension-pages';
import { PermissionsSectionContent } from './content';
import { useSettingsPermissions } from './useSettingsPermissions';
import { useRecordingMediaAccess } from '../../../../runtime/recording-media-access/provider';

function useTargetedMediaPermissionEnable(
  requestPermission: (id: string) => Promise<boolean>,
  activateRecordingAccess: () => void
) {
  const [mediaEnableFailed, setMediaEnableFailed] = useState(false);
  const [mediaRecordingReady, setMediaRecordingReady] = useState(false);
  const mounted = useRef(false);
  const requestPermissionRef = useRef(requestPermission);
  requestPermissionRef.current = requestPermission;
  const activateRecordingAccessRef = useRef(activateRecordingAccess);
  activateRecordingAccessRef.current = activateRecordingAccess;
  const intentRead = useRef(false);
  const pendingIntent = useRef<'microphone' | 'camera' | null>(null);
  const pendingReturn = useRef(false);

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
    const continueWhenFocused = () => {
      if (document.visibilityState !== 'visible') return;
      if (pendingReturn.current) {
        pendingReturn.current = false;
        void returnToMediaRecordingPopup()
          .then((returned) => {
            if (!returned && mounted.current) pendingReturn.current = true;
          })
          .catch(() => undefined);
      }
      const permission = pendingIntent.current;
      if (!permission || !document.hasFocus()) return;
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
          if (!mounted.current) return;
          activateRecordingAccessRef.current();
          setMediaRecordingReady(true);
          pendingReturn.current = true;
          continueWhenFocused();
        })
        .catch(() => {
          if (mounted.current) setMediaEnableFailed(true);
        });
    };
    window.addEventListener('focus', continueWhenFocused);
    document.addEventListener('visibilitychange', continueWhenFocused);
    continueWhenFocused();
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', continueWhenFocused);
      document.removeEventListener('visibilitychange', continueWhenFocused);
    };
  }, []);

  return { mediaEnableFailed, mediaRecordingReady };
}

export function PermissionsSection(props: { view?: 'optional' | 'required' }) {
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
  const recordingMediaAccess = useRecordingMediaAccess();
  const { mediaEnableFailed, mediaRecordingReady } = useTargetedMediaPermissionEnable(
    requestPermission,
    recordingMediaAccess.activate
  );

  const openMediaSettings = async (permission: 'microphone' | 'camera') => {
    if (navigating.current) return;
    navigating.current = true;
    setMediaNavigationFailed(false);
    try {
      await openMediaPermissionSettingsPage(permission, 'extension');
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
      onOpenBrowserSettings={() => void openMediaSettings('microphone')}
      mediaNavigationFailed={mediaNavigationFailed}
      mediaEnableFailed={mediaEnableFailed}
      mediaRecordingReady={mediaRecordingReady}
      mediaSessionFailed={recordingMediaAccess.failed}
      view={props.view ?? 'optional'}
    />
  );
}
